"""Confirmacao de e-mail de novos usuarios.

Fluxo:
  1. Cadastro cria User + Oficina e chama `gerar_token_e_enviar(user, request)`.
  2. Geramos um token aleatorio (`secrets.token_urlsafe`) com validade
     de 72 h, persistido em `TokenConfirmacaoEmail`.
  3. Enviamos um e-mail com link `<APP_BASE_URL>/api/oficina/auth/confirmar-email/<token>/`.
  4. Quando o usuario clica, a view marca o token como `usado_em=now()`.
  5. `email_verificado(user)` devolve True se ha qualquer token usado.

Em desenvolvimento, o `EMAIL_BACKEND` em `core/settings/local.py` aponta
para `console`, ou seja, o e-mail aparece no terminal do `runserver` —
basta copiar o link. Em producao, o operador configura SMTP em
`core/settings/production.py` via `.env`.
"""
from __future__ import annotations

import logging
import secrets
from typing import Optional

from django.conf import settings
from django.core.mail import send_mail
from django.urls import reverse, NoReverseMatch
from django.utils import timezone

from ..models import TokenConfirmacaoEmail

logger = logging.getLogger(__name__)

VALIDADE_HORAS = 72


def gerar_token_e_enviar(user, request=None) -> TokenConfirmacaoEmail:
    """Cria um novo token e dispara o e-mail de confirmacao.

    Idempotente em caso de falha de envio: o token fica gravado e podera
    ser reenviado pelo endpoint de reenvio (a ser implementado).
    """
    token_str = secrets.token_urlsafe(48)  # ~64 chars seguros
    expira_em = timezone.now() + timezone.timedelta(hours=VALIDADE_HORAS)

    token = TokenConfirmacaoEmail.objects.create(
        user=user,
        token=token_str,
        expira_em=expira_em,
        enviado_para=user.email,
    )

    link = _montar_link_confirmacao(token_str, request)
    assunto = "Confirme seu cadastro no Pit Stop Inteligente"
    corpo = (
        f"Olá, {user.first_name or 'tudo bem'}!\n\n"
        f"Recebemos sua solicitação de cadastro no Pit Stop Inteligente.\n"
        f"Para confirmar seu e-mail e ativar plenamente sua conta, clique no "
        f"link abaixo (válido por {VALIDADE_HORAS} horas):\n\n"
        f"  {link}\n\n"
        "Se você não solicitou este cadastro, basta ignorar esta mensagem.\n\n"
        "Equipe Pit Stop Inteligente."
    )

    try:
        send_mail(
            subject=assunto,
            message=corpo,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
            recipient_list=[user.email],
            fail_silently=False,
        )
    except Exception as exc:  # pragma: no cover — depende de SMTP externo
        # Nao bloqueia o cadastro por falha no envio. O usuario pode pedir
        # reenvio depois (endpoint dedicado), e o token continua valido.
        logger.warning("Falha ao enviar e-mail de confirmacao para %s: %s",
                       user.email, exc)

    return token


def confirmar_token(token_str: str) -> Optional[TokenConfirmacaoEmail]:
    """Marca o token como usado se valido. Devolve o token consumido ou None."""
    token = (TokenConfirmacaoEmail.objects
             .filter(token=token_str, usado_em__isnull=True)
             .first())
    if token is None or not token.valido:
        return None
    token.usado_em = timezone.now()
    token.save(update_fields=["usado_em"])
    return token


def email_verificado(user) -> bool:
    """True se ha qualquer token confirmado para este usuario."""
    if not user or not user.is_authenticated:
        return False
    return TokenConfirmacaoEmail.objects.filter(
        user=user, usado_em__isnull=False,
    ).exists()


def _montar_link_confirmacao(token_str: str, request) -> str:
    """Monta a URL absoluta do endpoint de confirmacao.

    Prefere `APP_BASE_URL` (settings) — confiavel mesmo quando a request
    vem com Host enganoso. Se nao definido, cai no `request.build_absolute_uri`.
    """
    base = (getattr(settings, "APP_BASE_URL", "") or "").rstrip("/")
    try:
        path = reverse("confirmar-email", kwargs={"token": token_str})
    except NoReverseMatch:
        # Nome de rota nao registrado — usa caminho hard-coded como fallback.
        path = f"/api/oficina/auth/confirmar-email/{token_str}/"
    if base:
        return f"{base}{path}"
    if request is not None:
        return request.build_absolute_uri(path)
    return path
