"""Endpoint de gate da assinatura.

Centraliza, para o front-end e middlewares, o estado da assinatura SaaS:
vigente? próximo do vencimento? bloqueado? Mensagem amigável a exibir?

Usar este endpoint evita que cada tela do front faça sua própria conta
em cima do `expira_em`/`status` da assinatura.
"""
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.modulo_oficina.utils import get_oficina_atual

from ..permissions import IsFuncionario
from ..services.assinatura_service import obter_gate


class GateAssinaturaAPIView(APIView):
    """GET /api/pagamentos/gate/

    Devolve o dicionário do `GateAssinatura`. Sempre 200 (mesmo bloqueado):
    o front decide o que fazer com base em `vigente` e `pode_acessar`.
    """

    permission_classes = [IsFuncionario]

    def get(self, request):
        oficina = get_oficina_atual(request)
        if oficina is None:
            return Response(
                {
                    "vigente": False,
                    "status": "sem_oficina",
                    "mensagem": "Oficina não selecionada.",
                    "nivel": "erro",
                    "pode_acessar": [],
                }
            )
        return Response(obter_gate(oficina).to_dict())
