"""Testes do aprovacao_service.

Foco nas regras de negócio:
- Atualização granular do status de cada item
- Geração automática de TarefaExecucao para itens aprovados (sem duplicar)
- Atualização do status da OS para 'aprovado'
- Registro do evento de aprovação no histórico
"""
import pytest

from apps.modulo_oficina.models import HistoricoOS, ItemOrcamento, TarefaExecucao
from apps.modulo_oficina.services import processar_aprovacao_orcamento


pytestmark = pytest.mark.django_db


def _payload_aprovando_dois_reprovando_um(itens):
    return [
        {"id": itens[0].id, "status": "aprovado"},
        {"id": itens[1].id, "status": "aprovado"},
        {"id": itens[2].id, "status": "reprovado"},
    ]


class TestProcessarAprovacaoOrcamento:
    def test_atualiza_status_de_cada_item_individualmente(self, ordem_servico, itens_orcamento):
        payload = _payload_aprovando_dois_reprovando_um(itens_orcamento)

        processar_aprovacao_orcamento(ordem_servico, payload)

        for item, esperado in zip(itens_orcamento, ["aprovado", "aprovado", "reprovado"]):
            item.refresh_from_db()
            assert item.status_aprovacao == esperado

    def test_gera_tarefa_apenas_para_itens_aprovados(self, ordem_servico, itens_orcamento):
        payload = _payload_aprovando_dois_reprovando_um(itens_orcamento)

        processar_aprovacao_orcamento(ordem_servico, payload)

        tarefas = TarefaExecucao.objects.filter(os=ordem_servico)
        # 2 aprovados → 2 tarefas
        assert tarefas.count() == 2
        descricoes = sorted(tarefas.values_list("descricao", flat=True))
        assert descricoes == sorted([itens_orcamento[0].nome_descricao, itens_orcamento[1].nome_descricao])

    def test_nao_duplica_tarefa_se_servico_ja_existe(self, ordem_servico, itens_orcamento):
        # Pré-cria tarefa idêntica ao primeiro item
        TarefaExecucao.objects.create(
            os=ordem_servico,
            descricao=itens_orcamento[0].nome_descricao,
            status="pendente",
        )
        payload = _payload_aprovando_dois_reprovando_um(itens_orcamento)

        processar_aprovacao_orcamento(ordem_servico, payload)

        # Para o item[0] não deveria criar nova; só item[1] gera nova
        tarefas_item0 = TarefaExecucao.objects.filter(
            os=ordem_servico, descricao=itens_orcamento[0].nome_descricao
        )
        assert tarefas_item0.count() == 1

    def test_marca_os_como_em_execucao(self, ordem_servico, itens_orcamento):
        """Após aprovar orçamento a OS sai de 'pendente' e entra em 'execucao'.

        OBS: STATUS_CHOICES da OrdemServico não inclui 'aprovado' — após o
        cliente aprovar, a OS passa direto para a fila de execução técnica.
        """
        payload = _payload_aprovando_dois_reprovando_um(itens_orcamento)

        processar_aprovacao_orcamento(ordem_servico, payload)

        ordem_servico.refresh_from_db()
        assert ordem_servico.status == "execucao"

    def test_registra_evento_de_aprovacao_no_historico(self, ordem_servico, itens_orcamento):
        payload = _payload_aprovando_dois_reprovando_um(itens_orcamento)

        processar_aprovacao_orcamento(ordem_servico, payload)

        eventos = HistoricoOS.objects.filter(os=ordem_servico, tipo="aprovacao")
        assert eventos.count() == 1
        assert "Aprovado" in eventos.first().descricao

    def test_payload_com_id_inexistente_nao_quebra_o_fluxo(self, ordem_servico, itens_orcamento):
        payload = [
            {"id": itens_orcamento[0].id, "status": "aprovado"},
            {"id": 999_999, "status": "aprovado"},  # id que não existe
        ]

        # Não deve lançar exceção
        processar_aprovacao_orcamento(ordem_servico, payload)

        itens_orcamento[0].refresh_from_db()
        assert itens_orcamento[0].status_aprovacao == "aprovado"
        # Apenas 1 tarefa criada (a do item válido)
        assert TarefaExecucao.objects.filter(os=ordem_servico).count() == 1
