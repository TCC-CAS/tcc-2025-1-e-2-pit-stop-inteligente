"""Bateria de testes para views administrativas (cobertura).

Cobre auditoria, usuários, notificações, OS admin, configurações,
backup, dashboard, oficinas, production_health, consumo global.
"""
import json
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework.test import APIClient

from apps.modulo_adm.models import (
    AuditoriaLog,
    ConfiguracaoGlobal,
    EventoErroProducao,
    GrupoErroProducao,
    Notificacao,
)
from apps.modulo_oficina.models import (
    Cliente,
    Oficina,
    OrdemServico,
    Veiculo,
)


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def super_admin(db):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    return User.objects.create_user(
        username="adm-cob", email="adm-cob@x.com", password="x",
        is_staff=True, is_superuser=True,
    )


@pytest.fixture
def admin_client(super_admin):
    c = APIClient(HTTP_USER_AGENT="Mozilla/5.0")
    c.force_authenticate(super_admin)
    return c


@pytest.fixture
def oficina(db):
    return Oficina.objects.create(nome="OF", cnpj="00000000000777", plano_atual="basico")


@pytest.fixture
def os_obj(db, oficina):
    c = Cliente.objects.create(oficina=oficina, nome="C", cpf_cnpj="11122233344")
    v = Veiculo.objects.create(cliente=c, placa="AAA1A11", modelo="X")
    return OrdemServico.objects.create(oficina=oficina, cliente=c, veiculo=v)


# ---------------------------------------------------------------------------
# Dashboard / Oficinas / OS admin
# ---------------------------------------------------------------------------

class TestDashboardAdmin:
    def test_dashboard_estrutura(self, admin_client):
        resp = admin_client.get(reverse("adm-dashboard"))
        assert resp.status_code == 200
        assert "kpis" in resp.json()


class TestOficinasAdmin:
    def test_listar(self, admin_client, oficina):
        resp = admin_client.get(reverse("adm-oficinas-list"))
        assert resp.status_code == 200

    def test_listar_com_filtros(self, admin_client, oficina):
        resp = admin_client.get(reverse("adm-oficinas-list") + "?plano=basico&busca=OF&estado=SP")
        assert resp.status_code == 200

    def test_detalhe(self, admin_client, oficina):
        resp = admin_client.get(reverse("adm-oficina-detail", args=[oficina.id]))
        assert resp.status_code == 200

    def test_atualizar(self, admin_client, oficina):
        resp = admin_client.patch(
            reverse("adm-oficina-detail", args=[oficina.id]),
            {"nome": "OF Renomeada"}, format="json",
        )
        assert resp.status_code in (200, 202)

    def test_inativar_e_reativar(self, admin_client, oficina):
        resp = admin_client.post(
            reverse("adm-oficina-inativar", args=[oficina.id]),
            {"ativo": False}, format="json",
        )
        assert resp.status_code == 200
        resp = admin_client.post(
            reverse("adm-oficina-inativar", args=[oficina.id]),
            {"ativo": True}, format="json",
        )
        assert resp.status_code == 200

    def test_excluir(self, admin_client):
        of = Oficina.objects.create(nome="apagar", cnpj="00000000000888")
        resp = admin_client.delete(reverse("adm-oficina-detail", args=[of.id]))
        assert resp.status_code in (200, 204)
        assert not Oficina.objects.filter(id=of.id).exists()


class TestOSAdmin:
    def test_listar_os(self, admin_client, os_obj):
        resp = admin_client.get(reverse("adm-os-list"))
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] >= 1

    def test_listar_com_filtros(self, admin_client, os_obj):
        resp = admin_client.get(
            reverse("adm-os-list") + f"?status=pendente&oficina_id={os_obj.oficina_id}&busca=AAA",
        )
        assert resp.status_code == 200

    def test_listar_page_invalido_cai_no_default(self, admin_client, os_obj):
        resp = admin_client.get(reverse("adm-os-list") + "?page=abc&page_size=xxx")
        assert resp.status_code == 200

    def test_alterar_status_ok(self, admin_client, os_obj):
        resp = admin_client.put(
            reverse("adm-os-status", args=[os_obj.id]),
            {"novo_status": "execucao", "motivo": "decisão"},
            format="json",
        )
        assert resp.status_code == 200

    def test_alterar_status_invalido(self, admin_client, os_obj):
        resp = admin_client.put(
            reverse("adm-os-status", args=[os_obj.id]),
            {"novo_status": "invalido", "motivo": "x"},
            format="json",
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Usuários admin
# ---------------------------------------------------------------------------

class TestUsuariosAdmin:
    def test_listar(self, admin_client):
        resp = admin_client.get(reverse("adm-usuarios-list"))
        assert resp.status_code == 200

    def test_listar_com_filtros(self, admin_client, super_admin):
        resp = admin_client.get(
            reverse("adm-usuarios-list")
            + "?busca=adm&papel=superuser&ativos=1",
        )
        assert resp.status_code == 200

    def test_listar_papel_staff(self, admin_client):
        resp = admin_client.get(reverse("adm-usuarios-list") + "?papel=staff")
        assert resp.status_code == 200

    def test_listar_papel_comum(self, admin_client):
        resp = admin_client.get(reverse("adm-usuarios-list") + "?papel=comum&ativos=0")
        assert resp.status_code == 200

    def test_criar_usuario(self, admin_client):
        resp = admin_client.post(
            reverse("adm-usuarios-list"),
            {"email": "novo-adm@x.com", "password": "senha-de-teste-123"},
            format="json",
        )
        assert resp.status_code == 201

    def test_criar_usuario_invalido(self, admin_client):
        resp = admin_client.post(
            reverse("adm-usuarios-list"),
            {"email": "", "password": "x"},
            format="json",
        )
        assert resp.status_code == 400

    def test_detalhe_patch_delete(self, admin_client):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        u = User.objects.create_user(username="alvo@x.com", email="alvo@x.com", password="x")
        resp = admin_client.get(reverse("adm-usuario-detail", args=[u.id]))
        assert resp.status_code == 200

        resp = admin_client.patch(
            reverse("adm-usuario-detail", args=[u.id]),
            {"first_name": "Alterado"}, format="json",
        )
        assert resp.status_code == 200

        resp = admin_client.delete(reverse("adm-usuario-detail", args=[u.id]))
        assert resp.status_code in (200, 204)

    def test_patch_invalido_retorna_400(self, admin_client):
        """Email duplicado dispara ValueError no service."""
        from django.contrib.auth import get_user_model
        User = get_user_model()
        existing = User.objects.create_user(username="existing@x.com", email="existing@x.com", password="x")
        other = User.objects.create_user(username="other@x.com", email="other@x.com", password="x")
        resp = admin_client.patch(
            reverse("adm-usuario-detail", args=[other.id]),
            {"email": "existing@x.com"}, format="json",
        )
        assert resp.status_code == 400

    def test_inativar_usuario(self, admin_client):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        u = User.objects.create_user(username="inat@x.com", email="inat@x.com", password="x")
        resp = admin_client.post(
            reverse("adm-usuario-ativar", args=[u.id]),
            {"ativo": False}, format="json",
        )
        assert resp.status_code == 200

    def test_resetar_senha(self, admin_client):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        u = User.objects.create_user(username="sen@x.com", email="sen@x.com", password="x")
        resp = admin_client.post(
            reverse("adm-usuario-senha", args=[u.id]),
            {"password": "nova-senha-segura-123"}, format="json",
        )
        assert resp.status_code == 200

    def test_resetar_senha_curta(self, admin_client):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        u = User.objects.create_user(username="sen2@x.com", email="sen2@x.com", password="x")
        resp = admin_client.post(
            reverse("adm-usuario-senha", args=[u.id]),
            {"password": "123"}, format="json",
        )
        assert resp.status_code == 400

    def test_vincular_oficina(self, admin_client, oficina):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        u = User.objects.create_user(username="vinc@x.com", email="vinc@x.com", password="x")
        resp = admin_client.post(
            reverse("adm-usuario-vinculo", args=[u.id]),
            {"oficina_id": oficina.id, "permissao": "atendente"},
            format="json",
        )
        assert resp.status_code == 200

    def test_vincular_oficina_inexistente_400(self, admin_client):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        u = User.objects.create_user(username="x2@x.com", email="x2@x.com", password="x")
        resp = admin_client.post(
            reverse("adm-usuario-vinculo", args=[u.id]),
            {"oficina_id": 99999, "permissao": "admin"},
            format="json",
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Configurações
# ---------------------------------------------------------------------------

class TestConfiguracoesAdmin:
    def test_listar(self, admin_client):
        resp = admin_client.get(reverse("adm-configs-list"))
        assert resp.status_code == 200

    def test_post_cria_ou_atualiza(self, admin_client):
        resp = admin_client.post(
            reverse("adm-configs-list"),
            {"chave": "tema_padrao", "valor": "dark"},
            format="json",
        )
        assert resp.status_code == 201

    def test_post_chave_vazia_400(self, admin_client):
        resp = admin_client.post(
            reverse("adm-configs-list"),
            {"chave": "", "valor": "x"},
            format="json",
        )
        assert resp.status_code == 400

    def test_patch_detalhe(self, admin_client):
        cfg = ConfiguracaoGlobal.objects.create(chave="x_test", valor=1)
        resp = admin_client.patch(
            reverse("adm-config-detail", args=[cfg.chave]),
            {"valor": 99}, format="json",
        )
        assert resp.status_code == 200

    def test_delete_detalhe(self, admin_client):
        cfg = ConfiguracaoGlobal.objects.create(chave="x_delete", valor=1)
        resp = admin_client.delete(reverse("adm-config-detail", args=[cfg.chave]))
        assert resp.status_code in (204, 200)


# ---------------------------------------------------------------------------
# Auditoria
# ---------------------------------------------------------------------------

class TestAuditoriaAdmin:
    def test_listar(self, admin_client, super_admin):
        AuditoriaLog.objects.create(
            usuario=super_admin, acao="x.y", descricao="desc", nivel="info",
        )
        resp = admin_client.get(reverse("adm-auditoria"))
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1

    def test_listar_com_filtros(self, admin_client, super_admin):
        AuditoriaLog.objects.create(
            usuario=super_admin, acao="ticket.criar", descricao="x", nivel="warning",
            recurso="ticket",
        )
        resp = admin_client.get(
            reverse("adm-auditoria")
            + f"?usuario={super_admin.username}&nivel=warning&acao=ticket&recurso=ticket"
            + "&desde=2020-01-01&ate=2099-12-31",
        )
        assert resp.status_code == 200

    def test_paginacao_lixo_cai_no_default(self, admin_client):
        resp = admin_client.get(reverse("adm-auditoria") + "?page=abc&page_size=xxx")
        assert resp.status_code == 200

    def test_exportar_csv(self, admin_client, super_admin):
        AuditoriaLog.objects.create(
            usuario=super_admin, acao="export.test", descricao="csv test", nivel="info",
        )
        resp = admin_client.get(reverse("adm-auditoria") + "?export=csv")
        assert resp.status_code == 200
        assert "csv" in resp["Content-Type"]
        assert "csv test" in resp.content.decode("utf-8")


# ---------------------------------------------------------------------------
# Notificações
# ---------------------------------------------------------------------------

class TestNotificacoes:
    def test_listar(self, admin_client):
        Notificacao.criar("info", "Teste", "msg")
        resp = admin_client.get(reverse("adm-notif-list"))
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1

    def test_listar_com_filtros(self, admin_client):
        Notificacao.criar("info", "Teste", "msg", nivel="warning")
        resp = admin_client.get(
            reverse("adm-notif-list")
            + "?nao_lidas=1&nivel=warning&tipo=info&page=abc&page_size=xxx",
        )
        assert resp.status_code == 200

    def test_marcar_lida_uma(self, admin_client):
        n = Notificacao.criar("info", "T", "m")
        resp = admin_client.post(reverse("adm-notif-lida", args=[n.id]))
        assert resp.status_code == 200
        n.refresh_from_db()
        assert n.lida is True

    def test_marcar_todas_lidas(self, admin_client):
        Notificacao.criar("info", "T1", "m")
        Notificacao.criar("info", "T2", "m")
        resp = admin_client.post(reverse("adm-notif-todas-lidas"))
        assert resp.status_code == 200
        assert Notificacao.objects.filter(lida=False).count() == 0

    def test_sumario(self, admin_client):
        Notificacao.criar("info", "T", "m")
        resp = admin_client.get(reverse("adm-notif-sumario"))
        assert resp.status_code == 200
        assert "nao_lidas" in resp.json()


# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------

class TestBackup:
    def test_exportar(self, admin_client):
        resp = admin_client.get(reverse("adm-backup-export"))
        assert resp.status_code == 200
        # Vem como JSON content (download)
        assert "json" in (resp.get("Content-Type", "") or "").lower() \
               or resp.get("Content-Disposition", "")

    def test_restaurar_sem_arquivo_400(self, admin_client):
        resp = admin_client.post(reverse("adm-backup-restore"), {})
        assert resp.status_code == 400

    def test_restaurar_arquivo_invalido_400(self, admin_client):
        arq = SimpleUploadedFile("bk.json", b"naoejson", content_type="application/json")
        resp = admin_client.post(
            reverse("adm-backup-restore"), {"arquivo": arq}, format="multipart",
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Production Health
# ---------------------------------------------------------------------------

class TestProductionHealth:
    def _criar_grupo(self):
        return GrupoErroProducao.objects.create(
            fingerprint="abc",
            titulo="ValueError em /api/x/",
            mensagem_tecnica="boom",
            tipo_excecao="ValueError",
            endpoint="/api/x/",
            metodo_http="POST",
            servico="modulo_oficina",
            severidade="error",
            status="aberto",
            ambiente="producao",
            total_eventos=5,
            usuarios_afetados=2,
        )

    def test_sumario(self, admin_client):
        resp = admin_client.get(reverse("adm-saude-sumario"))
        assert resp.status_code == 200
        body = resp.json()
        assert "eventos_24h" in body

    def test_listar_grupos(self, admin_client):
        self._criar_grupo()
        resp = admin_client.get(reverse("adm-saude-erros"))
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1

    def test_listar_grupos_com_filtros(self, admin_client):
        self._criar_grupo()
        resp = admin_client.get(
            reverse("adm-saude-erros")
            + "?janela=24h&ambiente=producao&severidade=error&busca=ValueError"
            + "&so_5xx=1&ordenar_por=total_eventos&page=abc",
        )
        assert resp.status_code == 200

    def test_listar_com_filtro_status_silenciado(self, admin_client):
        grupo = self._criar_grupo()
        grupo.status = "silenciado"
        grupo.save()
        resp = admin_client.get(reverse("adm-saude-erros") + "?status=silenciado")
        assert resp.status_code == 200

    def test_detalhe(self, admin_client):
        grupo = self._criar_grupo()
        resp = admin_client.get(reverse("adm-saude-erro-detail", args=[grupo.id]))
        assert resp.status_code == 200

    def test_patch_atualiza_severidade_status(self, admin_client):
        grupo = self._criar_grupo()
        resp = admin_client.patch(
            reverse("adm-saude-erro-detail", args=[grupo.id]),
            {"severidade": "critical", "status": "monitorando"},
            format="json",
        )
        assert resp.status_code == 200

    def test_patch_silencia_por_horas(self, admin_client):
        grupo = self._criar_grupo()
        resp = admin_client.patch(
            reverse("adm-saude-erro-detail", args=[grupo.id]),
            {"status": "silenciado", "silenciar_por_horas": 6},
            format="json",
        )
        assert resp.status_code == 200

    def test_patch_silencia_por_horas_invalido(self, admin_client):
        grupo = self._criar_grupo()
        resp = admin_client.patch(
            reverse("adm-saude-erro-detail", args=[grupo.id]),
            {"status": "silenciado", "silenciar_por_horas": "xyz"},
            format="json",
        )
        assert resp.status_code == 400

    def test_patch_resolver_e_reabrir(self, admin_client):
        grupo = self._criar_grupo()
        resp = admin_client.patch(
            reverse("adm-saude-erro-detail", args=[grupo.id]),
            {"status": "resolvido"}, format="json",
        )
        assert resp.status_code == 200
        resp = admin_client.patch(
            reverse("adm-saude-erro-detail", args=[grupo.id]),
            {"status": "aberto"}, format="json",
        )
        assert resp.status_code == 200

    def test_eventos_paginado(self, admin_client):
        grupo = self._criar_grupo()
        EventoErroProducao.objects.create(grupo=grupo, request_id="req", caminho="/x/")
        resp = admin_client.get(reverse("adm-saude-erro-eventos", args=[grupo.id]))
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1

    def test_eventos_paginacao_lixo(self, admin_client):
        grupo = self._criar_grupo()
        resp = admin_client.get(
            reverse("adm-saude-erro-eventos", args=[grupo.id])
            + "?page=xxx&page_size=xxx",
        )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Consumo global
# ---------------------------------------------------------------------------

class TestConsumoGlobal:
    def test_listar_consumo(self, admin_client, oficina):
        resp = admin_client.get(reverse("adm-consumo-global"))
        assert resp.status_code == 200
        body = resp.json()
        assert "alertas" in body and "results" in body

    def test_listar_com_storage_e_paginacao_invalida(self, admin_client, oficina):
        resp = admin_client.get(
            reverse("adm-consumo-global")
            + "?com_storage=1&ordenar_por=os_mensal&page=abc&page_size=abc",
        )
        assert resp.status_code == 200

    def test_ordenar_por_invalido_volta_ao_default(self, admin_client, oficina):
        resp = admin_client.get(
            reverse("adm-consumo-global") + "?ordenar_por=xyz",
        )
        assert resp.status_code == 200
