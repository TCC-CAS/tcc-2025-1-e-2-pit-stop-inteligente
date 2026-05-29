"""Testes do service de captura do Production Health."""
import pytest
from rest_framework.test import APIRequestFactory

from apps.modulo_adm.models import (
    EventoErroProducao,
    GrupoErroProducao,
    gerar_fingerprint,
)
from apps.modulo_adm.services.production_health_service import (
    EVENTOS_MAX_POR_GRUPO,
    capturar_erro,
    sanitizar_payload,
)


pytestmark = pytest.mark.django_db


def _request(method="POST", path="/api/x/", **extra):
    factory = APIRequestFactory()
    return factory.generic(method, path, **extra)


# ---------------------------------------------------------------------------
# Sanitização de payload (unidade)
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_sanitiza_password_em_dict():
    saida = sanitizar_payload({"username": "ana", "password": "secreto"})
    assert saida["username"] == "ana"
    assert saida["password"] == "<REDACTED>"


@pytest.mark.unit
def test_sanitiza_token_em_dict_aninhado():
    saida = sanitizar_payload({"auth": {"access_token": "xyz", "refresh_token": "abc"}})
    assert saida["auth"]["access_token"] == "<REDACTED>"
    assert saida["auth"]["refresh_token"] == "<REDACTED>"


@pytest.mark.unit
def test_sanitiza_lista_grande_e_trunca_strings():
    payload = sanitizar_payload(["x" * 5000])
    assert payload[0].endswith("[truncado]")


@pytest.mark.unit
def test_sanitiza_aceita_profundidade_limitada():
    # Construímos uma árvore profunda demais — não deve estourar a stack
    raiz = {}
    no = raiz
    for _ in range(20):
        no["proximo"] = {"password": "x"}
        no = no["proximo"]
    saida = sanitizar_payload(raiz)
    assert saida is not None  # apenas valida que não levanta


# ---------------------------------------------------------------------------
# Fingerprint
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_fingerprint_estavel_para_mesmas_partes():
    a = gerar_fingerprint("ValueError", "/api/x/1/", "frame")
    b = gerar_fingerprint("ValueError", "/api/x/1/", "frame")
    assert a == b


@pytest.mark.unit
def test_fingerprint_ignora_id_no_path():
    # Mesma exceção, mesmo endpoint, IDs diferentes — deve agrupar
    a = gerar_fingerprint("ValueError", "/api/os/1234/", "frame")
    b = gerar_fingerprint("ValueError", "/api/os/9999/", "frame")
    assert a == b


@pytest.mark.unit
def test_fingerprint_distingue_excecoes_diferentes():
    a = gerar_fingerprint("ValueError", "/api/x/", "frame")
    b = gerar_fingerprint("KeyError", "/api/x/", "frame")
    assert a != b


# ---------------------------------------------------------------------------
# capturar_erro (integração)
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_capturar_erro_cria_grupo_e_evento():
    request = _request("GET", "/api/falha/")
    try:
        raise RuntimeError("boom")
    except RuntimeError as exc:
        grupo = capturar_erro(exc=exc, request=request)

    assert grupo is not None
    assert grupo.tipo_excecao == "RuntimeError"
    assert grupo.endpoint == "/api/falha/"
    assert grupo.total_eventos == 1
    assert grupo.eventos.count() == 1


@pytest.mark.integration
def test_capturar_erro_agrega_no_mesmo_grupo():
    """Duas ocorrências do mesmo erro = um único grupo com 2 eventos."""
    request = _request("GET", "/api/falha/")
    for _ in range(2):
        try:
            raise RuntimeError("mesmo erro")
        except RuntimeError as exc:
            capturar_erro(exc=exc, request=request)

    assert GrupoErroProducao.objects.count() == 1
    assert EventoErroProducao.objects.count() == 2
    grupo = GrupoErroProducao.objects.first()
    assert grupo.total_eventos == 2


@pytest.mark.integration
def test_grupo_resolvido_reabre_em_nova_ocorrencia():
    request = _request("GET", "/api/falha/")
    try:
        raise ValueError("erro a")
    except ValueError as exc:
        grupo = capturar_erro(exc=exc, request=request)

    grupo.status = "resolvido"
    grupo.save(update_fields=["status"])

    try:
        raise ValueError("erro a")
    except ValueError as exc:
        grupo_refresh = capturar_erro(exc=exc, request=request)

    assert grupo_refresh.id == grupo.id
    assert grupo_refresh.status == "aberto"
    assert grupo_refresh.total_eventos == 2


@pytest.mark.integration
def test_capturar_erro_sanitiza_payload_da_request():
    factory = APIRequestFactory()
    request = factory.post("/api/login/", {"username": "ana", "password": "secret"})
    try:
        raise RuntimeError("oh")
    except RuntimeError as exc:
        grupo = capturar_erro(exc=exc, request=request)

    evento = grupo.eventos.first()
    # Django QueryDict envolve cada valor em lista; o importante é que o
    # campo sensível tenha sido marcado e o não-sensível tenha sido preservado.
    payload = evento.payload_sanitizado
    password = payload["password"]
    if isinstance(password, list):
        password = password[0]
    assert password == "<REDACTED>"
    username = payload["username"]
    if isinstance(username, list):
        username = username[0]
    assert username == "ana"


@pytest.mark.integration
def test_rotacao_limita_eventos_por_grupo(monkeypatch):
    """Quando excede EVENTOS_MAX_POR_GRUPO, os mais antigos somem."""
    # Reduz o limite para deixar o teste rápido
    monkeypatch.setattr(
        "apps.modulo_adm.services.production_health_service.EVENTOS_MAX_POR_GRUPO",
        3,
    )
    request = _request("GET", "/api/rota/")

    for _ in range(5):
        try:
            raise RuntimeError("repeat")
        except RuntimeError as exc:
            capturar_erro(exc=exc, request=request)

    grupo = GrupoErroProducao.objects.get(tipo_excecao="RuntimeError")
    assert grupo.total_eventos == 5  # contador global mantém
    assert grupo.eventos.count() == 3  # mas só guarda 3
