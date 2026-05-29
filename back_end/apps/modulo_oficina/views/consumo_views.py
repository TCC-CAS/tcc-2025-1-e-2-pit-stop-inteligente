"""Endpoint do painel da oficina para visualizar consumo do plano SaaS.

Retorna o snapshot consolidado dos três recursos rastreados
(usuários, OS/mês, armazenamento). Usado pela UI para:
  - barra de progresso em cada card;
  - alerta amarelo quando >= 80 %;
  - banner vermelho quando bloqueado;
  - CTA "Fazer upgrade do plano" quando faz sentido.
"""
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..permissions import IsFuncionario
from ..services import consumo_oficina
from ..utils import get_oficina_atual


class ConsumoOficinaAPIView(APIView):
    """GET /api/oficina/consumo/

    Retorna {oficina_id, oficina_nome, plano, calculado_em, recursos[]}.
    Cada recurso tem usado/limite/restante/percentual_uso/...
    """

    permission_classes = [IsFuncionario]

    def get(self, request):
        oficina = get_oficina_atual(request)
        if oficina is None:
            return Response({"erro": "Oficina não selecionada."}, status=400)
        return Response(consumo_oficina(oficina))
