"""Testes de integração dos endpoints de consumo e da quota mensal."""
import pytest
from rest_framework.test import APIClient

from apps.modulo_adm.services.configuracoes_service import (
    aplicar_seed_inicial,
    atualizar_configuracao,
    invalidar_cache,
)
from apps.modulo_oficina.models import Funcionario, Oficina


pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _seed_e_cache():
    aplicar_seed_inicial()
    invalidar_cache()
    yield
    invalidar_cache()


@pytest.fixture
def admin_oficina(db):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    of = Oficina.objects.create(nome="OFv", cnpj="00000000000401", plano_atual="basico")
    user = User.objects.create_user(
        username="adm-v@x.com", email="adm-v@x.com", password="senha-forte-123",
    )
    Funcionario.objects.create(user=user, oficina=of, permissao="admin")
    return of, user


@pytest.fixture
def client_logado(admin_oficina):
    of, user = admin_oficina
    c = APIClient()
    assert c.login(username="adm-v@x.com", password="senha-forte-123")
    s = c.session
    s["oficina_id"] = of.id
    s.save()
    return c, of, user


@pytest.fixture
def rf_admin(db):
    from django.contrib.auth import get_user_model
    from rest_framework.test import APIRequestFactory
    User = get_user_model()
    adm = User.objects.create_user(
        username="staff-v", email="staff-v@x.com", password="x",
        is_staff=True, is_superuser=True,
    )
    rf = APIRequestFactory()
    req = rf.post("/api/admin/configuracoes/")
    req.user = adm
    return req


# ---------------------------------------------------------------------------
# Endpoint /api/oficina/consumo/
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_consumo_oficina_retorna_payload_esperado(client_logado):
    client, of, _ = client_logado
    resp = client.get("/api/oficina/consumo/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["oficina_id"] == of.id
    assert body["plano"] == "basico"
    chaves = {r["chave"] for r in body["recursos"]}
    assert chaves == {"usuarios", "os_mensal", "storage_mb"}


# ---------------------------------------------------------------------------
# Bloqueio na criação de OS quando estoura quota mensal
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_criar_os_retorna_402_quando_quota_estourada(client_logado, rf_admin):
    client, of, _ = client_logado
    # Reduz para 1 e cria uma → próxima tentativa deve dar 402
    atualizar_configuracao(rf_admin, "limite_os_mensal_basico", 1)

    payload = {
        "cpf_cnpj": "11122233344",
        "nome_cliente": "C",
        "placa": "AAA1A11",
        "modelo": "X",
        "km_atual": 10000,
    }
    r1 = client.post("/api/oficina/os/criar/", payload, format="json")
    assert r1.status_code == 201, r1.json()

    r2 = client.post("/api/oficina/os/criar/", payload, format="json")
    assert r2.status_code == 402
    body = r2.json()
    assert body["quota_estourada"] is True
    assert "Limite mensal" in body["erro"]


@pytest.mark.integration
def test_criar_os_passa_quando_bloqueio_desativado(client_logado, rf_admin):
    """Mesma situação, mas com `bloquear_ao_atingir_limite_os=False` deve passar."""
    client, of, _ = client_logado
    atualizar_configuracao(rf_admin, "limite_os_mensal_basico", 1)
    atualizar_configuracao(rf_admin, "bloquear_ao_atingir_limite_os", False)

    payload = {
        "cpf_cnpj": "55566677788",
        "nome_cliente": "Y",
        "placa": "BBB2B22",
        "modelo": "Z",
        "km_atual": 1000,
    }
    client.post("/api/oficina/os/criar/", payload, format="json")
    r2 = client.post("/api/oficina/os/criar/", payload, format="json")
    assert r2.status_code == 201


# ---------------------------------------------------------------------------
# Endpoints do painel SaaS
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_admin_ve_consumo_de_uma_oficina(rf_admin, admin_oficina):
    of, _ = admin_oficina
    client = APIClient()
    client.force_authenticate(rf_admin.user)
    resp = client.get(f"/api/admin/oficinas/{of.id}/consumo/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["oficina_id"] == of.id
    assert {r["chave"] for r in body["recursos"]} == {"usuarios", "os_mensal", "storage_mb"}


@pytest.mark.integration
def test_admin_ve_consumo_global_paginado(rf_admin, admin_oficina):
    client = APIClient()
    client.force_authenticate(rf_admin.user)
    resp = client.get("/api/admin/consumo/")
    assert resp.status_code == 200
    body = resp.json()
    assert "results" in body
    assert "alertas" in body
    assert body["alertas"]["criticas"] >= 0


@pytest.mark.integration
def test_acesso_admin_global_e_obrigatorio_no_painel_saas(client_logado):
    """Admin de OFICINA (não staff) não deve poder ver /api/admin/consumo/."""
    client, _, _ = client_logado
    resp = client.get("/api/admin/consumo/")
    assert resp.status_code in (401, 403)
