"""Testes do auth_service: login, logout, sessão e seleção de oficina."""
import pytest
from django.contrib.auth import get_user_model
from django.test import RequestFactory
from django.contrib.sessions.backends.db import SessionStore

from apps.modulo_oficina.models import Funcionario, Oficina
from apps.modulo_oficina.services import (
    SESSION_OFICINA_KEY,
    autenticar_usuario,
    encerrar_sessao,
    montar_perfil_corrente,
    selecionar_oficina,
)


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Helpers locais
# ---------------------------------------------------------------------------

@pytest.fixture
def request_factory_session():
    """Factory que devolve requests Django com sessão já hidratada e user anônimo."""
    from django.contrib.auth.models import AnonymousUser

    rf = RequestFactory()

    def _build(method="get", path="/", **kwargs):
        request = getattr(rf, method.lower())(path, **kwargs)
        request.session = SessionStore()
        request.user = AnonymousUser()
        return request

    return _build


@pytest.fixture
def usuario_com_senha(db):
    User = get_user_model()
    user = User.objects.create_user(
        username="ana@oficina.test",
        email="ana@oficina.test",
        password="senha-segura-1",
        first_name="Ana",
    )
    return user


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

class TestAutenticarUsuario:
    def test_login_com_credenciais_validas(self, request_factory_session, usuario_com_senha):
        request = request_factory_session()
        result = autenticar_usuario(
            request, username="ana@oficina.test", password="senha-segura-1"
        )

        assert result["user"]["email"] == "ana@oficina.test"
        assert result["user"]["nome_completo"] == "Ana"
        assert "oficinas" in result

    def test_login_aceita_username_e_email(self, request_factory_session, usuario_com_senha):
        request = request_factory_session()
        # Usuário foi criado com username = email; testamos também por email puro
        result = autenticar_usuario(
            request, username="ana@oficina.test", password="senha-segura-1"
        )
        assert result["user"]["id"] == usuario_com_senha.id

    def test_login_falha_com_senha_errada(self, request_factory_session, usuario_com_senha):
        request = request_factory_session()
        with pytest.raises(ValueError, match="incorretos"):
            autenticar_usuario(request, username="ana@oficina.test", password="errada")

    def test_login_falha_quando_campos_vazios(self, request_factory_session):
        request = request_factory_session()
        with pytest.raises(ValueError, match="usu"):
            autenticar_usuario(request, username="", password="")

    def test_auto_seleciona_oficina_quando_unica(
        self, request_factory_session, usuario_com_senha, oficina
    ):
        Funcionario.objects.create(
            user=usuario_com_senha, oficina=oficina, permissao="admin", is_active=True
        )

        request = request_factory_session()
        result = autenticar_usuario(
            request, username="ana@oficina.test", password="senha-segura-1"
        )

        assert result["oficina_atual_id"] == oficina.id
        assert request.session[SESSION_OFICINA_KEY] == oficina.id

    def test_superuser_com_varias_oficinas_nao_auto_seleciona(
        self, request_factory_session, oficina
    ):
        """Superusers enxergam todas as oficinas como 'admin' — caso típico
        em que a tela de seleção é exibida."""
        from django.contrib.auth import get_user_model

        Oficina.objects.create(nome="Pit Stop Sul", cnpj="00.000.000/0002-00")
        User = get_user_model()
        admin = User.objects.create_superuser(
            username="root", email="root@x.test", password="root-1234"
        )

        request = request_factory_session()
        result = autenticar_usuario(request, username="root", password="root-1234")

        # 2 oficinas → não auto-seleciona; o front deve abrir tela de seleção
        assert result["oficina_atual_id"] is None
        assert len(result["oficinas"]) == 2
        assert all(v["permissao"] == "admin" for v in result["oficinas"])


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------

class TestEncerrarSessao:
    def test_remove_oficina_da_sessao(self, request_factory_session, usuario_com_senha, oficina):
        Funcionario.objects.create(
            user=usuario_com_senha, oficina=oficina, permissao="admin"
        )
        request = request_factory_session()
        autenticar_usuario(request, "ana@oficina.test", "senha-segura-1")
        assert request.session.get(SESSION_OFICINA_KEY) is not None

        encerrar_sessao(request)
        assert request.session.get(SESSION_OFICINA_KEY) is None


# ---------------------------------------------------------------------------
# Perfil corrente
# ---------------------------------------------------------------------------

class TestMontarPerfilCorrente:
    def test_retorna_none_para_usuario_anonimo(self, request_factory_session):
        from django.contrib.auth.models import AnonymousUser

        request = request_factory_session()
        request.user = AnonymousUser()
        assert montar_perfil_corrente(request) is None

    def test_retorna_dados_completos_apos_login(
        self, request_factory_session, usuario_com_senha, oficina
    ):
        Funcionario.objects.create(
            user=usuario_com_senha, oficina=oficina, permissao="admin"
        )
        request = request_factory_session()
        autenticar_usuario(request, "ana@oficina.test", "senha-segura-1")

        perfil = montar_perfil_corrente(request)
        assert perfil["user"]["email"] == "ana@oficina.test"
        assert perfil["oficina_atual"]["id"] == oficina.id
        assert perfil["oficina_atual"]["permissao"] == "admin"


# ---------------------------------------------------------------------------
# Selecionar oficina
# ---------------------------------------------------------------------------

class TestSelecionarOficina:
    def test_user_pode_selecionar_oficina_a_qual_tem_vinculo(
        self, request_factory_session, usuario_com_senha, oficina
    ):
        Funcionario.objects.create(
            user=usuario_com_senha, oficina=oficina, permissao="gerente"
        )
        request = request_factory_session()
        autenticar_usuario(request, "ana@oficina.test", "senha-segura-1")

        result = selecionar_oficina(request, oficina.id)
        assert result == oficina.id
        assert request.session[SESSION_OFICINA_KEY] == oficina.id

    def test_falha_ao_selecionar_oficina_sem_vinculo(
        self, request_factory_session, usuario_com_senha, oficina
    ):
        outra = Oficina.objects.create(nome="Outra", cnpj="00.000.000/0099-00")
        Funcionario.objects.create(
            user=usuario_com_senha, oficina=oficina, permissao="admin"
        )
        request = request_factory_session()
        autenticar_usuario(request, "ana@oficina.test", "senha-segura-1")

        with pytest.raises(ValueError, match="vínculo"):
            selecionar_oficina(request, outra.id)
