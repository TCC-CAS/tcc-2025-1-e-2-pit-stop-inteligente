"""Timeline da OS exibida ao cliente."""
from rest_framework.response import Response
from rest_framework.views import APIView

from ..permissions import ClienteSessionAuthentication, IsClienteAutenticado
from ..serializers import HistoricoClienteSerializer
from ..utils import get_os_do_cliente


class HistoricoClienteAPIView(APIView):
    """GET /api/cliente/os/<id>/historico/ — eventos da OS."""

    authentication_classes = [ClienteSessionAuthentication]
    permission_classes = [IsClienteAutenticado]

    def get(self, request, os_id):
        os_obj = get_os_do_cliente(request, os_id)
        eventos = os_obj.historico.all().order_by("-data_hora")
        return Response(HistoricoClienteSerializer(eventos, many=True).data)
