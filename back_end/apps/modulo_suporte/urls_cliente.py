"""Rotas do suporte para o portal do cliente (`/api/cliente/suporte/...`)."""
from django.urls import path

from .views import (
    SuporteClienteDetalheAPIView,
    SuporteClienteListaCreateAPIView,
    SuporteClienteMensagensAPIView,
)


urlpatterns = [
    path("tickets/", SuporteClienteListaCreateAPIView.as_view(), name="suporte-cliente-list"),
    path("tickets/<int:pk>/", SuporteClienteDetalheAPIView.as_view(), name="suporte-cliente-detail"),
    path("tickets/<int:pk>/mensagens/", SuporteClienteMensagensAPIView.as_view(),
         name="suporte-cliente-mensagens"),
]
