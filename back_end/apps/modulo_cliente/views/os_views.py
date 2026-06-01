"""Listagem e detalhe das OS pertencentes ao cliente logado."""
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.modulo_oficina.models import OrdemServico

from ..permissions import (
    ClienteSessionAuthentication,
    IsClienteAutenticado,
    get_cliente_session_id,
)
from ..serializers import OSDetalheClienteSerializer, OSListaClienteSerializer
from ..utils import get_os_do_cliente


class ListarOSClienteAPIView(APIView):
    """GET /api/cliente/os/ — todas as OS do cliente da sessão."""

    authentication_classes = [ClienteSessionAuthentication]
    permission_classes = [IsClienteAutenticado]

    def get(self, request):
        cliente_id = get_cliente_session_id(request)
        queryset = (
            OrdemServico.objects.filter(cliente_id=cliente_id)
            .select_related("veiculo", "oficina")
            .order_by("-criado_em")
        )
        return Response(OSListaClienteSerializer(queryset, many=True).data)


class DetalheOSClienteAPIView(APIView):
    """GET /api/cliente/os/<id>/ — cabeçalho da OS, validando ownership."""

    authentication_classes = [ClienteSessionAuthentication]
    permission_classes = [IsClienteAutenticado]

    def get(self, request, os_id):
        os_obj = get_os_do_cliente(request, os_id)
        return Response(OSDetalheClienteSerializer(os_obj).data)
