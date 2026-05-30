"""Modelos do módulo de pagamentos.

Concentra cobrança SaaS (assinatura mensal da oficina) e cobrança de
Ordens de Serviço (cliente paga pela OS) em um domínio único. A
integração externa é com AbacatePay — ver `services.abacatepay_client`.

Decisões de modelagem:
  - `PlanoSaaS` é tabela (não enum) para permitir mudar preço/limite e
    criar/descontinuar planos sem migration.
  - `Pagamento` é polimórfico por `tipo` (assinatura|os) com FKs nullable
    para o registro relevante; assim mantemos um único histórico de
    cobranças, fácil de listar em dashboards.
  - `WebhookAbacatePay` registra TODA chamada externa antes do processo,
    inclusive inválida — base para idempotência e auditoria.
"""
from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


# ---------------------------------------------------------------------------
# Catálogo de planos SaaS
# ---------------------------------------------------------------------------

class PlanoSaaS(models.Model):
    """Plano vendido para a oficina (Básico, Premium, …)."""

    codigo = models.SlugField(max_length=40, unique=True, db_index=True)
    nome = models.CharField(max_length=80)
    descricao = models.TextField(blank=True)
    preco_centavos = models.PositiveIntegerField(
        help_text="Preço mensal em centavos. R$ 199,00 = 19900.",
    )
    limite_usuarios = models.PositiveIntegerField(
        default=0,
        help_text="0 = sem limite específico (cai no default global).",
    )
    limite_os_mensal = models.PositiveIntegerField(
        default=0,
        help_text="0 = sem limite específico (cai no default global).",
    )
    limite_armazenamento_mb = models.PositiveIntegerField(
        default=0,
        help_text="Quota de armazenamento em MB (0 = sem limite específico, "
                  "cai no default global). Ex.: 1024 = 1 GB.",
    )
    duracao_dias = models.PositiveIntegerField(
        default=30,
        help_text="Duração de uma vigência da assinatura, em dias. "
                  "30 para planos mensais; 7 para o plano Teste de avaliação.",
    )
    destaque = models.BooleanField(
        default=False,
        help_text="Marca como 'Recomendado' na UI de seleção.",
    )
    ativo = models.BooleanField(default=True)
    ordem = models.PositiveSmallIntegerField(
        default=0, help_text="Ordem de exibição (menor aparece primeiro).",
    )

    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "pag_plano_saas"
        ordering = ("ordem", "preco_centavos", "codigo")
        verbose_name = "Plano SaaS"
        verbose_name_plural = "Planos SaaS"

    def __str__(self):
        return f"{self.nome} (R$ {self.preco_reais:.2f}/mês)"

    @property
    def preco_reais(self) -> float:
        return round(self.preco_centavos / 100, 2)


# ---------------------------------------------------------------------------
# Assinatura vigente de uma oficina
# ---------------------------------------------------------------------------

class AssinaturaOficina(models.Model):
    """Assinatura SaaS vigente da oficina (uma por oficina).

    O histórico de renovações fica em `Pagamento(tipo='assinatura')`.
    """

    STATUS_CHOICES = [
        ("pendente", "Aguardando pagamento"),
        ("ativa", "Ativa"),
        ("vencida", "Vencida"),
        ("cancelada", "Cancelada"),
    ]

    oficina = models.OneToOneField(
        "modulo_oficina.Oficina",
        on_delete=models.CASCADE,
        related_name="assinatura",
    )
    plano = models.ForeignKey(
        PlanoSaaS,
        on_delete=models.PROTECT,
        related_name="assinaturas",
    )
    status = models.CharField(
        max_length=15, choices=STATUS_CHOICES, default="pendente",
    )
    inicio_em = models.DateTimeField(blank=True, null=True)
    expira_em = models.DateTimeField(blank=True, null=True)
    cancelada_em = models.DateTimeField(blank=True, null=True)
    ultimo_pagamento_em = models.DateTimeField(blank=True, null=True)

    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "pag_assinatura_oficina"
        verbose_name = "Assinatura de oficina"
        verbose_name_plural = "Assinaturas de oficinas"
        indexes = [
            models.Index(fields=("status", "expira_em")),
        ]

    def __str__(self):
        return f"{self.oficina.nome} · {self.plano.codigo} · {self.status}"

    @property
    def vigente(self) -> bool:
        if self.status != "ativa" or self.expira_em is None:
            return False
        return self.expira_em > timezone.now()


# ---------------------------------------------------------------------------
# Pagamento (polimórfico: assinatura ou OS)
# ---------------------------------------------------------------------------

class Pagamento(models.Model):
    """Cobrança gerada no AbacatePay — pode ser de assinatura ou OS."""

    TIPO_CHOICES = [
        ("assinatura", "Assinatura SaaS"),
        ("os", "Ordem de Serviço"),
    ]
    STATUS_CHOICES = [
        ("pendente", "Pendente"),
        ("pago", "Pago"),
        ("falha", "Falha"),
        ("expirado", "Expirado"),
        ("cancelado", "Cancelado"),
    ]
    METODO_CHOICES = [
        ("PIX", "PIX"),
        ("CARD", "Cartão de crédito"),
        ("BOLETO", "Boleto"),
    ]

    # UUID estável — vai para AbacatePay como `externalId`, permite
    # reconciliar cobrança ⇄ Pagamento mesmo se reenviarmos.
    external_id = models.UUIDField(
        default=uuid.uuid4, unique=True, editable=False, db_index=True,
    )

    tipo = models.CharField(max_length=15, choices=TIPO_CHOICES, db_index=True)
    status = models.CharField(
        max_length=15, choices=STATUS_CHOICES, default="pendente",
    )
    # Preenchido apenas após o pagador escolher no checkout AbacatePay.
    metodo_escolhido = models.CharField(
        max_length=10, choices=METODO_CHOICES, blank=True,
    )

    valor_centavos = models.PositiveIntegerField()
    descricao = models.CharField(max_length=200, blank=True)

    # Oficina cobrada (assinatura) OU dona da OS (no caso de pagamento de OS).
    oficina = models.ForeignKey(
        "modulo_oficina.Oficina",
        on_delete=models.PROTECT,
        related_name="pagamentos",
    )
    assinatura = models.ForeignKey(
        AssinaturaOficina,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="pagamentos",
    )
    ordem_servico = models.ForeignKey(
        "modulo_oficina.OrdemServico",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="pagamentos",
    )
    cliente = models.ForeignKey(
        "modulo_oficina.Cliente",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="pagamentos",
        help_text="Cliente final que paga (preenchido só em tipo='os').",
    )

    # Dados retornados pela AbacatePay
    abacatepay_id = models.CharField(
        max_length=64, blank=True, db_index=True,
        help_text="ID da cobrança no AbacatePay (ex.: bill_abc123).",
    )
    abacatepay_url = models.URLField(
        max_length=500, blank=True,
        help_text="URL hospedada do checkout AbacatePay.",
    )

    expira_em = models.DateTimeField(blank=True, null=True)
    pago_em = models.DateTimeField(blank=True, null=True)
    metadados = models.JSONField(blank=True, null=True)

    criado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="pagamentos_criados",
    )
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "pag_pagamento"
        ordering = ("-criado_em",)
        indexes = [
            models.Index(fields=("status", "-criado_em")),
            models.Index(fields=("tipo", "status")),
            models.Index(fields=("oficina", "-criado_em")),
            models.Index(fields=("abacatepay_id",)),
        ]
        verbose_name = "Pagamento"
        verbose_name_plural = "Pagamentos"

    def __str__(self):
        return f"#{self.id} · {self.get_tipo_display()} · {self.get_status_display()}"

    @property
    def valor_reais(self) -> float:
        return round(self.valor_centavos / 100, 2)


# ---------------------------------------------------------------------------
# Eventos do pagamento (timeline)
# ---------------------------------------------------------------------------

class EventoPagamento(models.Model):
    """Audit trail de cada mudança no Pagamento.

    Cada evento documenta uma transição relevante (criado, checkout
    gerado, webhook, confirmado, falhou…) e armazena o payload bruto
    da fonte (request do front, body do webhook, etc.) para diagnóstico.
    """

    TIPO_CHOICES = [
        ("criado", "Pagamento criado"),
        ("checkout_gerado", "Checkout AbacatePay gerado"),
        ("webhook_recebido", "Webhook recebido"),
        ("pago", "Pagamento confirmado"),
        ("falha", "Falha"),
        ("expirado", "Expirado"),
        ("cancelado", "Cancelado"),
        ("simulado", "Simulação manual (dev)"),
    ]

    pagamento = models.ForeignKey(
        Pagamento, on_delete=models.CASCADE, related_name="eventos",
    )
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES)
    descricao = models.CharField(max_length=200, blank=True)
    payload = models.JSONField(blank=True, null=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "pag_evento_pagamento"
        ordering = ("-criado_em",)
        indexes = [
            models.Index(fields=("pagamento", "-criado_em")),
        ]
        verbose_name = "Evento de pagamento"
        verbose_name_plural = "Eventos de pagamento"

    def __str__(self):
        return f"{self.get_tipo_display()} · pag #{self.pagamento_id}"


# ---------------------------------------------------------------------------
# Webhook recebido do AbacatePay
# ---------------------------------------------------------------------------

class WebhookAbacatePay(models.Model):
    """Registro de todo webhook recebido (válido ou não).

    Persistimos antes de processar para:
      - idempotência (rejeitar replay pelo `event_id`);
      - reprocessamento manual em caso de falha;
      - investigação de tentativas inválidas (assinatura quebrada).
    """

    event_id = models.CharField(max_length=128, unique=True)
    evento = models.CharField(max_length=80, db_index=True)
    payload = models.JSONField()
    assinatura_valida = models.BooleanField(default=False)
    processado = models.BooleanField(default=False)
    processado_em = models.DateTimeField(blank=True, null=True)
    erro = models.TextField(blank=True)
    pagamento = models.ForeignKey(
        Pagamento,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="webhooks",
    )
    recebido_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "pag_webhook_abacatepay"
        ordering = ("-recebido_em",)
        indexes = [
            models.Index(fields=("-recebido_em",)),
            models.Index(fields=("processado", "-recebido_em")),
        ]
        verbose_name = "Webhook AbacatePay"
        verbose_name_plural = "Webhooks AbacatePay"

    def __str__(self):
        return f"{self.evento} · {self.event_id[:12]}…"
