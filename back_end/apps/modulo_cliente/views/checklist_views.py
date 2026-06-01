"""Endpoints do checklist no portal do cliente."""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.modulo_oficina.models import ChecklistRecebimento

from ..permissions import ClienteSessionAuthentication, IsClienteAutenticado
from ..serializers import ChecklistClienteSerializer
from ..services import assinar_checklist_cliente
from ..utils import get_os_do_cliente


class ChecklistClienteAPIView(APIView):
    """GET /api/cliente/os/<id>/checklist/ — leitura do checklist."""

    authentication_classes = [ClienteSessionAuthentication]
    permission_classes = [IsClienteAutenticado]

    def get(self, request, os_id):
        os_obj = get_os_do_cliente(request, os_id)
        try:
            checklist = ChecklistRecebimento.objects.get(os=os_obj)
        except ChecklistRecebimento.DoesNotExist:
            return Response({"disponivel": False, "concluido": False})
        data = ChecklistClienteSerializer(checklist).data
        data["disponivel"] = True
        return Response(data)


class AssinarChecklistClienteAPIView(APIView):
    """POST /api/cliente/os/<id>/checklist/assinar/

    Body: { "assinatura": "data:image/png;base64,..." }
    """

    authentication_classes = [ClienteSessionAuthentication]
    permission_classes = [IsClienteAutenticado]

    def post(self, request, os_id):
        os_obj = get_os_do_cliente(request, os_id)
        try:
            checklist = assinar_checklist_cliente(
                os_obj=os_obj,
                assinatura_data_url=request.data.get("assinatura"),
            )
        except ValueError as exc:
            return Response({"erro": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ChecklistClienteSerializer(checklist).data)
