"""Testes do `assinatura_service` (sem chamadas externas)."""
import pytest

from apps.modulo_pagamentos.models import (
    AssinaturaOficina, EventoPagamento, Pagamento, PlanoSaaS,
)
from apps.modulo_pagamentos.services import assinatura_service


pytestmark = pytest.mark.django_db


def test_listar_planos_ativos_devolve_apenas_ativos(planos_seed):
    inativo = PlanoSaaS.objects.create(
        codigo="oculto", nome="Oculto", preco_centavos=100, ativo=False,
    )
    codigos = [p.codigo for p in assinatura_service.listar_planos_ativos()]
    assert "basico" in codigos
    assert "premium" in codigos
    assert inativo.codigo not in codigos


def test_obter_ou_criar_assinatura_para_oficina_nova(planos_seed, oficina):
    assert not AssinaturaOficina.objects.filter(oficina=oficina).exists()
    a = assinatura_service.obter_ou_criar_assinatura(oficina)
    assert a.oficina_id == oficina.id
    assert a.plano.codigo == "basico"
    assert a.status == "pendente"


def test_iniciar_checkout_cria_pagamento_e_evento(
    planos_seed, oficina, admin_da_oficina, abacate_client_mock,
):
    resultado = assinatura_service.iniciar_checkout_assinatura(
        oficina=oficina,
        plano_codigo="premium",
        usuario=admin_da_oficina.user,
        client=abacate_client_mock,
    )
    assert resultado.url_checkout.startswith("https://app.abacatepay.com")
    pag = Pagamento.objects.get(pk=resultado.pagamento_id)
    assert pag.tipo == "assinatura"
    assert pag.status == "pendente"
    assert pag.abacatepay_id == "bill_test_42"
    eventos = list(pag.eventos.values_list("tipo", flat=True))
    assert "criado" in eventos
    assert "checkout_gerado" in eventos


def test_iniciar_checkout_plano_invalido_levanta(planos_seed, oficina, abacate_client_mock):
    with pytest.raises(ValueError, match="não está disponível"):
        assinatura_service.iniciar_checkout_assinatura(
            oficina=oficina, plano_codigo="inexistente", client=abacate_client_mock,
        )


def test_iniciar_checkout_propaga_erro_do_provedor(planos_seed, oficina, abacate_client_mock):
    abacate_client_mock.criar_checkout.side_effect = RuntimeError("simulado")
    with pytest.raises(RuntimeError):
        assinatura_service.iniciar_checkout_assinatura(
            oficina=oficina, plano_codigo="premium", client=abacate_client_mock,
        )
    pag = Pagamento.objects.order_by("-id").first()
    assert pag.status == "falha"
    assert pag.eventos.filter(tipo="falha").exists()


def test_aplicar_pagamento_aprovado_ativa_assinatura_e_atualiza_plano(
    planos_seed, oficina, abacate_client_mock,
):
    resultado = assinatura_service.iniciar_checkout_assinatura(
        oficina=oficina, plano_codigo="premium", client=abacate_client_mock,
    )
    pag = Pagamento.objects.get(pk=resultado.pagamento_id)
    assinatura_service.aplicar_pagamento_aprovado(pag, metodo="PIX")

    pag.refresh_from_db()
    assert pag.status == "pago"
    assert pag.metodo_escolhido == "PIX"
    assert pag.pago_em is not None

    oficina.refresh_from_db()
    assert oficina.plano_atual == "premium"

    a = AssinaturaOficina.objects.get(oficina=oficina)
    assert a.status == "ativa"
    assert a.plano.codigo == "premium"
    assert a.expira_em is not None
    assert a.vigente is True


def test_aplicar_pagamento_aprovado_idempotente(planos_seed, oficina, abacate_client_mock):
    resultado = assinatura_service.iniciar_checkout_assinatura(
        oficina=oficina, plano_codigo="premium", client=abacate_client_mock,
    )
    pag = Pagamento.objects.get(pk=resultado.pagamento_id)
    assinatura_service.aplicar_pagamento_aprovado(pag, metodo="PIX")
    pago_em = Pagamento.objects.get(pk=pag.pk).pago_em
    # Segunda chamada não muda nada
    assinatura_service.aplicar_pagamento_aprovado(
        Pagamento.objects.get(pk=pag.pk), metodo="CARD",
    )
    pag.refresh_from_db()
    assert pag.pago_em == pago_em
    assert pag.metodo_escolhido == "PIX"


def test_cancelar_assinatura(planos_seed, oficina):
    a = assinatura_service.obter_ou_criar_assinatura(oficina)
    a = assinatura_service.cancelar_assinatura(oficina, motivo="teste")
    assert a.status == "cancelada"
    assert a.cancelada_em is not None
