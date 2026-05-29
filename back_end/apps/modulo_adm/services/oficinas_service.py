"""Service de gestão de oficinas (admin SaaS)."""
from django.db.models import Count, Max, OuterRef, Q, Subquery

from apps.modulo_oficina.models import Oficina

from ..utils import registrar_auditoria


def listar_oficinas_com_agregados(busca=None, estado=None, plano=None):
    """Lista todas as oficinas com KPIs agregados.

    Anota:
      - total_funcionarios / funcionarios_ativos
      - total_clientes / total_os
      - ultimo_pagamento_status / ultimo_pagamento_em (Pagamento mais recente)
      - total_pagamentos_pagos (histórico)

    `select_related("assinatura__plano")` carrega a assinatura vigente
    para o serializer expor status sem N+1.
    """
    # Subquery: status do pagamento mais recente desta oficina (qualquer tipo)
    from apps.modulo_pagamentos.models import Pagamento

    pagamento_recente = Pagamento.objects.filter(
        oficina=OuterRef("pk")
    ).order_by("-criado_em")

    qs = (
        Oficina.objects.select_related("assinatura__plano")
        .annotate(
            total_funcionarios=Count("funcionarios", distinct=True),
            funcionarios_ativos=Count(
                "funcionarios",
                filter=Q(funcionarios__is_active=True),
                distinct=True,
            ),
            total_clientes=Count("clientes", distinct=True),
            total_os=Count("ordens_servico", distinct=True),
            total_pagamentos_pagos=Count(
                "pagamentos",
                filter=Q(pagamentos__status="pago"),
                distinct=True,
            ),
            ultimo_pagamento_status=Subquery(pagamento_recente.values("status")[:1]),
            ultimo_pagamento_em=Subquery(pagamento_recente.values("criado_em")[:1]),
            ultimo_pagamento_metodo=Subquery(
                pagamento_recente.values("metodo_escolhido")[:1]
            ),
        )
        .order_by("nome")
    )

    if busca:
        qs = qs.filter(nome__icontains=busca) | qs.filter(cnpj__icontains=busca)
    if estado:
        qs = qs.filter(estado=estado)
    if plano:
        qs = qs.filter(plano_atual=plano)

    return qs


def inativar_oficina(request, oficina, ativo):
    """Inativa/ativa a oficina marcando todos os funcionários como inativos.

    Como `Oficina` não tem `is_active`, encerramos os vínculos: nenhum
    funcionário consegue logar, mas os dados ficam preservados.
    """
    funcs = oficina.funcionarios.all()
    funcs.update(is_active=ativo)
    registrar_auditoria(
        request,
        acao="oficina.inativar" if not ativo else "oficina.reativar",
        recurso="oficina",
        recurso_id=oficina.id,
        nivel="critico" if not ativo else "warning",
        descricao=(
            f"{'Inativada' if not ativo else 'Reativada'} a oficina '{oficina.nome}' "
            f"({funcs.count()} funcionário(s) afetados)."
        ),
    )

    try:
        from ..models import Notificacao
        Notificacao.criar(
            "oficina_inativada",
            f"Oficina '{oficina.nome}' {'inativada' if not ativo else 'reativada'}",
            f"{funcs.count()} funcionário(s) afetados.",
            nivel="critico" if not ativo else "info",
            metadados={"oficina_id": oficina.id, "ativo": ativo},
        )
    except Exception:
        pass

    return oficina


def excluir_oficina(request, oficina):
    """Exclusão hard (cascade). Usado apenas por superuser."""
    nome = oficina.nome
    pk = oficina.id
    oficina.delete()
    registrar_auditoria(
        request,
        acao="oficina.excluir",
        recurso="oficina",
        recurso_id=pk,
        nivel="critico",
        descricao=f"Oficina '{nome}' excluída permanentemente.",
    )
