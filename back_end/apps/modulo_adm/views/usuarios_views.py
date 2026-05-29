"""Views administrativas de Usuários (User + Funcionario)."""
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from ..permissions import IsAdminGlobal
from ..serializers import UsuarioAdminSerializer
from ..services import (
    alterar_senha_usuario,
    atualizar_usuario_admin,
    criar_usuario_admin,
    excluir_usuario,
    inativar_usuario,
    vincular_usuario_oficina,
)


User = get_user_model()


def _qs_usuarios():
    return User.objects.all().order_by("-date_joined")


class UsuarioListCreateAdminAPIView(APIView):
    """GET /api/admin/usuarios/  — lista com filtros básicos.
    POST /api/admin/usuarios/ — cria User (e opcionalmente Funcionario).
    """
    permission_classes = [IsAdminGlobal]

    def get(self, request):
        qs = _qs_usuarios()
        busca = (request.GET.get("busca") or "").strip()
        if busca:
            qs = qs.filter(email__icontains=busca) | qs.filter(first_name__icontains=busca) | qs.filter(last_name__icontains=busca)
        papel = request.GET.get("papel")
        if papel == "superuser":
            qs = qs.filter(is_superuser=True)
        elif papel == "staff":
            qs = qs.filter(is_staff=True, is_superuser=False)
        elif papel == "comum":
            qs = qs.filter(is_staff=False, is_superuser=False)
        ativos = request.GET.get("ativos")
        if ativos == "1":
            qs = qs.filter(is_active=True)
        elif ativos == "0":
            qs = qs.filter(is_active=False)
        return Response(UsuarioAdminSerializer(qs[:200], many=True).data)

    def post(self, request):
        try:
            user = criar_usuario_admin(request, request.data)
        except ValueError as exc:
            return Response({"erro": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(UsuarioAdminSerializer(user).data, status=status.HTTP_201_CREATED)


class UsuarioDetalheAdminAPIView(APIView):
    """GET/PATCH/DELETE /api/admin/usuarios/<id>/"""
    permission_classes = [IsAdminGlobal]

    def get(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        return Response(UsuarioAdminSerializer(user).data)

    def patch(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        try:
            user = atualizar_usuario_admin(request, user, request.data)
        except ValueError as exc:
            return Response({"erro": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(UsuarioAdminSerializer(user).data)

    def delete(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        try:
            excluir_usuario(request, user)
        except ValueError as exc:
            return Response({"erro": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)


class UsuarioInativarAdminAPIView(APIView):
    """POST /api/admin/usuarios/<id>/ativar/ — Body: {ativo: bool}"""
    permission_classes = [IsAdminGlobal]

    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        ativo = bool(request.data.get("ativo", True))
        inativar_usuario(request, user, ativo=ativo)
        return Response(UsuarioAdminSerializer(user).data)


class UsuarioResetarSenhaAdminAPIView(APIView):
    """POST /api/admin/usuarios/<id>/senha/ — Body: {password: str}"""
    permission_classes = [IsAdminGlobal]

    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        try:
            alterar_senha_usuario(request, user, request.data.get("password"))
        except ValueError as exc:
            return Response({"erro": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"mensagem": "Senha redefinida com sucesso."})


class UsuarioVinculoOficinaAdminAPIView(APIView):
    """POST /api/admin/usuarios/<id>/vinculos/ — Body: {oficina_id, permissao}"""
    permission_classes = [IsAdminGlobal]

    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        try:
            vincular_usuario_oficina(
                request, user,
                oficina_id=request.data.get("oficina_id"),
                permissao=request.data.get("permissao"),
            )
        except ValueError as exc:
            return Response({"erro": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(UsuarioAdminSerializer(user).data)
