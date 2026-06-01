"""Testes do `pagamento_os_service`."""
from decimal import Decimal

import pytest

from apps.modulo_oficina.models import ItemOrcamento, OrdemServico
from apps.modulo_pagamentos.models import Pagamento
from apps.modulo_pagamentos.services import pagamento_os_service
from apps.modulo_pagamentos.services.valor_service import (
    calcular_valor_os_centavos,
)


pytestmark = pytest.mark.django_db


def test_calcular_valor_soma_apenas_aprovados(os_com_aprovados):
    valor = calcular_valor_os_centavos(os_com_aprovados)
    # 1×150,00 + 2×75,50 = 150 + 151 = 301,00 => 30100
    assert valor == 30100


def test_iniciar_checkout_os_cria_pagamento(
    planos_seed, os_com_aprovados, abacate_client_mock,
):
    resultado = pagamento_os_service.iniciar_checkout_os(
        os=os_com_aprovados, client=abacate_client_mock,
    )
    assert resultado.valor_centavos == 30100
    pag = Pagamento.objects.get(pk=resultado.pagamento_id)
    assert pag.tipo == "os"
    assert pag.status == "pendente"
    assert pag.ordem_servico_id == os_com_aprovados.id
    assert pag.cliente_id == os_com_aprovados.cliente_id


def test_iniciar_checkout_reaproveita_pendente(
    planos_seed, os_com_aprovados, abacate_client_mock,
):
    r1 = pagamento_os_service.iniciar_checkout_os(
        os=os_com_aprovados, client=abacate_client_mock,
    )
    r2 = pagamento_os_service.iniciar_checkout_os(
        os=os_com_aprovados, client=abacate_client_mock,
    )
    assert r1.pagamento_id == r2.pagamento_id
    # AbacatePayClient só é chamado uma vez (segundo reaproveita)
    assert abacate_client_mock.criar_checkout.call_count == 1


def test_iniciar_checkout_forcar_novo_cria_outro(
    planos_seed, os_com_aprovados, abacate_client_mock,
):
    r1 = pagamento_os_service.iniciar_checkout_os(
        os=os_com_aprovados, client=abacate_client_mock,
    )
    r2 = pagamento_os_service.iniciar_checkout_os(
        os=os_com_aprovados, client=abacate_client_mock, forcar_novo=True,
    )
    assert r1.pagamento_id != r2.pagamento_id


def test_iniciar_checkout_sem_aprovados_falha(planos_seed, oficina, cliente, veiculo, abacate_client_mock):
    os_vazia = OrdemServico.objects.create(
        oficina=oficina, cliente=cliente, veiculo=veiculo, status="pendente",
    )
    with pytest.raises(ValueError, match="Nenhum item aprovado"):
        pagamento_os_service.iniciar_checkout_os(
            os=os_vazia, client=abacate_client_mock,
        )


def test_aplicar_pagamento_aprovado_os(planos_seed, os_com_aprovados, abacate_client_mock):
    r = pagamento_os_service.iniciar_checkout_os(
        os=os_com_aprovados, client=abacate_client_mock,
    )
    pag = Pagamento.objects.get(pk=r.pagamento_id)
    pagamento_os_service.aplicar_pagamento_aprovado_os(pag, metodo="BOLETO")
    pag.refresh_from_db()
    assert pag.status == "pago"
    assert pag.metodo_escolhido == "BOLETO"
    assert pag.pago_em is not None
