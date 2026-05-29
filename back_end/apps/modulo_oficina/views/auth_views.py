"""Views de autenticação e seleção de oficina (sessão multi-tenant)."""
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.middleware.csrf import get_token

from ..services.auth_service import (
    autenticar_usuario,
    encerrar_sessao,
    montar_perfil_corrente,
    registrar_oficina_completa,
    selecionar_oficina,
)


class LoginAPIView(APIView):
    """POST /auth/login/  — autentica e devolve perfil + lista de oficinas."""
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            payload = autenticar_usuario(
                request,
                username=request.data.get("username"),
                password=request.data.get("password"),
            )
        except ValueError as exc:
            return Response({"erro": str(exc)}, status=400)

        # Devolve um CSRF token novo já que a sessão foi rotacionada no login
        payload["csrf_token"] = get_token(request)
        return Response(payload)


class LogoutAPIView(APIView):
    """POST /auth/logout/ — encerra a sessão."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        encerrar_sessao(request)
        return Response({"mensagem": "Sessão encerrada."})


class MeAPIView(APIView):
    """GET /auth/me/ — perfil do usuário logado + oficina atual."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        perfil = montar_perfil_corrente(request)
        if perfil is None:
            return Response({"erro": "Não autenticado"}, status=401)
        return Response(perfil)


class SelecionarOficinaAPIView(APIView):
    """POST /auth/oficinas/<id>/selecionar/ — define oficina ativa na sessão."""
    permission_classes = [IsAuthenticated]

    def post(self, request, oficina_id):
        try:
            selecionar_oficina(request, oficina_id)
        except ValueError as exc:
            return Response({"erro": str(exc)}, status=400)

        # Retorna o perfil já atualizado
        return Response(montar_perfil_corrente(request))


class CsrfAPIView(APIView):
    """GET /auth/csrf/ — emite cookie CSRF para o front antes do primeiro POST.

    Útil para que o login (que vem do Live Server, domínio diferente do Django)
    consiga enviar o header X-CSRFToken.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"csrf_token": get_token(request)})


class RegistrarOficinaAPIView(APIView):
    """POST /auth/registrar-oficina/ (público).

    Cria User + Oficina + Funcionario(admin) atomicamente, com aceite obrigatório
    de Termos de Uso e Política de Privacidade. Após sucesso, autentica o
    usuário e retorna o perfil + oficina já selecionada.

    Aceita JSON ou multipart/form-data (para enviar a logo).
    """
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        try:
            payload = registrar_oficina_completa(
                request=request,
                dados=request.data,
                arquivo_logo=request.FILES.get("logo"),
            )
        except ValueError as exc:
            return Response({"erro": str(exc)}, status=400)

        payload["csrf_token"] = get_token(request)
        return Response(payload, status=201)
