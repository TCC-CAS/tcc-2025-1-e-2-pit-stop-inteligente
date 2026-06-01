"""Testes de integração da view pública de solicitação de acesso."""
import pytest
from django.core.cache import cache
from django.urls import reverse
from rest_framework.test import APIClient

from apps.modulo_adm.models import Notificacao


pytestmark = pytest.mark.django_db

# User-Agent de um navegador real — o endpoint público bloqueia UA vazio
# ou claramente automatizado (curl, python-requests). Em testes que
# simulam um humano abrindo o formulário, fornecemos um UA válido.
UA_NAVEGADOR = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)


def _client():
    return APIClient(HTTP_USER_AGENT=UA_NAVEGADOR)


@pytest.fixture(autouse=True)
def _limpa_cache():
    """Cada teste começa com rate-limit zerado."""
    cache.clear()
    yield
    cache.clear()


@pytest.mark.integration
def test_solicitacao_oficina_201_e_gera_notificacao():
    resp = _client().post(
        reverse("adm-solicitacao-acesso"),
        {"modo": "oficina", "email": "func@oficina.com"},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["protocolo"].startswith("SOL-")
    assert Notificacao.objects.filter(tipo="recuperar_oficina").count() == 1


@pytest.mark.integration
def test_email_invalido_retorna_400_com_mensagem_amigavel():
    resp = _client().post(
        reverse("adm-solicitacao-acesso"),
        {"modo": "oficina", "email": "naoeumemail"},
        format="json",
    )
    assert resp.status_code == 400
    assert "e-mail" in resp.data["erro"].lower()


@pytest.mark.integration
def test_rate_limit_bloqueia_apos_5_sucessos(settings):
    client = _client()
    for i in range(5):
        resp = client.post(
            reverse("adm-solicitacao-acesso"),
            {"modo": "cliente", "email": f"x{i}@y.com"},
            format="json",
        )
        assert resp.status_code == 201

    resp = client.post(
        reverse("adm-solicitacao-acesso"),
        {"modo": "cliente", "email": "x6@y.com"},
        format="json",
    )
    assert resp.status_code == 429
    assert "muitas" in resp.data["erro"].lower()


@pytest.mark.integration
def test_validacao_falha_nao_consome_rate_limit():
    """Tentativa inválida não deve gastar tentativas — UX para quem digita errado."""
    client = _client()
    for _ in range(10):
        resp = client.post(
            reverse("adm-solicitacao-acesso"),
            {"modo": "oficina", "email": "invalido"},
            format="json",
        )
        assert resp.status_code == 400

    # Após 10 erros, ainda deve aceitar um válido
    resp = client.post(
        reverse("adm-solicitacao-acesso"),
        {"modo": "oficina", "email": "ok@dominio.com"},
        format="json",
    )
    assert resp.status_code == 201


@pytest.mark.integration
def test_endpoint_publico_recusa_user_agent_de_bot():
    """python-requests/curl recebem 403 antes mesmo de validar payload."""
    bot = APIClient(HTTP_USER_AGENT="python-requests/2.31.0")
    resp = bot.post(
        reverse("adm-solicitacao-acesso"),
        {"modo": "oficina", "email": "ok@dominio.com"},
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.integration
def test_endpoint_publico_recusa_honeypot_preenchido():
    """Bot que preenche `url_optional` recebe '201 fake' sem criar nada."""
    resp = _client().post(
        reverse("adm-solicitacao-acesso"),
        {
            "modo": "oficina", "email": "ok@dominio.com",
            "url_optional": "https://spam.example/",
        },
        format="json",
    )
    # Resposta finge sucesso para não dar pistas ao bot, mas nada é criado
    assert resp.status_code == 201
    assert Notificacao.objects.count() == 0
