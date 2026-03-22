from rest_framework import serializers
from apps.modulo_oficina.models import ItemOrcamento, OrdemServico

class ItemOrcamentoSerializer(serializers.ModelSerializer):
    # Define explicitamente o campo os_id como chave estrangeira (espera um ID)
    os_id = serializers.PrimaryKeyRelatedField(
        source='os',                # mapeia para o campo 'os' do modelo
        queryset=OrdemServico.objects.all(),
        write_only=False            # pode ser lido e escrito
    )

    class Meta:
        model = ItemOrcamento
        fields = ['id', 'os_id', 'tipo', 'nome_descricao', 'quantidade', 
                  'valor_unitario', 'dificuldade', 'status_aprovacao']