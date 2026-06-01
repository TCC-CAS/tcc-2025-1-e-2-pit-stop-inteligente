"""Serializers do sistema de suporte.

Diferentes representações conforme o contexto:
  - TicketListaSerializer: cards/linhas de lista (sem mensagens).
  - TicketDetalheSerializer: detalhe com mensagens visíveis.
  - MensagemSerializer: linha de chat.
  - TicketCriacaoSerializer: payload de POST (apenas campos editáveis).
"""
from rest_framework import serializers

from .models import MensagemTicket, Ticket


class MensagemSerializer(serializers.ModelSerializer):
    autor_nome = serializers.CharField(read_only=True)
    autor_tipo = serializers.SerializerMethodField()
    criado_em = serializers.DateTimeField(format="%d/%m/%Y %H:%M", read_only=True)

    class Meta:
        model = MensagemTicket
        fields = [
            "id", "conteudo", "autor_nome", "autor_tipo",
            "eh_admin", "eh_interna", "criado_em",
        ]
        read_only_fields = fields

    def get_autor_tipo(self, obj):
        if obj.eh_admin:
            return "admin"
        if obj.autor_user_id:
            return "oficina"
        if obj.autor_cliente_id:
            return "cliente"
        return "sistema"


class TicketListaSerializer(serializers.ModelSerializer):
    autor_nome = serializers.CharField(read_only=True)
    oficina_nome = serializers.CharField(source="oficina.nome", read_only=True)
    criado_em = serializers.DateTimeField(format="%d/%m/%Y %H:%M", read_only=True)
    atualizado_em = serializers.DateTimeField(format="%d/%m/%Y %H:%M", read_only=True)
    atribuido_a_nome = serializers.SerializerMethodField()
    total_mensagens = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = [
            "id", "titulo", "categoria", "status", "prioridade", "origem",
            "autor_nome", "oficina_nome", "atribuido_a_nome",
            "total_mensagens", "nao_lidas_usuario", "nao_lidas_admin",
            "criado_em", "atualizado_em",
        ]

    def get_atribuido_a_nome(self, obj):
        if obj.atribuido_a_id:
            return obj.atribuido_a.get_full_name() or obj.atribuido_a.username
        return ""

    def get_total_mensagens(self, obj):
        return getattr(obj, "_total_mensagens", obj.mensagens.count())


class TicketDetalheSerializer(TicketListaSerializer):
    descricao = serializers.CharField(read_only=True)
    autor_email = serializers.CharField(read_only=True)
    fechado_em = serializers.DateTimeField(format="%d/%m/%Y %H:%M", read_only=True, allow_null=True)
    os_relacionada = serializers.IntegerField(source="os_relacionada_id", read_only=True)
    mensagens = serializers.SerializerMethodField()

    class Meta(TicketListaSerializer.Meta):
        fields = TicketListaSerializer.Meta.fields + [
            "descricao", "autor_email", "fechado_em", "os_relacionada", "mensagens",
        ]

    def get_mensagens(self, obj):
        # Permite ao chamador filtrar mensagens internas via context
        incluir_internas = self.context.get("incluir_internas", False)
        qs = obj.mensagens.all()
        if not incluir_internas:
            qs = qs.filter(eh_interna=False)
        return MensagemSerializer(qs, many=True).data


class TicketCriacaoSerializer(serializers.ModelSerializer):
    """Payload aceito ao abrir um novo ticket (POST)."""

    class Meta:
        model = Ticket
        fields = ["titulo", "descricao", "categoria", "prioridade", "os_relacionada"]
        extra_kwargs = {
            "titulo": {"required": True, "allow_blank": False},
            "descricao": {"required": True, "allow_blank": False},
            "categoria": {"required": False},
            "prioridade": {"required": False},
            "os_relacionada": {"required": False, "allow_null": True},
        }

    def validate_titulo(self, value):
        v = (value or "").strip()
        if len(v) < 4:
            raise serializers.ValidationError("Informe um título com pelo menos 4 caracteres.")
        return v

    def validate_descricao(self, value):
        v = (value or "").strip()
        if len(v) < 10:
            raise serializers.ValidationError(
                "Descreva o problema com pelo menos 10 caracteres."
            )
        return v
