"""Endpoint público de status — front lê para mostrar ambiente atual.

Continua útil para o front exibir um badge "homologação" quando o
ambiente não é produção (evita confundir usuário-piloto).
"""
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from ..services.configuracoes_service import obter_flag


class StatusPublicoAPIView(APIView):
    """GET /api/admin/status-publico/

    Body de resposta:
        {
          "ambiente": "producao" | "homologacao" | "desenvolvimento",
          "versao_api": "1.0"
        }
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({
            "ambiente": obter_flag("ambiente", default="producao"),
            "versao_api": "1.0",
        })
