"""Testes do endpoint que cria Ticket a partir de um grupo de erro.

Corrige o bug onde o botão "Gerar ticket" do Saúde não criava nada.
"""
import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.modulo_adm.models import (
    AuditoriaLog,
    EventoErroProducao,
    GrupoErroProducao,
)
from apps.modulo_suporte.models import Ticket


pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_user(db):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    return User.objects.create_user(
        username="adm-ticket",
        email="adm-ticket@x.com",
        password="senha-forte-123",
        is_staff=True,
        is_superuser=True,
    )


@pytest.fixture
def grupo_erro(db):
    """Cria um grupo com 12 ocorrências e severidade 'error'."""
    g = GrupoErroProducao.objects.create(
        fingerprint="abc123fingerprint",
        titulo="IntegrityError em POST /api/admin/oficinas/",
        mensagem_tecnica="duplicate key value violates unique constraint",
        tipo_excecao="IntegrityError",
        endpoint="/api/admin/oficinas/",
        metodo_http="POST",
        servico="modulo_adm",
        severidade="error",
        status="aberto",
        ambiente="producao",
        total_eventos=12,
        usuarios_afetados=3,
    )
    return g


@pytest.fixture
def grupo_critico(db):
    return GrupoErroProducao.objects.create(
        fingerprint="critico-fp",
        titulo="OOM em fila de processamento",
        mensagem_tecnica="MemoryError",
        tipo_excecao="MemoryError",
        endpoint="/api/oficina/dashboard/",
        metodo_http="GET",
        servico="modulo_oficina",
        severidade="critical",
        status="aberto",
        ambiente="producao",
        total_eventos=99,
        usuarios_afetados=50,
    )


# ---------------------------------------------------------------------------
# Casos felizes
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_gerar_ticket_cria_ticket_com_prioridade_alta(admin_user, grupo_erro):
    """severidade='error' → prioridade='alta'."""
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.post(
        reverse("adm-saude-erro-gerar-ticket", args=[grupo_erro.id]),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["ticket_id"] > 0
    assert body["prioridade"] == "alta"

    ticket = Ticket.objects.get(id=body["ticket_id"])
    assert ticket.categoria == "tecnico"
    assert ticket.origem == "admin"
    assert ticket.autor_user_id == admin_user.id
    assert "[Saúde]" in ticket.titulo


@pytest.mark.integration
def test_severidade_critica_vira_prioridade_urgente(admin_user, grupo_critico):
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.post(
        reverse("adm-saude-erro-gerar-ticket", args=[grupo_critico.id]),
    )
    assert resp.status_code == 201
    assert resp.json()["prioridade"] == "urgente"


@pytest.mark.integration
def test_descricao_contem_dados_do_grupo(admin_user, grupo_erro):
    """A descrição do ticket deve trazer ocorrências, endpoint, etc."""
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.post(
        reverse("adm-saude-erro-gerar-ticket", args=[grupo_erro.id]),
    )
    ticket = Ticket.objects.get(id=resp.json()["ticket_id"])
    descricao = ticket.descricao
    assert "12" in descricao              # ocorrências
    assert "IntegrityError" in descricao  # tipo da exceção
    assert "/api/admin/oficinas/" in descricao
    assert "modulo_adm" in descricao
    assert f"#{grupo_erro.id}" in descricao


@pytest.mark.integration
def test_gera_log_de_auditoria(admin_user, grupo_erro):
    client = APIClient()
    client.force_authenticate(admin_user)
    client.post(
        reverse("adm-saude-erro-gerar-ticket", args=[grupo_erro.id]),
    )
    logs = AuditoriaLog.objects.filter(acao="saude.gerar_ticket")
    assert logs.count() == 1
    log = logs.first()
    assert log.metadados["grupo_id"] == grupo_erro.id


# ---------------------------------------------------------------------------
# Permissão
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_nao_admin_nao_pode_gerar_ticket(grupo_erro):
    """Usuário comum (sem is_staff) recebe 401/403."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    user = User.objects.create_user(username="comum", email="comum@x.com", password="x")
    client = APIClient()
    client.force_authenticate(user)
    resp = client.post(
        reverse("adm-saude-erro-gerar-ticket", args=[grupo_erro.id]),
    )
    assert resp.status_code in (401, 403)


@pytest.mark.integration
def test_grupo_inexistente_retorna_404(admin_user):
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.post(reverse("adm-saude-erro-gerar-ticket", args=[999999]))
    assert resp.status_code == 404
