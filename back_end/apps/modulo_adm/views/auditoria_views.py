"""Views de Auditoria — leitura e exportação."""
import csv

from django.http import HttpResponse
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import AuditoriaLog
from ..permissions import IsAdminGlobal
from ..serializers import AuditoriaLogSerializer


def _aplicar_filtros(queryset, request):
    """Filtros comuns: ?usuario, ?nivel, ?acao, ?recurso, ?desde, ?ate."""
    qs = queryset
    usuario = request.GET.get("usuario")
    nivel = request.GET.get("nivel")
    acao = request.GET.get("acao")
    recurso = request.GET.get("recurso")
    desde = request.GET.get("desde")
    ate = request.GET.get("ate")
    if usuario:
        qs = qs.filter(usuario__username__icontains=usuario)
    if nivel:
        qs = qs.filter(nivel=nivel)
    if acao:
        qs = qs.filter(acao__icontains=acao)
    if recurso:
        qs = qs.filter(recurso=recurso)
    if desde:
        qs = qs.filter(criado_em__date__gte=desde)
    if ate:
        qs = qs.filter(criado_em__date__lte=ate)
    return qs


class AuditoriaListAdminAPIView(APIView):
    """GET /api/admin/auditoria/?page=&page_size=&...

    Sempre paginado para não retornar tabela inteira.
    Use `?export=csv` para baixar como CSV (até 5000 linhas).
    """
    permission_classes = [IsAdminGlobal]

    def get(self, request):
        qs = _aplicar_filtros(AuditoriaLog.objects.select_related("usuario"), request)

        if request.GET.get("export") == "csv":
            return self._exportar_csv(qs[:5000])

        try:
            page = max(1, int(request.GET.get("page", 1)))
            page_size = min(200, max(5, int(request.GET.get("page_size", 25))))
        except ValueError:
            page, page_size = 1, 25

        total = qs.count()
        start = (page - 1) * page_size
        end = start + page_size
        itens = qs[start:end]

        return Response({
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
            "results": AuditoriaLogSerializer(itens, many=True).data,
        })

    def _exportar_csv(self, qs):
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="auditoria.csv"'
        writer = csv.writer(response)
        writer.writerow([
            "data_hora", "nivel", "usuario", "acao",
            "recurso", "recurso_id", "descricao", "ip",
        ])
        for log in qs:
            writer.writerow([
                log.criado_em.strftime("%Y-%m-%d %H:%M:%S"),
                log.nivel,
                (log.usuario and (log.usuario.get_full_name() or log.usuario.username)) or "Sistema",
                log.acao,
                log.recurso,
                log.recurso_id,
                log.descricao,
                log.ip or "",
            ])
        return response
