"""Testes do `webhook_service` — HMAC, idempotência, roteamento."""
import json

import pytest
from django.test import override_settings

from apps.modulo_pagamentos.models import (
    Pagamento, WebhookAbacatePay,
)
from apps.modulo_pagamentos.services import assinatura_service, webhook_service


pytestmark = pytest.mark.django_db

SECRET = "segredo-de-teste"


def _meta(assinatura=None, event_id=None):
    meta = {}
    if assinatura:
        meta["HTTP_X_ABACATEPAY_SIGNATURE"] = assinatura
    if event_id:
        meta["HTTP_X_ABACATEPAY_EVENT_ID"] = event_id
    return meta


def _criar_pag_assinatura(planos_seed, oficina, abacate_client_mock):
    r = assinatura_service.iniciar_checkout_assinatura(
        oficina=oficina, plano_codigo="premium", client=abacate_client_mock,
    )
    return Pagamento.objects.get(pk=r.pagamento_id)


def test_assinatura_invalida_quando_secret_configurado(
    planos_seed, oficina, abacate_client_mock,
):
    pag = _criar_pag_assinatura(planos_seed, oficina, abacate_client_mock)
    payload = {"event": "billing.paid", "data": {"externalId": str(pag.external_id)}}
    body = json.dumps(payload).encode()

    with override_settings(ABACATEPAY_WEBHOOK_SECRET=SECRET):
        r = webhook_service.processar_webhook(
            body_bytes=body, meta=_meta(assinatura="errada", event_id="evt-1"),
        )

    assert r.aceito is False
    assert r.detalhe == "assinatura inválida."
    registro = WebhookAbacatePay.objects.get(event_id="evt-1")
    assert registro.assinatura_valida is False
    assert "inválida" in (registro.erro or "")


def test_assinatura_valida_processa_billing_paid(
    planos_seed, oficina, abacate_client_mock,
):
    pag = _criar_pag_assinatura(planos_seed, oficina, abacate_client_mock)
    payload = {
        "event": "billing.paid",
        "data": {"externalId": str(pag.external_id), "method": "PIX"},
    }
    body = json.dumps(payload).encode()
    assinatura = webhook_service.calcular_assinatura(body, SECRET)

    with override_settings(ABACATEPAY_WEBHOOK_SECRET=SECRET):
        r = webhook_service.processar_webhook(
            body_bytes=body,
            meta=_meta(assinatura=f"sha256={assinatura}", event_id="evt-pago-1"),
        )

    assert r.aceito is True
    assert r.assinatura_valida is True
    assert r.pagamento_id == pag.id

    pag.refresh_from_db()
    assert pag.status == "pago"
    assert pag.metodo_escolhido == "PIX"


def test_idempotencia_rejeita_replay(planos_seed, oficina, abacate_client_mock):
    pag = _criar_pag_assinatura(planos_seed, oficina, abacate_client_mock)
    payload = {"event": "billing.paid", "data": {"externalId": str(pag.external_id)}}
    body = json.dumps(payload).encode()

    # Sem secret → assinatura considerada inválida mas como secret vazio
    # entramos no fluxo de processamento normal (que aceita a chamada).
    r1 = webhook_service.processar_webhook(
        body_bytes=body, meta=_meta(event_id="evt-replay"),
    )
    r2 = webhook_service.processar_webhook(
        body_bytes=body, meta=_meta(event_id="evt-replay"),
    )
    assert r1.duplicado is False
    assert r2.duplicado is True


def test_pagamento_nao_encontrado_aceita_mas_loga(planos_seed):
    payload = {
        "event": "billing.paid",
        "data": {"externalId": "00000000-0000-0000-0000-000000000000"},
    }
    body = json.dumps(payload).encode()
    r = webhook_service.processar_webhook(
        body_bytes=body, meta=_meta(event_id="evt-orfão"),
    )
    assert r.aceito is True
    assert r.pagamento_id is None
    registro = WebhookAbacatePay.objects.get(event_id="evt-orfão")
    assert registro.processado is True
    assert "não encontrado" in registro.erro


def test_eventos_falha_e_expirado_atualizam_status(
    planos_seed, oficina, abacate_client_mock,
):
    pag_falha = _criar_pag_assinatura(planos_seed, oficina, abacate_client_mock)
    body_f = json.dumps({
        "event": "billing.failed",
        "data": {"externalId": str(pag_falha.external_id)},
    }).encode()
    webhook_service.processar_webhook(body_bytes=body_f, meta=_meta(event_id="f1"))
    pag_falha.refresh_from_db()
    assert pag_falha.status == "falha"

    pag_exp = _criar_pag_assinatura(planos_seed, oficina, abacate_client_mock)
    body_e = json.dumps({
        "event": "billing.expired",
        "data": {"externalId": str(pag_exp.external_id)},
    }).encode()
    webhook_service.processar_webhook(body_bytes=body_e, meta=_meta(event_id="e1"))
    pag_exp.refresh_from_db()
    assert pag_exp.status == "expirado"


def test_payload_invalido_devolve_recusa():
    r = webhook_service.processar_webhook(
        body_bytes=b"isso nao e json", meta=_meta(event_id="bad"),
    )
    assert r.aceito is False
    assert "inválido" in r.detalhe
