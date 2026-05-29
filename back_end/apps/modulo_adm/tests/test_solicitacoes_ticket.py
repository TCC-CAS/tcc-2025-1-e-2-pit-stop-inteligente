"""Garante que solicitações de recuperação geram Ticket + Notificacao."""
import pytest
from rest_framework.test import APIRequestFactory

from apps.modulo_adm.models import Notificacao
from apps.modulo_adm.services.solicitacoes_service import registrar_solicitacao_acesso
from apps.modulo_suporte.models import Ticket


pytestmark = pytest.mark.django_db


def _req():
    return APIRequestFactory().post("/api/admin/solicitacoes-acesso/")


@pytest.mark.unit
def test_oficina_cria_ticket_alta_prioridade():
    res = registrar_solicitacao_acesso(
        request=_req(), modo="oficina",
        email="staff@oficina.com", motivo="senha",
    )
    assert res.ticket.id > 0
    assert res.ticket.titulo == "Redefinição de senha (oficina)"
    assert res.ticket.categoria == "acesso"
    assert res.ticket.prioridade == "alta"
    assert res.ticket.status == "aberto"
    assert res.protocolo.startswith("SOL-")


@pytest.mark.unit
def test_cliente_motivo_acesso_os_gera_titulo_apropriado():
    res = registrar_solicitacao_acesso(
        request=_req(), modo="cliente",
        email="cli@x.com", motivo="acesso_os",
    )
    assert "Acesso à O.S" in res.ticket.titulo
    assert res.ticket.categoria == "acesso"


@pytest.mark.integration
def test_notificacao_referencia_ticket():
    res = registrar_solicitacao_acesso(
        request=_req(), modo="oficina", email="staff@oficina.com",
    )
    n = Notificacao.objects.get(id=res.notificacao.id)
    assert n.metadados.get("ticket_id") == res.ticket.id
    assert f"#{res.ticket.id}" in n.mensagem
    assert n.nivel == "warning"


@pytest.mark.integration
def test_ticket_tem_contador_inicial_para_admin():
    res = registrar_solicitacao_acesso(
        request=_req(), modo="cliente", email="x@y.com",
    )
    t = Ticket.objects.get(id=res.ticket.id)
    assert t.nao_lidas_admin == 1
