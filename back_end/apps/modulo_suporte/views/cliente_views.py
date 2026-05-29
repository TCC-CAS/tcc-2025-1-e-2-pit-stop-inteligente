"""Endpoints de suporte para o cliente final (portal)."""
from rest_framework import status as http_status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from apps.modulo_cliente.permissions import (
    ClienteSessionAuthentication,
    IsClienteAutenticado,
)
from apps.modulo_cliente.utils import get_cliente_atual

from ..models import Ticket
from ..serializers import (
    TicketCriacaoSerializer,
    TicketDetalheSerializer,
    TicketListaSerializer,
)
from ..services import (
    criar_ticket_cliente,
    fechar_ticket,
    marcar_lidas,
    responder_ticket,
)


def _tickets_do_cliente(request):
    cliente = get_cliente_atual(request)
    if not cliente:
        return Ticket.objects.none()
    return Ticket.objects.filter(autor_cliente=cliente).select_related(
        "oficina", "atribuido_a",
    )


class SuporteClienteListaCreateAPIView(APIView):
    authentication_classes = [ClienteSessionAuthentication]
    permission_classes = [IsClienteAutenticado]

    def get(self, request):
        return Response(TicketListaSerializer(_tickets_do_cliente(request), many=True).data)

    def post(self, request):
        cliente = get_cliente_atual(request)
        if cliente is None:
            return Response({"erro": "Sessão expirada."}, status=http_status.HTTP_401_UNAUTHORIZED)
        serializer = TicketCriacaoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ticket = criar_ticket_cliente(request, serializer.validated_data, cliente=cliente)
        return Response(TicketDetalheSerializer(ticket).data, status=http_status.HTTP_201_CREATED)


class SuporteClienteDetalheAPIView(APIView):
    authentication_classes = [ClienteSessionAuthentication]
    permission_classes = [IsClienteAutenticado]

    def get(self, request, pk):
        ticket = get_object_or_404(_tickets_do_cliente(request), pk=pk)
        marcar_lidas(ticket, lado="usuario")
        return Response(
            TicketDetalheSerializer(ticket, context={"incluir_internas": False}).data
        )

    def patch(self, request, pk):
        ticket = get_object_or_404(_tickets_do_cliente(request), pk=pk)
        if request.data.get("acao") == "fechar":
            fechar_ticket(request, ticket, motivo=request.data.get("motivo", ""))
            return Response(TicketDetalheSerializer(ticket).data)
        return Response(
            {"erro": "Ação não permitida."},
            status=http_status.HTTP_400_BAD_REQUEST,
        )


class SuporteClienteMensagensAPIView(APIView):
    authentication_classes = [ClienteSessionAuthentication]
    permission_classes = [IsClienteAutenticado]

    def post(self, request, pk):
        ticket = get_object_or_404(_tickets_do_cliente(request), pk=pk)
        cliente = get_cliente_atual(request)
        try:
            msg, ticket = responder_ticket(
                request, ticket,
                conteudo=request.data.get("conteudo"),
                autor_cliente=cliente,
                eh_admin=False,
            )
        except ValueError as exc:
            return Response({"erro": str(exc)}, status=http_status.HTTP_400_BAD_REQUEST)
        return Response(TicketDetalheSerializer(ticket).data, status=http_status.HTTP_201_CREATED)
