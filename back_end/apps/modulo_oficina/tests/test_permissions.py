"""Testes das classes de permissão por papel.

Garantem que cada papel só consegue executar as ações documentadas:

    admin       → tudo
    gerente     → tudo exceto funcionários e perfil da oficina
    atendente   → operacional (clientes, OS, orçamento, aprovação)
    mecanico    → técnico (checklist, tarefas, finalizar OS); NÃO cria OS
    visualizador → somente leitura

A estratégia é usar o APIClient autenticado como cada papel e verificar
status code dos endpoints críticos.
"""
import pytest
from rest_framework.test import APIClient

from apps.modulo_oficina.models import Funcionario, OrdemServico


pytestmark = pytest.mark.django_db


@pytest.fixture
def client_factory(db, oficina):
    """Cria um APIClient logado como funcionário com o papel solicitado.

    Como cada user tem apenas um vínculo Funcionario, get_oficina_atual()
    encontra a oficina pelo caminho do "vínculo único" (sem precisar mexer
    em session — o que APIClient.force_authenticate não popula).
    """
    from django.contrib.auth import get_user_model

    User = get_user_model()
    counter = {"n": 0}

    def _build(papel):
        counter["n"] += 1
        username = f"user{counter['n']}_{papel}@oficina.test"
        user = User.objects.create_user(
            username=username, email=username, password="senha-1234"
        )
        Funcionario.objects.create(
            user=user, oficina=oficina, permissao=papel, is_active=True
        )
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    return _build


# ---------------------------------------------------------------------------
# Funcionários — restrito ao admin
# ---------------------------------------------------------------------------

class TestPermissoesFuncionarios:
    def test_admin_pode_listar_funcionarios(self, client_factory):
        client = client_factory("admin")
        assert client.get("/api/oficina/funcionarios/").status_code == 200

    @pytest.mark.parametrize("papel", ["gerente", "atendente", "mecanico", "visualizador"])
    def test_outros_papeis_nao_listam_funcionarios(self, client_factory, papel):
        client = client_factory(papel)
        assert client.get("/api/oficina/funcionarios/").status_code == 403


# ---------------------------------------------------------------------------
# Preços / catálogo — só gestão pode editar
# ---------------------------------------------------------------------------

class TestPermissoesPrecos:
    @pytest.mark.parametrize("papel", ["admin", "gerente"])
    def test_gestao_pode_alterar_valor_hora(self, client_factory, papel):
        client = client_factory(papel)
        resp = client.put(
            "/api/oficina/configuracao/", {"valor_hora": 100}, format="json",
        )
        assert resp.status_code == 200

    @pytest.mark.parametrize("papel", ["atendente", "mecanico", "visualizador"])
    def test_outros_papeis_nao_alteram_valor_hora(self, client_factory, papel):
        client = client_factory(papel)
        resp = client.put(
            "/api/oficina/configuracao/", {"valor_hora": 100}, format="json",
        )
        assert resp.status_code == 403

    @pytest.mark.parametrize("papel", ["atendente", "mecanico", "visualizador"])
    def test_outros_papeis_leem_valor_hora(self, client_factory, papel):
        client = client_factory(papel)
        assert client.get("/api/oficina/configuracao/").status_code == 200


# ---------------------------------------------------------------------------
# Criar OS — só operacional
# ---------------------------------------------------------------------------

class TestPermissoesOS:
    PAYLOAD_OS = {
        "nome_cliente": "Maria Silva",
        "cpf_cnpj": "111.222.333-44",
        "placa": "ABC1D23",
        "modelo": "Onix",
        "km_atual": 50000,
    }

    @pytest.mark.parametrize("papel", ["admin", "gerente", "atendente"])
    def test_operacional_pode_criar_os(self, client_factory, papel):
        client = client_factory(papel)
        resp = client.post("/api/oficina/os/criar/", self.PAYLOAD_OS, format="json")
        assert resp.status_code == 201

    @pytest.mark.parametrize("papel", ["mecanico", "visualizador"])
    def test_papeis_nao_operacionais_nao_criam_os(self, client_factory, papel):
        client = client_factory(papel)
        resp = client.post("/api/oficina/os/criar/", self.PAYLOAD_OS, format="json")
        assert resp.status_code == 403

    def test_visualizador_le_lista_de_os(self, client_factory):
        client = client_factory("visualizador")
        assert client.get("/api/oficina/os/").status_code == 200


# ---------------------------------------------------------------------------
# Mecânico — atua APENAS na aba Execução (executa/atualiza tarefas).
# Não pode aprovar orçamento e não pode finalizar OS (status crítico que
# libera fatura/SLA — fica reservado para operacional/admin).
# ---------------------------------------------------------------------------

class TestPermissoesMecanico:
    def test_mecanico_nao_pode_finalizar_os(self, client_factory, ordem_servico):
        """Finalizar OS é status crítico — restrito a operacional/admin."""
        client = client_factory("mecanico")
        resp = client.post(f"/api/oficina/os/{ordem_servico.id}/finalizar/")
        assert resp.status_code == 403

    def test_operacional_pode_finalizar_os(self, client_factory, ordem_servico):
        client = client_factory("atendente")
        resp = client.post(f"/api/oficina/os/{ordem_servico.id}/finalizar/")
        assert resp.status_code == 200

    def test_mecanico_nao_aprova_orcamento(self, client_factory, ordem_servico):
        client = client_factory("mecanico")
        resp = client.post(
            f"/api/oficina/os/{ordem_servico.id}/aprovacao/",
            {"itens": [], "termo_aceito": True},
            format="json",
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Anônimo / sem vínculo — sempre 401/403
# ---------------------------------------------------------------------------

class TestSemVinculo:
    def test_anonimo_nao_acessa_dashboard(self):
        client = APIClient()
        assert client.get("/api/oficina/dashboard/").status_code in (401, 403)

    def test_user_sem_funcionario_nao_acessa(self, db):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        user = User.objects.create_user(
            username="orfao", email="orfao@x.test", password="x"
        )
        client = APIClient()
        client.force_authenticate(user=user)
        # Sem Funcionario → IsFuncionario falha
        assert client.get("/api/oficina/dashboard/").status_code == 403
