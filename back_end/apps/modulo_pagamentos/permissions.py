"""Permissões do modulo_pagamentos.

Centraliza:
  - Reexport das permissões herdadas do `modulo_oficina` (IsAdmin, etc.).
  - Permission DRF `AssinaturaVigente` — paywall que bloqueia endpoints
    da oficina quando a assinatura não está vigente.
"""
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

from apps.modulo_oficina.permissions import (
    IsAdmin,
    IsFuncionario,
    IsGestao,
    IsOperacional,
)


__all__ = [
    "IsAdmin",
    "IsFuncionario",
    "IsGestao",
    "IsOperacional",
    "AssinaturaVigente",
    "AssinaturaPagaRequiredException",
]


class AssinaturaPagaRequiredException(PermissionDenied):
    """Erro custom para sinalizar bloqueio por falta de pagamento.

    Devolvido como 402 (Payment Required) via exception handler. O
    payload inclui o dicionário do gate para o front-end exibir aviso
    e redirecionar para a tela de Renovação de Plano.
    """

    status_code = 402
    default_detail = "Assinatura pendente."
    default_code = "assinatura_pendente"

    def __init__(self, gate_dict: dict | None = None):
        super().__init__(detail=gate_dict or {"erro": "Assinatura pendente."})


class AssinaturaVigente(BasePermission):
    """Permite o request apenas se a assinatura SaaS da oficina é vigente.

    Em endpoints decorados com esta permission, o request é negado com
    HTTP 402 (Payment Required) quando a assinatura está pendente,
    vencida ou cancelada. O corpo da resposta contém o gate completo,
    para o front-end mostrar mensagem amigável e redirecionar.

    Combinar com `IsFuncionario` (ou similar) é responsabilidade da view.
    """

    message = "Assinatura não está vigente."

    def has_permission(self, request, view):
        from apps.modulo_oficina.utils import get_oficina_atual
        from .services.assinatura_service import obter_gate

        oficina = get_oficina_atual(request)
        if oficina is None:
            return False
        gate = obter_gate(oficina)
        if gate.vigente:
            return True
        raise AssinaturaPagaRequiredException(gate.to_dict())
