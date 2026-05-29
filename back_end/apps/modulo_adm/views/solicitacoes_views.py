"""Endpoint público para registrar solicitações de ajuda.

Hoje atende a tela "Recuperar acesso" do front (oficina/cliente). Por
não exigir autenticação, aplicamos rate limit por IP via cache local
para mitigar abuso/scraping.
"""
from __future__ import annotations

from django.core.cache import cache
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from ..services.solicitacoes_service import registrar_solicitacao_acesso


RATE_LIMITE = 5      # nº máximo de solicitações
RATE_JANELA = 60 * 60  # janela em segundos (1h)


def _chave_rate_limit(request) -> str:
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    ip = xff.split(",")[0].strip() if xff else (request.META.get("REMOTE_ADDR") or "0.0.0.0")
    return f"solicitacao_acesso:rate:{ip}"


class SolicitacaoAcessoAPIView(APIView):
    """POST /api/admin/solicitacoes-acesso/ (público).

    Body:
        {
          "modo": "oficina" | "cliente",
          "email": "...",
          "observacao": "..."   # opcional
        }
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        # Honeypot anti-bot (campo escondido pelo CSS no front)
        from ..services.seguranca_service import (
            detectar_honeypot,
            user_agent_suspeito,
            _registrar_evento,
            acumular_evento_de_ip,
            extrair_ip,
        )
        if detectar_honeypot(request):
            # Não revela ao bot que ele foi detectado — devolve "sucesso" fake
            return Response(
                {"mensagem": "Solicitação registrada."},
                status=status.HTTP_201_CREATED,
            )

        # User-Agent claramente automatizado em form público → block
        if user_agent_suspeito(request):
            _registrar_evento(
                "user_agent_suspeito", request=request,
                severidade="warning",
                metadados={"endpoint": "solicitacao_acesso"},
            )
            ip = extrair_ip(request)
            if ip:
                acumular_evento_de_ip(ip)
            return Response(
                {"erro": "Acesso recusado."},
                status=status.HTTP_403_FORBIDDEN,
            )

        chave = _chave_rate_limit(request)
        atual = cache.get(chave, 0)
        if atual >= RATE_LIMITE:
            _registrar_evento(
                "recuperacao_abuso", request=request,
                severidade="warning",
                metadados={"limite": RATE_LIMITE, "janela_min": RATE_JANELA // 60},
            )
            return Response(
                {"erro": "Muitas solicitações deste IP. Tente novamente em alguns minutos."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        try:
            resultado = registrar_solicitacao_acesso(
                request=request,
                modo=request.data.get("modo"),
                email=request.data.get("email"),
                observacao=request.data.get("observacao", ""),
                motivo=request.data.get("motivo", "senha"),
            )
        except ValueError as exc:
            return Response({"erro": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        # Incrementa o contador APENAS após sucesso para que erros de
        # validação não consumam o limite (UX melhor para quem digitou errado).
        cache.set(chave, atual + 1, RATE_JANELA)

        return Response(
            {
                "mensagem": (
                    "Solicitação registrada. A equipe de suporte foi notificada e "
                    "entrará em contato pelo e-mail informado."
                ),
                "protocolo": resultado.protocolo,
                "ticket_id": resultado.ticket.id,
            },
            status=status.HTTP_201_CREATED,
        )
