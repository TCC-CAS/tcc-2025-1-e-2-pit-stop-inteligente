"""Testes do fluxo de criação/resposta de ticket pelo cliente (bug 400)."""
import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.modulo_oficina.models import Cliente, Oficina


pytestmark = pytest.mark.django_db


@pytest.fixture
def oficina(db):
    return Oficina.objects.create(
        nome="Oficina Teste",
        cnpj="00000000000191",
        email="of@teste.com",
    )


@pytest.fixture
def cliente(db, oficina):
    return Cliente.objects.create(
        oficina=oficina,
        nome="Cliente Teste",
        cpf_cnpj="11122233344",
        email="cli@teste.com",
    )


@pytest.fixture
def client_autenticado(cliente):
    """APIClient com a sessão de cliente já populada."""
    client = APIClient()
    session = client.session
    session["cliente_id"] = cliente.id
    session.save()
    return client


@pytest.mark.integration
def test_cria_ticket_valido_retorna_201(client_autenticado):
    resp = client_autenticado.post(
        "/api/cliente/suporte/tickets/",
        {
            "titulo": "Não consigo acompanhar a OS",
            "descricao": "A página fica travada quando clico em ver detalhes.",
            "categoria": "tecnico",
            "prioridade": "normal",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["titulo"] == "Não consigo acompanhar a OS"


@pytest.mark.integration
def test_titulo_curto_retorna_mensagem_clara_no_400(client_autenticado):
    """O bug original: 400 sem mensagem útil. A correção garante texto legível."""
    resp = client_autenticado.post(
        "/api/cliente/suporte/tickets/",
        {"titulo": "ola", "descricao": "tudo bem mesmo"},
        format="json",
    )
    assert resp.status_code == 400
    assert "titulo" in resp.data
    msg = resp.data["titulo"]
    if isinstance(msg, list):
        msg = " ".join(msg)
    assert "4 caracteres" in msg


@pytest.mark.integration
def test_descricao_curta_retorna_mensagem_clara_no_400(client_autenticado):
    resp = client_autenticado.post(
        "/api/cliente/suporte/tickets/",
        {"titulo": "Ticket válido", "descricao": "pouco"},
        format="json",
    )
    assert resp.status_code == 400
    assert "descricao" in resp.data


@pytest.mark.integration
def test_mensagem_em_ticket_inexistente_da_404(client_autenticado):
    resp = client_autenticado.post(
        "/api/cliente/suporte/tickets/99999/mensagens/",
        {"conteudo": "olá"},
        format="json",
    )
    assert resp.status_code == 404


@pytest.mark.integration
def test_mensagem_vazia_em_ticket_existente_da_400_amigavel(client_autenticado, cliente):
    """O conteudo vazio dispara um ValueError → 400 com mensagem clara."""
    from apps.modulo_suporte.models import Ticket
    ticket = Ticket.objects.create(
        titulo="x" * 5, descricao="x" * 20,
        origem="cliente", oficina=cliente.oficina, autor_cliente=cliente,
    )

    resp = client_autenticado.post(
        f"/api/cliente/suporte/tickets/{ticket.id}/mensagens/",
        {"conteudo": "   "},
        format="json",
    )
    assert resp.status_code == 400
    assert "vazia" in resp.data["erro"].lower()
