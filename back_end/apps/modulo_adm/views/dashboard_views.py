"""View do dashboard administrativo consolidado."""
from rest_framework.response import Response
from rest_framework.views import APIView

from ..permissions import IsAdminGlobal
from ..services import montar_dashboard_admin


class DashboardAdminAPIView(APIView):
    """GET /api/admin/dashboard/ — KPIs globais + atividade recente."""
    permission_classes = [IsAdminGlobal]

    def get(self, request):
        return Response(montar_dashboard_admin())
