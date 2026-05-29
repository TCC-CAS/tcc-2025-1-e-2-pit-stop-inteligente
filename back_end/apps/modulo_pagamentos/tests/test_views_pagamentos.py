"""Testes das views REST do modulo_pagamentos."""
import json
from unittest.mock import patch

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.modulo_cliente.permissions import SESSION_CLIENTE_KEY
from apps.modulo_pagamentos.models import Pagamento
from apps.modulo_pagamentos.services import webhook_service
from apps.modulo_pagamentos.services.abacatepay_client import CheckoutCriado


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# /planos/ e /assinatura/status/
# ---------------------------------------------------------------------------

def test_listar_planos(api_admin, planos_seed):
    resp = api_admin.get("/api/pagamentos/planos/")
    assert resp.status_code == 200
    codigos = [p["codigo"] for p in resp.json()["planos"]]
    assert codigos == ["basico", "premium"]


def test_status_assinatura_cria_pendente_se_nao_existe(api_admin, planos_seed):
    resp = api_admin.get("/api/pagamentos/assinatura/status/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["plano"]["codigo"] == "basico"
    assert body["status"] == "pendente"


# ---------------------------------------------------------------------------
# /assinatura/checkout/
# ---------------------------------------------------------------------------

def test_assinatura_checkout_admin_ok(api_admin, planos_seed, fake_checkout):
    with patch(
        "apps.modulo_pagamentos.services.assinatura_service.AbacatePayClient"
    ) as mock_cls:
        mock_cls.return_value.criar_checkout.return_value = fake_checkout
        resp = api_admin.post(
            "/api/pagamentos/assinatura/checkout/",
            data={"plano": "premium"}, format="json",
        )
    assert resp.status_code == 201
    body = resp.json()
    assert body["url_checkout"] == fake_checkout.url
    assert Pagamento.objects.filter(pk=body["pagamento_id"]).exists()


def test_assinatura_checkout_plano_invalido(api_admin, planos_seed):
    resp = api_admin.post(
        "/api/pagamentos/assinatura/checkout/",
        data={"plano": "inexistente"}, format="json",
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# /os/<id>/checkout/  (oficina)  +  /cliente/os/<id>/checkout/ (cliente)
# ---------------------------------------------------------------------------

def test_checkout_os_oficina_cria_e_cliente_reaproveita(
    api_admin, planos_seed, os_com_aprovados, cliente, fake_checkout,
):
    with patch(
        "apps.modulo_pagamentos.services.pagamento_os_service.AbacatePayClient"
    ) as mock_cls:
        mock_cls.return_value.criar_checkout.return_value = CheckoutCriado(
            id="bill_os_42", url="https://app.abacatepay.com/pay/bill_os_42",
            amount_centavos=30100, status="PENDING", raw={"id": "bill_os_42"},
        )
        # Oficina cria
        resp = api_admin.post(
            f"/api/pagamentos/os/{os_com_aprovados.id}/checkout/",
            data={}, format="json",
        )
        assert resp.status_code == 201
        criado = resp.json()
        assert criado["valor_centavos"] == 30100

        # Cliente busca pelo portal (sem rede — pendente já existe)
        cli = APIClient(HTTP_HOST="localhost")
        s = cli.session
        s[SESSION_CLIENTE_KEY] = cliente.id
        s.save()
        resp_cli = cli.get(
            f"/api/pagamentos/cliente/os/{os_com_aprovados.id}/checkout/"
        )
        assert resp_cli.status_code == 200
        recuperado = resp_cli.json()
        assert recuperado["pagamento_id"] == criado["pagamento_id"]


def test_checkout_os_sem_aprovados_devolve_400(
    api_admin, planos_seed, oficina, cliente, veiculo, fake_checkout,
):
    from apps.modulo_oficina.models import OrdemServico
    os_vazia = OrdemServico.objects.create(
        oficina=oficina, cliente=cliente, veiculo=veiculo, status="pendente",
    )
    resp = api_admin.post(
        f"/api/pagamentos/os/{os_vazia.id}/checkout/",
        data={}, format="json",
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# /<external_id>/status/  (público)
# ---------------------------------------------------------------------------

def test_status_pagamento_publico(api_admin, planos_seed, fake_checkout):
    with patch(
        "apps.modulo_pagamentos.services.assinatura_service.AbacatePayClient"
    ) as mock_cls:
        mock_cls.return_value.criar_checkout.return_value = fake_checkout
        resp = api_admin.post(
            "/api/pagamentos/assinatura/checkout/",
            data={"plano": "premium"}, format="json",
        )
    external_id = resp.json()["external_id"]

    cli = APIClient(HTTP_HOST="localhost")
    r = cli.get(f"/api/pagamentos/{external_id}/status/")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "pendente"
    assert body["abacatepay_url"] == fake_checkout.url


def test_status_pagamento_inexistente_devolve_404():
    cli = APIClient(HTTP_HOST="localhost")
    r = cli.get("/api/pagamentos/00000000-0000-0000-0000-000000000000/status/")
    assert r.status_code == 404


def test_status_reconcilia_pagamento_pago_sem_webhook(
    api_admin, planos_seed, fake_checkout, oficina,
):
    """Sem webhook, o polling consulta o AbacatePay; se a cobrança está
    paga, o status é reconhecido e a assinatura renovada."""
    with patch(
        "apps.modulo_pagamentos.services.assinatura_service.AbacatePayClient"
    ) as mock_cls:
        mock_cls.return_value.criar_checkout.return_value = fake_checkout
        resp = api_admin.post(
            "/api/pagamentos/assinatura/checkout/",
            data={"plano": "premium"}, format="json",
        )
    external_id = resp.json()["external_id"]

    cli = APIClient(HTTP_HOST="localhost")
    with patch(
        "apps.modulo_pagamentos.services.sincronizacao_service.AbacatePayClient"
    ) as sync_cls:
        sync_cls.return_value.consultar_checkout.return_value = {
            "status": "PAID", "method": "PIX",
        }
        r = cli.get(f"/api/pagamentos/{external_id}/status/")

    assert r.status_code == 200, r.content
    body = r.json()
    assert body["status"] == "pago"
    assert body["metodo_escolhido"] == "PIX"

    oficina.refresh_from_db()
    assert oficina.plano_atual == "premium"


def test_status_mantem_pendente_quando_abacatepay_pendente(
    api_admin, planos_seed, fake_checkout,
):
    """Enquanto o AbacatePay reporta PENDING, o pagamento segue pendente."""
    with patch(
        "apps.modulo_pagamentos.services.assinatura_service.AbacatePayClient"
    ) as mock_cls:
        mock_cls.return_value.criar_checkout.return_value = fake_checkout
        resp = api_admin.post(
            "/api/pagamentos/assinatura/checkout/",
            data={"plano": "premium"}, format="json",
        )
    external_id = resp.json()["external_id"]

    cli = APIClient(HTTP_HOST="localhost")
    with patch(
        "apps.modulo_pagamentos.services.sincronizacao_service.AbacatePayClient"
    ) as sync_cls:
        sync_cls.return_value.consultar_checkout.return_value = {"status": "PENDING"}
        r = cli.get(f"/api/pagamentos/{external_id}/status/")

    assert r.status_code == 200
    assert r.json()["status"] == "pendente"


# ---------------------------------------------------------------------------
# /webhook/abacatepay/
# ---------------------------------------------------------------------------

def test_webhook_aceito_marca_pago(
    api_admin, planos_seed, oficina, fake_checkout,
):
    # 1) Cria pagamento via API (com client mockado)
    with patch(
        "apps.modulo_pagamentos.services.assinatura_service.AbacatePayClient"
    ) as mock_cls:
        mock_cls.return_value.criar_checkout.return_value = fake_checkout
        resp = api_admin.post(
            "/api/pagamentos/assinatura/checkout/",
            data={"plano": "premium"}, format="json",
        )
    external_id = resp.json()["external_id"]

    # 2) Dispara webhook
    payload = {
        "event": "billing.paid",
        "data": {"externalId": external_id, "method": "PIX"},
    }
    body = json.dumps(payload).encode()
    secret = "segredo-de-webhook"
    assinatura = webhook_service.calcular_assinatura(body, secret)

    cli = APIClient(HTTP_HOST="localhost")
    with override_settings(ABACATEPAY_WEBHOOK_SECRET=secret):
        resp_w = cli.post(
            "/api/pagamentos/webhook/abacatepay/",
            data=body, content_type="application/json",
            HTTP_X_ABACATEPAY_SIGNATURE=f"sha256={assinatura}",
            HTTP_X_ABACATEPAY_EVENT_ID="evt-views-pago",
        )
    assert resp_w.status_code == 200
    assert resp_w.json()["assinatura_valida"] is True

    pag = Pagamento.objects.get(external_id=external_id)
    assert pag.status == "pago"
    assert pag.metodo_escolhido == "PIX"


def test_webhook_assinatura_invalida_401(planos_seed):
    cli = APIClient(HTTP_HOST="localhost")
    with override_settings(ABACATEPAY_WEBHOOK_SECRET="X"):
        resp = cli.post(
            "/api/pagamentos/webhook/abacatepay/",
            data=b'{"event":"billing.paid","data":{}}',
            content_type="application/json",
            HTTP_X_ABACATEPAY_SIGNATURE="invalid",
            HTTP_X_ABACATEPAY_EVENT_ID="evt-401",
        )
    assert resp.status_code == 401
