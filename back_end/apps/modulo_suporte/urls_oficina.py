"""Rotas do suporte para o módulo oficina (`/api/oficina/suporte/...`)."""
from django.urls import path

from .views import (
    SuporteOficinaDetalheAPIView,
    SuporteOficinaListaCreateAPIView,
    SuporteOficinaMensagensAPIView,
    SuporteOficinaSumarioAPIView,
)


urlpatterns = [
    path("tickets/", SuporteOficinaListaCreateAPIView.as_view(), name="suporte-oficina-list"),
    path("tickets/<int:pk>/", SuporteOficinaDetalheAPIView.as_view(), name="suporte-oficina-detail"),
    path("tickets/<int:pk>/mensagens/", SuporteOficinaMensagensAPIView.as_view(),
         name="suporte-oficina-mensagens"),
    path("sumario/", SuporteOficinaSumarioAPIView.as_view(), name="suporte-oficina-sumario"),
]
