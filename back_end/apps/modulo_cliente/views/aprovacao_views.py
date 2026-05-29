"""Endpoints de aprovação/rejeição de orçamento pelo cliente."""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.modulo_oficina.models import ItemOrcamento

from ..permissions import ClienteSessionAuthentication, IsClienteAutenticado
from ..serializers import ItemOrcamentoClienteSerializer
from ..services import aprovar_orcamento_cliente, atualizar_status_item_cliente
from ..utils import get_os_do_cliente


class ItensOrcamentoClienteAPIView(APIView):
    """GET /api/cliente/os/<id>/itens/ — lista itens para aprovação."""

    authentication_classes = [ClienteSessionAuthentication]
    permission_classes = [IsClienteAutenticado]

    def get(self, request, os_id):
        os_obj = get_os_do_cliente(request, os_id)
        itens = ItemOrcamento.objects.filter(os_id=os_obj.id).order_by("id")
        return Response(ItemOrcamentoClienteSerializer(itens, many=True).data)


class AtualizarStatusItemClienteAPIView(APIView):
    """POST /api/cliente/os/<id>/itens/<item_id>/decisao/

    Body: { "status": "aprovado" | "reprovado", "justificativa": "..." }
    """

    authentication_classes = [ClienteSessionAuthentication]
    permission_classes = [IsClienteAutenticado]

    def post(self, request, os_id, item_id):
        os_obj = get_os_do_cliente(request, os_id)
        try:
            item = atualizar_status_item_cliente(
                os_obj=os_obj,
                item_id=item_id,
                novo_status=request.data.get("status"),
                justificativa=request.data.get("justificativa", ""),
            )
        except ValueError as exc:
            return Response({"erro": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ItemOrcamentoClienteSerializer(item).data)


class AprovarOrcamentoClienteAPIView(APIView):
    """POST /api/cliente/os/<id>/aprovar/

    Body: { "termo_aceito": true, "itens": [{"id": 1, "status": "aprovado"}, ...] }
    """

    authentication_classes = [ClienteSessionAuthentication]
    permission_classes = [IsClienteAutenticado]

    def post(self, request, os_id):
        os_obj = get_os_do_cliente(request, os_id)
        try:
            resultado = aprovar_orcamento_cliente(
                os_obj=os_obj,
                itens_payload=request.data.get("itens", []),
                termo_aceito=request.data.get("termo_aceito", False),
            )
        except ValueError as exc:
            return Response({"erro": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"mensagem": "Orçamento processado!", **resultado})
