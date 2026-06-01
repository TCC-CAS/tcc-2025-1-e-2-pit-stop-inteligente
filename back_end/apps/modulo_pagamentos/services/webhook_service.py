"""Processamento de webhooks do AbacatePay.

Responsabilidades:
  - validar a assinatura HMAC do body (quando há segredo configurado);
  - garantir idempotência por `event_id`;
  - rotear o evento para a regra correta (assinatura ou OS);
  - persistir tudo em `WebhookAbacatePay` para auditoria/reprocesso.

A AbacatePay envia o cabeçalho de assinatura como HMAC-SHA256 do body
bruto com o segredo configurado no painel. Usamos `hmac.compare_digest`
para evitar timing attacks.

Quando `settings.ABACATEPAY_WEBHOOK_SECRET` está vazio (típico em dev
local), aceitamos sem validação mas marcamos `assinatura_valida=False`
para que o painel admin destaque chamadas não confiáveis.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import uuid
from dataclasses import dataclass
from typing import Optional

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from ..models import EventoPagamento, Pagamento, WebhookAbacatePay


logger = logging.getLogger(__name__)


HEADERS_ASSINATURA = (
    "HTTP_X_ABACATEPAY_SIGNATURE",
    "HTTP_X_SIGNATURE",
    "HTTP_X_ABACATE_SIGNATURE",
)
HEADERS_EVENT_ID = (
    "HTTP_X_ABACATEPAY_EVENT_ID",
    "HTTP_X_EVENT_ID",
    "HTTP_X_REQUEST_ID",
)

EVENTOS_PAGOS = {"billing.paid", "billing.completed", "payment.paid"}
EVENTOS_FALHA = {"billing.failed", "payment.failed"}
EVENTOS_EXPIRADOS = {"billing.expired", "payment.expired"}
EVENTOS_CANCELADOS = {"billing.cancelled", "billing.canceled", "payment.cancelled"}


# ---------------------------------------------------------------------------
# Resultado do processamento (consumido pela view para escolher o HTTP status)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ResultadoWebhook:
    aceito: bool
    duplicado: bool
    assinatura_valida: bool
    evento: str
    pagamento_id: Optional[int]
    detalhe: str


# ---------------------------------------------------------------------------
# Verificação HMAC
# ---------------------------------------------------------------------------

def calcular_assinatura(body_bytes: bytes, secret: str) -> str:
    """HMAC-SHA256 do body com o secret, em hex lowercase."""
    return hmac.new(
        secret.encode("utf-8"),
        body_bytes,
        hashlib.sha256,
    ).hexdigest()


def validar_assinatura(body_bytes: bytes, assinatura_recebida: str, secret: str) -> bool:
    if not secret:
        # Sem secret configurado — em dev permitimos, mas a view marca
        # o registro como `assinatura_valida=False`.
        return False
    if not assinatura_recebida:
        return False
    esperado = calcular_assinatura(body_bytes, secret)
    # Aceita formatos "sha256=<hex>" ou apenas "<hex>".
    recebida = assinatura_recebida.split("=", 1)[-1].strip()
    return hmac.compare_digest(esperado, recebida)


def extrair_header(meta: dict, candidatos) -> str:
    """Procura o primeiro header presente em `meta` (chave estilo HTTP_*)."""
    for nome in candidatos:
        valor = meta.get(nome)
        if valor:
            return valor.strip()
    return ""


# ---------------------------------------------------------------------------
# Roteador principal
# ---------------------------------------------------------------------------

def processar_webhook(*, body_bytes: bytes, meta: dict) -> ResultadoWebhook:
    """Decodifica, valida e roteia um payload recebido do AbacatePay.

    Não levanta — qualquer falha vira `ResultadoWebhook(aceito=False, ...)`
    para que a view possa devolver um HTTP apropriado e registrar tudo.
    """
    secret = getattr(settings, "ABACATEPAY_WEBHOOK_SECRET", "") or ""
    assinatura_header = extrair_header(meta, HEADERS_ASSINATURA)
    assinatura_ok = validar_assinatura(body_bytes, assinatura_header, secret)

    try:
        payload = json.loads(body_bytes.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("payload deve ser objeto JSON.")
    except (ValueError, UnicodeDecodeError) as exc:
        logger.warning("Webhook AbacatePay: payload inválido (%s).", exc)
        return ResultadoWebhook(
            aceito=False,
            duplicado=False,
            assinatura_valida=assinatura_ok,
            evento="",
            pagamento_id=None,
            detalhe=f"payload inválido: {exc}",
        )

    evento = str(payload.get("event") or payload.get("evento") or payload.get("type") or "").strip()
    event_id = (
        extrair_header(meta, HEADERS_EVENT_ID)
        or str(payload.get("id") or payload.get("eventId") or payload.get("event_id") or "")
    )
    if not event_id:
        # Garante idempotência mesmo se o provedor não enviar id;
        # registro permanece auditável.
        event_id = f"local-{uuid.uuid4()}"

    # ---- Idempotência: rejeita silenciosamente replays ---------------------
    existente = WebhookAbacatePay.objects.filter(event_id=event_id).first()
    if existente is not None:
        return ResultadoWebhook(
            aceito=True,
            duplicado=True,
            assinatura_valida=existente.assinatura_valida,
            evento=existente.evento,
            pagamento_id=existente.pagamento_id,
            detalhe="evento já processado (idempotência).",
        )

    registro = WebhookAbacatePay.objects.create(
        event_id=event_id,
        evento=evento or "desconhecido",
        payload=payload,
        assinatura_valida=assinatura_ok,
        processado=False,
    )

    if secret and not assinatura_ok:
        registro.erro = "assinatura HMAC inválida"
        registro.save(update_fields=["erro"])
        return ResultadoWebhook(
            aceito=False,
            duplicado=False,
            assinatura_valida=False,
            evento=evento,
            pagamento_id=None,
            detalhe="assinatura inválida.",
        )

    pagamento = _localizar_pagamento(payload)
    if pagamento is None:
        registro.erro = "pagamento não encontrado pelo external_id/abacatepay_id"
        registro.processado = True
        registro.processado_em = timezone.now()
        registro.save(update_fields=["erro", "processado", "processado_em"])
        return ResultadoWebhook(
            aceito=True,
            duplicado=False,
            assinatura_valida=assinatura_ok,
            evento=evento,
            pagamento_id=None,
            detalhe="pagamento não encontrado — ignorado.",
        )

    metodo = _extrair_metodo(payload)
    detalhe = _aplicar_efeito(pagamento, evento, metodo, payload, registro)

    registro.pagamento = pagamento
    registro.processado = True
    registro.processado_em = timezone.now()
    registro.save(update_fields=["pagamento", "processado", "processado_em", "erro"])

    return ResultadoWebhook(
        aceito=True,
        duplicado=False,
        assinatura_valida=assinatura_ok,
        evento=evento,
        pagamento_id=pagamento.id,
        detalhe=detalhe,
    )


# ---------------------------------------------------------------------------
# Helpers de roteamento
# ---------------------------------------------------------------------------

def _localizar_pagamento(payload: dict) -> Optional[Pagamento]:
    """Acha o `Pagamento` correspondente usando IDs do payload.

    AbacatePay envia o `externalId` que demos no `criar_checkout` —
    é nosso UUID e a forma canônica de bater. Como fallback, casamos
    pelo `id` (bill_*) que retornamos do checkout.
    """
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    external = (
        data.get("externalId") or data.get("external_id")
        or payload.get("externalId") or payload.get("external_id")
    )
    if external:
        try:
            uid = uuid.UUID(str(external))
        except (TypeError, ValueError):
            uid = None
        if uid:
            pag = Pagamento.objects.filter(external_id=uid).first()
            if pag:
                return pag

    abacate_id = data.get("id") or payload.get("billingId") or payload.get("paymentId")
    if abacate_id:
        return Pagamento.objects.filter(abacatepay_id=str(abacate_id)).first()
    return None


def _extrair_metodo(payload: dict) -> str:
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    metodo = data.get("method") or data.get("paymentMethod") or ""
    if isinstance(metodo, list) and metodo:
        metodo = metodo[0]
    return str(metodo or "").upper()[:10]


def _aplicar_efeito(
    pagamento: Pagamento,
    evento: str,
    metodo: str,
    payload: dict,
    registro: WebhookAbacatePay,
) -> str:
    """Aplica o efeito de domínio. Idempotência delegada aos services."""
    EventoPagamento.objects.create(
        pagamento=pagamento,
        tipo="webhook_recebido",
        descricao=f"Evento '{evento}' recebido.",
        payload=payload,
    )

    if evento in EVENTOS_PAGOS:
        with transaction.atomic():
            if pagamento.tipo == "assinatura":
                # Import lazy para evitar ciclo em fases anteriores.
                from .assinatura_service import aplicar_pagamento_aprovado
                aplicar_pagamento_aprovado(pagamento, metodo=metodo)
            elif pagamento.tipo == "os":
                from .pagamento_os_service import aplicar_pagamento_aprovado_os
                aplicar_pagamento_aprovado_os(pagamento, metodo=metodo)
        return f"pagamento #{pagamento.id} marcado como pago."

    if evento in EVENTOS_FALHA:
        Pagamento.objects.filter(pk=pagamento.pk).update(status="falha")
        EventoPagamento.objects.create(
            pagamento=pagamento, tipo="falha",
            descricao=f"Falha reportada pelo AbacatePay ({evento}).",
            payload=payload,
        )
        return f"pagamento #{pagamento.id} marcado como falha."

    if evento in EVENTOS_EXPIRADOS:
        Pagamento.objects.filter(pk=pagamento.pk).update(status="expirado")
        EventoPagamento.objects.create(
            pagamento=pagamento, tipo="expirado",
            descricao=f"Pagamento expirado ({evento}).",
            payload=payload,
        )
        return f"pagamento #{pagamento.id} marcado como expirado."

    if evento in EVENTOS_CANCELADOS:
        Pagamento.objects.filter(pk=pagamento.pk).update(status="cancelado")
        EventoPagamento.objects.create(
            pagamento=pagamento, tipo="cancelado",
            descricao=f"Pagamento cancelado ({evento}).",
            payload=payload,
        )
        return f"pagamento #{pagamento.id} marcado como cancelado."

    registro.erro = f"evento ignorado: {evento}"
    return f"evento '{evento}' não mapeado — sem efeito."
