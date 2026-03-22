from rest_framework import serializers
from apps.modulo_oficina.models import ChecklistRecebimento

class ChecklistSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChecklistRecebimento
        fields = ['id', 'os_id', 'concluido', 'assinatura_cliente', 'assinatura_tecnico', 'criado_em']
        read_only_fields = ['criado_em']