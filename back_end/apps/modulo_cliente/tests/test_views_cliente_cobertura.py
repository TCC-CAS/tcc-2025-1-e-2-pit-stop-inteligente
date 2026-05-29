"""Bateria de testes para views do modulo_cliente + suporte (cobertura).

Cobre login do cliente, listagem de OS, checklist, documentos, histórico,
aprovação/rejeição de itens, suporte (oficina+cliente views) e suporte_service.
"""
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.modulo_cliente.models import CodigoAcessoOS
from apps.modulo_oficina.models import (
    ChecklistRecebimento,
    Cliente,
    Documento,
    HistoricoOS,
    ItemOrcamento,
    Oficina,
    OrdemServico,
    Veiculo,
)
from apps.modulo_suporte.models import Ticket, MensagemTicket


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def oficina(db):
    return Oficina.objects.create(nome="OFcli", cnpj="00000000000222")


@pytest.fixture
def cliente(db, oficina):
    return Cliente.objects.create(oficina=oficina, nome="Cliente X", cpf_cnpj="12345678901")


@pytest.fixture
def os_obj(db, oficina, cliente):
    v = Veiculo.objects.create(cliente=cliente, placa="ZZZ1Z11", modelo="X")
    return OrdemServico.objects.create(oficina=oficina, cliente=cliente, veiculo=v)


@pytest.fixture
def codigo(db, os_obj):
    return CodigoAcessoOS.gerar(os_obj)


@pytest.fixture
def client_cliente(db, cliente):
    """APIClient com sessão de cliente já populada."""
    c = APIClient(HTTP_USER_AGENT="Mozilla/5.0")
    s = c.session
    s["cliente_id"] = cliente.id
    s.save()
    return c


# ---------------------------------------------------------------------------
# Login do cliente
# ---------------------------------------------------------------------------

class TestClienteAuth:
    def test_csrf(self):
        c = APIClient(HTTP_USER_AGENT="Mozilla/5.0")
        resp = c.get("/api/cliente/auth/csrf/")
        assert resp.status_code == 200

    def test_login_codigo_valido(self, codigo, cliente):
        c = APIClient(HTTP_USER_AGENT="Mozilla/5.0")
        resp = c.post(
            "/api/cliente/auth/login/",
            {"cpf_cnpj": cliente.cpf_cnpj, "codigo": codigo.codigo},
            format="json",
        )
        assert resp.status_code == 200

    def test_login_codigo_invalido_400(self, cliente):
        c = APIClient(HTTP_USER_AGENT="Mozilla/5.0")
        resp = c.post(
            "/api/cliente/auth/login/",
            {"cpf_cnpj": cliente.cpf_cnpj, "codigo": "ZZZZZZZZ"},
            format="json",
        )
        assert resp.status_code == 400

    def test_me_e_logout(self, client_cliente):
        resp = client_cliente.get("/api/cliente/auth/me/")
        assert resp.status_code == 200
        resp = client_cliente.post("/api/cliente/auth/logout/")
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# OS / checklist / documentos / histórico / itens
# ---------------------------------------------------------------------------

class TestOSCliente:
    def test_listar_os(self, client_cliente, os_obj):
        resp = client_cliente.get("/api/cliente/os/")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_detalhe_os(self, client_cliente, os_obj):
        resp = client_cliente.get(f"/api/cliente/os/{os_obj.id}/")
        assert resp.status_code == 200

    def test_detalhe_os_de_outro_cliente_404(self, client_cliente, oficina):
        outro = Cliente.objects.create(oficina=oficina, nome="O", cpf_cnpj="99988877766")
        v = Veiculo.objects.create(cliente=outro, placa="OUT2A22", modelo="Y")
        outra_os = OrdemServico.objects.create(oficina=oficina, cliente=outro, veiculo=v)
        resp = client_cliente.get(f"/api/cliente/os/{outra_os.id}/")
        assert resp.status_code == 404


class TestChecklistCliente:
    def test_get_checklist(self, client_cliente, os_obj):
        ChecklistRecebimento.objects.create(os=os_obj, concluido=True)
        resp = client_cliente.get(f"/api/cliente/os/{os_obj.id}/checklist/")
        assert resp.status_code == 200

    def test_assinar_checklist_invalido(self, client_cliente, os_obj):
        ChecklistRecebimento.objects.create(os=os_obj)
        resp = client_cliente.post(
            f"/api/cliente/os/{os_obj.id}/checklist/assinar/",
            {"assinatura": ""}, format="json",
        )
        assert resp.status_code == 400

    def test_assinar_checklist_valido(self, client_cliente, os_obj):
        ChecklistRecebimento.objects.create(os=os_obj)
        resp = client_cliente.post(
            f"/api/cliente/os/{os_obj.id}/checklist/assinar/",
            {"assinatura": "data:image/png;base64,iVBOR="}, format="json",
        )
        assert resp.status_code == 200


class TestDocumentosHistoricoCliente:
    def test_documentos(self, client_cliente, os_obj):
        resp = client_cliente.get(f"/api/cliente/os/{os_obj.id}/documentos/")
        assert resp.status_code == 200

    def test_historico(self, client_cliente, os_obj):
        HistoricoOS.objects.create(os=os_obj, tipo="criacao", descricao="X")
        resp = client_cliente.get(f"/api/cliente/os/{os_obj.id}/historico/")
        assert resp.status_code == 200


class TestItensECliente:
    def test_listar_itens(self, client_cliente, os_obj):
        ItemOrcamento.objects.create(
            os=os_obj, tipo="servico", nome_descricao="Troca",
            quantidade=1, valor_unitario=Decimal("100"),
        )
        resp = client_cliente.get(f"/api/cliente/os/{os_obj.id}/itens/")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_decisao_individual(self, client_cliente, os_obj):
        item = ItemOrcamento.objects.create(
            os=os_obj, tipo="servico", nome_descricao="Troca",
            quantidade=1, valor_unitario=Decimal("100"),
        )
        resp = client_cliente.post(
            f"/api/cliente/os/{os_obj.id}/itens/{item.id}/decisao/",
            {"status": "aprovado", "justificativa": "ok"}, format="json",
        )
        assert resp.status_code == 200

    def test_decisao_invalida_400(self, client_cliente, os_obj):
        item = ItemOrcamento.objects.create(
            os=os_obj, tipo="servico", nome_descricao="X",
            quantidade=1, valor_unitario=Decimal("100"),
        )
        resp = client_cliente.post(
            f"/api/cliente/os/{os_obj.id}/itens/{item.id}/decisao/",
            {"status": "ruim"}, format="json",
        )
        assert resp.status_code == 400

    def test_aprovacao_lote(self, client_cliente, os_obj):
        item = ItemOrcamento.objects.create(
            os=os_obj, tipo="servico", nome_descricao="X",
            quantidade=1, valor_unitario=Decimal("100"),
        )
        resp = client_cliente.post(
            f"/api/cliente/os/{os_obj.id}/aprovar/",
            {
                "termo_aceito": True,
                "itens": [{"id": item.id, "status": "aprovado"}],
            },
            format="json",
        )
        assert resp.status_code == 200

    def test_aprovacao_sem_termo_400(self, client_cliente, os_obj):
        resp = client_cliente.post(
            f"/api/cliente/os/{os_obj.id}/aprovar/",
            {"termo_aceito": False, "itens": []}, format="json",
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# SUPORTE — services + views
# ---------------------------------------------------------------------------

@pytest.fixture
def oficina_e_funcionario(db, oficina):
    """Cria um Funcionario admin na oficina para abrir tickets."""
    from django.contrib.auth import get_user_model
    from apps.modulo_oficina.models import Funcionario
    User = get_user_model()
    user = User.objects.create_user(
        username="sup-fun@x.com", email="sup-fun@x.com", password="senha-de-teste-123",
    )
    Funcionario.objects.create(user=user, oficina=oficina, permissao="admin")
    return oficina, user


@pytest.fixture
def client_oficina(oficina_e_funcionario):
    """APIClient autenticado como funcionário da oficina."""
    oficina, user = oficina_e_funcionario
    c = APIClient(HTTP_USER_AGENT="Mozilla/5.0")
    assert c.login(username=user.username, password="senha-de-teste-123")
    s = c.session
    s["oficina_atual_id"] = oficina.id
    s.save()
    return c


class TestSuporteOficina:
    def test_listar_tickets(self, client_oficina, oficina_e_funcionario):
        oficina, _ = oficina_e_funcionario
        Ticket.objects.create(
            titulo="aaaa", descricao="bbbbbbbbbb", oficina=oficina, origem="oficina",
        )
        resp = client_oficina.get("/api/oficina/suporte/tickets/")
        assert resp.status_code == 200

    def test_listar_com_filtros(self, client_oficina):
        resp = client_oficina.get(
            "/api/oficina/suporte/tickets/?status=aberto&prioridade=normal&busca=x",
        )
        assert resp.status_code == 200

    def test_criar_ticket(self, client_oficina):
        resp = client_oficina.post(
            "/api/oficina/suporte/tickets/",
            {
                "titulo": "Falha no boleto",
                "descricao": "Não consigo gerar boleto.",
                "categoria": "financeiro",
                "prioridade": "alta",
            },
            format="json",
        )
        assert resp.status_code == 201
        ticket_id = resp.json()["id"]
        # Detalhe
        resp = client_oficina.get(f"/api/oficina/suporte/tickets/{ticket_id}/")
        assert resp.status_code == 200
        # Responder
        resp = client_oficina.post(
            f"/api/oficina/suporte/tickets/{ticket_id}/mensagens/",
            {"conteudo": "Detalhes adicionais."}, format="json",
        )
        assert resp.status_code in (200, 201)
        # Fechar
        resp = client_oficina.patch(
            f"/api/oficina/suporte/tickets/{ticket_id}/",
            {"acao": "fechar", "motivo": "resolvi"}, format="json",
        )
        assert resp.status_code == 200

    def test_criar_ticket_invalido(self, client_oficina):
        resp = client_oficina.post(
            "/api/oficina/suporte/tickets/",
            {"titulo": "", "descricao": ""}, format="json",
        )
        assert resp.status_code == 400

    def test_mensagem_em_ticket_inexistente_404(self, client_oficina):
        resp = client_oficina.post(
            "/api/oficina/suporte/tickets/999999/mensagens/",
            {"conteudo": "x"}, format="json",
        )
        assert resp.status_code == 404

    def test_responder_mensagem_vazia(self, client_oficina, oficina_e_funcionario):
        oficina, user = oficina_e_funcionario
        t = Ticket.objects.create(
            titulo="t", descricao="dddddddddd", oficina=oficina,
            origem="oficina", autor_user=user,
        )
        resp = client_oficina.post(
            f"/api/oficina/suporte/tickets/{t.id}/mensagens/",
            {"conteudo": "   "}, format="json",
        )
        assert resp.status_code == 400

    def test_patch_acao_invalida(self, client_oficina, oficina_e_funcionario):
        oficina, user = oficina_e_funcionario
        t = Ticket.objects.create(
            titulo="t", descricao="dddddddddd", oficina=oficina,
            origem="oficina", autor_user=user,
        )
        resp = client_oficina.patch(
            f"/api/oficina/suporte/tickets/{t.id}/",
            {"acao": "transformar_em_lasanha"}, format="json",
        )
        assert resp.status_code == 400

    def test_sumario(self, client_oficina):
        resp = client_oficina.get("/api/oficina/suporte/sumario/")
        assert resp.status_code == 200


class TestSuporteAdmin:
    @pytest.fixture
    def admin_client(self, db):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        u = User.objects.create_user(
            username="adm-supp", email="adm-supp@x.com", password="x",
            is_staff=True, is_superuser=True,
        )
        c = APIClient(HTTP_USER_AGENT="Mozilla/5.0")
        c.force_authenticate(u)
        return c

    def test_listar_e_filtros(self, admin_client, oficina):
        Ticket.objects.create(
            titulo="tttt", descricao="aaaaaaaaaa", oficina=oficina, origem="oficina",
        )
        resp = admin_client.get("/api/admin/suporte/tickets/")
        assert resp.status_code == 200
        resp = admin_client.get(
            "/api/admin/suporte/tickets/"
            f"?status=aberto&prioridade=normal&categoria=duvida&origem=oficina"
            f"&oficina_id={oficina.id}&busca=tttt&page=abc&page_size=xxx",
        )
        assert resp.status_code == 200

    def test_detalhe_e_patch(self, admin_client, oficina):
        t = Ticket.objects.create(
            titulo="aa", descricao="bbbbbbbbbb", oficina=oficina, origem="cliente",
        )
        resp = admin_client.get(f"/api/admin/suporte/tickets/{t.id}/")
        assert resp.status_code == 200
        resp = admin_client.patch(
            f"/api/admin/suporte/tickets/{t.id}/",
            {"status": "em_atendimento", "prioridade": "alta"}, format="json",
        )
        assert resp.status_code == 200

    def test_mensagem(self, admin_client, oficina):
        t = Ticket.objects.create(
            titulo="aa", descricao="bbbbbbbbbb", oficina=oficina, origem="cliente",
        )
        resp = admin_client.post(
            f"/api/admin/suporte/tickets/{t.id}/mensagens/",
            {"conteudo": "Resposta do admin.", "eh_interna": False},
            format="json",
        )
        assert resp.status_code in (200, 201)

    def test_mensagem_interna(self, admin_client, oficina):
        t = Ticket.objects.create(
            titulo="aa", descricao="bbbbbbbbbb", oficina=oficina, origem="cliente",
        )
        resp = admin_client.post(
            f"/api/admin/suporte/tickets/{t.id}/mensagens/",
            {"conteudo": "Anotação só interna", "eh_interna": True},
            format="json",
        )
        assert resp.status_code in (200, 201)

    def test_mensagem_vazia_400(self, admin_client, oficina):
        t = Ticket.objects.create(
            titulo="aa", descricao="bbbbbbbbbb", oficina=oficina, origem="cliente",
        )
        resp = admin_client.post(
            f"/api/admin/suporte/tickets/{t.id}/mensagens/",
            {"conteudo": "  "}, format="json",
        )
        assert resp.status_code == 400

    def test_sumario(self, admin_client):
        resp = admin_client.get("/api/admin/suporte/sumario/")
        assert resp.status_code == 200
        assert "abertos" in resp.json()


# ---------------------------------------------------------------------------
# Suporte service — funções de baixo nível
# ---------------------------------------------------------------------------

class TestSuporteService:
    def test_atualizar_admin_aplica_mudancas(self, db, oficina, oficina_e_funcionario):
        from apps.modulo_suporte.services import atualizar_ticket_admin
        _, user = oficina_e_funcionario
        t = Ticket.objects.create(
            titulo="aa", descricao="bbbbbbbbbb", oficina=oficina,
            origem="cliente", status="aberto", prioridade="normal",
        )
        from rest_framework.test import APIRequestFactory
        req = APIRequestFactory().patch("/api/admin/suporte/")
        req.user = user
        atualizar_ticket_admin(
            req, t,
            dados={"status": "resolvido", "prioridade": "alta",
                   "categoria": "tecnico", "atribuido_a_id": user.id},
        )
        t.refresh_from_db()
        assert t.status == "resolvido"
        assert t.prioridade == "alta"
        assert t.fechado_em is not None  # status resolvido fecha o ticket

    def test_atualizar_admin_reabre_remove_fechado_em(self, db, oficina, oficina_e_funcionario):
        from apps.modulo_suporte.services import atualizar_ticket_admin
        _, user = oficina_e_funcionario
        from django.utils import timezone
        t = Ticket.objects.create(
            titulo="aa", descricao="bbbbbbbbbb", oficina=oficina,
            origem="cliente", status="resolvido",
            fechado_em=timezone.now(),
        )
        from rest_framework.test import APIRequestFactory
        req = APIRequestFactory().patch("/api/admin/suporte/")
        req.user = user
        atualizar_ticket_admin(req, t, dados={"status": "em_atendimento"})
        t.refresh_from_db()
        assert t.fechado_em is None

    def test_fechar_ticket_com_motivo_cria_mensagem(self, db, oficina, oficina_e_funcionario):
        from apps.modulo_suporte.services import fechar_ticket
        _, user = oficina_e_funcionario
        t = Ticket.objects.create(
            titulo="aa", descricao="bbbbbbbbbb", oficina=oficina,
            origem="cliente", autor_user=user,
        )
        from rest_framework.test import APIRequestFactory
        req = APIRequestFactory().patch("/api/oficina/suporte/")
        req.user = user
        fechar_ticket(req, t, motivo="resolvido por fora")
        t.refresh_from_db()
        assert t.status == "fechado"
        assert MensagemTicket.objects.filter(ticket=t).count() >= 1

    def test_fechar_ticket_ja_fechado_eh_idempotente(self, db, oficina, oficina_e_funcionario):
        from apps.modulo_suporte.services import fechar_ticket
        _, user = oficina_e_funcionario
        from django.utils import timezone
        t = Ticket.objects.create(
            titulo="aa", descricao="bbbbbbbbbb", oficina=oficina,
            origem="cliente", autor_user=user,
            status="fechado", fechado_em=timezone.now(),
        )
        from rest_framework.test import APIRequestFactory
        req = APIRequestFactory().patch("/api/oficina/suporte/")
        req.user = user
        # Não levanta
        fechar_ticket(req, t, motivo="...")

    def test_responder_ticket_em_fechado_falha(self, db, oficina, oficina_e_funcionario):
        from apps.modulo_suporte.services import responder_ticket
        _, user = oficina_e_funcionario
        t = Ticket.objects.create(
            titulo="aa", descricao="bbbbbbbbbb", oficina=oficina,
            origem="cliente", autor_user=user, status="fechado",
        )
        from rest_framework.test import APIRequestFactory
        req = APIRequestFactory().post("/api/x/")
        req.user = user
        with pytest.raises(ValueError, match="fechado"):
            responder_ticket(req, t, conteudo="x", autor_user=user, eh_admin=False)

    def test_marcar_lidas_admin(self, db, oficina):
        from apps.modulo_suporte.services import marcar_lidas
        t = Ticket.objects.create(
            titulo="aa", descricao="bbbbbbbbbb", oficina=oficina,
            origem="cliente", nao_lidas_admin=5,
        )
        marcar_lidas(t, lado="admin")
        t.refresh_from_db()
        assert t.nao_lidas_admin == 0

    def test_marcar_lidas_usuario(self, db, oficina):
        from apps.modulo_suporte.services import marcar_lidas
        t = Ticket.objects.create(
            titulo="aa", descricao="bbbbbbbbbb", oficina=oficina,
            origem="cliente", nao_lidas_usuario=3,
        )
        marcar_lidas(t, lado="usuario")
        t.refresh_from_db()
        assert t.nao_lidas_usuario == 0

    def test_criar_ticket_oficina(self, db, oficina_e_funcionario):
        from apps.modulo_suporte.services import criar_ticket_oficina
        oficina, user = oficina_e_funcionario
        from rest_framework.test import APIRequestFactory
        req = APIRequestFactory().post("/api/oficina/suporte/")
        req.user = user
        t = criar_ticket_oficina(
            req,
            {"titulo": "Falha", "descricao": "x" * 20, "categoria": "tecnico",
             "prioridade": "urgente"},
            oficina=oficina, autor_user=user,
        )
        assert t.origem == "oficina"
        assert t.prioridade == "urgente"
