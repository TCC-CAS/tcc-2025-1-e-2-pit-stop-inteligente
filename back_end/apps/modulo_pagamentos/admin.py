"""Configuração do Django Admin para o modulo_pagamentos.

Disponibiliza listagens leves para diagnóstico interno (suporte/dev).
O painel SaaS principal é o do `modulo_adm` — este Admin é só fallback.
"""
from django.contrib import admin

from .models import (
    AssinaturaOficina,
    EventoPagamento,
    Pagamento,
    PlanoSaaS,
    WebhookAbacatePay,
)


@admin.register(PlanoSaaS)
class PlanoSaaSAdmin(admin.ModelAdmin):
    list_display = ("codigo", "nome", "preco_reais", "ativo", "destaque", "ordem")
    list_filter = ("ativo", "destaque")
    search_fields = ("codigo", "nome")
    ordering = ("ordem", "codigo")


@admin.register(AssinaturaOficina)
class AssinaturaOficinaAdmin(admin.ModelAdmin):
    list_display = ("oficina", "plano", "status", "expira_em", "ultimo_pagamento_em")
    list_filter = ("status", "plano")
    search_fields = ("oficina__nome", "oficina__cnpj")
    autocomplete_fields = ("oficina", "plano")
    readonly_fields = ("criado_em", "atualizado_em")


@admin.register(Pagamento)
class PagamentoAdmin(admin.ModelAdmin):
    list_display = (
        "id", "tipo", "status", "metodo_escolhido", "valor_reais",
        "oficina", "abacatepay_id", "criado_em",
    )
    list_filter = ("tipo", "status", "metodo_escolhido")
    search_fields = ("external_id", "abacatepay_id", "oficina__nome", "descricao")
    autocomplete_fields = ("oficina", "cliente", "ordem_servico", "assinatura")
    readonly_fields = (
        "external_id", "abacatepay_id", "abacatepay_url",
        "criado_em", "atualizado_em", "pago_em",
    )


@admin.register(EventoPagamento)
class EventoPagamentoAdmin(admin.ModelAdmin):
    list_display = ("id", "pagamento", "tipo", "descricao", "criado_em")
    list_filter = ("tipo",)
    search_fields = ("pagamento__external_id", "descricao")
    autocomplete_fields = ("pagamento",)
    readonly_fields = ("criado_em",)


@admin.register(WebhookAbacatePay)
class WebhookAbacatePayAdmin(admin.ModelAdmin):
    list_display = (
        "id", "evento", "event_id", "assinatura_valida",
        "processado", "recebido_em",
    )
    list_filter = ("evento", "processado", "assinatura_valida")
    search_fields = ("event_id", "evento")
    readonly_fields = (
        "event_id", "evento", "payload", "assinatura_valida",
        "processado", "processado_em", "erro", "recebido_em",
    )
