"""Regras de cobrança de Ordem de Serviço pelo cliente final.

Fluxo:
  1. A oficina/funcionário (ou o próprio cliente no portal) chama o
     endpoint correspondente para gerar um checkout.
  2. Service calcula o valor (itens aprovados) e cria um `Pagamento`
     (tipo='os') referenciando OS + cliente + oficina.
  3. AbacatePay devolve a URL; o front redireciona o pagador.
  4. Webhook (fase 4) marca o pagamento como pago e adiciona um evento.

Decisões importantes:
  - Reaproveitamos um Pagamento PENDENTE existente em vez de criar
    duplicatas — assim o cliente que recarrega a tela continua olhando
    a mesma cobrança.
  - Valor zerado bloqueia o checkout: se ainda não há orçamento aprovado,
    a OS não pode ser paga.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional
from urllib.parse import urlencode

from django.conf import settings
from django.db import transaction

from apps.modulo_oficina.models import OrdemServico

from ..models import EventoPagamento, Pagamento
from .abacatepay_client import AbacatePayClient, CheckoutCriado
from .valor_service import calcular_valor_os_centavos, descricao_curta_os


@dataclass(frozen=True)
class CheckoutOS:
    pagamento_id: int
    external_id: str
    abacatepay_id: str
    url_checkout: str
    valor_centavos: int
    descricao: str


def obter_pagamento_pendente_os(os: OrdemServico) -> Optional[Pagamento]:
    """Retorna o último Pagamento pendente desta OS (ou None)."""
    return (
        Pagamento.objects
        .filter(ordem_servico=os, tipo="os", status="pendente")
        .order_by("-criado_em")
        .first()
    )


def iniciar_checkout_os(
    *,
    os: OrdemServico,
    usuario=None,
    metodos: Optional[Iterable[str]] = None,
    forcar_novo: bool = False,
    client: Optional[AbacatePayClient] = None,
) -> CheckoutOS:
    """Cria (ou reusa) o checkout AbacatePay para uma OS.

    - Se já existir um Pagamento pendente para a OS e `forcar_novo=False`,
      devolve o link existente — evita duplicar cobrança e dispensa o
      cliente de recriar pagamento ao recarregar a página.
    - Se a OS não tiver itens aprovados, levanta ValueError.
    """
    valor = calcular_valor_os_centavos(os)
    if valor <= 0:
        raise ValueError(
            "Nenhum item aprovado nesta OS — defina valores e aprove antes de cobrar."
        )

    if not forcar_novo:
        existente = obter_pagamento_pendente_os(os)
        if existente and existente.abacatepay_url:
            return CheckoutOS(
                pagamento_id=existente.id,
                external_id=str(existente.external_id),
                abacatepay_id=existente.abacatepay_id,
                url_checkout=existente.abacatepay_url,
                valor_centavos=existente.valor_centavos,
                descricao=existente.descricao,
            )

    descricao = descricao_curta_os(os)

    with transaction.atomic():
        pagamento = Pagamento.objects.create(
            tipo="os",
            status="pendente",
            valor_centavos=valor,
            descricao=descricao,
            oficina=os.oficina,
            ordem_servico=os,
            cliente=os.cliente,
            criado_por=usuario,
            metadados={
                "os_id": os.id,
                "metodos_solicitados": list(metodos) if metodos else None,
            },
        )
        EventoPagamento.objects.create(
            pagamento=pagamento,
            tipo="criado",
            descricao=f"Cobrança de OS #{os.id} iniciada (R$ {valor/100:.2f}).",
        )

    api_client = client or AbacatePayClient()

    try:
        checkout: CheckoutCriado = api_client.criar_checkout(
            valor_centavos=valor,
            descricao=descricao,
            external_id=str(pagamento.external_id),
            return_url=_montar_return_url(pagamento, status="cancelado"),
            completion_url=_montar_return_url(pagamento, status="aguardando"),
            metodos=metodos,
            cliente_nome=getattr(os.cliente, "nome", None),
            cliente_email=getattr(os.cliente, "email", None) or None,
            cliente_telefone=getattr(os.cliente, "telefone", None) or None,
            cliente_cpf_cnpj=getattr(os.cliente, "cpf_cnpj", None),
            metadata={
                "pitstop_tipo": "os",
                "pitstop_oficina_id": str(os.oficina_id),
                "pitstop_os_id": str(os.id),
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
    return CheckoutOS(
        pagamento_id=pagamento.id,
        external_id=str(pagamento.external_id),
        abacatepay_id=checkout.id,
        url_checkout=checkout.url,
        valor_centavos=valor,
        descricao=descricao,
    )


def aplicar_pagamento_aprovado_os(pagamento: Pagamento, *, metodo: str = "") -> None:
    """Marca o pagamento de OS como pago. Idempotente."""
    if pagamento.tipo != "os":
        return
    if pagamento.status == "pago":
        return

    from django.utils import timezone

    agora = timezone.now()
    Pagamento.objects.filter(pk=pagamento.pk).update(
        status="pago",
        metodo_escolhido=(metodo or pagamento.metodo_escolhido or "")[:10],
        pago_em=agora,
    )
    EventoPagamento.objects.create(
        pagamento=pagamento,
        tipo="pago",
        descricao=f"Cobrança de OS #{pagamento.ordem_servico_id} liquidada.",
        payload={"metodo": metodo},
    )


def _montar_return_url(pagamento: Pagamento, *, status: str) -> str:
    """Mesma lógica de assinatura_service — caminho configurável via
    `ABACATEPAY_RETORNO_URL_PATH` no .env."""
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
