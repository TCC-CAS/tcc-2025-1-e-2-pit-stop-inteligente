from rest_framework import serializers
from apps.modulo_oficina.models import TarefaExecucao

class TarefaExecucaoSerializer(serializers.ModelSerializer):
    class Meta:
        model = TarefaExecucao
        # Assumindo que o nome do campo ForeignKey no seu models.py é 'os'
        fields = ['id', 'os', 'descricao', 'status', 'atualizado_em']
        # Definimos 'os' como read_only para que o is_valid() não exija ele no JSON do request
        read_only_fields = ['id', 'os', 'atualizado_em']