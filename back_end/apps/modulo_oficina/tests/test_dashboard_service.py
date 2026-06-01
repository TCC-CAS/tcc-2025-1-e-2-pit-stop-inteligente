"""Testes do dashboard_service.

Verifica que o payload retornado tem a estrutura esperada e que os cálculos
agregam corretamente os dados das OS, itens e checklists no período.
"""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.modulo_oficina.models import (
    ChecklistRecebimento,
    ItemOrcamento,
    OrdemServico,
)
from apps.modulo_oficina.services import montar_dashboard


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Fixtures locais
# ---------------------------------------------------------------------------

@pytest.fixture
def os_concluida(oficina, cliente, veiculo):
    """OS concluída há ~2 dias com 2 itens aprovados (R$ 200 e R$ 300)."""
    agora = timezone.now()
    os_obj = OrdemServico.objects.create(
        oficina=oficina,
        cliente=cliente,
        veiculo=veiculo,
        km_atual=12000,
        status="concluido",
    )
    OrdemServico.objects.filter(id=os_obj.id).update(
        criado_em=agora - timedelta(days=2),
        atualizado_em=agora,
    )
    os_obj.refresh_from_db()

    ItemOrcamento.objects.create(
        os=os_obj, tipo="servico", nome_descricao="Troca de óleo",
        quantidade=1, valor_unitario=Decimal("200.00"), status_aprovacao="aprovado",
    )
    ItemOrcamento.objects.create(
        os=os_obj, tipo="peca", nome_descricao="Filtro de óleo",
        quantidade=1, valor_unitario=Decimal("300.00"), status_aprovacao="aprovado",
    )
    return os_obj


@pytest.fixture
def os_pendente(oficina, cliente, veiculo):
    return OrdemServico.objects.create(
        oficina=oficina,
        cliente=cliente,
        veiculo=veiculo,
        km_atual=15000,
        status="pendente",
    )


# ---------------------------------------------------------------------------
# Estrutura geral do payload
# ---------------------------------------------------------------------------

class TestEstruturaPayload:
    def test_payload_tem_todas_as_secoes(self, oficina):
        payload = montar_dashboard(oficina, dias=30)

        assert set(payload.keys()) == {
            "periodo", "kpis", "graficos",
            "alertas", "aprovacoes", "equipe", "totais",
        }

    def test_periodo_reflete_dias_solicitado(self, oficina):
        payload = montar_dashboard(oficina, dias=7)
        assert payload["periodo"]["dias"] == 7
        assert "inicio" in payload["periodo"]
        assert "fim" in payload["periodo"]

    def test_dias_zero_ou_none_cai_no_default_30(self, oficina):
        # 0 e None são tratados como "sem valor" → default de 30
        assert montar_dashboard(oficina, dias=0)["periodo"]["dias"] == 30
        assert montar_dashboard(oficina, dias=None)["periodo"]["dias"] == 30

    def test_dias_negativo_eh_clampeado_para_1(self, oficina):
        # Valores positivos passam direto; negativos viram 1 (mínimo seguro)
        assert montar_dashboard(oficina, dias=-5)["periodo"]["dias"] == 1


# ---------------------------------------------------------------------------
# KPIs
# ---------------------------------------------------------------------------

class TestKPIs:
    def test_kpis_iniciais_zerados(self, oficina):
        kpis = montar_dashboard(oficina)["kpis"]
        assert kpis["os_abertas"] == 0
        assert kpis["os_em_andamento"] == 0
        assert kpis["os_concluidas"] == 0
        assert kpis["faturamento"] == 0
        assert kpis["ticket_medio"] == 0

    def test_kpis_contam_os_por_status(self, oficina, os_pendente, os_concluida):
        kpis = montar_dashboard(oficina)["kpis"]
        assert kpis["os_abertas"] == 1
        assert kpis["os_concluidas"] == 1

    def test_faturamento_soma_itens_aprovados_de_os_concluidas(self, oficina, os_concluida):
        kpis = montar_dashboard(oficina)["kpis"]
        assert kpis["faturamento"] == 500.0  # 200 + 300
        assert kpis["ticket_medio"] == 500.0  # 1 OS concluída

    def test_kpis_tem_tendencias_para_todos_os_indicadores(self, oficina):
        tendencias = montar_dashboard(oficina)["kpis"]["tendencias"]
        chaves_esperadas = {
            "os_abertas", "os_em_andamento", "os_concluidas",
            "faturamento", "ticket_medio", "tempo_medio_dias",
        }
        assert set(tendencias.keys()) == chaves_esperadas
        for valor in tendencias.values():
            assert isinstance(valor, str) and "%" in valor


# ---------------------------------------------------------------------------
# Gráficos
# ---------------------------------------------------------------------------

class TestGraficos:
    def test_status_pie_inclui_todas_as_chaves(self, oficina):
        """Reflete os STATUS_CHOICES reais da OrdemServico.

        Não existe estado 'aprovado' na OS — o cliente aprova ITENS de
        orçamento, e isso faz a OS transitar de 'pendente' → 'execucao'.
        """
        graficos = montar_dashboard(oficina)["graficos"]
        assert set(graficos["status_pie"].keys()) == {
            "pendente", "execucao", "concluido",
        }

    def test_top_servicos_realizados_so_traz_servicos_aprovados(self, oficina, os_concluida):
        graficos = montar_dashboard(oficina)["graficos"]
        nomes = [s["nome"] for s in graficos["top_servicos_realizados"]]
        assert "Troca de óleo" in nomes
        assert "Filtro de óleo" not in nomes  # tipo=peca não entra aqui

    def test_top_servicos_rentaveis_inclui_pecas_e_servicos(self, oficina, os_concluida):
        graficos = montar_dashboard(oficina)["graficos"]
        nomes = [s["nome"] for s in graficos["top_servicos_rentaveis"]]
        assert "Filtro de óleo" in nomes
        assert "Troca de óleo" in nomes

    def test_os_por_dia_semana_tem_7_dias(self, oficina):
        graficos = montar_dashboard(oficina)["graficos"]
        assert len(graficos["os_por_dia_semana"]) == 7
        for entrada in graficos["os_por_dia_semana"]:
            assert "dia" in entrada and "total" in entrada


# ---------------------------------------------------------------------------
# Alertas e aprovações
# ---------------------------------------------------------------------------

class TestAlertasEAprovacoes:
    def test_quando_nao_ha_problemas_alerta_eh_success(self, oficina):
        alertas = montar_dashboard(oficina)["alertas"]
        assert len(alertas) == 1
        assert alertas[0]["tipo"] == "success"

    def test_aprovacoes_calcula_taxa_corretamente(self, oficina, os_concluida):
        # Adiciona 1 reprovado para alterar a taxa
        ItemOrcamento.objects.create(
            os=os_concluida, tipo="peca", nome_descricao="Pastilha",
            quantidade=1, valor_unitario=Decimal("100"), status_aprovacao="reprovado",
        )
        ap = montar_dashboard(oficina)["aprovacoes"]
        assert ap["aprovados"] == 2
        assert ap["reprovados"] == 1
        # 2 aprovados de 3 total = 66.7%
        assert ap["taxa_aprovacao"] == 66.7


# ---------------------------------------------------------------------------
# Equipe (consultor do checklist)
# ---------------------------------------------------------------------------

class TestEquipe:
    def test_equipe_agrupa_por_consultor_do_checklist(self, oficina, os_concluida, os_pendente):
        ChecklistRecebimento.objects.create(os=os_concluida, consultor="Carlos", concluido=True)
        ChecklistRecebimento.objects.create(os=os_pendente, consultor="Carlos", concluido=True)

        equipe = montar_dashboard(oficina)["equipe"]
        assert len(equipe) == 1
        carlos = equipe[0]
        assert carlos["nome"] == "Carlos"
        assert carlos["os_total"] == 2
        assert carlos["os_concluidas"] == 1

    def test_equipe_eh_ordenada_por_total_descendente(self, oficina, cliente, veiculo):
        # 2 OS para Ana, 1 para Bruno
        for _ in range(2):
            os_a = OrdemServico.objects.create(
                oficina=oficina, cliente=cliente, veiculo=veiculo, status="pendente",
            )
            ChecklistRecebimento.objects.create(os=os_a, consultor="Ana", concluido=False)

        os_b = OrdemServico.objects.create(
            oficina=oficina, cliente=cliente, veiculo=veiculo, status="pendente",
        )
        ChecklistRecebimento.objects.create(os=os_b, consultor="Bruno", concluido=False)

        equipe = montar_dashboard(oficina)["equipe"]
        nomes = [e["nome"] for e in equipe]
        assert nomes == ["Ana", "Bruno"]
