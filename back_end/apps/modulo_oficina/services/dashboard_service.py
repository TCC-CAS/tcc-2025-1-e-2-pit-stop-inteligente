"""Cálculo dos KPIs, gráficos e alertas exibidos no Dashboard Gerencial.

Tudo é derivado dos modelos reais (OrdemServico, ItemOrcamento, ChecklistRecebimento)
e parametrizado por oficina + período em dias. Não há mock — basta consumir o
endpoint /dashboard/ no front-end.
"""
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum, Q
from django.utils import timezone

from ..models import (
    ChecklistRecebimento,
    Cliente,
    ItemOrcamento,
    OrdemServico,
    Veiculo,
)


# Status agrupado: front-end consome como "abertas/andamento/concluidas".
# `OrdemServico.STATUS_CHOICES` reconhece pendente / execucao / concluido.
# OS aguardando aprovação do cliente ficam em "pendente"; ao aprovar o
# orçamento, passam para "execucao"; ao finalizar, para "concluido".
STATUS_ABERTAS = "pendente"
STATUS_ANDAMENTO = ("execucao",)
STATUS_CONCLUIDAS = "concluido"

# Limites de alerta
DIAS_OS_PARADA = 5


# ---------------------------------------------------------------------------
# API pública
# ---------------------------------------------------------------------------

def montar_dashboard(oficina, dias=30):
    """Retorna o payload completo do dashboard para a oficina + período.

    Args:
        oficina: instância de Oficina.
        dias: tamanho da janela em dias (>=1). Default: 30.
    """
    dias = max(int(dias or 30), 1)
    fim = timezone.now()
    inicio = fim - timedelta(days=dias)
    inicio_anterior = inicio - timedelta(days=dias)

    ordens_atual = _ordens_no_periodo(oficina, inicio, fim)
    ordens_anterior = _ordens_no_periodo(oficina, inicio_anterior, inicio)

    return {
        "periodo": {
            "inicio": inicio.date().isoformat(),
            "fim": fim.date().isoformat(),
            "dias": dias,
        },
        "kpis": _calcular_kpis(ordens_atual, ordens_anterior),
        "graficos": _calcular_graficos(oficina, ordens_atual),
        "alertas": _gerar_alertas(oficina, ordens_atual),
        "aprovacoes": _calcular_aprovacoes(oficina, inicio, fim),
        "equipe": _calcular_desempenho_equipe(ordens_atual),
        "totais": _calcular_totais_gerais(oficina, ordens_atual),
    }


# ---------------------------------------------------------------------------
# Helpers de queryset
# ---------------------------------------------------------------------------

def _ordens_no_periodo(oficina, inicio, fim):
    """Queryset base: OS da oficina criadas entre [inicio, fim)."""
    return OrdemServico.objects.filter(
        oficina=oficina,
        criado_em__gte=inicio,
        criado_em__lt=fim,
    )


def _itens_aprovados_da_oficina(oficina, inicio, fim):
    """Itens de orçamento com status 'aprovado' das OS no período."""
    return ItemOrcamento.objects.filter(
        os__oficina=oficina,
        os__criado_em__gte=inicio,
        os__criado_em__lt=fim,
        status_aprovacao="aprovado",
    )


# ---------------------------------------------------------------------------
# KPIs (com tendência vs. período anterior)
# ---------------------------------------------------------------------------

def _calcular_kpis(ordens_atual, ordens_anterior):
    atual = _resumir_ordens(ordens_atual)
    anterior = _resumir_ordens(ordens_anterior)

    return {
        "os_abertas": atual["abertas"],
        "os_em_andamento": atual["andamento"],
        "os_concluidas": atual["concluidas"],
        "faturamento": float(atual["faturamento"]),
        "ticket_medio": float(atual["ticket"]),
        "tempo_medio_dias": atual["tempo_medio"],
        "tendencias": {
            "os_abertas": _tendencia(anterior["abertas"], atual["abertas"]),
            "os_em_andamento": _tendencia(anterior["andamento"], atual["andamento"]),
            "os_concluidas": _tendencia(anterior["concluidas"], atual["concluidas"]),
            "faturamento": _tendencia(anterior["faturamento"], atual["faturamento"]),
            "ticket_medio": _tendencia(anterior["ticket"], atual["ticket"]),
            "tempo_medio_dias": _tendencia(anterior["tempo_medio"], atual["tempo_medio"]),
        },
    }


def _resumir_ordens(qs):
    """Resumo dos campos usados pelos KPIs (puro Python — qs já filtrado)."""
    ordens = list(qs)
    abertas = sum(1 for o in ordens if o.status == STATUS_ABERTAS)
    andamento = sum(1 for o in ordens if o.status in STATUS_ANDAMENTO)
    concluidas_qs = [o for o in ordens if o.status == STATUS_CONCLUIDAS]

    # Faturamento = soma dos itens aprovados das OS concluídas no período
    if concluidas_qs:
        ids = [o.id for o in concluidas_qs]
        faturamento = (
            ItemOrcamento.objects.filter(os_id__in=ids, status_aprovacao="aprovado")
            .aggregate(total=Sum("valor_unitario"))["total"]
            or Decimal("0")
        )
    else:
        faturamento = Decimal("0")

    ticket = (faturamento / len(concluidas_qs)) if concluidas_qs else Decimal("0")

    # Tempo médio (em dias) — usa atualizado_em como proxy de "data de conclusão"
    tempos = [
        (o.atualizado_em - o.criado_em).total_seconds() / 86400
        for o in concluidas_qs
        if o.atualizado_em and o.criado_em
    ]
    tempo_medio = round(sum(tempos) / len(tempos)) if tempos else 0

    return {
        "abertas": abertas,
        "andamento": andamento,
        "concluidas": len(concluidas_qs),
        "faturamento": faturamento,
        "ticket": ticket,
        "tempo_medio": tempo_medio,
    }


def _tendencia(anterior, atual):
    anterior_f = float(anterior or 0)
    atual_f = float(atual or 0)
    if anterior_f == 0:
        return "+100%" if atual_f > 0 else "0%"
    variacao = ((atual_f - anterior_f) / anterior_f) * 100
    sinal = "+" if variacao >= 0 else ""
    return f"{sinal}{variacao:.1f}%"


# ---------------------------------------------------------------------------
# Gráficos
# ---------------------------------------------------------------------------

def _calcular_graficos(oficina, ordens_atual):
    return {
        "status_pie": _grafico_status(ordens_atual),
        "evolucao_diaria": _grafico_evolucao_diaria(ordens_atual),
        "faturamento_mensal": _grafico_faturamento_mensal(oficina),
        "top_servicos_realizados": _grafico_top_servicos(oficina, ordens_atual),
        "top_servicos_rentaveis": _grafico_servicos_rentaveis(oficina, ordens_atual),
        "os_por_dia_semana": _grafico_os_por_dia_semana(ordens_atual),
    }


def _grafico_status(ordens):
    contagem = ordens.values("status").annotate(total=Count("id"))
    base = {"pendente": 0, "execucao": 0, "concluido": 0}
    for row in contagem:
        if row["status"] in base:
            base[row["status"]] = row["total"]
    return base


def _grafico_evolucao_diaria(ordens):
    contagem = defaultdict(int)
    for os_obj in ordens.only("criado_em"):
        contagem[os_obj.criado_em.date().isoformat()] += 1
    return [
        {"data": data, "total": total}
        for data, total in sorted(contagem.items())
    ]


def _grafico_faturamento_mensal(oficina):
    """Últimos 12 meses, mesmo que extrapole o período do dashboard."""
    fim = timezone.now()
    inicio = fim - timedelta(days=365)

    itens = ItemOrcamento.objects.filter(
        os__oficina=oficina,
        os__criado_em__gte=inicio,
        os__criado_em__lt=fim,
        status_aprovacao="aprovado",
    ).select_related("os")

    por_mes = defaultdict(Decimal)
    for item in itens:
        chave = item.os.criado_em.strftime("%Y-%m")
        por_mes[chave] += item.valor_unitario or Decimal("0")

    return [
        {"mes": mes, "valor": float(valor)}
        for mes, valor in sorted(por_mes.items())
    ]


def _grafico_top_servicos(oficina, ordens, limite=5):
    """Serviços mais executados (contagem de itens aprovados do tipo 'servico')."""
    itens = (
        ItemOrcamento.objects.filter(
            os__in=ordens,
            tipo="servico",
            status_aprovacao="aprovado",
        )
        .values("nome_descricao")
        .annotate(quantidade=Count("id"))
        .order_by("-quantidade")[:limite]
    )
    return [{"nome": i["nome_descricao"], "quantidade": i["quantidade"]} for i in itens]


def _grafico_servicos_rentaveis(oficina, ordens, limite=5):
    """Serviços/peças que mais geraram faturamento."""
    itens = (
        ItemOrcamento.objects.filter(
            os__in=ordens,
            status_aprovacao="aprovado",
        )
        .values("nome_descricao")
        .annotate(faturamento=Sum("valor_unitario"))
        .order_by("-faturamento")[:limite]
    )
    return [
        {"nome": i["nome_descricao"], "faturamento": float(i["faturamento"] or 0)}
        for i in itens
    ]


_DIAS_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]


def _grafico_os_por_dia_semana(ordens):
    """Distribuição de aberturas de OS por dia da semana."""
    contagem = [0] * 7
    for os_obj in ordens.only("criado_em"):
        contagem[os_obj.criado_em.weekday()] += 1
    return [{"dia": _DIAS_PT[i], "total": total} for i, total in enumerate(contagem)]


# ---------------------------------------------------------------------------
# Alertas e aprovações
# ---------------------------------------------------------------------------

def _gerar_alertas(oficina, ordens_atual):
    alertas = []
    agora = timezone.now()
    limite_paradas = agora - timedelta(days=DIAS_OS_PARADA)

    paradas = ordens_atual.filter(
        criado_em__lt=limite_paradas,
    ).exclude(status=STATUS_CONCLUIDAS).count()
    if paradas:
        alertas.append({
            "tipo": "warning",
            "mensagem": f"{paradas} O.S. paradas há mais de {DIAS_OS_PARADA} dias",
        })

    pendentes = ItemOrcamento.objects.filter(
        os__oficina=oficina,
        status_aprovacao="pendente",
    ).count()
    if pendentes:
        alertas.append({
            "tipo": "info",
            "mensagem": f"{pendentes} itens aguardando aprovação",
        })

    sem_checklist = ordens_atual.filter(
        ~Q(checklist__concluido=True),
    ).count()
    if sem_checklist:
        alertas.append({
            "tipo": "info",
            "mensagem": f"{sem_checklist} O.S. sem checklist concluído",
        })

    if not alertas:
        alertas.append({"tipo": "success", "mensagem": "Nenhum alerta no momento"})

    return alertas


def _calcular_aprovacoes(oficina, inicio, fim):
    qs = ItemOrcamento.objects.filter(
        os__oficina=oficina,
        os__criado_em__gte=inicio,
        os__criado_em__lt=fim,
    )
    pendentes = qs.filter(status_aprovacao="pendente").count()
    aprovados = qs.filter(status_aprovacao="aprovado").count()
    reprovados = qs.filter(status_aprovacao="reprovado").count()
    total = pendentes + aprovados + reprovados
    taxa = round((aprovados / total) * 100, 1) if total else 0.0

    return {
        "pendentes": pendentes,
        "aprovados": aprovados,
        "reprovados": reprovados,
        "taxa_aprovacao": taxa,
    }


# ---------------------------------------------------------------------------
# Equipe (uses Checklist.consultor as proxy)
# ---------------------------------------------------------------------------

def _calcular_desempenho_equipe(ordens_atual):
    """Agrupa OS por consultor (do checklist). Usado como proxy de 'mecânico'.

    Retorna lista ordenada por número total de OS, descendente.
    """
    checklists = (
        ChecklistRecebimento.objects.filter(os__in=ordens_atual)
        .select_related("os")
    )

    por_consultor = defaultdict(lambda: {"total": 0, "concluidas": 0, "tempos": []})
    for chk in checklists:
        nome = (chk.consultor or "Sem consultor").strip() or "Sem consultor"
        bucket = por_consultor[nome]
        bucket["total"] += 1
        if chk.os.status == STATUS_CONCLUIDAS:
            bucket["concluidas"] += 1
            if chk.os.atualizado_em and chk.os.criado_em:
                tempo = (chk.os.atualizado_em - chk.os.criado_em).total_seconds() / 86400
                bucket["tempos"].append(tempo)

    resultado = []
    for nome, dados in por_consultor.items():
        eficiencia = (dados["concluidas"] / dados["total"]) * 100 if dados["total"] else 0
        tempo_medio = sum(dados["tempos"]) / len(dados["tempos"]) if dados["tempos"] else 0
        resultado.append({
            "nome": nome,
            "os_total": dados["total"],
            "os_concluidas": dados["concluidas"],
            "tempo_medio_dias": round(tempo_medio, 1),
            "eficiencia": round(eficiencia, 1),
        })

    return sorted(resultado, key=lambda r: r["os_total"], reverse=True)


# ---------------------------------------------------------------------------
# Totais gerais (cards de cabeçalho do dashboard)
# ---------------------------------------------------------------------------

def _calcular_totais_gerais(oficina, ordens_atual):
    clientes_periodo = (
        Cliente.objects.filter(ordens_servico__in=ordens_atual).distinct().count()
    )
    veiculos_periodo = (
        Veiculo.objects.filter(ordens_servico__in=ordens_atual).distinct().count()
    )
    return {
        "clientes_atendidos": clientes_periodo,
        "veiculos_atendidos": veiculos_periodo,
        "total_clientes_oficina": oficina.clientes.count(),
        "total_servicos_catalogo": oficina.catalogo_servicos.count(),
    }
