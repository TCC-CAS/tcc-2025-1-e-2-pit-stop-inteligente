"""Testes do service de configurações (feature toggles)."""
import pytest

from apps.modulo_adm.services.configuracoes_service import (
    aplicar_seed_inicial,
    atualizar_configuracao,
    invalidar_cache,
    obter_flag,
)


pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _limpa_cache():
    invalidar_cache()
    yield
    invalidar_cache()


def _request_admin(rf, admin_user):
    r = rf.post("/api/admin/configuracoes/")
    r.user = admin_user
    return r


@pytest.fixture
def rf():
    from rest_framework.test import APIRequestFactory
    return APIRequestFactory()


@pytest.fixture
def admin_user(db):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    return User.objects.create_user(
        username="adm", email="adm@x.com", password="x", is_staff=True, is_superuser=True,
    )


@pytest.mark.unit
def test_seed_inclui_limites_por_plano():
    aplicar_seed_inicial()
    assert int(obter_flag("limite_usuarios_basico")) == 5
    assert int(obter_flag("limite_usuarios_premium")) == 25
    assert int(obter_flag("limite_os_mensal_basico")) == 100
    assert int(obter_flag("limite_storage_mb_basico")) == 1024


@pytest.mark.unit
def test_atualizar_configuracao_invalida_cache(rf, admin_user):
    aplicar_seed_inicial()
    # Primeira leitura preenche cache
    assert int(obter_flag("limite_usuarios_basico")) == 5

    # Mudou via API → cache deve ser invalidado
    atualizar_configuracao(_request_admin(rf, admin_user), "limite_usuarios_basico", 10)
    assert int(obter_flag("limite_usuarios_basico")) == 10


@pytest.mark.unit
def test_normalizacao_de_bool_aceita_strings(rf, admin_user):
    aplicar_seed_inicial()
    atualizar_configuracao(
        _request_admin(rf, admin_user),
        "bloquear_ao_atingir_limite_usuarios",
        "true",
    )
    assert obter_flag("bloquear_ao_atingir_limite_usuarios") is True

    atualizar_configuracao(
        _request_admin(rf, admin_user),
        "bloquear_ao_atingir_limite_usuarios",
        "off",
    )
    assert obter_flag("bloquear_ao_atingir_limite_usuarios") is False


@pytest.mark.unit
def test_normalizacao_int_rejeita_lixo(rf, admin_user):
    aplicar_seed_inicial()
    with pytest.raises(ValueError, match="inteiro"):
        atualizar_configuracao(
            _request_admin(rf, admin_user),
            "limite_usuarios_basico",
            "abc",
        )


@pytest.mark.integration
def test_flag_inexistente_usa_default_do_arg():
    """Quando a chave não está no seed nem no banco, cai no `default` passado."""
    aplicar_seed_inicial()
    assert obter_flag("chave_que_nao_existe", default=42) == 42
