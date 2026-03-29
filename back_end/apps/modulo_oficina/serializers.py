from rest_framework import serializers
from .models import Cliente, Veiculo, OrdemServico, ItemOrcamento, TarefaExecucao, Documento
from .models import ConfiguracaoOficina, CategoriaVeiculo, Servico

class ClienteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cliente
        fields = '__all__'

class VeiculoSerializer(serializers.ModelSerializer):
    cliente = ClienteSerializer(read_only=True)  # aninhar cliente

    class Meta:
        model = Veiculo
        fields = '__all__'

class OrdemServicoSerializer(serializers.ModelSerializer):
    veiculo = VeiculoSerializer(read_only=True)  # aninhar veículo com cliente

    class Meta:
        model = OrdemServico
        fields = '__all__'

# Para listagem resumida (usada na lista lateral)
class OrdemServicoListaSerializer(serializers.ModelSerializer):
    veiculo_modelo = serializers.CharField(source='veiculo.modelo')
    veiculo_placa = serializers.CharField(source='veiculo.placa')
    cliente_nome = serializers.CharField(source='veiculo.cliente.nome')
    criado_em = serializers.DateTimeField(format='%d/%m/%Y %H:%M')

    class Meta:
        model = OrdemServico
        fields = ['id', 'veiculo_modelo', 'veiculo_placa', 'cliente_nome', 'status', 'km_atual', 'criado_em']

# Demais serializers (ItemOrcamento, TarefaExecucao) se necessário
class ItemOrcamentoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemOrcamento
        fields = '__all__'

class TarefaExecucaoSerializer(serializers.ModelSerializer):
    class Meta:
        model = TarefaExecucao
        fields = '__all__'

class DocumentoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Documento
        fields = ['id', 'nome', 'tipo', 'data_inclusao']

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


class ClienteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cliente
        fields = '__all__'

    def validate_cpf_cnpj(self, value):
        """Validação simples para remover caracteres especiais do CPF/CNPJ"""
        import re
        # Remove tudo que não for número
        clean_value = re.sub(r'\D', '', value)
        if not clean_value:
            raise serializers.ValidationError("CPF/CNPJ inválido.")
        return clean_value