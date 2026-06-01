"""Classes de permissão DRF baseadas no campo Funcionario.permissao.

Hierarquia (do mais ao menos privilegiado):
    admin       — dono da oficina, faz tudo
    gerente     — gestão operacional + comercial; não mexe em conta/usuários
    atendente   — balcão (clientes, OS, orçamento, aprovação)
    mecanico    — executa tarefas e checklist
    visualizador — só leitura

As classes abaixo seguem o padrão:
    - PermitidoSe<Papeis>: só passa se o funcionário pertencer a um dos papéis
    - <Algo>OuLeitura: permite GET para qualquer funcionário, mas restringe
      escrita aos papéis listados.

Sempre exige usuário autenticado E vinculado a uma oficina (Funcionario).
"""
from rest_framework.permissions import BasePermission, SAFE_METHODS

from .models import Funcionario


# Mapeamento explícito dos grupos hierárquicos
PAPEIS_TODOS = {"admin", "gerente", "atendente", "mecanico", "visualizador"}
PAPEIS_OPERACIONAIS = {"admin", "gerente", "atendente"}     # podem criar OS
PAPEIS_TECNICOS = {"admin", "gerente", "atendente", "mecanico"}  # podem executar
PAPEIS_GESTAO = {"admin", "gerente"}                         # podem mexer em preços
PAPEIS_ADMIN = {"admin"}                                     # acesso total à conta


def _funcionario_ativo(user):
    """Retorna o vínculo Funcionario ativo do user, ou None."""
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        # Superuser tem acesso total para administração técnica
        return Funcionario(permissao="admin", is_active=True)
    try:
        f = user.funcionario_oficina
    except Funcionario.DoesNotExist:
        return None
    return f if f.is_active else None


class IsFuncionario(BasePermission):
    """Usuário autenticado E vinculado a uma oficina ativa."""
    message = "Acesso restrito a funcionários ativos da oficina."

    def has_permission(self, request, view):
        return _funcionario_ativo(request.user) is not None


class _PorPapel(BasePermission):
    """Base: permite somente os papéis listados em `papeis_permitidos`."""
    papeis_permitidos: set = set()
    message = "Você não tem permissão para esta operação."

    def has_permission(self, request, view):
        f = _funcionario_ativo(request.user)
        return bool(f and f.permissao in self.papeis_permitidos)


class IsAdmin(_PorPapel):
    """Apenas admin (dono da oficina)."""
    papeis_permitidos = PAPEIS_ADMIN


class IsGestao(_PorPapel):
    """Admin ou gerente — gestão de preços/configurações."""
    papeis_permitidos = PAPEIS_GESTAO


class IsOperacional(_PorPapel):
    """Admin, gerente ou atendente — fluxo comercial e atendimento."""
    papeis_permitidos = PAPEIS_OPERACIONAIS


class IsTecnico(_PorPapel):
    """Admin, gerente, atendente ou mecânico — fluxo técnico (execução)."""
    papeis_permitidos = PAPEIS_TECNICOS


# ---------------------------------------------------------------------------
# Variantes "OuLeitura": GET é permitido para qualquer funcionário ativo;
# escrita exige um dos papéis configurados.
# ---------------------------------------------------------------------------

class _PorPapelOuLeitura(BasePermission):
    papeis_permitidos: set = set()
    message = "Você só tem permissão de leitura nesta área."

    def has_permission(self, request, view):
        f = _funcionario_ativo(request.user)
        if not f:
            return False
        if request.method in SAFE_METHODS:
            return True
        return f.permissao in self.papeis_permitidos


class IsAdminOuLeitura(_PorPapelOuLeitura):
    papeis_permitidos = PAPEIS_ADMIN


class IsGestaoOuLeitura(_PorPapelOuLeitura):
    papeis_permitidos = PAPEIS_GESTAO


class IsOperacionalOuLeitura(_PorPapelOuLeitura):
    papeis_permitidos = PAPEIS_OPERACIONAIS


class IsTecnicoOuLeitura(_PorPapelOuLeitura):
    papeis_permitidos = PAPEIS_TECNICOS
