"""Testes do registro público de oficina (POST /auth/registrar-oficina/).

Garantem que:
  - User + Oficina + Funcionario(admin) são criados em uma única transação
  - O usuário fica logado e a oficina selecionada na sessão
  - Validações cobrem termos, e-mail duplicado, CNPJ duplicado, senha curta, etc.
"""
import pytest
from rest_framework.test import APIClient

from apps.modulo_oficina.models import Funcionario, Oficina


pytestmark = pytest.mark.django_db


URL = "/api/oficina/auth/registrar-oficina/"


def _payload_completo(**overrides):
    base = {
        "admin_nome": "Maria",
        "admin_sobrenome": "Souza",
        "admin_email": "maria@oficina-nova.test",
        "admin_senha": "senha-segura-1",
        "admin_senha_confirmacao": "senha-segura-1",
        "termos_aceitos": True,
        # Oficina
        "nome": "Oficina da Maria",
        "cnpj": "12.345.678/0001-99",
        "email": "contato@oficina.test",
        "telefone": "(11) 98888-7777",
        "especialidade": "geral",
        "horario_abertura": "08:00",
        "horario_fechamento": "18:00",
        "dias_funcionamento": '["seg","ter","qua","qui","sex"]',
        "cep": "01310-100",
        "logradouro": "Av. Paulista",
        "numero": "1000",
        "bairro": "Bela Vista",
        "cidade": "São Paulo",
        "estado": "SP",
        "plano": "premium",
    }
    base.update(overrides)
    return base


class TestRegistroSucesso:
    def test_cria_user_oficina_e_vinculo_admin(self, db):
        client = APIClient()
        resp = client.post(URL, _payload_completo(), format="json")
        assert resp.status_code == 201, resp.json()

        from django.contrib.auth import get_user_model
        User = get_user_model()
        user = User.objects.get(email__iexact="maria@oficina-nova.test")
        assert user.first_name == "Maria"

        oficina = Oficina.objects.get(cnpj="12.345.678/0001-99")
        funcionario = Funcionario.objects.get(user=user, oficina=oficina)
        assert funcionario.permissao == "admin"
        assert funcionario.is_active is True

    def test_resposta_inclui_perfil_e_oficina_selecionada(self, db):
        client = APIClient()
        resp = client.post(URL, _payload_completo(), format="json")
        body = resp.json()
        assert body["user"]["email"] == "maria@oficina-nova.test"
        assert body["oficina_atual_id"] is not None
        assert body["oficinas"][0]["permissao"] == "admin"

    def test_apos_registro_a_sessao_esta_autenticada(self, db):
        client = APIClient()
        client.post(URL, _payload_completo(), format="json")

        # /auth/me/ exige autenticação — basta o cookie de sessão
        resp_me = client.get("/api/oficina/auth/me/")
        assert resp_me.status_code == 200


class TestValidacoes:
    def test_falha_se_termos_nao_forem_aceitos(self, db):
        client = APIClient()
        resp = client.post(URL, _payload_completo(termos_aceitos=False), format="json")
        assert resp.status_code == 400
        assert "Termos" in resp.json()["erro"]

    def test_falha_com_email_duplicado(self, db):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        User.objects.create_user(
            username="existing@x.test", email="existing@x.test", password="x"
        )
        client = APIClient()
        resp = client.post(
            URL,
            _payload_completo(admin_email="existing@x.test", cnpj="99.999.999/0001-99"),
            format="json",
        )
        assert resp.status_code == 400
        assert "e-mail" in resp.json()["erro"].lower()

    def test_falha_com_cnpj_duplicado(self, db, oficina):
        client = APIClient()
        resp = client.post(URL, _payload_completo(cnpj=oficina.cnpj), format="json")
        assert resp.status_code == 400
        assert "CNPJ" in resp.json()["erro"]

    def test_falha_com_senha_curta(self, db):
        client = APIClient()
        resp = client.post(
            URL,
            _payload_completo(admin_senha="123", admin_senha_confirmacao="123"),
            format="json",
        )
        assert resp.status_code == 400
        assert "senha" in resp.json()["erro"].lower()

    def test_falha_quando_senha_nao_confere(self, db):
        client = APIClient()
        resp = client.post(
            URL,
            _payload_completo(admin_senha_confirmacao="outra-senha-diferente"),
            format="json",
        )
        assert resp.status_code == 400
        assert "confirma" in resp.json()["erro"].lower()

    def test_falha_com_email_invalido(self, db):
        client = APIClient()
        resp = client.post(URL, _payload_completo(admin_email="nao-eh-email"), format="json")
        assert resp.status_code == 400


class TestRollbackEmFalha:
    def test_email_duplicado_nao_cria_oficina_orfa(self, db):
        """Garante que o decorator @transaction.atomic faz rollback do User
        criado caso a oficina falhe (e vice-versa)."""
        from django.contrib.auth import get_user_model
        User = get_user_model()
        User.objects.create_user(
            username="conflito@x.test", email="conflito@x.test", password="x"
        )
        oficinas_antes = Oficina.objects.count()
        users_antes = User.objects.count()

        client = APIClient()
        client.post(
            URL,
            _payload_completo(admin_email="conflito@x.test", cnpj="11.111.111/0001-11"),
            format="json",
        )

        assert Oficina.objects.count() == oficinas_antes
        assert User.objects.count() == users_antes
