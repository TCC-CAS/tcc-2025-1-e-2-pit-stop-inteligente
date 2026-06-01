"""Listagem do catálogo de planos SaaS."""
from rest_framework.response import Response
from rest_framework.views import APIView

from ..permissions import IsFuncionario
from ..serializers import PlanoSaaSSerializer
from ..services.assinatura_service import listar_planos_ativos


class ListarPlanosAPIView(APIView):
    """GET /api/pagamentos/planos/

    Devolve o catálogo de planos ativos, ordenado pelo campo `ordem`.
    Disponível para qualquer funcionário (a UI usa para renderizar a
    seleção de plano e mostrar o preço atual).
    """

    permission_classes = [IsFuncionario]

    def get(self, request):
        planos = listar_planos_ativos()
        return Response({"planos": PlanoSaaSSerializer(planos, many=True).data})
