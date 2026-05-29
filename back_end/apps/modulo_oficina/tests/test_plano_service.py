"""Testes do limite de usuários por plano SaaS."""
import pytest

from apps.modulo_adm.services.configuracoes_service import (
    aplicar_seed_inicial,
    atualizar_configuracao,
    invalidar_cache,
)
from apps.modulo_oficina.models import Funcionario, Oficina
from apps.modulo_oficina.services.plano_service import (
    StatusPlano,
    assegurar_pode_criar_funcionario,
    status_plano,
)


pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _seed_e_cache():
    aplicar_seed_inicial()
    invalidar_cache()
    yield
    invalidar_cache()


@pytest.fixture
def oficina_basica(db):
    return Oficina.objects.create(
        nome="Oficina X",
        cnpj="00000000000111",
        plano_atual="basico",
    )


def _criar_funcionario(oficina, email):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    user = User.objects.create_user(username=email, email=email, password="x")
    return Funcionario.objects.create(user=user, oficina=oficina, permissao="mecanico")


@pytest.mark.unit
def test_status_plano_oficina_vazia():
    o = Oficina.objects.create(nome="Y", cnpj="00000000000112", plano_atual="basico")
    sp = status_plano(o)
    assert sp.usuarios_ativos == 0
    assert sp.limite_usuarios == 5
    assert sp.restantes == 5
    assert sp.percentual_uso == 0.0
    assert sp.atingiu_limite is False
    assert sp.proximo_do_limite is False


@pytest.mark.unit
def test_alerta_amarelo_quando_atinge_80_pct(oficina_basica):
    # Plano básico = 5. Criar 4 → 80%
    for i in range(4):
        _criar_funcionario(oficina_basica, f"f{i}@x.com")
    sp = status_plano(oficina_basica)
    assert sp.percentual_uso == 80.0
    assert sp.proximo_do_limite is True
    assert sp.atingiu_limite is False


@pytest.mark.unit
def test_bloqueio_quando_limite_atingido(oficina_basica):
    for i in range(5):
        _criar_funcionario(oficina_basica, f"g{i}@x.com")
    sp = status_plano(oficina_basica)
    assert sp.atingiu_limite is True
    with pytest.raises(ValueError, match="Limite"):
        assegurar_pode_criar_funcionario(oficina_basica)


@pytest.mark.integration
def test_limite_configuravel_via_painel(rf_admin, oficina_basica):
    """Alterar a flag no painel deve refletir imediatamente no service."""
    # Sobe limite para 10 via API admin
    request, admin = rf_admin
    atualizar_configuracao(request, "limite_usuarios_basico", 10)

    # Cria 6 — ainda OK porque limite agora é 10
    for i in range(6):
        _criar_funcionario(oficina_basica, f"h{i}@x.com")
    sp = status_plano(oficina_basica)
    assert sp.limite_usuarios == 10
    assert sp.usuarios_ativos == 6
    assert sp.atingiu_limite is False


@pytest.mark.unit
def test_bloqueio_pode_ser_desativado_globalmente(rf_admin, oficina_basica):
    # Bloqueio off + limite atingido → assegurar não levanta
    request, _ = rf_admin
    atualizar_configuracao(request, "bloquear_ao_atingir_limite_usuarios", False)
    for i in range(5):
        _criar_funcionario(oficina_basica, f"k{i}@x.com")
    # Não deve levantar
    assegurar_pode_criar_funcionario(oficina_basica)


@pytest.fixture
def rf_admin(db):
    from django.contrib.auth import get_user_model
    from rest_framework.test import APIRequestFactory
    User = get_user_model()
    admin = User.objects.create_user(
        username="adm-plan", email="adm-plan@x.com", password="x",
        is_staff=True, is_superuser=True,
    )
    rf = APIRequestFactory()
    request = rf.post("/api/admin/configuracoes/")
    request.user = admin
    return request, admin
