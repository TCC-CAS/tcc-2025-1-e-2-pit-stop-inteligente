"""Camada de serviços do modulo_pagamentos.

Cada submódulo isola uma responsabilidade:
  - `abacatepay_client`: chamadas HTTP à API externa.
  - `assinatura_service`: regras de assinatura SaaS (fase 2).
  - `pagamento_os_service`: regras de cobrança de OS (fase 3).
  - `webhook_service`: processamento idempotente de webhooks (fase 4).
"""

from .abacatepay_client import (
    AbacatePayClient,
    AbacatePayError,
    AbacatePayConfigError,
    AbacatePayAPIError,
    CheckoutCriado,
)


__all__ = [
    "AbacatePayClient",
    "AbacatePayError",
    "AbacatePayConfigError",
    "AbacatePayAPIError",
    "CheckoutCriado",
]
