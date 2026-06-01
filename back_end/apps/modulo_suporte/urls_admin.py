"""Rotas do suporte para o painel SaaS (`/api/admin/suporte/...`)."""
from django.urls import path

from .views import (
    SuporteAdminDetalheAPIView,
    SuporteAdminListaAPIView,
    SuporteAdminMensagensAPIView,
    SuporteAdminSumarioAPIView,
)


urlpatterns = [
    path("tickets/", SuporteAdminListaAPIView.as_view(), name="suporte-adm-list"),
    path("tickets/<int:pk>/", SuporteAdminDetalheAPIView.as_view(), name="suporte-adm-detail"),
    path("tickets/<int:pk>/mensagens/", SuporteAdminMensagensAPIView.as_view(),
         name="suporte-adm-mensagens"),
    path("sumario/", SuporteAdminSumarioAPIView.as_view(), name="suporte-adm-sumario"),
]
