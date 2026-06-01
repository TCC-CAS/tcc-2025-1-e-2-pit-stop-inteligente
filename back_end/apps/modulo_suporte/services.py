"""Regras de negócio do sistema de suporte.

Centralizamos aqui toda lógica que vive entre views/dados:
  - criação de ticket (oficina/cliente/admin);
  - envio de mensagem na thread;
  - mudança de status / atribuição / prioridade;
  - geração de notificações para a equipe administrativa;
  - registro em log de auditoria.

As views ficam "magras" — apenas validam request + chamam um service.
"""
from django.db import transaction
from django.utils import timezone

from .models import MensagemTicket, Ticket


# ---------------------------------------------------------------------------
# Hooks de auditoria e notificação (defensivos: nunca derrubam a operação)
# ---------------------------------------------------------------------------

def _log(request, acao, descricao, *, nivel="info", recurso_id=None, metadados=None):
    try:
        from apps.modulo_adm.utils import registrar_auditoria
        registrar_auditoria(
            request,
            acao=acao,
            descricao=descricao,
            recurso="suporte_ticket",
            recurso_id=str(recurso_id or ""),
            nivel=nivel,
            metadados=metadados,
        )
    except Exception:
        pass


def _notificar_admin(titulo, mensagem="", *, nivel="info", tipo="info", metadados=None):
    try:
        from apps.modulo_adm.models import Notificacao
        Notificacao.criar(
            tipo, titulo, mensagem,
            nivel=nivel, metadados=metadados,
        )
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Criação de tickets
# ---------------------------------------------------------------------------

@transaction.atomic
def criar_ticket_oficina(request, dados, *, oficina, autor_user):
    """Cria um ticket originado por um funcionário da oficina."""
    ticket = Ticket.objects.create(
        titulo=dados["titulo"],
        descricao=dados["descricao"],
        categoria=dados.get("categoria") or "duvida",
        prioridade=dados.get("prioridade") or "normal",
        origem="oficina",
        oficina=oficina,
        autor_user=autor_user,
        os_relacionada_id=dados.get("os_relacionada"),
        nao_lidas_admin=1,  # mensagem inicial = a própria descrição
    )
    _log(
        request, "ticket.criar",
        f"Ticket #{ticket.id} aberto: {ticket.titulo}",
        recurso_id=ticket.id,
        metadados={"origem": "oficina", "categoria": ticket.categoria},
    )
    _notificar_admin(
        f"Novo chamado da oficina · #{ticket.id}",
        f"{ticket.autor_nome}: {ticket.titulo}",
        nivel="warning" if ticket.prioridade in ("alta", "urgente") else "info",
        tipo="info",
        metadados={"ticket_id": ticket.id},
    )
    return ticket


@transaction.atomic
def criar_ticket_cliente(request, dados, *, cliente):
    """Cria um ticket originado pelo cliente final (portal)."""
    oficina = cliente.oficina
    ticket = Ticket.objects.create(
        titulo=dados["titulo"],
        descricao=dados["descricao"],
        categoria=dados.get("categoria") or "duvida",
        prioridade=dados.get("prioridade") or "normal",
        origem="cliente",
        oficina=oficina,
        autor_cliente=cliente,
        os_relacionada_id=dados.get("os_relacionada"),
        nao_lidas_admin=1,
    )
    _log(
        request, "ticket.criar",
        f"Ticket #{ticket.id} aberto pelo cliente: {ticket.titulo}",
        recurso_id=ticket.id,
        metadados={"origem": "cliente", "categoria": ticket.categoria, "cliente_id": cliente.id},
    )
    _notificar_admin(
        f"Novo chamado de cliente · #{ticket.id}",
        f"{cliente.nome}: {ticket.titulo}",
        nivel="warning" if ticket.prioridade in ("alta", "urgente") else "info",
        tipo="info",
        metadados={"ticket_id": ticket.id, "cliente_id": cliente.id},
    )
    return ticket


# ---------------------------------------------------------------------------
# Mensagens (thread)
# ---------------------------------------------------------------------------

@transaction.atomic
def responder_ticket(request, ticket, *, conteudo, autor_user=None,
                     autor_cliente=None, eh_admin=False, eh_interna=False):
    """Adiciona uma mensagem ao ticket atualizando contadores."""
    conteudo = (conteudo or "").strip()
    if not conteudo:
        raise ValueError("A mensagem não pode estar vazia.")

    if ticket.status == "fechado":
        raise ValueError(
            "Este ticket foi fechado. Reabra-o antes de adicionar novas mensagens."
        )

    msg = MensagemTicket.objects.create(
        ticket=ticket,
        autor_user=autor_user,
        autor_cliente=autor_cliente,
        eh_admin=eh_admin,
        eh_interna=eh_interna,
        conteudo=conteudo,
    )

    # Contadores de não lidas: incrementa o lado oposto (a menos que seja
    # mensagem interna entre admins)
    if eh_admin and not eh_interna:
        Ticket.objects.filter(pk=ticket.pk).update(
            nao_lidas_usuario=models_F("nao_lidas_usuario") + 1,
            atualizado_em=timezone.now(),
            status="em_atendimento" if ticket.status == "aberto" else ticket.status,
        )
    elif not eh_admin:
        Ticket.objects.filter(pk=ticket.pk).update(
            nao_lidas_admin=models_F("nao_lidas_admin") + 1,
            atualizado_em=timezone.now(),
        )

    ticket.refresh_from_db()

    _log(
        request, "ticket.mensagem",
        f"Mensagem em #{ticket.id} por {msg.autor_nome}",
        recurso_id=ticket.id,
        metadados={"interna": eh_interna, "admin": eh_admin},
    )
    if eh_admin and not eh_interna:
        # Resposta do admin: avisar usuário? Aqui só registramos — o lado
        # do usuário/cliente vê via contador `nao_lidas_usuario`.
        pass
    elif not eh_admin:
        # Mensagem do usuário/cliente: notifica o admin
        _notificar_admin(
            f"Nova mensagem no ticket #{ticket.id}",
            f"{msg.autor_nome}: {conteudo[:80]}",
            tipo="info",
            metadados={"ticket_id": ticket.id},
        )
    return msg, ticket


# ---------------------------------------------------------------------------
# Mudanças de status / atribuição
# ---------------------------------------------------------------------------

@transaction.atomic
def atualizar_ticket_admin(request, ticket, *, dados):
    """Permite ao ADM mudar status, prioridade, categoria e atribuição."""
    mudancas = {}
    for campo in ("status", "prioridade", "categoria"):
        if campo in dados and dados[campo] not in (None, ""):
            anterior = getattr(ticket, campo)
            novo = dados[campo]
            if novo != anterior:
                setattr(ticket, campo, novo)
                mudancas[campo] = {"de": anterior, "para": novo}

    if "atribuido_a_id" in dados:
        anterior = ticket.atribuido_a_id
        ticket.atribuido_a_id = dados["atribuido_a_id"] or None
        if anterior != ticket.atribuido_a_id:
            mudancas["atribuido_a"] = {"de": anterior, "para": ticket.atribuido_a_id}

    if ticket.status in ("resolvido", "fechado") and not ticket.fechado_em:
        ticket.fechado_em = timezone.now()
    if ticket.status not in ("resolvido", "fechado") and ticket.fechado_em:
        ticket.fechado_em = None

    if mudancas:
        ticket.save()
        _log(
            request, "ticket.atualizar",
            f"Ticket #{ticket.id} atualizado pelo admin.",
            recurso_id=ticket.id,
            metadados=mudancas,
        )
    return ticket


def fechar_ticket(request, ticket, *, motivo=""):
    """Marca o ticket como fechado (por quem abriu)."""
    if ticket.status == "fechado":
        return ticket
    ticket.status = "fechado"
    ticket.fechado_em = timezone.now()
    ticket.save(update_fields=["status", "fechado_em", "atualizado_em"])

    if motivo:
        MensagemTicket.objects.create(
            ticket=ticket, eh_admin=False, conteudo=f"[Ticket fechado pelo solicitante] {motivo}",
        )

    _log(
        request, "ticket.fechar",
        f"Ticket #{ticket.id} fechado.",
        recurso_id=ticket.id,
        metadados={"motivo": motivo or ""},
    )
    return ticket


# ---------------------------------------------------------------------------
# Marcação de mensagens como lidas
# ---------------------------------------------------------------------------

def marcar_lidas(ticket, *, lado):
    """Zera o contador de não-lidas do lado informado.

    lado: "admin" (admin acabou de ver) ou "usuario" (oficina/cliente).
    """
    if lado == "admin":
        Ticket.objects.filter(pk=ticket.pk).update(nao_lidas_admin=0)
        ticket.nao_lidas_admin = 0
    elif lado == "usuario":
        Ticket.objects.filter(pk=ticket.pk).update(nao_lidas_usuario=0)
        ticket.nao_lidas_usuario = 0


# Helper local — importa F de forma lazy só para não inflar o topo.
def models_F(nome):
    from django.db.models import F
    return F(nome)
