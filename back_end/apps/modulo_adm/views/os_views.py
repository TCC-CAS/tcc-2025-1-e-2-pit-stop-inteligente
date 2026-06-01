"""Views administrativas para Ordens de Serviço (visão global)."""
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.modulo_oficina.models import OrdemServico

from ..permissions import IsAdminGlobal
from ..serializers import OSAdminSerializer
from ..services import alterar_status_os_admin


class OrdemServicoListAdminAPIView(APIView):
    """GET /api/admin/os/ — lista todas as OS com filtros (status, oficina, busca)."""
    permission_classes = [IsAdminGlobal]

    def get(self, request):
        qs = (
            OrdemServico.objects
            .select_related("cliente", "oficina", "veiculo")
            .order_by("-criado_em")
        )

        status_q = request.GET.get("status")
        if status_q:
            qs = qs.filter(status=status_q)

        oficina_id = request.GET.get("oficina_id")
        if oficina_id:
            qs = qs.filter(oficina_id=oficina_id)

        busca = (request.GET.get("busca") or "").strip()
        if busca:
            qs = qs.filter(
                veiculo__placa__icontains=busca
            ) | qs.filter(
                cliente__nome__icontains=busca
            ) | qs.filter(
                oficina__nome__icontains=busca
            )

        # paginação simples
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
            "results": OSAdminSerializer(qs[start:end], many=True).data,
        })


class OrdemServicoStatusAdminAPIView(APIView):
    """PUT /api/admin/os/<id>/status/ — Body: { novo_status, motivo }"""
    permission_classes = [IsAdminGlobal]

    def put(self, request, pk):
        os_obj = get_object_or_404(OrdemServico, pk=pk)
        try:
            alterar_status_os_admin(
                request, os_obj,
                novo_status=request.data.get("novo_status"),
                motivo=request.data.get("motivo"),
            )
        except ValueError as exc:
            return Response({"erro": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(OSAdminSerializer(os_obj).data)
