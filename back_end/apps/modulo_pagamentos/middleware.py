"""Middleware de paywall — bloqueia /api/oficina/* sem assinatura vigente.

Quando a oficina logada não tem assinatura vigente (status != ativa ou
expira_em <= now), respondemos 402 (Payment Required) para todas as
requisições em /api/oficina/*, EXCETO um pequeno kit liberado:
  - /api/oficina/perfil/             (Dados da Oficina)
  - /api/oficina/alterar-senha/      (Segurança)
  - /api/oficina/auth/*              (login, csrf, me, etc.)
  - /api/oficina/funcionarios/*      (gestão de usuários — parte de Dados)
  - /api/oficina/plano/status/       (somente leitura)
  - /api/oficina/consumo/            (somente leitura)
  - /api/oficina/suporte/*           (abrir ticket pedindo ajuda)
  - /api/pagamentos/*                (cobrança e gate)

O middleware NÃO bloqueia endpoints administrativos (/api/admin/*) nem
do portal do cliente (/api/cliente/*) — outro contexto.

Para desativar globalmente, defina PAGAMENTOS_PAYWALL_HABILITADO=False
em settings (útil em testes legados).
"""
from __future__ import annotations

import json
import logging

from django.conf import settings
from django.http import JsonResponse


logger = logging.getLogger(__name__)


# Caminhos sob /api/oficina/ que continuam acessíveis mesmo bloqueado.
# Use sempre prefixo (startswith).
_PREFIXOS_LIBERADOS_OFICINA = (
    "/api/oficina/perfil/",
    "/api/oficina/alterar-senha/",
    "/api/oficina/auth/",
    "/api/oficina/funcionarios/",
    "/api/oficina/plano/status/",
    "/api/oficina/consumo/",
    "/api/oficina/suporte/",
)


def _esta_liberado(path: str) -> bool:
    """True se o path NÃO deve ser bloqueado mesmo com assinatura vencida."""
    if not path.startswith("/api/oficina/"):
        return True  # outros prefixos (admin, cliente, pagamentos) nunca bloqueamos aqui
    return any(path.startswith(p) for p in _PREFIXOS_LIBERADOS_OFICINA)


class AssinaturaPaywallMiddleware:
    """Devolve 402 nos endpoints da oficina quando a assinatura não é vigente.

    Tem que rodar DEPOIS de `AuthenticationMiddleware` (precisa de
    `request.user`/`request.session` resolvidos) — registro em base.py
    posiciona logo após `ProductionHealthMiddleware`/`SegurancaMiddleware`.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Lemos o flag em cada request para que `@override_settings` em
        # testes (ou alteração em runtime) tenha efeito imediato.
        habilitado = bool(
            getattr(settings, "PAGAMENTOS_PAYWALL_HABILITADO", True)
        )
        if habilitado and self._deve_bloquear(request):
            return self._resposta_bloqueio(request)
        return self.get_response(request)

    # ------------------------------------------------------------------

    def _deve_bloquear(self, request) -> bool:
        path = request.path_info or request.path or ""
        if _esta_liberado(path):
            return False

        # Sem usuário autenticado → DRF/views vão devolver 401/403; não
        # interferimos para preservar a semântica.
        user = getattr(request, "user", None)
        if not user or not getattr(user, "is_authenticated", False):
            return False
        if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
            return False  # staff/super não é bloqueado

        oficina = self._oficina_da_sessao(request)
        if oficina is None:
            return False  # sem oficina, view decide

        # Import lazy: importar no topo gera ciclo com apps.modulo_oficina.
        from .services.assinatura_service import obter_gate
        try:
            gate = obter_gate(oficina)
        except Exception:
            logger.exception("Paywall: falha ao obter gate; liberando request.")
            return False

        if gate.vigente:
            return False

        # Salva o gate no request para o renderer aproveitar.
        request._gate_assinatura = gate
        return True

    @staticmethod
    def _oficina_da_sessao(request):
        """Tenta resolver a oficina do usuário sem causar import cycle."""
        try:
            from apps.modulo_oficina.utils import get_oficina_atual
            return get_oficina_atual(request)
        except Exception:
            logger.exception("Paywall: erro ao resolver oficina atual.")
            return None

    @staticmethod
    def _resposta_bloqueio(request) -> JsonResponse:
        gate = getattr(request, "_gate_assinatura", None)
        body = {
            "erro": "Pagamento pendente.",
            "code": "assinatura_pendente",
            "detalhe": getattr(gate, "mensagem", "Assinatura não está vigente."),
            "gate": gate.to_dict() if gate else None,
        }
        return JsonResponse(body, status=402)
