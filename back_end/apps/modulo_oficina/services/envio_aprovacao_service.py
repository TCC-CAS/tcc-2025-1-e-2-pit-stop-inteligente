"""Serviço que centraliza o "Enviar para aprovação" da OS.

Regras do novo fluxo (2026-05):

1. Todos os itens do orçamento existentes na OS passam a `pendente` de
   aprovação (regrava o status para zerar decisões anteriores que estejam
   inconsistentes).
2. Um código de acesso é gerado automaticamente para o cliente, com
   validade padrão de 7 dias e 5 tentativas — disponibilizando a OS no
   portal do cliente sem etapas adicionais para a oficina.
3. A OS, se ainda estiver `pendente`, permanece nesse status (aguardando
   aprovação). Se já estiver em execução/concluído, mantemos o status.
4. Registra histórico marcando o envio e referenciando o código gerado.
"""
from django.db import transaction

from apps.modulo_cliente.models import CodigoAcessoOS

from ..models import ItemOrcamento
from ..utils import registrar_historico


@transaction.atomic
def enviar_para_aprovacao(os_obj, request=None, *, validade_dias=7, max_tentativas=5):
    """Marca a OS como "aguardando aprovação" e libera o portal do cliente.

    Retorna o `CodigoAcessoOS` recém-gerado para que a view possa devolvê-lo
    ao front e exibir no modal de compartilhamento.
    """
    itens = list(ItemOrcamento.objects.filter(os=os_obj))
    if not itens:
        raise ValueError(
            "Inclua pelo menos um item (peça ou serviço) no diagnóstico antes de enviar."
        )

    # Reseta status de aprovação dos itens — qualquer decisão anterior deve
    # ser refeita pelo cliente, garantindo integridade do termo de aceite.
    ItemOrcamento.objects.filter(os=os_obj).update(status_aprovacao="pendente")

    # Gera código de acesso (revoga qualquer ativo anterior — vide
    # CodigoAcessoOS.gerar)
    codigo = CodigoAcessoOS.gerar(
        os_obj,
        gerado_por=request.user if request and request.user.is_authenticated else None,
        validade_dias=validade_dias,
        max_tentativas=max_tentativas,
    )

    registrar_historico(
        os_obj,
        "aprovacao",
        "Orçamento enviado para aprovação do cliente",
        f"{len(itens)} item(ns) liberados no portal do cliente. "
        f"Código gerado: {codigo.codigo} (válido por {validade_dias} dia(s)).",
        request,
    )
    return codigo, itens
