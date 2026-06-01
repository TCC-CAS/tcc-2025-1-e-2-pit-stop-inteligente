"""Testes da aprovação que gera tarefas a partir do catálogo de tarefas padrão."""
from decimal import Decimal

import pytest

from apps.modulo_oficina.models import (
    Cliente,
    ItemOrcamento,
    Oficina,
    OrdemServico,
    Servico,
    ServicoTarefaPadrao,
    TarefaExecucao,
    Veiculo,
)
from apps.modulo_oficina.services.aprovacao_service import processar_aprovacao_orcamento


pytestmark = pytest.mark.django_db


@pytest.fixture
def of_basica(db):
    return Oficina.objects.create(nome="OF", cnpj="00000000000113", plano_atual="basico")


@pytest.fixture
def os_com_cliente(of_basica):
    c = Cliente.objects.create(oficina=of_basica, nome="C", cpf_cnpj="00011122233")
    v = Veiculo.objects.create(cliente=c, placa="ABC1234", modelo="Gol")
    return OrdemServico.objects.create(oficina=of_basica, cliente=c, veiculo=v)


@pytest.fixture
def servico_com_padroes(of_basica):
    s = Servico.objects.create(oficina=of_basica, nome="Troca de óleo", tempo_estimado=Decimal("1.0"))
    ServicoTarefaPadrao.objects.create(servico=s, descricao="Remover óleo antigo", ordem=1, tempo_estimado_h=Decimal("0.5"))
    ServicoTarefaPadrao.objects.create(servico=s, descricao="Substituir filtro", ordem=2, tempo_estimado_h=Decimal("0.3"))
    ServicoTarefaPadrao.objects.create(servico=s, descricao="Adicionar novo óleo", ordem=3, tempo_estimado_h=Decimal("0.4"))
    return s


@pytest.mark.integration
def test_aprovacao_de_servico_com_padroes_cria_n_tarefas(os_com_cliente, servico_com_padroes):
    item = ItemOrcamento.objects.create(
        os=os_com_cliente, servico_catalogo=servico_com_padroes,
        tipo="servico", nome_descricao="Troca de óleo",
        valor_unitario=Decimal("180.00"),
    )
    processar_aprovacao_orcamento(
        os_com_cliente,
        itens_payload=[{"id": item.id, "status": "aprovado"}],
    )
    tarefas = list(TarefaExecucao.objects.filter(os=os_com_cliente).order_by("id"))
    assert len(tarefas) == 3
    assert all("Troca de óleo · " in t.descricao for t in tarefas)
    # Tempos estimados foram propagados
    assert float(tarefas[0].tempo_estimado_h) == 0.5


@pytest.mark.integration
def test_aprovacao_de_item_avulso_cria_uma_tarefa_simples(os_com_cliente):
    item = ItemOrcamento.objects.create(
        os=os_com_cliente, tipo="servico",
        nome_descricao="Serviço avulso", valor_unitario=Decimal("50.00"),
    )
    processar_aprovacao_orcamento(
        os_com_cliente,
        itens_payload=[{"id": item.id, "status": "aprovado"}],
    )
    tarefas = list(TarefaExecucao.objects.filter(os=os_com_cliente))
    assert len(tarefas) == 1
    assert tarefas[0].descricao == "Serviço avulso"


@pytest.mark.integration
def test_reaprovacao_nao_duplica_tarefas(os_com_cliente, servico_com_padroes):
    item = ItemOrcamento.objects.create(
        os=os_com_cliente, servico_catalogo=servico_com_padroes,
        tipo="servico", nome_descricao="Troca de óleo",
        valor_unitario=Decimal("180.00"),
    )
    processar_aprovacao_orcamento(os_com_cliente, [{"id": item.id, "status": "aprovado"}])
    processar_aprovacao_orcamento(os_com_cliente, [{"id": item.id, "status": "aprovado"}])
    assert TarefaExecucao.objects.filter(os=os_com_cliente).count() == 3
