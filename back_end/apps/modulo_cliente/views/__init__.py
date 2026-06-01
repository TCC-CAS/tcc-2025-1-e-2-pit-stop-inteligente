"""Views do portal do cliente."""
from .auth_views import ClienteLoginAPIView, ClienteLogoutAPIView, ClienteMeAPIView
from .os_views import ListarOSClienteAPIView, DetalheOSClienteAPIView
from .checklist_views import ChecklistClienteAPIView, AssinarChecklistClienteAPIView
from .documento_views import DocumentoListClienteAPIView
from .historico_views import HistoricoClienteAPIView
from .aprovacao_views import (
    ItensOrcamentoClienteAPIView,
    AtualizarStatusItemClienteAPIView,
    AprovarOrcamentoClienteAPIView,
)

__all__ = [
    "ClienteLoginAPIView",
    "ClienteLogoutAPIView",
    "ClienteMeAPIView",
    "ListarOSClienteAPIView",
    "DetalheOSClienteAPIView",
    "ChecklistClienteAPIView",
    "AssinarChecklistClienteAPIView",
    "DocumentoListClienteAPIView",
    "HistoricoClienteAPIView",
    "ItensOrcamentoClienteAPIView",
    "AtualizarStatusItemClienteAPIView",
    "AprovarOrcamentoClienteAPIView",
]
