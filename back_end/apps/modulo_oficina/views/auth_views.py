"""Views de autenticação e seleção de oficina (sessão multi-tenant)."""
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.http import HttpResponse
from django.middleware.csrf import get_token

from ..services.auth_service import (
    autenticar_usuario,
    encerrar_sessao,
    montar_perfil_corrente,
    registrar_oficina_completa,
    selecionar_oficina,
)
from ..services.email_confirmacao_service import confirmar_token


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


class ConfirmarEmailAPIView(APIView):
    """GET /auth/confirmar-email/<token>/ — endpoint publico.

    Valida o token e devolve uma resposta HTML simples informando se a
    confirmacao foi bem-sucedida. Mantemos resposta HTML (em vez de JSON)
    porque o link sera clicado direto a partir do e-mail recebido — o
    usuario nao tem app rodando para consumir JSON nesse momento.
    """
    permission_classes = [AllowAny]

    def get(self, request, token):
        token_obj = confirmar_token(token)
        if token_obj is None:
            html = (
                "<!doctype html><meta charset='utf-8'>"
                "<title>Link inválido</title>"
                "<body style='font-family:Inter,system-ui,sans-serif;"
                "padding:2rem;max-width:560px;margin:0 auto;line-height:1.5;'>"
                "<h1>Link inválido ou expirado</h1>"
                "<p>Este link de confirmação não é mais válido. Solicite o "
                "reenvio acessando sua conta.</p>"
                "</body>"
            )
            return HttpResponse(html, status=410)

        html = (
            "<!doctype html><meta charset='utf-8'>"
            "<title>E-mail confirmado</title>"
            "<body style='font-family:Inter,system-ui,sans-serif;"
            "padding:2rem;max-width:560px;margin:0 auto;line-height:1.5;'>"
            "<h1 style='color:#16a34a'>E-mail confirmado com sucesso!</h1>"
            f"<p>Olá, {token_obj.user.first_name or token_obj.user.email}. "
            "Sua conta agora está plenamente ativada.</p>"
            "<p><a href='/'>Acessar o Pit Stop Inteligente</a></p>"
            "</body>"
        )
        return HttpResponse(html, status=200)


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
