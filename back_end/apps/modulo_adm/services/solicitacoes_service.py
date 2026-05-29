"""Service para registrar solicitações vindas da tela pública.

A tela `/recuperar-acesso.html` (oficina/cliente) e qualquer outro fluxo
público em que o usuário não tem como autenticar antes de pedir ajuda
chamam esta service. Cada solicitação gera:

  1. Um Ticket (modulo_suporte) com prioridade "alta", status "aberto"
     e categoria adequada — permite que a equipe atribua responsável,
     converse com o solicitante e mantenha histórico de interações.
  2. Uma Notificacao (modulo_adm) para alertar a equipe em tempo real
     no painel administrativo, com link direto para o ticket.

Mantemos o service simples e idempotente do ponto de vista do chamador:
recebe os dados, retorna o ticket + notificação criados. Quem decide
rate limit, permission ou throttling é a view.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from django.utils import timezone

from apps.modulo_suporte.models import Ticket

from ..models import Notificacao
from ..utils import registrar_auditoria


TIPOS_VALIDOS = ("oficina", "cliente")


@dataclass
class ResultadoSolicitacao:
    ticket: Ticket
    notificacao: Notificacao

    @property
    def protocolo(self) -> str:
        return f"SOL-{self.ticket.id:06d}"


def _ip(request) -> Optional[str]:
    if request is None:
        return None
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def registrar_solicitacao_acesso(
    *,
    request,
    modo: str,
    email: str,
    observacao: str = "",
    motivo: str = "senha",   # "senha" | "acesso_os"
) -> ResultadoSolicitacao:
    """Cria Ticket + Notificacao para a solicitação.

    `motivo`:
      - "senha"     → redefinição de senha (default p/ oficina)
      - "acesso_os" → recuperação de acesso a uma O.S específica (cliente)

    Levanta ValueError quando os dados são inválidos.
    """
    modo = (modo or "").strip().lower()
    email = (email or "").strip()
    observacao = (observacao or "").strip()
    motivo = (motivo or "").strip().lower() or "senha"

    if modo not in TIPOS_VALIDOS:
        raise ValueError("Modo inválido. Use 'oficina' ou 'cliente'.")
    if not email or "@" not in email or "." not in email:
        raise ValueError("Informe um e-mail válido.")
    if len(email) > 254:
        raise ValueError("E-mail muito longo.")
    if len(observacao) > 800:
        raise ValueError("Observação acima do tamanho permitido (800 caracteres).")
    if motivo not in ("senha", "acesso_os"):
        raise ValueError("Motivo inválido. Use 'senha' ou 'acesso_os'.")

    # Tipo da Notificacao e categoria do Ticket
    if modo == "oficina":
        tipo_notif = "recuperar_oficina"
        ticket_titulo = (
            "Redefinição de senha (oficina)"
            if motivo == "senha"
            else "Acesso à O.S. (oficina)"
        )
        descricao_base = (
            f"Solicitação de recuperação de acesso para conta de oficina vinculada "
            f"ao e-mail {email}."
        )
    else:
        tipo_notif = "recuperar_cliente"
        ticket_titulo = (
            "Redefinição de senha (cliente)"
            if motivo == "senha"
            else "Acesso à O.S. (cliente)"
        )
        descricao_base = (
            f"Cliente final solicitou ajuda para reaver o acesso ao portal de "
            f"acompanhamento da O.S. (e-mail informado: {email})."
        )

    descricao = descricao_base
    if observacao:
        descricao = f"{descricao}\n\nObservação do usuário: {observacao}"

    categoria = "acesso"  # categoria do Ticket
    prioridade = "alta"   # solicitações de recuperação são "alta" por default

    # 1) Cria o Ticket no modulo_suporte
    ticket = Ticket.objects.create(
        titulo=ticket_titulo,
        descricao=descricao,
        categoria=categoria,
        prioridade=prioridade,
        origem="admin",
        nao_lidas_admin=1,
    )

    metadados = {
        "modo": modo,
        "motivo": motivo,
        "email": email,
        "ip": _ip(request),
        "user_agent": (request.META.get("HTTP_USER_AGENT") or "")[:255] if request else "",
        "data_solicitacao": timezone.now().isoformat(),
        "ticket_id": ticket.id,
    }
    if observacao:
        metadados["observacao"] = observacao

    # 2) Notificação para a central do admin com link curto pro ticket
    notif_titulo = f"Solicitação {ticket_titulo} · {email}"
    notif_mensagem = (
        f"{descricao_base}\n\nProtocolo: SOL-{ticket.id:06d}. "
        f"Atenda em: Suporte → Ticket #{ticket.id}."
    )
    notificacao = Notificacao.criar(
        tipo_notif, notif_titulo, notif_mensagem,
        nivel="warning",
        metadados=metadados,
        link=f"/modulos/modulo_adm/pages/admin.html#suporte/{ticket.id}",
    )

    # Auditoria também — facilita rastrear abuso/repetição
    try:
        registrar_auditoria(
            request,
            acao=f"solicitacao_acesso.{modo}.{motivo}",
            descricao=(
                f"Solicitação de recuperação de acesso ({modo}/{motivo}) "
                f"para {email} — ticket #{ticket.id}"
            ),
            recurso="ticket",
            recurso_id=str(ticket.id),
            nivel="info",
            metadados={"email": email, "modo": modo, "motivo": motivo},
        )
    except Exception:
        # Não derrubar a solicitação se a auditoria falhar
        pass

    return ResultadoSolicitacao(ticket=ticket, notificacao=notificacao)
