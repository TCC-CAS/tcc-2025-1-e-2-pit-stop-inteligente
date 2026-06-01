"""Views administrativas de Oficinas."""
from rest_framework import status
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from apps.modulo_oficina.models import Oficina

from ..permissions import IsAdminGlobal, IsSuperAdmin
from ..serializers import OficinaAdminDetalheSerializer, OficinaAdminListaSerializer
from ..services import excluir_oficina, inativar_oficina, listar_oficinas_com_agregados
from ..utils import registrar_auditoria


class OficinaListAdminAPIView(APIView):
    """GET /api/admin/oficinas/ — listagem com filtros + agregados."""
    permission_classes = [IsAdminGlobal]

    def get(self, request):
        qs = listar_oficinas_com_agregados(
            busca=request.GET.get("busca"),
            estado=request.GET.get("estado"),
            plano=request.GET.get("plano"),
        )
        return Response(OficinaAdminListaSerializer(qs, many=True).data)


class OficinaDetalheAdminAPIView(RetrieveUpdateAPIView):
    """GET/PUT/PATCH /api/admin/oficinas/<id>/ — leitura e edição direta.

    DELETE só pelo superuser, via endpoint dedicado abaixo.
    """
    serializer_class = OficinaAdminDetalheSerializer
    permission_classes = [IsAdminGlobal]
    queryset = Oficina.objects.all()

    def perform_update(self, serializer):
        oficina = serializer.save()
        registrar_auditoria(
            self.request,
            acao="oficina.atualizar",
            recurso="oficina",
            recurso_id=oficina.id,
            nivel="info",
            descricao=f"Oficina '{oficina.nome}' atualizada pelo admin.",
        )

    def delete(self, request, *args, **kwargs):
        IsSuperAdmin().has_permission(request, self)
        oficina = self.get_object()
        excluir_oficina(request, oficina)
        return Response(status=status.HTTP_204_NO_CONTENT)


class OficinaInativarAdminAPIView(APIView):
    """POST /api/admin/oficinas/<id>/inativar/  Body: { "ativo": false }"""
    permission_classes = [IsAdminGlobal]

    def post(self, request, pk):
        oficina = get_object_or_404(Oficina, pk=pk)
        ativo = bool(request.data.get("ativo", False))
        inativar_oficina(request, oficina, ativo=ativo)
        return Response({"mensagem": f"Oficina {'reativada' if ativo else 'inativada'} com sucesso."})
