"""Regras de assinatura SaaS.

Responsável por:
  - listar planos disponíveis;
  - iniciar checkout de upgrade/renovação (chama o AbacatePay e cria o
    `Pagamento` correspondente);
  - aplicar a confirmação (chamado pelo webhook quando o pagamento é
    aprovado): atualiza `AssinaturaOficina` e `Oficina.plano_atual`;
  - cancelar uma assinatura.

A lógica fica aqui (não nas views) para ficar testável e reaproveitável
pelo webhook quando ele estiver implementado (fase 4).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional
from urllib.parse import urlencode

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.modulo_oficina.models import Oficina

from ..models import (
    AssinaturaOficina,
    EventoPagamento,
    Pagamento,
    PlanoSaaS,
)
from .abacatepay_client import AbacatePayClient, CheckoutCriado


VALIDADE_MESES = 1  # mantido como fallback histórico
VALIDADE_PADRAO_DIAS = 30  # usado quando o plano não declara duracao_dias
AVISO_VENCIMENTO_DIAS = 7  # janela de "aviso amarelo" antes do vencimento


@dataclass(frozen=True)
class CheckoutAssinatura:
    """Resultado retornado para o front quando um checkout é iniciado."""

    pagamento_id: int
    external_id: str
    abacatepay_id: str
    url_checkout: str
    valor_centavos: int
    plano_codigo: str
    metodos: list


@dataclass(frozen=True)
class GateAssinatura:
    """Resumo da assinatura para decidir bloqueios e avisos.

    `vigente` é o único sinal que importa para liberar o acesso geral.
    `dias_restantes` alimenta o banner amarelo do header (≤ 7 dias).
    `nivel` é um atalho para o front-end (ok|atencao|erro).
    """

    vigente: bool
    status: str
    plano_codigo: str
    plano_nome: str
    expira_em: Optional[object]
    dias_restantes: Optional[int]
    proximo_do_vencimento: bool
    nivel: str           # ok | atencao | erro
    mensagem: str
    pode_acessar: list   # chaves de páginas/módulos liberados quando bloqueado

    def to_dict(self):
        return {
            "vigente": self.vigente,
            "status": self.status,
            "plano_codigo": self.plano_codigo,
            "plano_nome": self.plano_nome,
            "expira_em": self.expira_em,
            "dias_restantes": self.dias_restantes,
            "proximo_do_vencimento": self.proximo_do_vencimento,
            "nivel": self.nivel,
            "mensagem": self.mensagem,
            "pode_acessar": list(self.pode_acessar),
        }


# Páginas/funcionalidades liberadas mesmo quando a assinatura está
# bloqueada — usado pelo front (sidebar) e pelo permission do back.
PAGINAS_LIBERADAS_BLOQUEIO = (
    "atualizacao",   # Dados da Oficina (inclui aba Renovação de Plano)
    "suporte",       # Para o usuário pedir ajuda quando o pagamento trava
    "pagamentos",    # Endpoints de cobrança continuam acessíveis
)


# ---------------------------------------------------------------------------
# Catálogo / status
# ---------------------------------------------------------------------------

def listar_planos_ativos() -> Iterable[PlanoSaaS]:
    return PlanoSaaS.objects.filter(ativo=True).order_by("ordem", "preco_centavos")


def obter_gate(oficina: Oficina) -> GateAssinatura:
    """Resumo do estado de cobrança para regular acesso à UI/API.

    - Vigente: status `ativa` e `expira_em` no futuro → libera tudo.
    - Próximo do vencimento (≤ 7 dias): vigente mas com aviso amarelo.
    - Pendente/vencida/cancelada: bloqueio, restringe ao kit mínimo.
    """
    assinatura = obter_ou_criar_assinatura(oficina)
    agora = timezone.now()

    dias_restantes = None
    if assinatura.expira_em:
        delta = assinatura.expira_em - agora
        dias_restantes = max(int(delta.total_seconds() // 86400), -999)

    vigente = (
        assinatura.status == "ativa"
        and assinatura.expira_em is not None
        and assinatura.expira_em > agora
    )

    proximo = bool(
        vigente
        and dias_restantes is not None
        and dias_restantes <= AVISO_VENCIMENTO_DIAS
    )

    if not vigente:
        nivel = "erro"
        if assinatura.status == "pendente":
            mensagem = (
                "Sua oficina ainda não tem uma assinatura ativa. Conclua o "
                "pagamento para liberar todos os recursos."
            )
        elif assinatura.status == "vencida":
            mensagem = (
                "Sua assinatura está vencida. Renove o plano para voltar a "
                "usar o sistema."
            )
        elif assinatura.status == "cancelada":
            mensagem = (
                "Sua assinatura foi cancelada. Reative escolhendo um plano "
                "na aba 'Renovação de Plano'."
            )
        else:
            mensagem = (
                "Acesso restrito enquanto não confirmamos o pagamento da "
                "assinatura."
            )
    elif proximo:
        nivel = "atencao"
        mensagem = (
            f"Sua assinatura vence em {dias_restantes} dia(s). Renove para "
            "evitar interrupção do serviço."
        )
    else:
        nivel = "ok"
        mensagem = ""

    return GateAssinatura(
        vigente=vigente,
        status=assinatura.status,
        plano_codigo=assinatura.plano.codigo if assinatura.plano else "",
        plano_nome=assinatura.plano.nome if assinatura.plano else "",
        expira_em=assinatura.expira_em,
        dias_restantes=dias_restantes,
        proximo_do_vencimento=proximo,
        nivel=nivel,
        mensagem=mensagem,
        pode_acessar=list(PAGINAS_LIBERADAS_BLOQUEIO),
    )


def ativar_plano_gratuito(
    *,
    oficina: Oficina,
    plano_codigo: str,
    usuario=None,
) -> AssinaturaOficina:
    """Ativa uma assinatura em plano gratuito (preço = 0) sem AbacatePay.

    Usado pelo plano "Teste" (7 dias, 10 OS) entregue para novas oficinas
    avaliarem a plataforma. Como não há cobrança, pulamos completamente
    o checkout: criamos a assinatura no estado 'ativa', com `expira_em`
    derivado de `plano.duracao_dias`.

    Idempotente — chamar duas vezes para o mesmo plano estende a vigência.
    """
    plano = PlanoSaaS.objects.filter(codigo=plano_codigo, ativo=True).first()
    if plano is None:
        raise ValueError(f"Plano '{plano_codigo}' não está disponível.")
    if plano.preco_centavos != 0:
        raise ValueError(
            f"Plano '{plano_codigo}' tem preço — use "
            "iniciar_checkout_assinatura() em vez de ativar_plano_gratuito()."
        )

    agora = timezone.now()
    assinatura = obter_ou_criar_assinatura(oficina)
    dias = plano.duracao_dias or VALIDADE_PADRAO_DIAS
    base = (
        assinatura.expira_em
        if assinatura.expira_em and assinatura.expira_em > agora
        else agora
    )
    nova_expira = base + timezone.timedelta(days=dias)

    with transaction.atomic():
        AssinaturaOficina.objects.filter(pk=assinatura.pk).update(
            plano=plano,
            status="ativa",
            inicio_em=assinatura.inicio_em or agora,
            expira_em=nova_expira,
            ultimo_pagamento_em=agora,
            cancelada_em=None,
        )
        Oficina.objects.filter(pk=oficina.id).update(plano_atual=plano.codigo)
        # Registra evento sem Pagamento associado para auditoria — facilita
        # rastrear quem ativou o trial e quando.
        # Não cria Pagamento: o histórico de cobrança fica limpo (sem R$ 0).

    assinatura.refresh_from_db()
    return assinatura


def obter_ou_criar_assinatura(oficina: Oficina) -> AssinaturaOficina:
    """Garante que exista uma `AssinaturaOficina` para a oficina.

    Útil para oficinas criadas antes da feature de cobrança: caem no
    plano correspondente ao `oficina.plano_atual` em status 'pendente'.
    """
    try:
        return oficina.assinatura
    except AssinaturaOficina.DoesNotExist:
        plano = (
            PlanoSaaS.objects.filter(codigo=oficina.plano_atual or "basico").first()
            or PlanoSaaS.objects.filter(codigo="basico").first()
        )
        if plano is None:
            raise RuntimeError(
                "Nenhum PlanoSaaS cadastrado. Rode `migrate modulo_pagamentos` "
                "para semear os planos default."
            )
        return AssinaturaOficina.objects.create(
            oficina=oficina, plano=plano, status="pendente",
        )


# ---------------------------------------------------------------------------
# Iniciar checkout (POST /assinatura/checkout/)
# ---------------------------------------------------------------------------

def iniciar_checkout_assinatura(
    *,
    oficina: Oficina,
    plano_codigo: str,
    usuario=None,
    metodos: Optional[Iterable[str]] = None,
    client: Optional[AbacatePayClient] = None,
) -> CheckoutAssinatura:
    """Cria checkout no AbacatePay para assinar/renovar um plano.

    Cria o `Pagamento` em status 'pendente' antes da chamada externa.
    Se a chamada falhar, o Pagamento fica registrado em status 'falha'
    para diagnóstico.
    """
    plano = PlanoSaaS.objects.filter(codigo=plano_codigo, ativo=True).first()
    if plano is None:
        raise ValueError(f"Plano '{plano_codigo}' não está disponível.")
    if plano.preco_centavos <= 0:
        raise ValueError(f"Plano '{plano_codigo}' não possui preço configurado.")

    assinatura = obter_ou_criar_assinatura(oficina)

    descricao = f"Assinatura {plano.nome} — {oficina.nome}"

    with transaction.atomic():
        pagamento = Pagamento.objects.create(
            tipo="assinatura",
            status="pendente",
            valor_centavos=plano.preco_centavos,
            descricao=descricao,
            oficina=oficina,
            assinatura=assinatura,
            criado_por=usuario,
            metadados={
                "plano_codigo": plano.codigo,
                "plano_nome": plano.nome,
                "metodos_solicitados": list(metodos) if metodos else None,
            },
        )
        EventoPagamento.objects.create(
            pagamento=pagamento,
            tipo="criado",
            descricao=f"Checkout de assinatura iniciado para {plano.nome}.",
        )

    api_client = client or AbacatePayClient()

    try:
        checkout: CheckoutCriado = api_client.criar_checkout(
            valor_centavos=plano.preco_centavos,
            descricao=descricao,
            external_id=str(pagamento.external_id),
            return_url=_montar_return_url(pagamento, status="cancelado"),
            completion_url=_montar_return_url(pagamento, status="aguardando"),
            metodos=metodos,
            cliente_nome=oficina.nome,
            cliente_email=oficina.email or None,
            cliente_telefone=oficina.telefone or None,
            cliente_cpf_cnpj=oficina.cnpj,
            metadata={
                "pitstop_tipo": "assinatura",
                "pitstop_oficina_id": str(oficina.id),
                "pitstop_plano": plano.codigo,
            },
        )
    except Exception as exc:
        Pagamento.objects.filter(pk=pagamento.pk).update(status="falha")
        EventoPagamento.objects.create(
            pagamento=pagamento,
            tipo="falha",
            descricao="Falha ao criar checkout no AbacatePay.",
            payload={"erro": str(exc)},
        )
        raise

    Pagamento.objects.filter(pk=pagamento.pk).update(
        abacatepay_id=checkout.id,
        abacatepay_url=checkout.url,
    )
    EventoPagamento.objects.create(
        pagamento=pagamento,
        tipo="checkout_gerado",
        descricao=f"AbacatePay devolveu cobrança {checkout.id}.",
        payload=checkout.raw,
    )

    pagamento.refresh_from_db()
    return CheckoutAssinatura(
        pagamento_id=pagamento.id,
        external_id=str(pagamento.external_id),
        abacatepay_id=checkout.id,
        url_checkout=checkout.url,
        valor_centavos=checkout.amount_centavos or plano.preco_centavos,
        plano_codigo=plano.codigo,
        metodos=list(metodos) if metodos else ["PIX", "CARD", "BOLETO"],
    )


# ---------------------------------------------------------------------------
# Aplicar confirmação (chamado pelo webhook na fase 4)
# ---------------------------------------------------------------------------

def aplicar_pagamento_aprovado(pagamento: Pagamento, *, metodo: str = "") -> None:
    """Marca o pagamento como pago e renova a assinatura da oficina.

    Idempotente: chamar duas vezes não duplica nada.
    """
    if pagamento.tipo != "assinatura":
        return
    if pagamento.status == "pago":
        return

    agora = timezone.now()
    assinatura = pagamento.assinatura or obter_ou_criar_assinatura(pagamento.oficina)

    base = (
        assinatura.expira_em
        if assinatura.expira_em and assinatura.expira_em > agora
        else agora
    )

    plano_codigo = (pagamento.metadados or {}).get("plano_codigo")
    plano = (
        PlanoSaaS.objects.filter(codigo=plano_codigo).first()
        if plano_codigo
        else assinatura.plano
    )

    # Duração da nova vigência vem do próprio plano. Permite que o plano
    # "Teste" expire em 7 dias enquanto Básico/Premium seguem em 30, sem
    # bifurcar regras no service.
    dias = getattr(plano, "duracao_dias", None) or VALIDADE_PADRAO_DIAS
    nova_expira = base + timezone.timedelta(days=dias)

    with transaction.atomic():
        Pagamento.objects.filter(pk=pagamento.pk).update(
            status="pago",
            metodo_escolhido=(metodo or pagamento.metodo_escolhido or "")[:10],
            pago_em=agora,
        )
        AssinaturaOficina.objects.filter(pk=assinatura.pk).update(
            plano=plano,
            status="ativa",
            inicio_em=assinatura.inicio_em or agora,
            expira_em=nova_expira,
            ultimo_pagamento_em=agora,
            cancelada_em=None,
        )
        # Cache rápido (Oficina.plano_atual) — mantém consistente com
        # AssinaturaOficina para queries antigas que ainda leem dali.
        if plano and plano.codigo:
            Oficina.objects.filter(pk=pagamento.oficina_id).update(
                plano_atual=plano.codigo,
            )
        EventoPagamento.objects.create(
            pagamento=pagamento,
            tipo="pago",
            descricao=f"Assinatura renovada até {nova_expira:%Y-%m-%d}.",
            payload={"plano": plano.codigo if plano else None, "metodo": metodo},
        )


# ---------------------------------------------------------------------------
# Cancelamento de assinatura (chamado pela UI/admin)
# ---------------------------------------------------------------------------

def cancelar_assinatura(oficina: Oficina, *, motivo: str = "") -> AssinaturaOficina:
    assinatura = obter_ou_criar_assinatura(oficina)
    if assinatura.status == "cancelada":
        return assinatura
    AssinaturaOficina.objects.filter(pk=assinatura.pk).update(
        status="cancelada",
        cancelada_em=timezone.now(),
    )
    assinatura.refresh_from_db()
    return assinatura


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _montar_return_url(pagamento: Pagamento, *, status: str) -> str:
    """Monta a URL de retorno apontando para a página do front.

    Usa `settings.ABACATEPAY_RETURN_URL_BASE` como prefixo e
    `settings.ABACATEPAY_RETORNO_URL_PATH` como caminho até a página.
    Os parâmetros `pagamento` e `status` informam ao front qual
    cobrança consultar (polling) e em que caminho do fluxo o usuário está.
    """
    base = getattr(settings, "ABACATEPAY_RETURN_URL_BASE", "").rstrip("/")
    path = getattr(
        settings,
        "ABACATEPAY_RETORNO_URL_PATH",
        "/front_end/src/modulos/modulo_oficina/pagamentos/pages/retorno-pagamento.html",
    )
    if not path.startswith("/"):
        path = "/" + path
    query = urlencode({
        "pagamento": pagamento.external_id,
        "status": status,
    })
    return f"{base}{path}?{query}"
