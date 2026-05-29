"""Endpoint de status do plano SaaS para a oficina logada.

A UI de gerenciamento de usuários usa esse endpoint para:
  - mostrar barra de progresso "X de Y usuários usados";
  - exibir aviso amarelo quando >= 80%;
  - desabilitar botão "Adicionar funcionário" quando o limite é atingido
    e o bloqueio global está ativo.
"""
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..permissions import IsFuncionario
from ..services import status_plano
from ..utils import get_oficina_atual


class StatusPlanoAPIView(APIView):
    """GET /api/oficina/plano/status/

    Retorna: {plano, limite_usuarios, usuarios_ativos, restantes,
              percentual_uso, atingiu_limite, proximo_do_limite, bloqueio_ativo}
    """

    permission_classes = [IsFuncionario]

    def get(self, request):
        oficina = get_oficina_atual(request)
        if oficina is None:
            return Response({"erro": "Oficina não selecionada."}, status=400)
        return Response(status_plano(oficina).to_dict())
