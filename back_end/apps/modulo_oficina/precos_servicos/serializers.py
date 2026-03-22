# back_end/apps/modulo_oficina/precos_servicos/serializers.py
from rest_framework import serializers
from ..models import ConfiguracaoOficina, CategoriaVeiculo, Servico

class ConfiguracaoOficinaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConfiguracaoOficina
        fields = ['id', 'valor_hora', 'atualizado_em']

class CategoriaVeiculoSerializer(serializers.ModelSerializer):
    class Meta:
        model = CategoriaVeiculo
        fields = ['id', 'nome', 'percentual', 'icone', 'cor']

class ServicoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Servico
        fields = ['id', 'nome', 'descricao', 'tempo', 'criado_em', 'atualizado_em']