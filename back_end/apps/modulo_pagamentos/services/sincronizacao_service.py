"""Reconciliação ativa de pagamentos com o AbacatePay.

O webhook (`billing.paid`) é a forma primária de confirmação, mas em
ambientes sem URL pública — desenvolvimento/localhost — ele nunca chega.
Esta sincronização consulta o status atual da cobrança sob demanda
(durante o polling da tela de retorno) e aplica o MESMO efeito de
domínio que o webhook aplicaria. Assim o pagamento é reconhecido mesmo
sem webhook, e o endpoint de status deixa de depender exclusivamente dele.
"""
from __future__ import annotations

import logging
from typing import Optional

from ..models import EventoPagamento, Pagamento
from .abacatepay_client import AbacatePayClient, AbacatePayError


logger = logging.getLogger(__name__)


# Status devolvido pelo AbacatePay (checkout/billing) → efeito interno.
# Conjuntos defensivos: cobrem variações de grafia entre versões da API.
_STATUS_PAGO = {"PAID", "COMPLETED", "APPROVED", "CONFIRMED"}
_STATUS_TERMINAIS = {
    "expirado": {"EXPIRED"},
    "cancelado": {"CANCELLED", "CANCELED", "REFUNDED"},
    "falha": {"FAILED", "REJECTED", "ERROR"},
}


def sincronizar_pagamento_pendente(
    pagamento: Pagamento, *, client: Optional[AbacatePayClient] = None,
) -> Pagamento:
    """Consulta o AbacatePay e aplica o status real a um pagamento pendente.

    Defensiva e idempotente: só age quando o pagamento está 'pendente' e
    possui `abacatepay_id`. Qualquer falha de rede/configuração é logada
    e engolida — o caller (polling) continua mostrando o último estado
    conhecido do banco. Devolve o `Pagamento` (recarregado se mudou).
    """
    if pagamento.status != "pendente" or not pagamento.abacatepay_id:
        return pagamento

    try:
        api = client or AbacatePayClient()
        dados = api.consultar_checkout(pagamento.abacatepay_id)
    except AbacatePayError as exc:
        logger.warning("Sincronização do pagamento #%s falhou: %s", pagamento.id, exc)
        return pagamento
    except Exception:
        # Configuração ausente, erro inesperado — não pode derrubar o polling.
        logger.exception("Erro inesperado ao sincronizar pagamento #%s", pagamento.id)
        return pagamento

    status_remoto = str((dados or {}).get("status") or "").upper()
    logger.info(
        "Pagamento #%s — status no AbacatePay: %r",
        pagamento.id, status_remoto or "(vazio)",
    )

    if status_remoto in _STATUS_PAGO:
        _aplicar_pago(pagamento, _extrair_metodo(dados))
    else:
        for novo_status, codigos in _STATUS_TERMINAIS.items():
            if status_remoto in codigos:
                _marcar_terminal(pagamento, novo_status)
                break

    pagamento.refresh_from_db()
    return pagamento


def _aplicar_pago(pagamento: Pagamento, metodo: str) -> None:
    """Aplica o efeito de pagamento aprovado (idempotente nos services)."""
    if pagamento.tipo == "assinatura":
        from .assinatura_service import aplicar_pagamento_aprovado
        aplicar_pagamento_aprovado(pagamento, metodo=metodo)
    elif pagamento.tipo == "os":
        from .pagamento_os_service import aplicar_pagamento_aprovado_os
        aplicar_pagamento_aprovado_os(pagamento, metodo=metodo)


def _marcar_terminal(pagamento: Pagamento, novo_status: str) -> None:
    """Move um pagamento pendente para falha/expirado/cancelado.

    O filtro por `status='pendente'` evita corrida com um webhook que
    chegue ao mesmo tempo.
    """
    atualizados = Pagamento.objects.filter(
        pk=pagamento.pk, status="pendente",
    ).update(status=novo_status)
    if atualizados:
        EventoPagamento.objects.create(
            pagamento=pagamento,
            tipo=novo_status,
            descricao=f"Status '{novo_status}' obtido por sincronização com o AbacatePay.",
        )


def _extrair_metodo(dados) -> str:
    if not isinstance(dados, dict):
        return ""
    metodo = dados.get("method") or dados.get("paymentMethod") or ""
    if isinstance(metodo, list) and metodo:
        metodo = metodo[0]
    return str(metodo or "").upper()[:10]
