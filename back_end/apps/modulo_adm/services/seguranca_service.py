"""Camada de segurança defensiva.

Concentra três mecanismos:

  1. **Rate limit** — limita N requisições por IP (ou por alvo) numa
     janela deslizante. Usado em login, recuperar acesso, criar OS, etc.

  2. **Lockout** — após M falhas consecutivas (login), bloqueia o e-mail
     por um período curto (mitiga brute force sem afetar usuário legítimo).

  3. **IP block** — IP que acumula muitos eventos críticos é banido por
     algumas horas. O middleware checa esse block em toda request.

Tudo via Django cache (memcached/redis em prod, locmem em dev) — sem
mexer em banco em hot path. Eventos persistidos vão para `EventoSeguranca`
de forma assíncrona-tolerante (silencia falhas para não atrapalhar req).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from django.core.cache import cache


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constantes (configuráveis via configuração global ou settings)
# ---------------------------------------------------------------------------

# Lockout de login: 5 falhas em 15 min = lock de 15 min
LOGIN_FALHAS_MAX = 5
LOGIN_LOCKOUT_SEGUNDOS = 15 * 60

# Rate limit padrão de recuperar acesso (já existia, deixamos aqui também)
RATE_RECUPERACAO_MAX = 5
RATE_RECUPERACAO_JANELA = 60 * 60

# IP block automático: 10 eventos de segurança/hora → bloqueio de 2h
IP_LIMIAR_EVENTOS = 10
IP_LIMIAR_JANELA = 60 * 60
IP_BLOCK_DURACAO = 2 * 60 * 60

# User-Agents claramente automatizados em endpoints público sensíveis.
# Lista intencionalmente conservadora — não bloqueamos navegadores nem
# Googlebot/Bingbot (que respeitam robots.txt).
USER_AGENTS_BLOQUEADOS = (
    "python-requests", "curl/", "wget/", "go-http-client",
    "okhttp/", "java/", "scrapy/", "axios/", "httpie",
    "masscan", "nmap", "sqlmap", "nikto", "wpscan",
    "fuzzer", "burpsuite", "gobuster", "dirbuster",
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def extrair_ip(request) -> Optional[str]:
    if request is None:
        return None
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def extrair_ua(request) -> str:
    if request is None:
        return ""
    return (request.META.get("HTTP_USER_AGENT") or "")[:255]


def _chave(prefixo: str, *partes: str) -> str:
    return ":".join(["seg", prefixo, *[str(p) for p in partes]])


def _registrar_evento(categoria: str, *, request=None, alvo: str = "",
                      severidade: str = "warning", metadados=None,
                      usuario=None) -> None:
    """Persiste o evento. NUNCA propaga exceção — segurança é defensiva."""
    try:
        from ..models import EventoSeguranca
        EventoSeguranca.objects.create(
            categoria=categoria,
            severidade=severidade,
            ip=extrair_ip(request),
            user_agent=extrair_ua(request),
            usuario=usuario,
            alvo=(alvo or "")[:255],
            endpoint=(request.path if request is not None else "")[:255],
            metadados=metadados or None,
        )
    except Exception:
        logger.exception("Falha ao persistir EventoSeguranca")


# ---------------------------------------------------------------------------
# IP block — verificação central usada pelo middleware
# ---------------------------------------------------------------------------

def ip_esta_bloqueado(ip: str) -> bool:
    if not ip:
        return False
    return bool(cache.get(_chave("ipblock", ip)))


def bloquear_ip(ip: str, *, segundos: int = IP_BLOCK_DURACAO,
                motivo: str = "padrão anômalo") -> None:
    if not ip:
        return
    cache.set(_chave("ipblock", ip), {"motivo": motivo}, segundos)
    _registrar_evento(
        "ip_bloqueado",
        request=None,
        alvo=ip,
        severidade="critical",
        metadados={"motivo": motivo, "duracao_seg": segundos},
    )


def acumular_evento_de_ip(ip: str) -> None:
    """Conta eventos de segurança do IP; se passar do limiar, bloqueia."""
    if not ip:
        return
    chave = _chave("ipcount", ip)
    atual = cache.get(chave, 0)
    cache.set(chave, atual + 1, IP_LIMIAR_JANELA)
    if atual + 1 >= IP_LIMIAR_EVENTOS:
        bloquear_ip(ip, motivo=f"{atual + 1} eventos em {IP_LIMIAR_JANELA // 60} min")


# ---------------------------------------------------------------------------
# Rate limit genérico
# ---------------------------------------------------------------------------

@dataclass
class ResultadoRateLimit:
    permitido: bool
    atual: int
    limite: int
    motivo: str = ""


def checar_rate_limit(escopo: str, identificador: str, *,
                      limite: int, janela_segundos: int) -> ResultadoRateLimit:
    """Verifica e incrementa o contador. Retorna permitido=False quando estourou.

    O contador só é incrementado quando ainda há cota. Isso evita que erros
    de validação sucessivos "queimem" o limite legítimo.
    """
    chave = _chave("rate", escopo, identificador)
    atual = cache.get(chave, 0)
    if atual >= limite:
        return ResultadoRateLimit(permitido=False, atual=atual, limite=limite,
                                  motivo=f"{atual}/{limite} em {janela_segundos // 60}min")
    cache.set(chave, atual + 1, janela_segundos)
    return ResultadoRateLimit(permitido=True, atual=atual + 1, limite=limite)


def consumir_rate_limit_login(request, email: str) -> ResultadoRateLimit:
    """Rate limit específico do login — combinado IP + e-mail tentado."""
    ip = extrair_ip(request) or "0.0.0.0"
    identificador = f"{ip}|{(email or '').lower()}"
    return checar_rate_limit(
        "login", identificador,
        limite=15, janela_segundos=10 * 60,
    )


# ---------------------------------------------------------------------------
# Lockout de login (por e-mail)
# ---------------------------------------------------------------------------

def login_esta_bloqueado(email: str) -> bool:
    if not email:
        return False
    return bool(cache.get(_chave("login_lock", (email or "").lower())))


def registrar_falha_login(request, email: str) -> bool:
    """Registra UMA falha; se atingir o teto, bloqueia o e-mail temporariamente.

    Retorna `True` quando o lockout foi acionado nesta chamada.
    """
    email_norm = (email or "").lower()
    if not email_norm:
        return False
    chave = _chave("login_fail", email_norm)
    atual = cache.get(chave, 0) + 1
    cache.set(chave, atual, LOGIN_LOCKOUT_SEGUNDOS)

    _registrar_evento(
        "login_falha",
        request=request, alvo=email_norm,
        severidade="info",
        metadados={"tentativa": atual, "max": LOGIN_FALHAS_MAX},
    )

    bloqueou = False
    if atual >= LOGIN_FALHAS_MAX:
        cache.set(_chave("login_lock", email_norm), True, LOGIN_LOCKOUT_SEGUNDOS)
        bloqueou = True
        _registrar_evento(
            "login_lockout",
            request=request, alvo=email_norm,
            severidade="warning",
            metadados={"falhas": atual, "duracao_seg": LOGIN_LOCKOUT_SEGUNDOS},
        )
        # Lockout também conta como evento "pesado" para IP block
        ip = extrair_ip(request)
        if ip:
            acumular_evento_de_ip(ip)
    return bloqueou


def resetar_falhas_login(email: str) -> None:
    """Chamar após login bem-sucedido — zera contagem do email."""
    if not email:
        return
    cache.delete(_chave("login_fail", email.lower()))
    cache.delete(_chave("login_lock", email.lower()))


# ---------------------------------------------------------------------------
# Honeypot / User-Agent suspeito
# ---------------------------------------------------------------------------

def detectar_honeypot(request, campo: str = "url_optional") -> bool:
    """Retorna True quando o campo armadilha veio preenchido (= bot).

    Forms públicos incluem um <input> escondido por CSS. Usuário humano
    nunca enxerga; bot que parseia o HTML preenche tudo.
    """
    if request is None:
        return False
    try:
        valor = request.data.get(campo) if hasattr(request, "data") else None
    except Exception:
        valor = None
    if not valor:
        valor = request.POST.get(campo) or request.GET.get(campo)
    if valor:
        _registrar_evento(
            "honeypot",
            request=request,
            severidade="warning",
            metadados={"campo": campo, "preenchido": True},
        )
        ip = extrair_ip(request)
        if ip:
            acumular_evento_de_ip(ip)
        return True
    return False


def user_agent_suspeito(request) -> bool:
    ua = extrair_ua(request).lower()
    if not ua:
        # UA vazio em endpoint público sensível também é suspeito
        return True
    return any(s in ua for s in USER_AGENTS_BLOQUEADOS)
