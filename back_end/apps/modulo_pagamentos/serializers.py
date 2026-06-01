"""Serializers REST do modulo_pagamentos.

Apresentação dos modelos para o front. A regra de negócio fica nos
services — aqui é só shape/validação superficial.
"""
from rest_framework import serializers

from .models import AssinaturaOficina, Pagamento, PlanoSaaS


class PlanoSaaSSerializer(serializers.ModelSerializer):
    preco_reais = serializers.FloatField(read_only=True)

    class Meta:
        model = PlanoSaaS
        fields = (
            "codigo", "nome", "descricao",
            "preco_centavos", "preco_reais",
            "limite_usuarios", "limite_os_mensal",
            "limite_armazenamento_mb", "duracao_dias",
            "destaque", "ativo", "ordem",
        )


class AssinaturaOficinaSerializer(serializers.ModelSerializer):
    plano = PlanoSaaSSerializer(read_only=True)
    vigente = serializers.BooleanField(read_only=True)

    class Meta:
        model = AssinaturaOficina
        fields = (
            "id", "plano", "status", "vigente",
            "inicio_em", "expira_em", "cancelada_em", "ultimo_pagamento_em",
        )


class PagamentoSerializer(serializers.ModelSerializer):
    """Representação genérica de um pagamento (assinatura ou OS)."""

    valor_reais = serializers.FloatField(read_only=True)
    tipo_display = serializers.CharField(source="get_tipo_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Pagamento
        fields = (
            "id", "external_id", "tipo", "tipo_display",
            "status", "status_display",
            "metodo_escolhido",
            "valor_centavos", "valor_reais",
            "descricao",
            "abacatepay_id", "abacatepay_url",
            "expira_em", "pago_em",
            "criado_em", "atualizado_em",
        )
        read_only_fields = fields


class IniciarCheckoutAssinaturaSerializer(serializers.Serializer):
    plano = serializers.CharField(max_length=40)
    metodos = serializers.ListField(
        child=serializers.ChoiceField(choices=["PIX", "CARD", "BOLETO"]),
        required=False,
        allow_empty=False,
    )

    def validate_plano(self, value):
        if not PlanoSaaS.objects.filter(codigo=value, ativo=True).exists():
            raise serializers.ValidationError("Plano não disponível.")
        return value
