"""Análise automática (insights) para o Dashboard Gerencial.

A função `gerar_analise` consome o payload do dashboard e devolve uma
lista de "insights" em linguagem natural — frases que o gestor entende
de relance, com categoria (financeiro, operacional, equipe, qualidade)
e severidade (positivo, neutro, atenção, crítico).

Mantemos o módulo PURO (recebe um dicionário, devolve outro). Assim é
fácil testar e adicionar novas regras sem encostar no service de
dashboard.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


@dataclass
class Insight:
    titulo: str
    descricao: str
    categoria: str = "geral"     # financeiro|operacional|equipe|qualidade|geral
    severidade: str = "info"     # positivo|info|atencao|critico
    metrica: str = ""            # ex: "+18,5%", "5 OS"
    acao_sugerida: str = ""      # próximo passo recomendado

    def to_dict(self):
        return {
            "titulo": self.titulo,
            "descricao": self.descricao,
            "categoria": self.categoria,
            "severidade": self.severidade,
            "metrica": self.metrica,
            "acao_sugerida": self.acao_sugerida,
        }


@dataclass
class AnaliseDashboard:
    resumo_executivo: str
    insights: List[Insight] = field(default_factory=list)
    gerado_em: str = ""

    def to_dict(self):
        return {
            "resumo_executivo": self.resumo_executivo,
            "gerado_em": self.gerado_em,
            "total_insights": len(self.insights),
            "insights": [i.to_dict() for i in self.insights],
        }


def _pct_para_float(tendencia_str: str) -> float:
    """Converte "+18.5%" → 18.5, "-7%" → -7.0, "0%" → 0.0."""
    if not tendencia_str:
        return 0.0
    txt = tendencia_str.replace("%", "").replace(",", ".").strip()
    try:
        return float(txt)
    except (TypeError, ValueError):
        return 0.0


def _ifBR(numero) -> str:
    """Formata número usando vírgula como separador decimal."""
    try:
        return f"{float(numero):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except (TypeError, ValueError):
        return str(numero)


def gerar_analise(payload_dashboard: dict, dias: int = 30) -> AnaliseDashboard:
    """Recebe o JSON do dashboard e produz uma análise textual.

    `dias` é só para contextualizar mensagens ("nos últimos 30 dias").
    """
    from django.utils import timezone

    kpis = payload_dashboard.get("kpis", {}) or {}
    graficos = payload_dashboard.get("graficos", {}) or {}
    equipe = payload_dashboard.get("equipe", []) or []
    aprovacoes = payload_dashboard.get("aprovacoes", {}) or {}
    alertas = payload_dashboard.get("alertas", []) or []

    insights: List[Insight] = []

    # ---- Faturamento ----
    fat_atual = float(kpis.get("faturamento", 0) or 0)
    fat_tend = _pct_para_float(kpis.get("tendencias", {}).get("faturamento", "0%"))
    if fat_tend >= 10:
        insights.append(Insight(
            titulo="Faturamento em alta",
            descricao=(
                f"Nos últimos {dias} dias seu faturamento foi de R$ {_ifBR(fat_atual)}, "
                f"crescimento de {kpis['tendencias']['faturamento']} em relação ao período anterior."
            ),
            categoria="financeiro",
            severidade="positivo",
            metrica=kpis["tendencias"]["faturamento"],
            acao_sugerida="Mantenha a estratégia e considere expandir os serviços mais rentáveis.",
        ))
    elif fat_tend <= -10:
        insights.append(Insight(
            titulo="Atenção: receita em queda",
            descricao=(
                f"Sua receita caiu {abs(fat_tend):.1f}% em relação ao período anterior "
                f"(R$ {_ifBR(fat_atual)} nos últimos {dias} dias)."
            ),
            categoria="financeiro",
            severidade="atencao" if fat_tend > -25 else "critico",
            metrica=kpis["tendencias"]["faturamento"],
            acao_sugerida="Revise a taxa de aprovação dos orçamentos e o pipeline de OS abertas.",
        ))

    # ---- Ticket médio ----
    ticket_atual = float(kpis.get("ticket_medio", 0) or 0)
    ticket_tend = _pct_para_float(kpis.get("tendencias", {}).get("ticket_medio", "0%"))
    if abs(ticket_tend) >= 8:
        if ticket_tend > 0:
            severidade = "positivo"
            acao = "Continue oferecendo serviços complementares no momento da aprovação."
        else:
            severidade = "atencao"
            acao = "Avalie se a queda vem de descontos excessivos ou de mix de serviços mais baratos."
        insights.append(Insight(
            titulo=("Ticket médio crescente" if ticket_tend > 0 else "Ticket médio caindo"),
            descricao=(
                f"O valor médio por O.S. é R$ {_ifBR(ticket_atual)} "
                f"({kpis['tendencias']['ticket_medio']} vs período anterior)."
            ),
            categoria="financeiro",
            severidade=severidade,
            metrica=kpis["tendencias"]["ticket_medio"],
            acao_sugerida=acao,
        ))

    # ---- Volume de OS ----
    os_concluidas = int(kpis.get("os_concluidas", 0) or 0)
    os_abertas = int(kpis.get("os_abertas", 0) or 0)
    os_andamento = int(kpis.get("os_em_andamento", 0) or 0)
    if os_andamento > os_concluidas * 1.5 and os_andamento >= 5:
        insights.append(Insight(
            titulo="Gargalo em execução",
            descricao=(
                f"Você tem {os_andamento} O.S. em andamento e apenas {os_concluidas} "
                f"concluídas no período. Pode haver um gargalo na finalização."
            ),
            categoria="operacional",
            severidade="atencao",
            metrica=f"{os_andamento} OS",
            acao_sugerida="Reveja a distribuição de tarefas e priorize as O.S. mais antigas.",
        ))

    # ---- Tempo médio ----
    tempo_medio = float(kpis.get("tempo_medio_dias", 0) or 0)
    tempo_tend = _pct_para_float(kpis.get("tendencias", {}).get("tempo_medio_dias", "0%"))
    if tempo_medio >= 7 and tempo_tend > 0:
        insights.append(Insight(
            titulo="Tempo de conclusão aumentando",
            descricao=(
                f"As O.S. estão demorando em média {tempo_medio:.0f} dias para concluir, "
                f"variação de {kpis['tendencias']['tempo_medio_dias']} vs período anterior."
            ),
            categoria="operacional",
            severidade="atencao",
            metrica=f"{tempo_medio:.0f} dias",
            acao_sugerida="Verifique se peças estão atrasando e considere reforçar a equipe.",
        ))
    elif tempo_medio > 0 and tempo_tend <= -10:
        insights.append(Insight(
            titulo="Equipe acelerando entregas",
            descricao=(
                f"Tempo médio de conclusão caiu para {tempo_medio:.0f} dias "
                f"({kpis['tendencias']['tempo_medio_dias']} vs período anterior)."
            ),
            categoria="operacional",
            severidade="positivo",
            metrica=kpis["tendencias"]["tempo_medio_dias"],
        ))

    # ---- Taxa de aprovação ----
    taxa = float(aprovacoes.get("taxa_aprovacao", 0) or 0)
    if taxa and taxa < 60:
        insights.append(Insight(
            titulo="Baixa taxa de aprovação de orçamentos",
            descricao=(
                f"Apenas {taxa:.1f}% dos itens orçados são aprovados pelo cliente. "
                "Pode indicar precificação fora do mercado ou comunicação pouco clara."
            ),
            categoria="financeiro",
            severidade="atencao",
            metrica=f"{taxa:.1f}%",
            acao_sugerida="Revise o template de orçamento e treine atendentes em apresentação de propostas.",
        ))
    elif taxa >= 85:
        insights.append(Insight(
            titulo="Excelente taxa de aprovação",
            descricao=(
                f"{taxa:.1f}% dos itens orçados são aprovados — sua comunicação com o cliente está afinada."
            ),
            categoria="financeiro",
            severidade="positivo",
            metrica=f"{taxa:.1f}%",
        ))

    # ---- Equipe: produtividade ----
    if equipe:
        # Ordena por concluídas e identifica o destaque + atenção
        ordenada = sorted(equipe, key=lambda r: r.get("os_concluidas", 0), reverse=True)
        top = ordenada[0]
        if top.get("os_concluidas", 0) >= 3:
            insights.append(Insight(
                titulo=f"Destaque da equipe: {top['nome']}",
                descricao=(
                    f"{top['nome']} é o funcionário mais produtivo do período, "
                    f"com {top['os_concluidas']} O.S. concluídas "
                    f"(eficiência de {top.get('eficiencia', 0):.1f}%)."
                ),
                categoria="equipe",
                severidade="positivo",
                metrica=f"{top['os_concluidas']} OS",
                acao_sugerida="Reconheça publicamente — engaja a equipe e referência boas práticas.",
            ))
        # Eficiência baixa
        baixos = [r for r in equipe if r.get("eficiencia", 0) < 40 and r.get("os_total", 0) >= 3]
        if baixos:
            nomes = ", ".join(r["nome"] for r in baixos[:3])
            insights.append(Insight(
                titulo="Funcionários com eficiência baixa",
                descricao=(
                    f"{nomes} têm eficiência abaixo de 40%. "
                    "Pode indicar falta de treinamento ou sobrecarga em outras frentes."
                ),
                categoria="equipe",
                severidade="atencao",
                acao_sugerida="Converse individualmente e identifique bloqueios — treinamento, ferramenta ou priorização.",
            ))

    # ---- Top serviços rentáveis ----
    rentaveis = graficos.get("top_servicos_rentaveis") or []
    if rentaveis:
        top_servico = rentaveis[0]
        insights.append(Insight(
            titulo=f"Serviço mais rentável: {top_servico['nome']}",
            descricao=(
                f"Responsável por R$ {_ifBR(top_servico['faturamento'])} no período."
            ),
            categoria="financeiro",
            severidade="info",
            metrica=f"R$ {_ifBR(top_servico['faturamento'])}",
            acao_sugerida="Considere promover este serviço em campanhas ou pacotes.",
        ))

    # ---- Alertas críticos do dashboard viram insights ----
    for alerta in alertas:
        if alerta.get("tipo") == "warning":
            insights.append(Insight(
                titulo="Alerta operacional",
                descricao=alerta.get("mensagem", ""),
                categoria="operacional",
                severidade="atencao",
            ))

    # ---- Resumo executivo (1 frase) ----
    if not insights:
        resumo = (
            f"Nada de extraordinário nos últimos {dias} dias. "
            "A operação está estável dentro dos padrões esperados."
        )
    else:
        positivos = sum(1 for i in insights if i.severidade == "positivo")
        atencao = sum(1 for i in insights if i.severidade in ("atencao", "critico"))
        if atencao == 0:
            resumo = f"Boa notícia: {positivos} indicador(es) positivo(s) e nenhum ponto de atenção."
        elif positivos == 0:
            resumo = (
                f"Atenção necessária: {atencao} ponto(s) de atenção identificado(s). "
                "Veja as recomendações abaixo."
            )
        else:
            resumo = (
                f"Cenário misto: {positivos} ponto(s) positivo(s) e {atencao} ponto(s) de atenção. "
                "Comece pelos mais críticos."
            )

    return AnaliseDashboard(
        resumo_executivo=resumo,
        insights=insights,
        gerado_em=timezone.now().isoformat(),
    )
