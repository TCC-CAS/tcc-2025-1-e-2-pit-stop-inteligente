"""Views administrativas de Configurações globais."""
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import ConfiguracaoGlobal
from ..permissions import IsAdminGlobal, IsSuperAdmin
from ..serializers import ConfiguracaoGlobalSerializer
from ..services import atualizar_configuracao, listar_configuracoes


class ConfiguracaoListAdminAPIView(APIView):
    """GET /api/admin/configuracoes/    — lista (com seed inicial).
    POST /api/admin/configuracoes/ — cria/atualiza por `chave`.
    """
    permission_classes = [IsAdminGlobal]

    def get(self, request):
        return Response(
            ConfiguracaoGlobalSerializer(listar_configuracoes(), many=True).data
        )

    def post(self, request):
        try:
            cfg = atualizar_configuracao(
                request,
                chave=request.data.get("chave"),
                valor=request.data.get("valor"),
            )
        except ValueError as exc:
            return Response({"erro": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ConfiguracaoGlobalSerializer(cfg).data, status=status.HTTP_201_CREATED)


class ConfiguracaoDetalheAdminAPIView(APIView):
    """PATCH/DELETE /api/admin/configuracoes/<chave>/

    DELETE só superuser; PATCH atualiza o valor.
    """
    permission_classes = [IsAdminGlobal]

    def patch(self, request, chave):
        config = get_object_or_404(ConfiguracaoGlobal, chave=chave)
        valor = request.data.get("valor", config.valor)
        atualizar_configuracao(request, chave=config.chave, valor=valor)
        config.refresh_from_db()
        return Response(ConfiguracaoGlobalSerializer(config).data)

    def delete(self, request, chave):
        IsSuperAdmin().has_permission(request, self)
        config = get_object_or_404(ConfiguracaoGlobal, chave=chave)
        config.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
