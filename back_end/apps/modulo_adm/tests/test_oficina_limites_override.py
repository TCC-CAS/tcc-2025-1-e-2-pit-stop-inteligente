"""Testes do override de limites por oficina (substitui defaults do plano)."""
import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.modulo_adm.models import AuditoriaLog
from apps.modulo_adm.services.configuracoes_service import (
    aplicar_seed_inicial,
    invalidar_cache,
)
from apps.modulo_oficina.models import (
    Funcionario,
    Oficina,
    OficinaLimitesOverride,
)
from apps.modulo_oficina.services.consumo_service import (
    consumo_os_mes,
    consumo_storage,
    consumo_usuarios,
)


pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _seed_e_cache():
    aplicar_seed_inicial()
    invalidar_cache()
    yield
    invalidar_cache()


@pytest.fixture
def admin_user(db):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    return User.objects.create_user(
        username="adm-ov", email="adm-ov@x.com",
        password="senha-forte-123", is_staff=True, is_superuser=True,
    )


@pytest.fixture
def oficina_basica(db):
    return Oficina.objects.create(
        nome="OFov", cnpj="00000000000601", plano_atual="basico",
    )


# ---------------------------------------------------------------------------
# Service: consumo_* respeita override
# ---------------------------------------------------------------------------

@pytest.mark.unit
def test_consumo_usuarios_default_quando_nao_ha_override(oficina_basica):
    r = consumo_usuarios(oficina_basica)
    assert r.limite == 5  # default do plano básico


@pytest.mark.unit
def test_consumo_usuarios_usa_override_quando_existe(oficina_basica):
    OficinaLimitesOverride.objects.create(
        oficina=oficina_basica, limite_usuarios=50,
    )
    r = consumo_usuarios(oficina_basica)
    assert r.limite == 50


@pytest.mark.unit
def test_consumo_os_mes_respeita_override(oficina_basica):
    OficinaLimitesOverride.objects.create(
        oficina=oficina_basica, limite_os_mensal=500,
    )
    r = consumo_os_mes(oficina_basica)
    assert r.limite == 500


@pytest.mark.unit
def test_consumo_storage_respeita_override(oficina_basica):
    OficinaLimitesOverride.objects.create(
        oficina=oficina_basica, limite_storage_mb=5000,
    )
    r = consumo_storage(oficina_basica)
    assert r.limite == 5000


@pytest.mark.unit
def test_override_parcial_aplica_apenas_aos_campos_definidos(oficina_basica):
    """Sobrescrever só `limite_usuarios` mantém os outros no default do plano."""
    OficinaLimitesOverride.objects.create(
        oficina=oficina_basica, limite_usuarios=20,
        # OS e storage ficam null → usa default do plano
    )
    assert consumo_usuarios(oficina_basica).limite == 20
    assert consumo_os_mes(oficina_basica).limite == 100   # default básico
    assert consumo_storage(oficina_basica).limite == 1024  # default básico


# ---------------------------------------------------------------------------
# Endpoint PUT /api/admin/oficinas/<id>/limites/
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_put_limites_cria_override(admin_user, oficina_basica):
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.put(
        reverse("adm-oficina-limites", args=[oficina_basica.id]),
        {
            "limite_usuarios": 30,
            "limite_os_mensal": 1500,
            "limite_storage_mb": 5000,
            "motivo": "Piloto TCC",
        },
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert OficinaLimitesOverride.objects.filter(oficina=oficina_basica).exists()
    ov = OficinaLimitesOverride.objects.get(oficina=oficina_basica)
    assert ov.limite_usuarios == 30
    assert ov.motivo == "Piloto TCC"
    assert ov.atualizado_por_id == admin_user.id


@pytest.mark.integration
def test_put_com_null_remove_o_override_daquele_campo(admin_user, oficina_basica):
    """Mandar null em um campo = "voltar ao default do plano para este campo"."""
    OficinaLimitesOverride.objects.create(
        oficina=oficina_basica, limite_usuarios=99, limite_os_mensal=99,
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.put(
        reverse("adm-oficina-limites", args=[oficina_basica.id]),
        {"limite_usuarios": None, "limite_os_mensal": 99},
        format="json",
    )
    assert resp.status_code == 200
    ov = OficinaLimitesOverride.objects.get(oficina=oficina_basica)
    assert ov.limite_usuarios is None  # voltou ao default
    assert ov.limite_os_mensal == 99   # mantido


@pytest.mark.integration
def test_put_valor_invalido_retorna_400(admin_user, oficina_basica):
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.put(
        reverse("adm-oficina-limites", args=[oficina_basica.id]),
        {"limite_usuarios": "abc"},
        format="json",
    )
    assert resp.status_code == 400
    assert "inteiro" in resp.json()["erro"].lower()


@pytest.mark.integration
def test_delete_remove_override_inteiro(admin_user, oficina_basica):
    OficinaLimitesOverride.objects.create(
        oficina=oficina_basica, limite_usuarios=99,
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.delete(
        reverse("adm-oficina-limites", args=[oficina_basica.id]),
    )
    assert resp.status_code == 200
    assert not OficinaLimitesOverride.objects.filter(oficina=oficina_basica).exists()


@pytest.mark.integration
def test_put_gera_auditoria(admin_user, oficina_basica):
    client = APIClient()
    client.force_authenticate(admin_user)
    client.put(
        reverse("adm-oficina-limites", args=[oficina_basica.id]),
        {"limite_usuarios": 30, "motivo": "auditoria"},
        format="json",
    )
    logs = AuditoriaLog.objects.filter(acao="oficina.limites_override")
    assert logs.count() == 1
    assert logs.first().metadados["oficina_id"] == oficina_basica.id


# ---------------------------------------------------------------------------
# Endpoint GET /api/admin/oficinas/<id>/consumo/ retorna `override`
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_get_consumo_inclui_metadados_do_override(admin_user, oficina_basica):
    OficinaLimitesOverride.objects.create(
        oficina=oficina_basica,
        limite_usuarios=30,
        motivo="piloto comercial",
        atualizado_por=admin_user,
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get(
        reverse("adm-oficina-consumo", args=[oficina_basica.id]),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["override"]["limite_usuarios"] == 30
    assert body["override"]["motivo"] == "piloto comercial"
    assert body["override"]["atualizado_por"]


@pytest.mark.integration
def test_get_consumo_sem_override_retorna_null(admin_user, oficina_basica):
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get(
        reverse("adm-oficina-consumo", args=[oficina_basica.id]),
    )
    assert resp.status_code == 200
    assert resp.json()["override"]["limite_usuarios"] is None


# ---------------------------------------------------------------------------
# Permissão
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_admin_de_oficina_nao_pode_editar_limites(oficina_basica):
    """Funcionario.permissao='admin' NÃO é admin global — não deve passar."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    user = User.objects.create_user(
        username="adm-of", email="adm-of@x.com", password="x",
    )
    Funcionario.objects.create(user=user, oficina=oficina_basica, permissao="admin")

    client = APIClient()
    client.force_authenticate(user)
    resp = client.put(
        reverse("adm-oficina-limites", args=[oficina_basica.id]),
        {"limite_usuarios": 100},
        format="json",
    )
    assert resp.status_code in (401, 403)
