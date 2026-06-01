"""Serializers do portal do cliente.

Diferenças importantes em relação aos serializers da oficina:
- Removemos campos administrativos (oficina_id, criado_em interno, ids de
  funcionários, etc.) que o cliente final não precisa enxergar.
- Datas vêm já formatadas para exibição direta no front (pt-BR).
- Nada aqui aceita `write_only`: o cliente só escreve em endpoints
  dedicados (assinatura/aprovação), com validação explícita na view.
"""
from rest_framework import serializers

from apps.modulo_oficina.models import (
    ChecklistRecebimento,
    Documento,
    HistoricoOS,
    ItemOrcamento,
    OrdemServico,
)


class ClienteResumoSerializer(serializers.Serializer):
    """Snapshot mínimo do cliente para a sessão e o cabeçalho do portal."""

    id = serializers.IntegerField()
    nome = serializers.CharField()
    email = serializers.EmailField(allow_blank=True, allow_null=True, required=False)
    telefone = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    oficina_nome = serializers.CharField(source="oficina.nome", read_only=True)


class OSListaClienteSerializer(serializers.ModelSerializer):
    """Lista de OS visíveis para o cliente — uma linha por OS."""

    veiculo_modelo = serializers.CharField(source="veiculo.modelo", read_only=True)
    veiculo_placa = serializers.CharField(source="veiculo.placa", read_only=True)
    veiculo_marca = serializers.CharField(source="veiculo.marca", read_only=True)
    oficina_nome = serializers.CharField(source="oficina.nome", read_only=True)
    criado_em = serializers.DateTimeField(format="%d/%m/%Y %H:%M", read_only=True)
    atualizado_em = serializers.DateTimeField(format="%d/%m/%Y %H:%M", read_only=True)

    class Meta:
        model = OrdemServico
        fields = [
            "id",
            "status",
            "km_atual",
            "criado_em",
            "atualizado_em",
            "veiculo_modelo",
            "veiculo_placa",
            "veiculo_marca",
            "oficina_nome",
        ]


class OSDetalheClienteSerializer(serializers.ModelSerializer):
    """Detalhe da OS na home do portal (cabeçalho + dados do veículo)."""

    veiculo_modelo = serializers.CharField(source="veiculo.modelo", read_only=True)
    veiculo_placa = serializers.CharField(source="veiculo.placa", read_only=True)
    veiculo_marca = serializers.CharField(source="veiculo.marca", read_only=True)
    veiculo_ano = serializers.CharField(source="veiculo.ano", read_only=True)
    veiculo_cor = serializers.CharField(source="veiculo.cor", read_only=True)
    oficina_nome = serializers.CharField(source="oficina.nome", read_only=True)
    oficina_telefone = serializers.CharField(source="oficina.telefone", read_only=True)
    criado_em = serializers.DateTimeField(format="%d/%m/%Y %H:%M", read_only=True)
    atualizado_em = serializers.DateTimeField(format="%d/%m/%Y %H:%M", read_only=True)

    class Meta:
        model = OrdemServico
        fields = [
            "id",
            "status",
            "km_atual",
            "criado_em",
            "atualizado_em",
            "veiculo_modelo",
            "veiculo_placa",
            "veiculo_marca",
            "veiculo_ano",
            "veiculo_cor",
            "oficina_nome",
            "oficina_telefone",
        ]


class ChecklistClienteSerializer(serializers.ModelSerializer):
    """Versão somente-leitura do checklist (com flag de assinatura)."""

    cliente_assinou = serializers.SerializerMethodField()
    tecnico_assinou = serializers.SerializerMethodField()

    class Meta:
        model = ChecklistRecebimento
        fields = [
            "id",
            "concluido",
            "data_recebimento",
            "consultor",
            "nivel_combustivel",
            "observacoes_iniciais",
            "lataria_pintura",
            "vidros_farois",
            "possui_manual",
            "possui_estepe_macaco",
            "observacoes_internas",
            "nivel_oleo",
            "fluido_arrefecimento",
            "observacoes_mecanica",
            "assinatura_cliente",
            "assinatura_tecnico",
            "cliente_assinou",
            "tecnico_assinou",
            "criado_em",
            "atualizado_em",
        ]

    def get_cliente_assinou(self, obj):
        return bool((obj.assinatura_cliente or "").strip())

    def get_tecnico_assinou(self, obj):
        return bool((obj.assinatura_tecnico or "").strip())


class ItemOrcamentoClienteSerializer(serializers.ModelSerializer):
    """Item do orçamento exibido ao cliente para aprovação/rejeição."""

    valor_total = serializers.SerializerMethodField()

    class Meta:
        model = ItemOrcamento
        fields = [
            "id",
            "tipo",
            "nome_descricao",
            "quantidade",
            "valor_unitario",
            "valor_total",
            "status_aprovacao",
        ]

    def get_valor_total(self, obj):
        try:
            return round(float(obj.valor_unitario or 0) * int(obj.quantidade or 0), 2)
        except (TypeError, ValueError):
            return 0.0


class DocumentoClienteSerializer(serializers.ModelSerializer):
    """Documento exibido para download no portal do cliente."""

    nome = serializers.CharField(source="nome_arquivo", read_only=True)
    tipo = serializers.SerializerMethodField()
    url = serializers.SerializerMethodField()
    data_inclusao = serializers.DateTimeField(
        source="criado_em", format="%d/%m/%Y %H:%M", read_only=True
    )

    class Meta:
        model = Documento
        fields = ["id", "nome", "tipo", "url", "origem", "categoria", "data_inclusao"]

    def get_tipo(self, obj):
        fonte = obj.nome_arquivo or (obj.arquivo.name if obj.arquivo else "")
        if "." in fonte:
            return fonte.rsplit(".", 1)[-1].lower()
        return "desconhecido"

    def get_url(self, obj):
        if not obj.arquivo:
            return None
        request = self.context.get("request")
        url = obj.arquivo.url
        if request is not None:
            return request.build_absolute_uri(url)
        return url


class HistoricoClienteSerializer(serializers.ModelSerializer):
    """Linha do tempo da OS visível ao cliente."""

    autor = serializers.SerializerMethodField()
    data_hora = serializers.DateTimeField(format="%d/%m/%Y %H:%M", read_only=True)

    class Meta:
        model = HistoricoOS
        fields = ["id", "tipo", "descricao", "detalhes", "autor", "data_hora"]

    def get_autor(self, obj):
        if obj.usuario:
            return obj.usuario.get_full_name() or obj.usuario.username
        return "Sistema"
