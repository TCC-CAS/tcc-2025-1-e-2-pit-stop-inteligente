"""Endpoints de suporte para usuários da oficina (funcionários)."""
from rest_framework import status as http_status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from apps.modulo_oficina.permissions import IsFuncionario
from apps.modulo_oficina.utils import get_oficina_atual

from ..models import Ticket
from ..serializers import (
    TicketCriacaoSerializer,
    TicketDetalheSerializer,
    TicketListaSerializer,
)
from ..services import (
    criar_ticket_oficina,
    fechar_ticket,
    marcar_lidas,
    responder_ticket,
)


def _tickets_da_oficina(request):
    return Ticket.objects.filter(
        oficina=get_oficina_atual(request),
    ).select_related("oficina", "autor_user", "autor_cliente", "atribuido_a")


class SuporteOficinaListaCreateAPIView(APIView):
    """GET/POST /api/oficina/suporte/tickets/"""
    permission_classes = [IsFuncionario]

    def get(self, request):
        qs = _tickets_da_oficina(request)
        status_filtro = request.GET.get("status")
        if status_filtro:
            qs = qs.filter(status=status_filtro)
        prioridade = request.GET.get("prioridade")
        if prioridade:
            qs = qs.filter(prioridade=prioridade)
        busca = (request.GET.get("busca") or "").strip()
        if busca:
            qs = qs.filter(titulo__icontains=busca) | qs.filter(descricao__icontains=busca)
        return Response(TicketListaSerializer(qs, many=True).data)

    def post(self, request):
        serializer = TicketCriacaoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ticket = criar_ticket_oficina(
            request,
            serializer.validated_data,
            oficina=get_oficina_atual(request),
            autor_user=request.user,
        )
        return Response(TicketDetalheSerializer(ticket).data, status=http_status.HTTP_201_CREATED)


class SuporteOficinaDetalheAPIView(APIView):
    """GET/PATCH /api/oficina/suporte/tickets/<id>/"""
    permission_classes = [IsFuncionario]

    def _get(self, request, pk):
        return get_object_or_404(_tickets_da_oficina(request), pk=pk)

    def get(self, request, pk):
        ticket = self._get(request, pk)
        marcar_lidas(ticket, lado="usuario")
        return Response(
            TicketDetalheSerializer(ticket, context={"incluir_internas": False}).data
        )

    def patch(self, request, pk):
        ticket = self._get(request, pk)
        if request.data.get("acao") == "fechar":
            fechar_ticket(request, ticket, motivo=request.data.get("motivo", ""))
            return Response(TicketDetalheSerializer(ticket).data)
        return Response(
            {"erro": "Ação não permitida para funcionários da oficina."},
            status=http_status.HTTP_400_BAD_REQUEST,
        )


class SuporteOficinaMensagensAPIView(APIView):
    """POST /api/oficina/suporte/tickets/<id>/mensagens/  Body: { conteudo }"""
    permission_classes = [IsFuncionario]

    def post(self, request, pk):
        ticket = get_object_or_404(_tickets_da_oficina(request), pk=pk)
        try:
            msg, ticket = responder_ticket(
                request, ticket,
                conteudo=request.data.get("conteudo"),
                autor_user=request.user,
                eh_admin=False,
            )
        except ValueError as exc:
            return Response({"erro": str(exc)}, status=http_status.HTTP_400_BAD_REQUEST)
        return Response(TicketDetalheSerializer(ticket).data, status=http_status.HTTP_201_CREATED)


class SuporteOficinaSumarioAPIView(APIView):
    """GET /api/oficina/suporte/sumario/ — contadores para badge no menu."""
    permission_classes = [IsFuncionario]

    def get(self, request):
        qs = _tickets_da_oficina(request)
        total_abertos = qs.exclude(status__in=("resolvido", "fechado")).count()
        return Response({
            "total": qs.count(),
            "abertos": total_abertos,
            "respostas_nao_lidas": sum(
                qs.values_list("nao_lidas_usuario", flat=True)
            ),
        })
