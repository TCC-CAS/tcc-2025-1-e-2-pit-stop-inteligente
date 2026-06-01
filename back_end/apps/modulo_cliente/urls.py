"""Rotas REST do modulo_cliente.

Prefixadas com `/api/cliente/` em `core/urls.py`. As rotas seguem o padrão
de cada feature (autenticação, OS, checklist, documentos, histórico,
aprovação) — espelhando o `modulo_oficina` para facilitar a navegação.
"""
from django.urls import include, path

from .views import (
    ClienteLoginAPIView,
    ClienteLogoutAPIView,
    ClienteMeAPIView,
    ListarOSClienteAPIView,
    DetalheOSClienteAPIView,
    ChecklistClienteAPIView,
    AssinarChecklistClienteAPIView,
    DocumentoListClienteAPIView,
    HistoricoClienteAPIView,
    ItensOrcamentoClienteAPIView,
    AtualizarStatusItemClienteAPIView,
    AprovarOrcamentoClienteAPIView,
)
from .views.auth_views import ClienteCsrfAPIView


urlpatterns = [
    # ----- Autenticação do cliente -----
    path("auth/csrf/", ClienteCsrfAPIView.as_view(), name="cliente-auth-csrf"),
    path("auth/login/", ClienteLoginAPIView.as_view(), name="cliente-auth-login"),
    path("auth/logout/", ClienteLogoutAPIView.as_view(), name="cliente-auth-logout"),
    path("auth/me/", ClienteMeAPIView.as_view(), name="cliente-auth-me"),

    # ----- Ordens de serviço do cliente -----
    path("os/", ListarOSClienteAPIView.as_view(), name="cliente-os-list"),
    path("os/<int:os_id>/", DetalheOSClienteAPIView.as_view(), name="cliente-os-detail"),

    # ----- Checklist (leitura + assinatura) -----
    path("os/<int:os_id>/checklist/", ChecklistClienteAPIView.as_view(),
         name="cliente-os-checklist"),
    path("os/<int:os_id>/checklist/assinar/", AssinarChecklistClienteAPIView.as_view(),
         name="cliente-os-checklist-assinar"),

    # ----- Documentos (somente leitura) -----
    path("os/<int:os_id>/documentos/", DocumentoListClienteAPIView.as_view(),
         name="cliente-os-documentos"),

    # ----- Histórico/timeline -----
    path("os/<int:os_id>/historico/", HistoricoClienteAPIView.as_view(),
         name="cliente-os-historico"),

    # ----- Aprovações -----
    path("os/<int:os_id>/itens/", ItensOrcamentoClienteAPIView.as_view(),
         name="cliente-os-itens"),
    path("os/<int:os_id>/itens/<int:item_id>/decisao/",
         AtualizarStatusItemClienteAPIView.as_view(),
         name="cliente-os-item-decisao"),
    path("os/<int:os_id>/aprovar/", AprovarOrcamentoClienteAPIView.as_view(),
         name="cliente-os-aprovar"),

    # ----- Suporte do cliente (delegado ao app modulo_suporte) -----
    path("suporte/", include("apps.modulo_suporte.urls_cliente")),
]
