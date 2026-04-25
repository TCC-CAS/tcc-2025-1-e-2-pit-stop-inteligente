from rest_framework import serializers
from .models import (Oficina, Cliente, Veiculo, Servico, ConfigPreco, ChecklistRecebimento, 
                     ItemOrcamento, TarefaExecucao, OrdemServico, Documento, HistoricoOS)

# ==========================================
# 1. SERIALIZERS BASE (Oficina, Clientes e Veículos)
# ==========================================

class OficinaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Oficina
        fields = '__all__'

class ClienteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cliente
        fields = '__all__'

class VeiculoSerializer(serializers.ModelSerializer):
    cliente_detalhes = ClienteSerializer(source='cliente', read_only=True)
    
    class Meta:
        model = Veiculo
        fields = '__all__'

# ====================================================
# 2. SERIALIZERS DE CONFIGURAÇÃO E CATÁLOGO DE SERVIÇO
# ====================================================

class ConfigPrecoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConfigPreco
        fields = '__all__'

class ServicoSerializer(serializers.ModelSerializer):
    tempo = serializers.DecimalField(max_digits=5, decimal_places=2, source='tempo_estimado')
    valor_base_calculado = serializers.SerializerMethodField()

    class Meta:
        model = Servico
        fields = ['id', 'nome', 'descricao', 'tempo', 'valor_base_calculado', 'criado_em', 'atualizado_em']

    def get_valor_base_calculado(self, obj):
        try:
            config = ConfigPreco.objects.first()
            if not config or not config.valor_hora_mecanico:
                return 0.00
            
            valor_hora = config.valor_hora_mecanico
            tempo = obj.tempo_estimado
            valor_total = float(tempo) * float(valor_hora)
            return round(valor_total, 2)
        except Exception:
            return 0.00

# ==========================================
# 3. SERIALIZERS DE OPERAÇÕES (Abas da OS)
# ==========================================

class ChecklistSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChecklistRecebimento
        fields = [
            'id', 'os_id', 'concluido',
            'assinatura_cliente', 'assinatura_tecnico',
            'data_recebimento', 'consultor',
            'nivel_combustivel', 'observacoes_iniciais',
            'lataria_pintura', 'vidros_farois',
            'possui_manual', 'possui_estepe_macaco', 'observacoes_internas',
            'nivel_oleo', 'fluido_arrefecimento', 'observacoes_mecanica', 
            'criado_em'
        ]
        read_only_fields = ['criado_em']

class ItemOrcamentoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemOrcamento
        fields = ['id', 'os_id', 'tipo', 'nome_descricao', 'quantidade', 
                  'valor_unitario', 'categoria_veiculo', 'status_aprovacao']

class TarefaExecucaoSerializer(serializers.ModelSerializer):
    os_id = serializers.PrimaryKeyRelatedField(
        source='os',
        queryset=OrdemServico.objects.all(),
        write_only=False,
        required=False
    )
    descricao = serializers.CharField(required=False)

    class Meta:
        model = TarefaExecucao
        fields = ['id', 'os_id', 'descricao', 'status', 'criado_em', 'atualizado_em']
        read_only_fields = ['criado_em', 'atualizado_em']

class DocumentoSerializer(serializers.ModelSerializer):
    # ADAPTER: Traduz os campos do Banco para o que o Javascript espera
    nome = serializers.CharField(source='nome_arquivo', read_only=True)
    tipo = serializers.SerializerMethodField()
    data_inclusao = serializers.DateTimeField(source='criado_em', read_only=True)
    
    class Meta:
        model = Documento
        fields = ['id', 'nome', 'tipo', 'data_inclusao', 'arquivo', 'origem', 'categoria']

    def get_tipo(self, obj):
        """Extrai a extensão do arquivo para o front-end desenhar o ícone correto (PDF, PNG, etc)"""
        if obj.nome_arquivo and '.' in obj.nome_arquivo:
            return obj.nome_arquivo.split('.')[-1].lower()
        elif obj.arquivo and '.' in obj.arquivo.name:
            return obj.arquivo.name.split('.')[-1].lower()
        return 'desconhecido'

class HistoricoOSSerializer(serializers.ModelSerializer):
    # ADAPTER: Trata o campo usuário que pode ser nulo
    usuario = serializers.SerializerMethodField()

    class Meta:
        model = HistoricoOS
        fields = ['id', 'tipo', 'descricao', 'detalhes', 'usuario', 'data_hora']

    def get_usuario(self, obj):
        if obj.usuario:
            return obj.usuario.get_full_name() or obj.usuario.username
        return "Sistema"

# ==========================================
# 4. SERIALIZERS DA ORDEM DE SERVIÇO PRINCIPAL
# ==========================================

class OrdemServicoSerializer(serializers.ModelSerializer):
    veiculo_detalhes = VeiculoSerializer(source='veiculo', read_only=True)

    class Meta:
        model = OrdemServico
        fields = '__all__'

class OrdemServicoListaSerializer(serializers.ModelSerializer):
    veiculo_modelo = serializers.CharField(source='veiculo.modelo', read_only=True)
    veiculo_placa = serializers.CharField(source='veiculo.placa', read_only=True)
    cliente_nome = serializers.CharField(source='cliente.nome', read_only=True)
    criado_em = serializers.DateTimeField(format='%d/%m/%Y %H:%M', read_only=True)

    class Meta:
        model = OrdemServico
        fields = ['id', 'veiculo_modelo', 'veiculo_placa', 'cliente_nome', 'status', 'km_atual', 'criado_em']