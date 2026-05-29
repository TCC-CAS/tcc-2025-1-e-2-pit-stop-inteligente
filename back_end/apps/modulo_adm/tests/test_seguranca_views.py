"""Testes de integração dos endpoints da aba Segurança + middleware."""
import pytest
from django.core.cache import cache
from django.urls import reverse
from rest_framework.test import APIClient

from apps.modulo_adm.models import EventoSeguranca
from apps.modulo_adm.services.seguranca_service import (
    bloquear_ip,
    ip_esta_bloqueado,
)


pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _limpa_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def admin_user(db):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    return User.objects.create_user(
        username="adm-sec", email="adm-sec@x.com",
        password="senha-forte-123", is_staff=True, is_superuser=True,
    )


@pytest.fixture
def client_admin(admin_user):
    c = APIClient()
    c.force_authenticate(admin_user)
    return c


# ---------------------------------------------------------------------------
# Endpoint /api/admin/seguranca/sumario/
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_sumario_retorna_payload_esperado(client_admin):
    EventoSeguranca.objects.create(
        categoria="login_falha", severidade="info", ip="1.1.1.1",
    )
    EventoSeguranca.objects.create(
        categoria="ip_bloqueado", severidade="critical", ip="2.2.2.2",
    )

    resp = client_admin.get(reverse("adm-seguranca-sumario"))
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_24h"] >= 2
    assert body["criticos_24h"] >= 1
    assert "top_ips_24h" in body


# ---------------------------------------------------------------------------
# Endpoint /api/admin/seguranca/eventos/
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_listagem_eventos_pagina(client_admin):
    for i in range(30):
        EventoSeguranca.objects.create(
            categoria="login_falha", severidade="info", ip=f"10.0.0.{i}",
        )
    resp = client_admin.get(
        reverse("adm-seguranca-eventos"), {"page": 1, "page_size": 10},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["page"] == 1
    assert body["page_size"] == 10
    assert len(body["results"]) == 10
    assert body["total"] >= 30


@pytest.mark.integration
def test_filtro_por_categoria(client_admin):
    EventoSeguranca.objects.create(categoria="login_falha", ip="1.1.1.1")
    EventoSeguranca.objects.create(categoria="honeypot", ip="2.2.2.2")
    resp = client_admin.get(
        reverse("adm-seguranca-eventos"), {"categoria": "honeypot"},
    )
    assert resp.status_code == 200
    assert all(r["categoria"] == "honeypot" for r in resp.json()["results"])


# ---------------------------------------------------------------------------
# Bloquear / desbloquear IP manualmente
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_bloquear_ip_pelo_endpoint_funciona(client_admin):
    resp = client_admin.post(
        reverse("adm-seguranca-bloquear-ip"),
        {"ip": "4.4.4.4", "horas": 1, "motivo": "teste"},
        format="json",
    )
    assert resp.status_code == 200
    assert ip_esta_bloqueado("4.4.4.4") is True


@pytest.mark.integration
def test_desbloquear_ip_pelo_endpoint(client_admin):
    bloquear_ip("5.5.5.5", segundos=60, motivo="teste")
    assert ip_esta_bloqueado("5.5.5.5") is True

    resp = client_admin.post(
        reverse("adm-seguranca-desbloquear-ip"),
        {"ip": "5.5.5.5"},
        format="json",
    )
    assert resp.status_code == 200
    assert ip_esta_bloqueado("5.5.5.5") is False


@pytest.mark.integration
def test_endpoint_segurança_exige_admin_global():
    from django.contrib.auth import get_user_model
    User = get_user_model()
    user = User.objects.create_user(username="comum", email="comum@x.com", password="x")
    c = APIClient()
    c.force_authenticate(user)
    resp = c.get(reverse("adm-seguranca-sumario"))
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Middleware: bloqueia IP banido com 403
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_middleware_recusa_ip_bloqueado():
    """Quando o IP está banido, qualquer request pública vai 403 imediato."""
    bloquear_ip("9.9.9.9", segundos=120, motivo="teste")
    c = APIClient(REMOTE_ADDR="9.9.9.9")
    resp = c.get(reverse("adm-status-publico"))
    assert resp.status_code == 403
    assert resp.json()["erro"]


@pytest.mark.integration
def test_middleware_aplica_headers_de_seguranca():
    """Toda response deve trazer X-Content-Type-Options, X-Frame-Options etc."""
    c = APIClient()
    resp = c.get(reverse("adm-status-publico"))
    assert resp.status_code == 200
    assert resp["X-Content-Type-Options"] == "nosniff"
    assert resp["X-Frame-Options"] == "DENY"
    assert "Permissions-Policy" in resp


# ---------------------------------------------------------------------------
# Login: rate-limit + lockout + honeypot integrados
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_login_com_honeypot_preenchido_eh_rejeitado(admin_user):
    """Bot preenche `url_optional` → recusa imediata, sem checar senha."""
    c = APIClient()
    # Pré-aquece CSRF
    c.get("/api/oficina/auth/csrf/")
    resp = c.post(
        "/api/oficina/auth/login/",
        {
            "username": admin_user.username,
            "password": "senha-forte-123",   # senha correta
            "url_optional": "https://spam/",  # honeypot acionado
        },
        format="json",
    )
    # Mesmo com senha correta, o honeypot derruba a request
    assert resp.status_code == 400
    assert "recusado" in resp.json()["erro"].lower()


@pytest.mark.integration
def test_login_com_credenciais_invalidas_eventualmente_bloqueia(admin_user):
    """5 tentativas falhas → conta bloqueada por 15 min."""
    c = APIClient()
    c.get("/api/oficina/auth/csrf/")
    for _ in range(5):
        c.post(
            "/api/oficina/auth/login/",
            {"username": admin_user.username, "password": "errada"},
            format="json",
        )
    resp = c.post(
        "/api/oficina/auth/login/",
        {"username": admin_user.username, "password": "senha-forte-123"},
        format="json",
    )
    # Mesmo com senha correta, conta está bloqueada
    assert resp.status_code == 400
    assert "bloqueada" in resp.json()["erro"].lower()
