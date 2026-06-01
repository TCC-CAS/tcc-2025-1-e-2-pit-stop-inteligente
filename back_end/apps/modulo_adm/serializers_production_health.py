"""Serializers do Production Health.

Mantemos em arquivo dedicado para não inflar `serializers.py` e para
facilitar evolução independente (tendem a mudar muito conforme a aba
amadurece).
"""
from __future__ import annotations

from rest_framework import serializers

from .models import EventoErroProducao, GrupoErroProducao


class GrupoErroListaSerializer(serializers.ModelSerializer):
    """Linha do feed — sem stack/payload, para listas leves."""

    primeira_ocorrencia = serializers.DateTimeField(format="%d/%m/%Y %H:%M", read_only=True)
    ultima_ocorrencia = serializers.DateTimeField(format="%d/%m/%Y %H:%M", read_only=True)
    silenciado_ate = serializers.DateTimeField(format="%d/%m/%Y %H:%M", read_only=True, allow_null=True)
    silenciado_ativo = serializers.BooleanField(read_only=True)

    class Meta:
        model = GrupoErroProducao
        fields = [
            "id", "fingerprint", "titulo", "tipo_excecao",
            "endpoint", "metodo_http", "servico", "ambiente",
            "severidade", "status", "silenciado_ativo", "silenciado_ate",
            "total_eventos", "usuarios_afetados",
            "primeira_ocorrencia", "ultima_ocorrencia",
        ]
        read_only_fields = fields


class EventoErroSerializer(serializers.ModelSerializer):
    criado_em = serializers.DateTimeField(format="%d/%m/%Y %H:%M:%S", read_only=True)
    usuario_email = serializers.SerializerMethodField()

    class Meta:
        model = EventoErroProducao
        fields = [
            "id", "request_id", "trace_id",
            "metodo_http", "caminho", "status_http", "tempo_resposta_ms",
            "ip", "user_agent", "usuario_email",
            "payload_sanitizado", "stack_trace",
            "versao_app", "pod", "deploy_recente",
            "criado_em",
        ]
        read_only_fields = fields

    def get_usuario_email(self, obj):
        if obj.usuario_id:
            return obj.usuario.email or obj.usuario.username
        return None


class GrupoErroDetalheSerializer(GrupoErroListaSerializer):
    """Detalhe completo incluindo amostra de eventos."""

    mensagem_tecnica = serializers.CharField(read_only=True)
    versao_app = serializers.CharField(read_only=True)
    silenciado_por_nome = serializers.SerializerMethodField()
    resolvido_por_nome = serializers.SerializerMethodField()
    eventos_recentes = serializers.SerializerMethodField()

    class Meta(GrupoErroListaSerializer.Meta):
        fields = GrupoErroListaSerializer.Meta.fields + [
            "mensagem_tecnica", "versao_app",
            "silenciado_por_nome", "resolvido_por_nome",
            "eventos_recentes",
        ]

    def get_silenciado_por_nome(self, obj):
        if obj.silenciado_por_id:
            return obj.silenciado_por.get_full_name() or obj.silenciado_por.username
        return None

    def get_resolvido_por_nome(self, obj):
        if obj.resolvido_por_id:
            return obj.resolvido_por.get_full_name() or obj.resolvido_por.username
        return None

    def get_eventos_recentes(self, obj):
        limite = self.context.get("limite_eventos", 5)
        qs = obj.eventos.all().order_by("-criado_em")[:limite]
        return EventoErroSerializer(qs, many=True).data
