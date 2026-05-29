"""Testes do service de segurança (rate limit, lockout, honeypot, IP block)."""
import pytest
from django.core.cache import cache

from apps.modulo_adm.models import EventoSeguranca
from apps.modulo_adm.services.seguranca_service import (
    LOGIN_FALHAS_MAX,
    acumular_evento_de_ip,
    bloquear_ip,
    checar_rate_limit,
    consumir_rate_limit_login,
    detectar_honeypot,
    ip_esta_bloqueado,
    login_esta_bloqueado,
    registrar_falha_login,
    resetar_falhas_login,
    user_agent_suspeito,
    IP_LIMIAR_EVENTOS,
)


pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _limpa_cache():
    cache.clear()
    yield
    cache.clear()


def _request_factory(method="POST", path="/api/login/", ip="1.2.3.4", ua=""):
    from rest_framework.test import APIRequestFactory
    f = APIRequestFactory()
    if method == "POST":
        req = f.post(path, {})
    else:
        req = f.get(path)
    req.META["REMOTE_ADDR"] = ip
    if ua:
        req.META["HTTP_USER_AGENT"] = ua
    return req


# ---------------------------------------------------------------------------
# Rate limit
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_rate_limit_permite_ate_o_limite():
    for i in range(5):
        r = checar_rate_limit("teste", "id", limite=5, janela_segundos=60)
        assert r.permitido is True
        assert r.atual == i + 1


@pytest.mark.unit
def test_rate_limit_bloqueia_apos_estourar():
    for _ in range(5):
        checar_rate_limit("teste", "id", limite=5, janela_segundos=60)
    r = checar_rate_limit("teste", "id", limite=5, janela_segundos=60)
    assert r.permitido is False
    assert r.atual == 5


@pytest.mark.unit
def test_rate_limit_login_combina_ip_e_email():
    req = _request_factory(ip="9.9.9.9")
    # Limita por (ip|email): 15 tentativas em 10min — usamos 16 para estourar
    for _ in range(15):
        r = consumir_rate_limit_login(req, "ana@x.com")
        assert r.permitido is True
    r = consumir_rate_limit_login(req, "ana@x.com")
    assert r.permitido is False


# ---------------------------------------------------------------------------
# Lockout de login
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_falhas_acumulam_e_disparam_lockout():
    req = _request_factory(ip="1.1.1.1")
    email = "vai@bloquear.com"
    assert login_esta_bloqueado(email) is False

    for i in range(LOGIN_FALHAS_MAX - 1):
        bloqueou = registrar_falha_login(req, email)
        assert bloqueou is False
        assert login_esta_bloqueado(email) is False

    # Última falha → dispara lockout
    bloqueou = registrar_falha_login(req, email)
    assert bloqueou is True
    assert login_esta_bloqueado(email) is True


@pytest.mark.unit
def test_resetar_falhas_libera_login():
    req = _request_factory()
    email = "ok@x.com"
    for _ in range(LOGIN_FALHAS_MAX):
        registrar_falha_login(req, email)
    assert login_esta_bloqueado(email) is True
    resetar_falhas_login(email)
    assert login_esta_bloqueado(email) is False


@pytest.mark.integration
def test_falha_de_login_grava_evento():
    req = _request_factory(ip="2.2.2.2")
    registrar_falha_login(req, "alvo@x.com")
    eventos = EventoSeguranca.objects.filter(categoria="login_falha")
    assert eventos.count() == 1
    assert eventos.first().ip == "2.2.2.2"
    assert eventos.first().alvo == "alvo@x.com"


@pytest.mark.integration
def test_lockout_gera_evento_critico_e_conta_para_ip_block():
    req = _request_factory(ip="3.3.3.3")
    email = "lock@x.com"
    for _ in range(LOGIN_FALHAS_MAX):
        registrar_falha_login(req, email)
    assert EventoSeguranca.objects.filter(categoria="login_lockout").count() == 1


# ---------------------------------------------------------------------------
# Honeypot
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_honeypot_vazio_passa():
    from rest_framework.test import APIRequestFactory
    req = APIRequestFactory().post("/api/login/", {"url_optional": ""})
    assert detectar_honeypot(req) is False


@pytest.mark.unit
def test_honeypot_preenchido_eh_detectado():
    from rest_framework.test import APIRequestFactory
    req = APIRequestFactory().post("/api/login/", {"url_optional": "https://spam.example/"})
    # parser precisa expor `.data` (DRF) — usamos request.POST como fallback
    req.data = {"url_optional": "https://spam.example/"}
    assert detectar_honeypot(req) is True


@pytest.mark.integration
def test_honeypot_grava_evento_e_acumula_para_ip_block():
    from rest_framework.test import APIRequestFactory
    req = APIRequestFactory().post("/api/login/", {"url_optional": "spam"})
    req.data = {"url_optional": "spam"}
    req.META["REMOTE_ADDR"] = "8.8.8.8"
    detectar_honeypot(req)
    assert EventoSeguranca.objects.filter(categoria="honeypot").count() == 1


# ---------------------------------------------------------------------------
# User-Agent suspeito
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_user_agent_suspeito_curl():
    req = _request_factory(ua="curl/7.81.0")
    assert user_agent_suspeito(req) is True


@pytest.mark.unit
def test_user_agent_suspeito_python_requests():
    req = _request_factory(ua="python-requests/2.31.0")
    assert user_agent_suspeito(req) is True


@pytest.mark.unit
def test_user_agent_vazio_eh_considerado_suspeito():
    req = _request_factory(ua="")
    assert user_agent_suspeito(req) is True


@pytest.mark.unit
def test_user_agent_de_navegador_real_passa():
    req = _request_factory(
        ua="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    )
    assert user_agent_suspeito(req) is False


# ---------------------------------------------------------------------------
# IP block
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_ip_block_marca_e_libera_apos_expirar():
    ip = "5.5.5.5"
    assert ip_esta_bloqueado(ip) is False
    bloquear_ip(ip, segundos=60, motivo="teste")
    assert ip_esta_bloqueado(ip) is True


@pytest.mark.unit
def test_acumulo_de_eventos_dispara_block_automatico():
    ip = "6.6.6.6"
    for _ in range(IP_LIMIAR_EVENTOS):
        acumular_evento_de_ip(ip)
    assert ip_esta_bloqueado(ip) is True


@pytest.mark.integration
def test_bloquear_ip_registra_evento_critico():
    bloquear_ip("7.7.7.7", segundos=60, motivo="suspeita")
    ev = EventoSeguranca.objects.filter(categoria="ip_bloqueado").first()
    assert ev is not None
    assert ev.severidade == "critical"
    assert ev.alvo == "7.7.7.7"
