"""Service do módulo Production Health.

Responsável por:
  - Receber uma ocorrência de erro (exceção + contexto da request).
  - Sanitizar payload (remover campos sensíveis).
  - Calcular fingerprint (chave de agrupamento).
  - Persistir/atualizar `GrupoErroProducao` e criar `EventoErroProducao`.
  - Aplicar política de retenção (manter só os N últimos eventos por grupo).

A função `capturar_erro` é defensiva: NUNCA deve levantar exceção, mesmo
que o banco esteja indisponível. O middleware que chama essa função
opera durante o pipeline de erro do Django — se ela explodir, derruba
ainda mais o site.
"""
from __future__ import annotations

import logging
import traceback
import uuid
from typing import Optional

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from ..models import EventoErroProducao, GrupoErroProducao, gerar_fingerprint


logger = logging.getLogger(__name__)


# Quantos eventos preservar por grupo (rotação) — evita bloating ilimitado.
EVENTOS_MAX_POR_GRUPO = 50

# Campos do payload de requisição cujo conteúdo NUNCA pode ser persistido.
# Lista inclui sinônimos comuns (senha em pt/en, tokens, headers de auth).
CAMPOS_SENSIVEIS = {
    "password", "senha", "current_password", "new_password",
    "token", "access_token", "refresh_token", "id_token",
    "authorization", "x-csrftoken", "csrf", "csrf_token",
    "secret", "client_secret", "api_key", "apikey",
    "cpf", "cpf_cnpj", "cnpj",  # mascarados parcialmente
    "card", "credit_card", "card_number", "cvv", "cvc",
}


def sanitizar_payload(dado, _profundidade=0):
    """Remove valores de campos sensíveis recursivamente.

    Limita profundidade para não cair em estruturas circulares enormes.
    Retorna uma cópia segura, mantendo as chaves para que o suporte saiba
    que existiam (não esconde a estrutura, só o valor).
    """
    if _profundidade > 6:
        return "<...>"
    if isinstance(dado, dict):
        limpo = {}
        for k, v in dado.items():
            chave_norm = str(k).lower()
            if any(s in chave_norm for s in CAMPOS_SENSIVEIS):
                limpo[k] = "<REDACTED>"
            else:
                limpo[k] = sanitizar_payload(v, _profundidade + 1)
        return limpo
    if isinstance(dado, (list, tuple)):
        return [sanitizar_payload(x, _profundidade + 1) for x in dado[:25]]
    if isinstance(dado, str) and len(dado) > 4000:
        return dado[:4000] + "…[truncado]"
    return dado


def _extrair_request_id(request) -> str:
    """Procura por um id de request já injetado por proxy/middleware externo.

    Headers comuns: X-Request-Id (nginx, traefik), X-Trace-Id, X-Correlation-Id.
    Se nenhum existir, gera um UUID4 curto para esta captura — permite que o
    suporte correlacione mesmo sem trace upstream.
    """
    candidatos = (
        "HTTP_X_REQUEST_ID",
        "HTTP_X_TRACE_ID",
        "HTTP_X_CORRELATION_ID",
        "HTTP_X_AMZN_TRACE_ID",
    )
    for header in candidatos:
        valor = request.META.get(header)
        if valor:
            return str(valor)[:80]
    return uuid.uuid4().hex[:16]


def _ip(request) -> Optional[str]:
    if request is None:
        return None
    xff = request.META.get("HTTP_X_FORWARDED_FOR") or ""
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _ambiente() -> str:
    """Detecta ambiente atual com base em settings.DEBUG e env explícito."""
    env = getattr(settings, "PITSTOP_AMBIENTE", None)
    if env:
        return str(env).lower()
    if getattr(settings, "DEBUG", False):
        return "desenvolvimento"
    return "producao"


def _versao_app() -> str:
    return getattr(settings, "PITSTOP_VERSAO_APP", "") or ""


def _resolver_servico(request, view_func=None) -> str:
    """Determina o componente lógico responsável pelo endpoint."""
    if view_func and hasattr(view_func, "__module__"):
        modulo = view_func.__module__
        for prefixo in ("apps.modulo_", "modulo_"):
            if prefixo in modulo:
                # Ex.: "apps.modulo_oficina.views.foo" → "modulo_oficina"
                resto = modulo.split(prefixo, 1)[1]
                return prefixo.rstrip("_") + resto.split(".")[0]
    if request and hasattr(request, "resolver_match") and request.resolver_match:
        return (request.resolver_match.app_name
                or request.resolver_match.namespace
                or "desconhecido")
    return "desconhecido"


def _frame_top_relevante(tb: str) -> str:
    """Pega a linha mais profunda do projeto (ignora libs) para o fingerprint."""
    for linha in reversed(tb.splitlines()):
        if "site-packages" in linha or "django/" in linha:
            continue
        if linha.strip().startswith("File "):
            return linha.strip()
    return tb.splitlines()[-1] if tb else ""


def _titulo_amigavel(tipo_excecao: str, mensagem: str, endpoint: str) -> str:
    """Resumo curto: 'IntegrityError em POST /api/admin/oficinas/'."""
    msg = (mensagem or "").splitlines()[0][:80] if mensagem else ""
    base = f"{tipo_excecao}" if tipo_excecao else "Erro"
    if endpoint:
        base += f" em {endpoint}"
    if msg:
        base += f" — {msg}"
    return base[:255]


@transaction.atomic
def capturar_erro(*, exc: BaseException, request=None, view_func=None,
                  status_http: int = 500, tempo_resposta_ms: Optional[int] = None,
                  titulo_legivel: str = "") -> Optional[GrupoErroProducao]:
    """Registra um evento de erro e atualiza/cria o grupo correspondente.

    Retorna o grupo (útil pra middleware adicionar header X-Error-Id na
    response). Nunca propaga exceção — captura defensivamente e loga.
    """
    try:
        tipo_excecao = type(exc).__name__
        mensagem_tecnica = str(exc)[:4000] if exc else ""
        stack = "".join(
            traceback.format_exception(type(exc), exc, exc.__traceback__),
        )[:20000] if exc else ""
        frame_top = _frame_top_relevante(stack)

        endpoint = (request.path if request is not None else "")[:255]
        metodo = (request.method if request is not None else "")[:10]
        servico = _resolver_servico(request, view_func)
        ambiente = _ambiente()
        versao = _versao_app()

        # Fingerprint baseado em tipo + endpoint + linha mais profunda
        # (excluindo a mensagem, que pode variar com IDs/parâmetros).
        fp = gerar_fingerprint(tipo_excecao, endpoint, frame_top, servico, ambiente)

        titulo = titulo_legivel or _titulo_amigavel(tipo_excecao, mensagem_tecnica, endpoint)
        agora = timezone.now()

        grupo, criado = GrupoErroProducao.objects.select_for_update().get_or_create(
            fingerprint=fp,
            defaults={
                "titulo": titulo,
                "mensagem_tecnica": mensagem_tecnica,
                "tipo_excecao": tipo_excecao,
                "endpoint": endpoint,
                "metodo_http": metodo,
                "servico": servico,
                "ambiente": ambiente,
                "versao_app": versao,
                "primeira_ocorrencia": agora,
                "ultima_ocorrencia": agora,
            },
        )

        # Atualiza estatísticas e libera silenciados expirados
        grupo.total_eventos = (grupo.total_eventos or 0) + 1
        grupo.ultima_ocorrencia = agora
        if grupo.status == "resolvido":
            # Erro voltou — reabre o grupo
            grupo.status = "aberto"
            grupo.resolvido_em = None
        if grupo.status == "silenciado" and grupo.silenciado_ate and grupo.silenciado_ate <= agora:
            grupo.status = "aberto"
            grupo.silenciado_ate = None
        grupo.save(update_fields=[
            "total_eventos", "ultima_ocorrencia", "status",
            "resolvido_em", "silenciado_ate",
        ])

        # Coleta dados do request (payload sanitizado, IP, UA)
        request_id = _extrair_request_id(request) if request is not None else uuid.uuid4().hex[:16]
        payload_raw = {}
        if request is not None:
            try:
                # request.POST / request.GET sempre disponíveis;
                # JSON body pode estar em request.data (DRF) ou body.
                if hasattr(request, "data") and isinstance(request.data, dict):
                    payload_raw = dict(request.data)
                elif request.method == "GET":
                    payload_raw = dict(request.GET)
                else:
                    payload_raw = dict(request.POST or {})
            except Exception:
                payload_raw = {}

        usuario = None
        if request is not None and getattr(request, "user", None):
            try:
                if request.user.is_authenticated:
                    usuario = request.user
            except Exception:
                usuario = None

        evento = EventoErroProducao.objects.create(
            grupo=grupo,
            request_id=request_id,
            trace_id=request_id,
            metodo_http=metodo,
            caminho=endpoint,
            status_http=status_http,
            tempo_resposta_ms=tempo_resposta_ms,
            ip=_ip(request),
            user_agent=(request.META.get("HTTP_USER_AGENT") or "")[:255] if request else "",
            usuario=usuario,
            payload_sanitizado=sanitizar_payload(payload_raw),
            stack_trace=stack,
            versao_app=versao,
        )

        # Atualiza contador de usuários afetados (distintos por grupo).
        # Conta autenticados + IPs únicos como proxy de "usuários".
        grupo.usuarios_afetados = (
            grupo.eventos
            .exclude(usuario__isnull=True, ip__isnull=True)
            .values("usuario", "ip")
            .distinct()
            .count()
        )
        grupo.save(update_fields=["usuarios_afetados"])

        # Rotação: mantém apenas os EVENTOS_MAX_POR_GRUPO mais recentes
        if grupo.total_eventos > EVENTOS_MAX_POR_GRUPO:
            ids_para_manter = list(
                grupo.eventos.order_by("-criado_em")
                .values_list("id", flat=True)[:EVENTOS_MAX_POR_GRUPO]
            )
            grupo.eventos.exclude(id__in=ids_para_manter).delete()

        return grupo
    except Exception:
        # Defensivo: nunca derrubar o pipeline de erro
        logger.exception("Falha ao registrar erro no Production Health")
        return None
