"""Endpoints de suporte para a equipe administrativa SaaS."""
from rest_framework import status as http_status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404

from apps.modulo_adm.permissions import IsAdminGlobal

from ..models import Ticket
from ..serializers import (
    TicketDetalheSerializer,
    TicketListaSerializer,
)
from ..services import (
    atualizar_ticket_admin,
    marcar_lidas,
    responder_ticket,
)


def _qs_base():
    return Ticket.objects.all().select_related(
        "oficina", "autor_user", "autor_cliente", "atribuido_a",
    )


class SuporteAdminListaAPIView(APIView):
    """GET /api/admin/suporte/tickets/ — listagem global com filtros."""
    permission_classes = [IsAdminGlobal]

    def get(self, request):
        qs = _qs_base()
        for campo in ("status", "prioridade", "categoria", "origem"):
            valor = request.GET.get(campo)
            if valor:
                qs = qs.filter(**{campo: valor})
        oficina_id = request.GET.get("oficina_id")
        if oficina_id:
            qs = qs.filter(oficina_id=oficina_id)
        busca = (request.GET.get("busca") or "").strip()
        if busca:
            qs = qs.filter(
                Q(titulo__icontains=busca)
                | Q(descricao__icontains=busca)
                | Q(autor_user__email__icontains=busca)
                | Q(autor_cliente__nome__icontains=busca)
            )

        try:
            page = max(1, int(request.GET.get("page", 1)))
            page_size = min(100, max(5, int(request.GET.get("page_size", 25))))
        except ValueError:
            page, page_size = 1, 25

        total = qs.count()
        start = (page - 1) * page_size
        end = start + page_size

        return Response({
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
            "results": TicketListaSerializer(qs[start:end], many=True).data,
        })


class SuporteAdminDetalheAPIView(APIView):
    """GET/PATCH /api/admin/suporte/tickets/<id>/

    PATCH aceita { status, prioridade, categoria, atribuido_a_id }
    """
    permission_classes = [IsAdminGlobal]

    def get(self, request, pk):
        ticket = get_object_or_404(_qs_base(), pk=pk)
        marcar_lidas(ticket, lado="admin")
        return Response(
            TicketDetalheSerializer(ticket, context={"incluir_internas": True}).data
        )

    def patch(self, request, pk):
        ticket = get_object_or_404(_qs_base(), pk=pk)
        atualizar_ticket_admin(request, ticket, dados=request.data)
        return Response(
            TicketDetalheSerializer(ticket, context={"incluir_internas": True}).data
        )


class SuporteAdminMensagensAPIView(APIView):
    """POST /api/admin/suporte/tickets/<id>/mensagens/
    Body: { conteudo, eh_interna? }
    """
    permission_classes = [IsAdminGlobal]

    def post(self, request, pk):
        ticket = get_object_or_404(_qs_base(), pk=pk)
        try:
            msg, ticket = responder_ticket(
                request, ticket,
                conteudo=request.data.get("conteudo"),
                autor_user=request.user,
                eh_admin=True,
                eh_interna=bool(request.data.get("eh_interna")),
            )
        except ValueError as exc:
            return Response({"erro": str(exc)}, status=http_status.HTTP_400_BAD_REQUEST)
        return Response(
            TicketDetalheSerializer(ticket, context={"incluir_internas": True}).data,
            status=http_status.HTTP_201_CREATED,
        )


class SuporteAdminSumarioAPIView(APIView):
    """GET /api/admin/suporte/sumario/ — KPIs para o painel."""
    permission_classes = [IsAdminGlobal]

    def get(self, request):
        agregados = Ticket.objects.aggregate(
            total=Count("id"),
            abertos=Count("id", filter=Q(status="aberto")),
            em_atendimento=Count("id", filter=Q(status="em_atendimento")),
            aguardando=Count("id", filter=Q(status="aguardando_usuario")),
            resolvidos=Count("id", filter=Q(status="resolvido")),
            fechados=Count("id", filter=Q(status="fechado")),
            urgentes=Count("id", filter=Q(prioridade="urgente") & ~Q(status__in=("resolvido", "fechado"))),
            altas=Count("id", filter=Q(prioridade="alta") & ~Q(status__in=("resolvido", "fechado"))),
        )
        nao_lidas = sum(
            Ticket.objects.values_list("nao_lidas_admin", flat=True)
        )
        agregados["mensagens_nao_lidas"] = nao_lidas
        return Response(agregados)
