"""Permissões do painel administrativo SaaS.

Toda rota sob `/api/admin/` exige usuário com `is_superuser=True` OU
`is_staff=True`. A diferença prática:
- superuser: acesso irrestrito a tudo;
- staff: também acessa o painel, mas não pode promover/demover outro staff
  (regra reforçada na view de usuários).

Esta separação está alinhada com o modelo de permissões nativo do Django,
evitando inventar uma nova hierarquia que conviva com `Funcionario.permissao`
do modulo_oficina (que é por-oficina, não global).
"""
from rest_framework.exceptions import NotAuthenticated, PermissionDenied
from rest_framework.permissions import BasePermission


class IsAdminGlobal(BasePermission):
    """Permite apenas usuários com staff/superuser ativo."""

    message = "Acesso restrito ao painel administrativo."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            raise NotAuthenticated("Faça login para acessar o painel administrativo.")
        if not user.is_active:
            raise PermissionDenied("Sua conta está desativada.")
        if not (user.is_superuser or user.is_staff):
            raise PermissionDenied(self.message)
        return True


class IsSuperAdmin(BasePermission):
    """Apenas superuser — usado em ações de controle total (apagar oficina,
    promover staff a superuser, alterar configurações sensíveis)."""

    message = "Esta operação é restrita ao Super Administrador."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            raise NotAuthenticated("Faça login para acessar o painel administrativo.")
        if not user.is_superuser:
            raise PermissionDenied(self.message)
        return True
