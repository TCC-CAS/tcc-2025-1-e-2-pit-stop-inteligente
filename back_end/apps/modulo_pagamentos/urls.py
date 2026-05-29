"""Rotas REST do modulo_pagamentos.

Prefixadas com `/api/pagamentos/` em `core/urls.py`.
"""
from django.urls import path

from .views import (
    CheckoutOSPortalClienteAPIView,
    CriarCheckoutAssinaturaAPIView,
    CriarCheckoutOSAPIView,
    GateAssinaturaAPIView,
    ListarPlanosAPIView,
    StatusAssinaturaAPIView,
    StatusPagamentoAPIView,
    WebhookAbacatePayAPIView,
)


urlpatterns = [
    # ----- Catálogo de planos -----
    path("planos/", ListarPlanosAPIView.as_view(), name="pagamentos-planos"),

    # ----- Assinatura SaaS -----
    path(
        "assinatura/status/",
        StatusAssinaturaAPIView.as_view(),
        name="pagamentos-assinatura-status",
    ),
    path(
        "assinatura/checkout/",
        CriarCheckoutAssinaturaAPIView.as_view(),
        name="pagamentos-assinatura-checkout",
    ),

    # ----- Gate da assinatura (UI + paywall) -----
    path(
        "gate/",
        GateAssinaturaAPIView.as_view(),
        name="pagamentos-gate",
    ),

    # ----- Pagamento de OS (oficina cria, cliente paga) -----
    path(
        "os/<int:os_id>/checkout/",
        CriarCheckoutOSAPIView.as_view(),
        name="pagamentos-os-checkout",
    ),
    path(
        "cliente/os/<int:os_id>/checkout/",
        CheckoutOSPortalClienteAPIView.as_view(),
        name="pagamentos-os-checkout-cliente",
    ),

    # ----- Webhook AbacatePay (público, HMAC validado em service) -----
    path(
        "webhook/abacatepay/",
        WebhookAbacatePayAPIView.as_view(),
        name="pagamentos-webhook-abacatepay",
    ),

    # ----- Consulta de pagamento (polling do front) -----
    path(
        "<uuid:external_id>/status/",
        StatusPagamentoAPIView.as_view(),
        name="pagamentos-status",
    ),
]
