"""Endpoints da central de notificações administrativas."""
from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from ..models import Notificacao
from ..permissions import IsAdminGlobal
from ..serializers import NotificacaoSerializer


def _queryset_para(usuario):
    """Notificações destinadas ao usuário OU globais (sem destinatario)."""
    return Notificacao.objects.filter(
        Q(destinatario__isnull=True) | Q(destinatario=usuario),
    )


class NotificacaoListAPIView(APIView):
    """GET /api/admin/notificacoes/?nao_lidas=1 — lista paginada."""
    permission_classes = [IsAdminGlobal]

    def get(self, request):
        qs = _queryset_para(request.user)
        if request.GET.get("nao_lidas") == "1":
            qs = qs.filter(lida=False)
        nivel = request.GET.get("nivel")
        if nivel:
            qs = qs.filter(nivel=nivel)
        tipo = request.GET.get("tipo")
        if tipo:
            qs = qs.filter(tipo=tipo)

        try:
            page = max(1, int(request.GET.get("page", 1)))
            page_size = min(100, max(5, int(request.GET.get("page_size", 25))))
        except ValueError:
            page, page_size = 1, 25

        total = qs.count()
        nao_lidas = _queryset_para(request.user).filter(lida=False).count()
        start = (page - 1) * page_size
        end = start + page_size

        return Response({
            "total": total,
            "nao_lidas": nao_lidas,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
            "results": NotificacaoSerializer(qs[start:end], many=True).data,
        })


class NotificacaoMarcarLidaAPIView(APIView):
    """POST /api/admin/notificacoes/<id>/lida/ — marca uma como lida."""
    permission_classes = [IsAdminGlobal]

    def post(self, request, pk):
        notif = get_object_or_404(_queryset_para(request.user), pk=pk)
        notif.marcar_como_lida()
        return Response(NotificacaoSerializer(notif).data)


class NotificacaoMarcarTodasAPIView(APIView):
    """POST /api/admin/notificacoes/lidas/ — marca todas como lidas."""
    permission_classes = [IsAdminGlobal]

    def post(self, request):
        from django.utils import timezone
        _queryset_para(request.user).filter(lida=False).update(
            lida=True, lida_em=timezone.now(),
        )
        return Response({"mensagem": "Todas as notificações marcadas como lidas."})


class NotificacaoSumarioAPIView(APIView):
    """GET /api/admin/notificacoes/sumario/ — só o contador (pol leve)."""
    permission_classes = [IsAdminGlobal]

    def get(self, request):
        qs = _queryset_para(request.user)
        return Response({
            "total": qs.count(),
            "nao_lidas": qs.filter(lida=False).count(),
        })
