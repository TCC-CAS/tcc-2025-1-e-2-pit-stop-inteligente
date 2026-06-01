"""Modelos do sistema de tickets de suporte.

Um ticket pode ser aberto por:
  - um funcionário da oficina (autor_user + oficina);
  - um cliente final via portal (autor_cliente + oficina pode ser derivada);
  - excepcionalmente, um staff/superuser registrando algo em nome do cliente.

`autor_user` e `autor_cliente` são mutuamente exclusivos. As mensagens
seguem a mesma regra (autor é ou um User do Django ou um Cliente do
modulo_oficina).
"""
from django.conf import settings
from django.db import models


class Ticket(models.Model):
    """Solicitação de suporte (ticket)."""

    CATEGORIA_CHOICES = [
        ("tecnico", "Técnico / falha do sistema"),
        ("financeiro", "Financeiro / cobrança"),
        ("acesso", "Acesso / credenciais"),
        ("duvida", "Dúvida geral"),
        ("sugestao", "Sugestão de melhoria"),
        ("outro", "Outro"),
    ]
    STATUS_CHOICES = [
        ("aberto", "Aberto"),
        ("em_atendimento", "Em atendimento"),
        ("aguardando_usuario", "Aguardando usuário"),
        ("resolvido", "Resolvido"),
        ("fechado", "Fechado"),
    ]
    PRIORIDADE_CHOICES = [
        ("baixa", "Baixa"),
        ("normal", "Normal"),
        ("alta", "Alta"),
        ("urgente", "Urgente"),
    ]
    ORIGEM_CHOICES = [
        ("oficina", "Oficina"),
        ("cliente", "Cliente final"),
        ("admin", "Equipe administrativa"),
    ]

    titulo = models.CharField(max_length=160)
    descricao = models.TextField()
    categoria = models.CharField(max_length=20, choices=CATEGORIA_CHOICES, default="duvida")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="aberto")
    prioridade = models.CharField(max_length=10, choices=PRIORIDADE_CHOICES, default="normal")
    origem = models.CharField(max_length=10, choices=ORIGEM_CHOICES, default="oficina")

    # Vínculo com o domínio: identifica de qual oficina/cliente nasceu o
    # chamado. `oficina` é sempre preenchido se houver contexto (mesmo para
    # tickets criados pelo cliente final, a OS dele tem oficina).
    oficina = models.ForeignKey(
        "modulo_oficina.Oficina",
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name="tickets",
    )
    autor_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="tickets_abertos",
    )
    autor_cliente = models.ForeignKey(
        "modulo_oficina.Cliente",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="tickets_abertos",
    )
    os_relacionada = models.ForeignKey(
        "modulo_oficina.OrdemServico",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="tickets",
        help_text="Quando o ticket é sobre uma OS específica.",
    )

    atribuido_a = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="tickets_atribuidos",
        help_text="Usuário responsável pelo atendimento (staff/superuser).",
    )

    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)
    fechado_em = models.DateTimeField(null=True, blank=True)
    # Quantidade de mensagens não lidas pelo lado oposto (admin/usuário).
    # Cache barato — é atualizado pelo service ao criar/marcar lida.
    nao_lidas_usuario = models.PositiveIntegerField(default=0)
    nao_lidas_admin = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "suporte_ticket"
        ordering = ("-criado_em",)
        indexes = [
            models.Index(fields=("status", "-criado_em")),
            models.Index(fields=("oficina", "-criado_em")),
            models.Index(fields=("autor_cliente", "-criado_em")),
            models.Index(fields=("prioridade",)),
        ]

    def __str__(self):
        return f"#{self.id} · {self.titulo}"

    # -----------------------------------------------------------------
    # Conveniências
    # -----------------------------------------------------------------

    @property
    def aberto(self):
        return self.status not in ("resolvido", "fechado")

    @property
    def autor_nome(self):
        if self.autor_user:
            return self.autor_user.get_full_name() or self.autor_user.username
        if self.autor_cliente:
            return self.autor_cliente.nome
        return "Anônimo"

    @property
    def autor_email(self):
        if self.autor_user:
            return self.autor_user.email
        if self.autor_cliente:
            return self.autor_cliente.email or ""
        return ""


class MensagemTicket(models.Model):
    """Mensagem dentro de um ticket — thread cronológica."""

    ticket = models.ForeignKey(
        Ticket, on_delete=models.CASCADE, related_name="mensagens",
    )
    autor_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="mensagens_suporte",
    )
    autor_cliente = models.ForeignKey(
        "modulo_oficina.Cliente",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="mensagens_suporte",
    )
    eh_admin = models.BooleanField(default=False)
    eh_interna = models.BooleanField(
        default=False,
        help_text=(
            "Quando True, a mensagem aparece apenas para o ADM "
            "(anotação interna). Útil para histórico de atendimento."
        ),
    )
    conteudo = models.TextField()
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "suporte_mensagem_ticket"
        ordering = ("criado_em",)
        indexes = [
            models.Index(fields=("ticket", "criado_em")),
        ]

    def __str__(self):
        return f"Msg #{self.id} · Ticket #{self.ticket_id}"

    @property
    def autor_nome(self):
        if self.autor_user:
            return self.autor_user.get_full_name() or self.autor_user.username
        if self.autor_cliente:
            return self.autor_cliente.nome
        return "Sistema"
