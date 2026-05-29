"""Permissões do portal do cliente.

A autenticação do cliente é leve: ao logar com CPF/CNPJ + número da OS,
o `cliente_id` fica gravado em `request.session`. Como o cliente NÃO é um
`User` do Django, criamos uma autenticação DRF dedicada que injeta um
"usuário falso" autenticado no request — isso garante que falhas devolvam
401 (não autenticado) em vez de 403 (proibido), o que é mais correto
semanticamente e permite ao front-end diferenciar os dois casos.
"""
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import BasePermission


SESSION_CLIENTE_KEY = "cliente_id"


class _ClienteSessao:
    """Carrier simples para o `request.user` quando o cliente está logado."""

    def __init__(self, cliente_id):
        self.cliente_id = cliente_id
        self.is_authenticated = True
        self.is_anonymous = False
        self.is_staff = False
        self.is_superuser = False

    def __str__(self):
        return f"cliente:{self.cliente_id}"


def get_cliente_session_id(request):
    """Retorna o id do cliente logado na sessão, ou None."""
    if not hasattr(request, "session"):
        return None
    valor = request.session.get(SESSION_CLIENTE_KEY)
    if not valor:
        return None
    try:
        return int(valor)
    except (TypeError, ValueError):
        return None


class ClienteSessionAuthentication(BaseAuthentication):
    """Authenticator DRF que reconhece a sessão do cliente.

    - Se houver `cliente_id` na sessão → autenticado como ClienteSessao.
    - Caso contrário → retorna None (DRF prossegue, e a Permission decide).
    """

    def authenticate(self, request):
        cliente_id = get_cliente_session_id(request)
        if cliente_id is None:
            return None
        return (_ClienteSessao(cliente_id), None)

    def authenticate_header(self, request):
        # Faz o DRF responder 401 (e não 403) quando falta autenticação
        return "Session"


class IsClienteAutenticado(BasePermission):
    """Permite apenas requisições com `cliente_id` válido em sessão."""

    message = "Sessão do cliente não encontrada. Faça login novamente."

    def has_permission(self, request, view):
        if get_cliente_session_id(request) is None:
            raise AuthenticationFailed(self.message)
        return True
