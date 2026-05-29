"""Service do dashboard administrativo (visão consolidada global)."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.utils import timezone

from apps.modulo_oficina.models import (
    Cliente,
    Funcionario,
    Oficina,
    OrdemServico,
)

from ..models import AuditoriaLog


User = get_user_model()


def montar_dashboard_admin():
    """Retorna o snapshot do dashboard administrativo.

    Centraliza todas as queries para evitar N+1 e manter as views finas.
    """
    agora = timezone.now()
    sete_dias = agora - timedelta(days=7)
    trinta_dias = agora - timedelta(days=30)

    total_oficinas = Oficina.objects.count()
    total_clientes = Cliente.objects.count()
    total_usuarios = User.objects.count()
    total_os = OrdemServico.objects.count()
    os_pendentes = OrdemServico.objects.filter(status="pendente").count()
    os_execucao = OrdemServico.objects.filter(status="execucao").count()
    os_concluidas = OrdemServico.objects.filter(status="concluido").count()

    novas_oficinas_7d = Oficina.objects.filter(criado_em__gte=sete_dias).count()
    novas_os_7d = OrdemServico.objects.filter(criado_em__gte=sete_dias).count()
    novos_clientes_30d = Cliente.objects.filter(criado_em__gte=trinta_dias).count()

    taxa_conclusao = (
        round((os_concluidas / total_os) * 100, 1) if total_os else 0.0
    )

    os_por_dia = list(
        OrdemServico.objects.filter(criado_em__gte=sete_dias)
        .extra(select={"dia": "DATE(criado_em)"})
        .values("dia")
        .annotate(total=Count("id"))
        .order_by("dia")
    )

    top_oficinas = list(
        Oficina.objects.annotate(qtd=Count("ordens_servico"))
        .order_by("-qtd")[:5]
        .values("id", "nome", "qtd")
    )

    eventos_recentes = list(
        AuditoriaLog.objects.select_related("usuario")
        .order_by("-criado_em")[:8]
        .values("id", "criado_em", "acao", "descricao", "nivel")
    )
    for ev in eventos_recentes:
        ev["criado_em"] = ev["criado_em"].strftime("%d/%m/%Y %H:%M")

    funcionarios_por_papel = list(
        Funcionario.objects.values("permissao")
        .annotate(qtd=Count("id"))
        .order_by("-qtd")
    )

    return {
        "kpis": {
            "total_oficinas": total_oficinas,
            "total_clientes": total_clientes,
            "total_usuarios": total_usuarios,
            "total_os": total_os,
            "os_pendentes": os_pendentes,
            "os_execucao": os_execucao,
            "os_concluidas": os_concluidas,
            "taxa_conclusao": taxa_conclusao,
            "novas_oficinas_7d": novas_oficinas_7d,
            "novas_os_7d": novas_os_7d,
            "novos_clientes_30d": novos_clientes_30d,
        },
        "os_status_distribuicao": {
            "pendente": os_pendentes,
            "execucao": os_execucao,
            "concluido": os_concluidas,
        },
        "os_por_dia": [
            {"dia": str(item["dia"]), "total": item["total"]} for item in os_por_dia
        ],
        "top_oficinas": top_oficinas,
        "funcionarios_por_papel": funcionarios_por_papel,
        "eventos_recentes": eventos_recentes,
    }
