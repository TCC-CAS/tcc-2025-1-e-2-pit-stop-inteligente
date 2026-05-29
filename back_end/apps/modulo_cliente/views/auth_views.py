"""Endpoints de autenticação do cliente."""
from django.middleware.csrf import get_token
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from ..permissions import ClienteSessionAuthentication, IsClienteAutenticado
from ..serializers import ClienteResumoSerializer
from ..services import autenticar_cliente, encerrar_sessao_cliente
from ..utils import get_cliente_atual


class ClienteCsrfAPIView(APIView):
    """GET /api/cliente/auth/csrf/ — emite cookie CSRF antes do login."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"csrf_token": get_token(request)})


class ClienteLoginAPIView(APIView):
    """POST /api/cliente/auth/login/

    Body: { "cpf_cnpj": "...", "numero_os": 123 }
    Não exige autenticação prévia — qualquer um pode tentar logar.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            payload = autenticar_cliente(
                request,
                cpf_cnpj=request.data.get("cpf_cnpj"),
                numero_os=request.data.get("numero_os"),
                codigo=request.data.get("codigo"),
            )
        except ValueError as exc:
            return Response({"erro": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        payload["csrf_token"] = get_token(request)
        return Response(payload)


class ClienteLogoutAPIView(APIView):
    """POST /api/cliente/auth/logout/ — limpa a sessão do cliente."""

    authentication_classes = [ClienteSessionAuthentication]
    permission_classes = [IsClienteAutenticado]

    def post(self, request):
        encerrar_sessao_cliente(request)
        return Response({"mensagem": "Sessão encerrada."})


class ClienteMeAPIView(APIView):
    """GET /api/cliente/auth/me/ — retorna o cliente da sessão."""

    authentication_classes = [ClienteSessionAuthentication]
    permission_classes = [IsClienteAutenticado]

    def get(self, request):
        cliente = get_cliente_atual(request)
        if cliente is None:
            return Response(
                {"erro": "Sessão expirada."}, status=status.HTTP_401_UNAUTHORIZED
            )
        return Response(ClienteResumoSerializer(cliente).data)
