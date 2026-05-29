"""Documentos da OS visíveis ao cliente."""
from rest_framework.response import Response
from rest_framework.views import APIView

from ..permissions import ClienteSessionAuthentication, IsClienteAutenticado
from ..serializers import DocumentoClienteSerializer
from ..utils import get_os_do_cliente


class DocumentoListClienteAPIView(APIView):
    """GET /api/cliente/os/<id>/documentos/ — lista somente-leitura."""

    authentication_classes = [ClienteSessionAuthentication]
    permission_classes = [IsClienteAutenticado]

    def get(self, request, os_id):
        os_obj = get_os_do_cliente(request, os_id)
        documentos = os_obj.documentos.all().order_by("-criado_em")
        return Response(
            DocumentoClienteSerializer(
                documentos, many=True, context={"request": request}
            ).data
        )
