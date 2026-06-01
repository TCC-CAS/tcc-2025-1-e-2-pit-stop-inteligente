"""Endpoints do painel SaaS para visualizar consumo das oficinas.

Endpoints:
  - GET  /api/admin/oficinas/<id>/consumo/         → snapshot completo
  - PUT  /api/admin/oficinas/<id>/limites/         → ajusta override
  - GET  /api/admin/consumo/                       → visão consolidada
"""
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.modulo_oficina.models import Oficina, OficinaLimitesOverride
from apps.modulo_oficina.services import consumo_oficina, consumo_os_mes, consumo_usuarios

from ..permissions import IsAdminGlobal
from ..utils import registrar_auditoria


class OficinaConsumoAdminAPIView(APIView):
    """Snapshot completo de UMA oficina, com override de limites anexado.

    O payload extra `override` permite a UI mostrar quais limites foram
    sobrescritos por esta oficina (vs. plano default).
    """

    permission_classes = [IsAdminGlobal]

    def get(self, request, pk):
        oficina = get_object_or_404(Oficina, pk=pk)
        snapshot = consumo_oficina(oficina)
        ov = getattr(oficina, "limites_override", None)
        snapshot["override"] = {
            "limite_usuarios": ov.limite_usuarios if ov else None,
            "limite_os_mensal": ov.limite_os_mensal if ov else None,
            "limite_storage_mb": ov.limite_storage_mb if ov else None,
            "motivo": ov.motivo if ov else "",
            "atualizado_em": ov.atualizado_em.strftime("%d/%m/%Y %H:%M") if ov else None,
            "atualizado_por": (
                (ov.atualizado_por.get_full_name() or ov.atualizado_por.username)
                if (ov and ov.atualizado_por) else None
            ),
        }
        return Response(snapshot)


class OficinaLimitesAdminAPIView(APIView):
    """PUT /api/admin/oficinas/<id>/limites/

    Body: { "limite_usuarios": int|null, "limite_os_mensal": int|null,
            "limite_storage_mb": int|null, "motivo": str }
    `null` em qualquer campo = remover override → volta a usar o default do plano.
    """

    permission_classes = [IsAdminGlobal]

    def put(self, request, pk):
        oficina = get_object_or_404(Oficina, pk=pk)
        ov, _ = OficinaLimitesOverride.objects.get_or_create(oficina=oficina)

        dados = request.data or {}
        mudancas = {}

        for campo in ("limite_usuarios", "limite_os_mensal", "limite_storage_mb"):
            if campo in dados:
                valor = dados[campo]
                # Valida quando não-null
                if valor is not None:
                    try:
                        valor = max(0, int(valor))
                    except (TypeError, ValueError):
                        return Response(
                            {"erro": f"Valor inválido para {campo}: esperado inteiro."},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                anterior = getattr(ov, campo)
                if anterior != valor:
                    setattr(ov, campo, valor)
                    mudancas[campo] = {"de": anterior, "para": valor}

        if "motivo" in dados:
            ov.motivo = str(dados["motivo"])[:255]

        ov.atualizado_por = request.user
        ov.save()

        if mudancas:
            registrar_auditoria(
                request,
                acao="oficina.limites_override",
                descricao=f"Limites da oficina {oficina.nome} alterados.",
                recurso="oficina",
                recurso_id=str(oficina.id),
                nivel="warning",
                metadados={"oficina_id": oficina.id, "mudancas": mudancas},
            )

        # Retorna o snapshot atualizado para o front renderizar de novo
        snapshot = consumo_oficina(oficina)
        return Response({"mensagem": "Limites atualizados.", "snapshot": snapshot})

    def delete(self, request, pk):
        """Remove o override por completo → volta ao default do plano."""
        oficina = get_object_or_404(Oficina, pk=pk)
        OficinaLimitesOverride.objects.filter(oficina=oficina).delete()
        registrar_auditoria(
            request,
            acao="oficina.limites_reset",
            descricao=f"Override removido da oficina {oficina.nome}.",
            recurso="oficina",
            recurso_id=str(oficina.id),
        )
        return Response({"mensagem": "Override removido."})


class ConsumoGlobalAdminAPIView(APIView):
    """Resumo de todas as oficinas — ordenado por % de uso descendente.

    Para evitar custo alto em produção (storage é o caro), por padrão
    usamos consumo *leve* (usuários + OS/mês). O detalhe completo
    (incluindo storage) é pedido sob demanda ao clicar em uma oficina.

    Query params:
        ordenar_por (str): "usuarios" | "os_mensal" (default: "usuarios")
        page (int) / page_size (int): paginação simples
        com_storage (str): "1" para incluir storage no cálculo (lento)
    """

    permission_classes = [IsAdminGlobal]

    def get(self, request):
        oficinas = list(Oficina.objects.all().order_by("nome"))
        com_storage = request.GET.get("com_storage") == "1"

        resultado = []
        for o in oficinas:
            usuarios = consumo_usuarios(o).to_dict()
            os_mes = consumo_os_mes(o).to_dict()
            item = {
                "oficina_id": o.id,
                "oficina_nome": o.nome,
                "plano": o.plano_atual or "basico",
                "usuarios": usuarios,
                "os_mensal": os_mes,
            }
            if com_storage:
                from apps.modulo_oficina.services import consumo_storage
                item["storage_mb"] = consumo_storage(o).to_dict()
            resultado.append(item)

        chave_ord = request.GET.get("ordenar_por") or "usuarios"
        if chave_ord not in ("usuarios", "os_mensal"):
            chave_ord = "usuarios"
        resultado.sort(
            key=lambda r: r[chave_ord]["percentual_uso"], reverse=True,
        )

        try:
            page = max(1, int(request.GET.get("page", 1)))
            page_size = min(100, max(5, int(request.GET.get("page_size", 25))))
        except ValueError:
            page, page_size = 1, 25

        total = len(resultado)
        start = (page - 1) * page_size
        end = start + page_size

        # Alertas globais — oficinas críticas (>=100%) e atenção (>=80%)
        criticas = sum(
            1 for r in resultado
            if r["usuarios"]["atingiu_limite"] or r["os_mensal"]["atingiu_limite"]
        )
        atencao = sum(
            1 for r in resultado
            if (r["usuarios"]["proximo_do_limite"] or r["os_mensal"]["proximo_do_limite"])
            and not (r["usuarios"]["atingiu_limite"] or r["os_mensal"]["atingiu_limite"])
        )

        return Response({
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
            "alertas": {"criticas": criticas, "atencao": atencao},
            "results": resultado[start:end],
        })
