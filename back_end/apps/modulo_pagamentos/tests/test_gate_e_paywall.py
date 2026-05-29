"""Testes do endpoint /gate/ e do middleware de paywall."""
import pytest
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.modulo_pagamentos.models import AssinaturaOficina
from apps.modulo_pagamentos.services.assinatura_service import (
    obter_gate,
    obter_ou_criar_assinatura,
)


pytestmark = pytest.mark.django_db


def _ativar_assinatura(oficina, plano, dias=30):
    """Garante assinatura ativa com expiração futura."""
    a = obter_ou_criar_assinatura(oficina)
    a.plano = plano
    a.status = "ativa"
    a.inicio_em = timezone.now()
    a.expira_em = timezone.now() + timezone.timedelta(days=dias)
    a.save()
    return a


# ---------------------------------------------------------------------------
# Service: obter_gate
# ---------------------------------------------------------------------------

def test_gate_vigente_quando_assinatura_ativa_no_futuro(oficina, planos_seed):
    _ativar_assinatura(oficina, planos_seed["premium"], dias=20)
    gate = obter_gate(oficina)
    assert gate.vigente is True
    assert gate.nivel == "ok"
    assert gate.proximo_do_vencimento is False
    assert gate.dias_restantes == 19 or gate.dias_restantes == 20


def test_gate_amarelo_quando_proximo_do_vencimento(oficina, planos_seed):
    _ativar_assinatura(oficina, planos_seed["premium"], dias=5)
    gate = obter_gate(oficina)
    assert gate.vigente is True
    assert gate.proximo_do_vencimento is True
    assert gate.nivel == "atencao"
    assert "vence em" in gate.mensagem


def test_gate_bloqueio_quando_pendente(oficina, planos_seed):
    a = obter_ou_criar_assinatura(oficina)
    assert a.status == "pendente"
    gate = obter_gate(oficina)
    assert gate.vigente is False
    assert gate.nivel == "erro"
    assert "pagamento" in gate.mensagem.lower()


def test_gate_bloqueio_quando_vencida(oficina, planos_seed):
    a = _ativar_assinatura(oficina, planos_seed["basico"], dias=10)
    a.status = "vencida"
    a.expira_em = timezone.now() - timezone.timedelta(days=2)
    a.save()
    gate = obter_gate(oficina)
    assert gate.vigente is False
    assert gate.nivel == "erro"
    assert "vencida" in gate.mensagem.lower()
    assert gate.dias_restantes is not None and gate.dias_restantes < 0


# ---------------------------------------------------------------------------
# Endpoint /gate/
# ---------------------------------------------------------------------------

def test_endpoint_gate_devolve_dicionario(api_admin, planos_seed, oficina):
    _ativar_assinatura(oficina, planos_seed["premium"], dias=15)
    resp = api_admin.get("/api/pagamentos/gate/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["vigente"] is True
    assert body["nivel"] == "ok"
    assert "pagamentos" in body["pode_acessar"]
    assert "atualizacao" in body["pode_acessar"]
    assert "suporte" in body["pode_acessar"]


# ---------------------------------------------------------------------------
# Middleware AssinaturaPaywallMiddleware
# ---------------------------------------------------------------------------

@override_settings(PAGAMENTOS_PAYWALL_HABILITADO=True)
def test_paywall_bloqueia_endpoints_oficina_quando_pendente(api_admin, planos_seed, oficina):
    # Garante que NÃO há assinatura ativa
    obter_ou_criar_assinatura(oficina)  # cria pendente
    AssinaturaOficina.objects.filter(oficina=oficina).update(
        status="pendente", expira_em=None,
    )
    resp = api_admin.get("/api/oficina/dashboard/")
    assert resp.status_code == 402, resp.content
    body = resp.json()
    assert body["code"] == "assinatura_pendente"
    assert body["gate"]["vigente"] is False


@override_settings(PAGAMENTOS_PAYWALL_HABILITADO=True)
def test_paywall_libera_dados_da_oficina_mesmo_pendente(api_admin, planos_seed, oficina):
    AssinaturaOficina.objects.filter(oficina=oficina).update(
        status="pendente", expira_em=None,
    )
    # Perfil deve permanecer acessível
    resp = api_admin.get("/api/oficina/perfil/")
    assert resp.status_code in (200, 404)  # 404 se perfil não populado, mas NÃO 402


@override_settings(PAGAMENTOS_PAYWALL_HABILITADO=True)
def test_paywall_libera_endpoints_pagamentos(api_admin, planos_seed, oficina):
    AssinaturaOficina.objects.filter(oficina=oficina).update(
        status="pendente", expira_em=None,
    )
    # O próprio gate continua acessível mesmo bloqueado.
    resp = api_admin.get("/api/pagamentos/gate/")
    assert resp.status_code == 200


@override_settings(PAGAMENTOS_PAYWALL_HABILITADO=True)
def test_paywall_libera_quando_assinatura_vigente(api_admin, planos_seed, oficina):
    _ativar_assinatura(oficina, planos_seed["premium"], dias=20)
    resp = api_admin.get("/api/oficina/dashboard/")
    assert resp.status_code != 402  # libera (200 ou 4xx por outro motivo)


@override_settings(PAGAMENTOS_PAYWALL_HABILITADO=True)
def test_paywall_nao_bloqueia_staff_superuser(api_admin, planos_seed, oficina):
    """Admin global (staff/superuser) não cai no paywall."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    staff = User.objects.create_user(
        username="staff-paywall", password="x",
        is_staff=True, is_superuser=True,
    )
    AssinaturaOficina.objects.filter(oficina=oficina).update(
        status="pendente", expira_em=None,
    )
    c = APIClient(HTTP_HOST="localhost")
    c.force_authenticate(user=staff)
    s = c.session
    s["oficina_atual_id"] = oficina.id
    s.save()
    resp = c.get("/api/oficina/dashboard/")
    assert resp.status_code != 402
