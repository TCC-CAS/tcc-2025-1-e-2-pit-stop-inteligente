"""Testes do endpoint de categorias de veículo (fixas + customizadas)."""
import pytest
from rest_framework.test import APIClient

from apps.modulo_oficina.models import (
    CategoriaVeiculoCustom,
    Funcionario,
    Oficina,
)


pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_oficina(db):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    oficina = Oficina.objects.create(
        nome="Of", cnpj="00000000000114", plano_atual="basico",
    )
    user = User.objects.create_user(username="adm-c", email="adm-c@x.com", password="x")
    Funcionario.objects.create(user=user, oficina=oficina, permissao="admin")
    return oficina, user


@pytest.fixture
def client_logado(admin_oficina):
    oficina, user = admin_oficina
    client = APIClient()
    client.force_authenticate(user)
    # Seleciona a oficina na sessão (replica o que o LoginView faz)
    session = client.session
    session["oficina_id"] = oficina.id
    session.save()
    return client


@pytest.mark.integration
def test_listagem_traz_6_fixas_no_inicio(client_logado):
    resp = client_logado.get("/api/oficina/categorias/")
    assert resp.status_code == 200
    fixas = [c for c in resp.data if c["tipo"] == "fixa"]
    assert len(fixas) == 6
    assert fixas[0]["nome"] == "Carros Populares"


@pytest.mark.integration
def test_criar_categoria_custom_aparece_na_listagem(client_logado, admin_oficina):
    oficina, _ = admin_oficina
    resp = client_logado.post(
        "/api/oficina/categorias/",
        {"nome": "Motos custom", "percentual": 12.5, "icone": "fa-motorcycle", "cor": "#0ea5e9"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["id"] >= 1000

    resp = client_logado.get("/api/oficina/categorias/")
    nomes = [c["nome"] for c in resp.data]
    assert "Motos custom" in nomes


@pytest.mark.integration
def test_nao_permite_nome_igual_a_fixa(client_logado):
    resp = client_logado.post(
        "/api/oficina/categorias/",
        {"nome": "Carros Populares", "percentual": 1},
        format="json",
    )
    assert resp.status_code == 400
    assert "fixa" in resp.data["erro"].lower()


@pytest.mark.integration
def test_alterar_percentual_de_fixa(client_logado):
    resp = client_logado.put(
        "/api/oficina/categorias/1/",
        {"percentual": 7.5},
        format="json",
    )
    assert resp.status_code == 200
    assert float(resp.data["percentual"]) == 7.5


@pytest.mark.integration
def test_excluir_custom_remove_do_banco(client_logado, admin_oficina):
    oficina, _ = admin_oficina
    cc = CategoriaVeiculoCustom.objects.create(
        oficina=oficina, nome="Caminhões",
    )
    resp = client_logado.delete(f"/api/oficina/categorias/{1000 + cc.id}/")
    assert resp.status_code == 200
    assert not CategoriaVeiculoCustom.objects.filter(id=cc.id).exists()


@pytest.mark.integration
def test_nao_permite_excluir_categoria_fixa(client_logado):
    resp = client_logado.delete("/api/oficina/categorias/1/")
    assert resp.status_code == 400
    assert "fixa" in resp.data["erro"].lower()
