"""Middlewares do painel admin.

  - ProductionHealthMiddleware: captura exceções e respostas 5xx do
    DRF/Django, registra um evento na aba "Saúde da aplicação".
    Implementação defensiva: nunca muda comportamento, só observa.

  - SegurancaMiddleware: aplica três camadas:
      a) bloqueia IPs banidos (responde 403 imediatamente);
      b) injeta headers de segurança em toda response;
      c) detecta padrões anômalos de 4xx do mesmo IP e contabiliza.

NOTA: o `MaintenanceModeMiddleware` foi removido — bloquear o sistema
inteiro provou ser mais danoso que útil em produção. Para janelas de
manutenção, use o proxy/CDN.
"""
from __future__ import annotations

import logging
import time
from typing import Optional


logger = logging.getLogger(__name__)


class ProductionHealthMiddleware:
    """Captura exceções e respostas 5xx e alimenta o feed do Production Health.

    Pode ser desativado via setting `PITSTOP_PRODUCTION_HEALTH_ENABLED = False`
    (útil em testes ou para isolar um incidente).
    """

    def __init__(self, get_response):
        self.get_response = get_response
        try:
            from django.conf import settings
            self.enabled = getattr(settings, "PITSTOP_PRODUCTION_HEALTH_ENABLED", True)
        except Exception:
            self.enabled = True

    def __call__(self, request):
        if not self.enabled:
            return self.get_response(request)

        inicio = time.monotonic()
        response = self.get_response(request)
        try:
            self._handle_response(request, response, inicio)
        except Exception:
            logger.exception("ProductionHealthMiddleware falhou ao registrar response")
        return response

    def process_exception(self, request, exception):
        """Hook chamado pelo Django quando uma view explode.

        Retornamos None para não interferir no fluxo padrão (o Django segue
        adiante e responde 500). O DRF intercepta exceções antes desse hook,
        portanto também observamos respostas 5xx em `_handle_response`.
        """
        if not self.enabled:
            return None
        try:
            from .services.production_health_service import capturar_erro
            capturar_erro(exc=exception, request=request, status_http=500)
        except Exception:
            logger.exception("Falha ao capturar exception no Production Health")
        return None

    def _handle_response(self, request, response, inicio):
        # Capturamos APENAS respostas 5xx no fluxo "normal". Erros não tratados
        # já vieram pelo process_exception. O DRF pega exceções e responde 5xx
        # silenciosamente — esse caso aparece só aqui.
        if response.status_code < 500:
            return

        elapsed_ms = int((time.monotonic() - inicio) * 1000)
        from .services.production_health_service import capturar_erro

        # Tenta extrair a mensagem da resposta DRF, se houver
        msg = ""
        try:
            data = getattr(response, "data", None)
            if isinstance(data, dict):
                msg = (data.get("detail") or data.get("erro") or "")[:255]
        except Exception:
            msg = ""

        falsa_exc = _RespostaServerError(msg or f"HTTP {response.status_code}")
        capturar_erro(
            exc=falsa_exc,
            request=request,
            status_http=response.status_code,
            tempo_resposta_ms=elapsed_ms,
            titulo_legivel=msg,
        )


class _RespostaServerError(Exception):
    """Stand-in usado quando capturamos response 5xx sem exceção viva."""
    pass


# ---------------------------------------------------------------------------
# Middleware de Segurança
# ---------------------------------------------------------------------------

# Path prefixes ignorados (saúde de proxy, estáticos, etc.)
_PREFIXOS_LIVRES = ("/static/", "/media/", "/admin/")

# Headers de segurança aplicados em TODA resposta. Mantemos compatibilidade
# com o front no Live Server (porta 5500) — em produção (HTTPS) eles
# ficam ainda mais agressivos via settings.SECURE_*.
_HEADERS_SEGURANCA = {
    # Mitiga MIME-sniffing (ex.: navegador interpretando upload como JS)
    "X-Content-Type-Options": "nosniff",
    # Bloqueia iframes externos por padrão (clickjacking)
    "X-Frame-Options": "DENY",
    # Previne que info de Referer vaze para outros domínios
    "Referrer-Policy": "strict-origin-when-cross-origin",
    # Restringe APIs sensíveis do navegador
    "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=()",
}


class SegurancaMiddleware:
    """Aplica defesas básicas:
       1. Recusa IPs bloqueados (403).
       2. Injeta headers de segurança em todas as respostas.
       3. Conta respostas 401/403/404 do mesmo IP — se passar do limiar,
          o IP é bloqueado automaticamente (mitiga enumeração/varredura).
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Import tardio para não causar problemas em testes/migrate
        try:
            from .services.seguranca_service import (
                extrair_ip,
                ip_esta_bloqueado,
                acumular_evento_de_ip,
            )
        except Exception:
            return self._aplicar_headers(self.get_response(request))

        path = request.path or ""
        if any(path.startswith(p) for p in _PREFIXOS_LIVRES):
            return self._aplicar_headers(self.get_response(request))

        ip = extrair_ip(request)
        # 1) IP banido — corta antes de qualquer view
        if ip and ip_esta_bloqueado(ip):
            from django.http import JsonResponse
            return self._aplicar_headers(JsonResponse(
                {"erro": "Acesso temporariamente bloqueado por políticas de segurança."},
                status=403,
            ))

        response = self.get_response(request)

        # 3) 401/403/404 anômalos → contabiliza para ban automático
        if ip and response.status_code in (401, 403, 404):
            try:
                acumular_evento_de_ip(ip)
            except Exception:
                pass

        return self._aplicar_headers(response)

    @staticmethod
    def _aplicar_headers(response):
        for k, v in _HEADERS_SEGURANCA.items():
            # Não sobrescreve headers que a view definiu explicitamente
            response.setdefault(k, v) if hasattr(response, "setdefault") else None
            if k not in response:
                response[k] = v
        return response
