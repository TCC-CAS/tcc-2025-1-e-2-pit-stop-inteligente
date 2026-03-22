from rest_framework import serializers
from apps.modulo_oficina.models import HistoricoOS

class HistoricoOSSerializer(serializers.ModelSerializer):
    usuario = serializers.StringRelatedField()

    class Meta:
        model = HistoricoOS
        fields = ['id', 'tipo', 'descricao', 'detalhes', 'usuario', 'data_hora']