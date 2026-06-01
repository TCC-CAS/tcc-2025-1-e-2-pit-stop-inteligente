"""Views REST do modulo_suporte, agrupadas por contexto."""
from .oficina_views import (
    SuporteOficinaListaCreateAPIView,
    SuporteOficinaDetalheAPIView,
    SuporteOficinaMensagensAPIView,
    SuporteOficinaSumarioAPIView,
)
from .cliente_views import (
    SuporteClienteListaCreateAPIView,
    SuporteClienteDetalheAPIView,
    SuporteClienteMensagensAPIView,
)
from .admin_views import (
    SuporteAdminListaAPIView,
    SuporteAdminDetalheAPIView,
    SuporteAdminMensagensAPIView,
    SuporteAdminSumarioAPIView,
)

__all__ = [
    "SuporteOficinaListaCreateAPIView",
    "SuporteOficinaDetalheAPIView",
    "SuporteOficinaMensagensAPIView",
    "SuporteOficinaSumarioAPIView",
    "SuporteClienteListaCreateAPIView",
    "SuporteClienteDetalheAPIView",
    "SuporteClienteMensagensAPIView",
    "SuporteAdminListaAPIView",
    "SuporteAdminDetalheAPIView",
    "SuporteAdminMensagensAPIView",
    "SuporteAdminSumarioAPIView",
]
