"""View pública do Dashboard Gerencial: agrega KPIs, gráficos e alertas
em uma única chamada GET /dashboard/?periodo=<dias>.
"""
from rest_framework.response import Response
from rest_framework.views import APIView

from ..permissions import IsFuncionario
from ..services import gerar_analise
from ..services.dashboard_service import montar_dashboard
from ..utils import get_oficina_atual


def _resolver_dias(request, default=30):
    try:
        return max(int(request.query_params.get("periodo", default)), 1)
    except (TypeError, ValueError):
        return default


class DashboardAPIView(APIView):
    """Endpoint único do dashboard.

    Query params:
        periodo (int): janela em dias para os cálculos. Default 30.
                       Aceita 7, 30, 90 ou qualquer valor positivo.
    """

    permission_classes = [IsFuncionario]

    def get(self, request):
        oficina = get_oficina_atual(request)
        if oficina is None:
            return Response({
                "erro": "Nenhuma oficina encontrada para o usuário autenticado.",
            }, status=404)
        dias = _resolver_dias(request)
        return Response(montar_dashboard(oficina, dias=dias))


class DashboardAnaliseAPIView(APIView):
    """Endpoint do botão 'Gerar Análise'.

    Calcula o dashboard internamente e passa pelo motor de insights, que
    devolve um resumo executivo + lista de insights em linguagem natural.

    Mantido separado do GET /dashboard/ para que o front possa exibir
    skeleton de loading só no card de análise (que tem latência maior).
    """

    permission_classes = [IsFuncionario]

    def get(self, request):
        oficina = get_oficina_atual(request)
        if oficina is None:
            return Response({"erro": "Nenhuma oficina encontrada."}, status=404)
        dias = _resolver_dias(request)
        payload = montar_dashboard(oficina, dias=dias)
        analise = gerar_analise(payload, dias=dias)
        return Response(analise.to_dict())
