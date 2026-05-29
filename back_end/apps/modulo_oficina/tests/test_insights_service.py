"""Testes do motor de insights ('Gerar Análise')."""
import pytest

from apps.modulo_oficina.services.insights_service import gerar_analise


pytestmark = pytest.mark.unit


def _payload(**overrides):
    base = {
        "kpis": {
            "os_abertas": 0,
            "os_em_andamento": 0,
            "os_concluidas": 5,
            "faturamento": 10000.0,
            "ticket_medio": 2000.0,
            "tempo_medio_dias": 3,
            "tendencias": {
                "os_abertas": "0%",
                "os_em_andamento": "0%",
                "os_concluidas": "+10%",
                "faturamento": "+15%",
                "ticket_medio": "0%",
                "tempo_medio_dias": "0%",
            },
        },
        "graficos": {"top_servicos_rentaveis": []},
        "equipe": [],
        "aprovacoes": {"taxa_aprovacao": 75},
        "alertas": [],
    }
    base.update(overrides)
    return base


def test_faturamento_em_alta_gera_insight_positivo():
    a = gerar_analise(_payload())
    titulos = [i.titulo for i in a.insights]
    assert "Faturamento em alta" in titulos


def test_receita_em_queda_aciona_insight_de_atencao():
    p = _payload()
    p["kpis"]["tendencias"]["faturamento"] = "-20%"
    a = gerar_analise(p)
    insight = next(i for i in a.insights if "queda" in i.titulo.lower())
    assert insight.severidade == "atencao"


def test_queda_severa_marca_como_critico():
    p = _payload()
    p["kpis"]["tendencias"]["faturamento"] = "-40%"
    a = gerar_analise(p)
    insight = next(i for i in a.insights if "queda" in i.titulo.lower())
    assert insight.severidade == "critico"


def test_destaque_de_equipe_quando_ha_funcionario_produtivo():
    p = _payload()
    p["equipe"] = [
        {"nome": "Ana", "os_total": 5, "os_concluidas": 5, "eficiencia": 100.0, "tempo_medio_dias": 1.5},
        {"nome": "Carlos", "os_total": 4, "os_concluidas": 2, "eficiencia": 50.0, "tempo_medio_dias": 3.5},
    ]
    a = gerar_analise(p)
    titulos = [i.titulo for i in a.insights]
    assert any("Ana" in t for t in titulos)


def test_baixa_taxa_de_aprovacao_dispara_atencao():
    p = _payload()
    p["aprovacoes"]["taxa_aprovacao"] = 45
    a = gerar_analise(p)
    insight = next(i for i in a.insights if "aprovação" in i.titulo.lower())
    assert insight.severidade == "atencao"


def test_resumo_executivo_existe_em_qualquer_caso():
    a = gerar_analise(_payload())
    assert a.resumo_executivo
    assert isinstance(a.resumo_executivo, str)
    assert len(a.resumo_executivo) > 10


def test_dicionario_serializado_tem_chaves_esperadas():
    d = gerar_analise(_payload()).to_dict()
    assert {"resumo_executivo", "insights", "total_insights", "gerado_em"} <= set(d.keys())
