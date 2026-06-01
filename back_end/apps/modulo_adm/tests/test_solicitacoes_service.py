"""Testes unitários do service de solicitações de recuperação de acesso."""
import pytest
from rest_framework.test import APIRequestFactory

from apps.modulo_adm.models import Notificacao
from apps.modulo_adm.services.solicitacoes_service import registrar_solicitacao_acesso


pytestmark = pytest.mark.django_db


def _request():
    return APIRequestFactory().post("/api/admin/solicitacoes-acesso/")


@pytest.mark.unit
def test_solicitacao_oficina_cria_notificacao_warning():
    res = registrar_solicitacao_acesso(
        request=_request(),
        modo="oficina",
        email="usuario@oficina.com",
    )
    notif = res.notificacao
    assert notif.tipo == "recuperar_oficina"
    assert notif.nivel == "warning"
    assert "oficina" in notif.titulo.lower()
    assert "usuario@oficina.com" in notif.titulo
    assert notif.metadados["modo"] == "oficina"


@pytest.mark.unit
def test_solicitacao_cliente_cria_notificacao_separada():
    res = registrar_solicitacao_acesso(
        request=_request(),
        modo="cliente",
        email="cliente@dominio.com",
    )
    assert res.notificacao.tipo == "recuperar_cliente"
    assert "cliente" in res.notificacao.titulo.lower()


@pytest.mark.unit
def test_modo_invalido_levanta_value_error():
    with pytest.raises(ValueError, match="Modo inválido"):
        registrar_solicitacao_acesso(
            request=_request(), modo="moderador", email="x@y.com",
        )


@pytest.mark.unit
@pytest.mark.parametrize("email", ["", "naoeumemail", "sem.arroba", "a@b"])
def test_email_invalido_levanta_value_error(email):
    with pytest.raises(ValueError, match="e-mail"):
        registrar_solicitacao_acesso(
            request=_request(), modo="oficina", email=email,
        )


@pytest.mark.unit
def test_observacao_acima_do_limite_e_rejeitada():
    with pytest.raises(ValueError, match="800"):
        registrar_solicitacao_acesso(
            request=_request(), modo="cliente",
            email="ok@dominio.com",
            observacao="x" * 801,
        )


@pytest.mark.integration
def test_solicitacao_aparece_na_listagem_admin():
    """Service deve criar registro recuperável pela queryset padrão."""
    registrar_solicitacao_acesso(
        request=_request(), modo="oficina", email="staff@oficina.com",
    )
    qs = Notificacao.objects.filter(tipo="recuperar_oficina")
    assert qs.count() == 1
    assert qs.first().lida is False
