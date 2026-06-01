from rest_framework import serializers
from django.contrib.auth.models import User
from .models import (Oficina, Cliente, Veiculo, Servico, ConfigPreco, ChecklistRecebimento,
                     ItemOrcamento, TarefaExecucao, ServicoTarefaPadrao,
                     OrdemServico, Documento, HistoricoOS, Funcionario,
                     ManutencaoPreventiva)

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
        read_only_fields = ['oficina']

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
    tarefas_padrao = serializers.SerializerMethodField(read_only=True)
    # Aceita lista no POST/PUT para criar/substituir o conjunto de tarefas
    # padrão em uma única chamada (UX mais simples no painel de catálogo).
    tarefas_padrao_input = serializers.ListField(
        child=serializers.DictField(), required=False, write_only=True,
    )

    class Meta:
        model = Servico
        fields = [
            'id', 'nome', 'descricao', 'tempo', 'valor_base_calculado',
            'preco_sugerido', 'tarefas_padrao', 'tarefas_padrao_input',
            'criado_em', 'atualizado_em',
        ]

    def get_tarefas_padrao(self, obj):
        qs = obj.tarefas_padrao.filter(ativa=True).order_by("ordem", "id")
        return ServicoTarefaPadraoSerializer(qs, many=True).data

    def _salvar_tarefas_padrao(self, servico, tarefas_data):
        """Substitui o conjunto de tarefas padrão pelo novo (replace-all).

        Mantemos a abordagem simples: o front sempre envia o conjunto
        completo. Isso evita problemas de sincronização de IDs e dá ao
        gestor uma visão clara do "checklist" do serviço.
        """
        servico.tarefas_padrao.all().delete()
        for idx, t in enumerate(tarefas_data, start=1):
            ServicoTarefaPadrao.objects.create(
                servico=servico,
                descricao=str(t.get("descricao", "")).strip()[:255],
                ordem=int(t.get("ordem", idx)),
                tempo_estimado_h=t.get("tempo_estimado_h") or 0,
                obrigatoria=bool(t.get("obrigatoria", True)),
                ativa=bool(t.get("ativa", True)),
            )

    def create(self, validated_data):
        tarefas = validated_data.pop("tarefas_padrao_input", None)
        servico = super().create(validated_data)
        if tarefas is not None:
            self._salvar_tarefas_padrao(servico, tarefas)
        return servico

    def update(self, instance, validated_data):
        tarefas = validated_data.pop("tarefas_padrao_input", None)
        servico = super().update(instance, validated_data)
        if tarefas is not None:
            self._salvar_tarefas_padrao(servico, tarefas)
        return servico

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
    # Atribuição: aceita lista de IDs de Funcionario; devolve lista de
    # dicionários resumidos com {id, nome, permissao} para a UI mostrar.
    responsaveis_ids = serializers.PrimaryKeyRelatedField(
        source="responsaveis",
        queryset=Funcionario.objects.all(),
        many=True,
        required=False,
    )
    responsaveis_detalhes = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = TarefaExecucao
        fields = [
            'id', 'os_id', 'descricao', 'status',
            'responsaveis_ids', 'responsaveis_detalhes',
            'tempo_estimado_h', 'iniciada_em', 'concluida_em', 'tempo_gasto_minutos',
            'criado_em', 'atualizado_em',
        ]
        read_only_fields = [
            'criado_em', 'atualizado_em', 'concluida_em', 'tempo_gasto_minutos',
            'responsaveis_detalhes',
        ]

    def get_responsaveis_detalhes(self, obj):
        return [
            {
                "id": f.id,
                "nome": (f.user.get_full_name() or f.user.username),
                "permissao": f.permissao,
            }
            for f in obj.responsaveis.select_related("user").all()
        ]

    def update(self, instance, validated_data):
        """Calcula tempo gasto automaticamente quando o status muda."""
        from django.utils import timezone
        novo_status = validated_data.get("status", instance.status)

        # Início: passou de pendente → execucao
        if instance.status == "pendente" and novo_status == "execucao" and not instance.iniciada_em:
            validated_data["iniciada_em"] = timezone.now()

        # Conclusão: passou para concluido, registra fim e calcula tempo
        if novo_status == "concluido" and instance.status != "concluido":
            agora = timezone.now()
            validated_data["concluida_em"] = agora
            inicio = instance.iniciada_em or agora
            delta = agora - inicio
            validated_data["tempo_gasto_minutos"] = max(0, int(delta.total_seconds() // 60))

        return super().update(instance, validated_data)


class ServicoTarefaPadraoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServicoTarefaPadrao
        fields = [
            'id', 'servico', 'descricao', 'ordem',
            'tempo_estimado_h', 'obrigatoria', 'ativa',
            'criado_em', 'atualizado_em',
        ]
        read_only_fields = ['criado_em', 'atualizado_em']
        extra_kwargs = {'servico': {'required': False}}

class DocumentoSerializer(serializers.ModelSerializer):
    nome = serializers.CharField(source='nome_arquivo', read_only=True)
    tipo = serializers.SerializerMethodField()
    data_inclusao = serializers.DateTimeField(source='criado_em', read_only=True)
    
    class Meta:
        model = Documento
        fields = ['id', 'nome', 'tipo', 'data_inclusao', 'arquivo', 'origem', 'categoria']

    def get_tipo(self, obj):
        if obj.nome_arquivo and '.' in obj.nome_arquivo:
            return obj.nome_arquivo.split('.')[-1].lower()
        elif obj.arquivo and '.' in obj.arquivo.name:
            return obj.arquivo.name.split('.')[-1].lower()
        return 'desconhecido'

class HistoricoOSSerializer(serializers.ModelSerializer):
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
    cliente_detalhes = ClienteSerializer(source='cliente', read_only=True)
    cliente_nome = serializers.CharField(source='cliente.nome', read_only=True)
    oficina_nome = serializers.CharField(source='oficina.nome', read_only=True)

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

class OrdemServicoHistoricoSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrdemServico
        fields = ['id', 'status', 'km_atual', 'criado_em']

# NOVO SERIALIZER (manter os já existentes no arquivo)
class ChecklistResumoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChecklistRecebimento
        fields = ['concluido', 'data_recebimento', 'consultor', 'nivel_combustivel', 'observacoes_iniciais']

class OrdemServicoComChecklistSerializer(serializers.ModelSerializer):
    checklist = ChecklistResumoSerializer(read_only=True, allow_null=True)

    class Meta:
        model = OrdemServico
        fields = ['id', 'status', 'km_atual', 'criado_em', 'checklist']

class FuncionarioSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(read_only=True)
    email = serializers.EmailField(source='user.email')
    nome = serializers.CharField(source='user.get_full_name', read_only=True)
    primeiro_nome = serializers.CharField(source='user.first_name', required=False, allow_blank=True)
    ultimo_nome = serializers.CharField(source='user.last_name', required=False, allow_blank=True)
    password = serializers.CharField(
        write_only=True, required=False, allow_blank=True, min_length=8,
        help_text="Senha do funcionário (mínimo 8 caracteres). Obrigatória na criação."
    )

    class Meta:
        model = Funcionario
        fields = [
            'id', 'email', 'nome', 'primeiro_nome', 'ultimo_nome',
            'permissao', 'is_active', 'password', 'criado_em',
        ]
        read_only_fields = ['criado_em']

    def validate(self, attrs):
        is_create = self.instance is None
        user_data = attrs.get("user", {}) or {}
        email = (user_data.get("email") or "").strip().lower()

        if is_create:
            if not email:
                raise serializers.ValidationError({"email": "E-mail é obrigatório."})
            if User.objects.filter(email__iexact=email).exists() or \
               User.objects.filter(username__iexact=email).exists():
                raise serializers.ValidationError(
                    {"email": "Já existe um usuário com este e-mail."}
                )
            senha = attrs.get("password") or ""
            if len(senha) < 8:
                raise serializers.ValidationError(
                    {"password": "Informe uma senha com no mínimo 8 caracteres."}
                )

        # Em edição, password vazio significa "manter a atual"
        if not is_create and attrs.get("password") == "":
            attrs.pop("password", None)

        return attrs

    def create(self, validated_data):
        # Enforce limite de usuários por plano antes de criar o User
        # — evita ficar com um auth.User "órfão" no banco caso a regra
        # SaaS bloqueie a criação do Funcionario.
        from .services.plano_service import assegurar_pode_criar_funcionario
        oficina = validated_data.get("oficina")
        if oficina is not None:
            try:
                assegurar_pode_criar_funcionario(oficina)
            except ValueError as exc:
                raise serializers.ValidationError({"plano": str(exc)})

        user_data = validated_data.pop('user')
        senha = validated_data.pop('password', None)
        email = (user_data.get('email') or "").strip().lower()
        first_name = user_data.get('first_name', '') or ''
        last_name = user_data.get('last_name', '') or ''

        user = User.objects.create_user(
            username=email,
            email=email,
            password=senha,
            first_name=first_name,
            last_name=last_name,
        )
        return Funcionario.objects.create(user=user, **validated_data)

    def update(self, instance, validated_data):
        user_data = validated_data.pop('user', None) or {}
        senha = validated_data.pop('password', None)

        # Reativação consome uma "vaga" do plano — checa antes
        reativando = (
            validated_data.get("is_active") is True
            and instance.is_active is False
        )
        if reativando:
            from .services.plano_service import assegurar_pode_reativar
            try:
                assegurar_pode_reativar(instance.oficina, instance)
            except ValueError as exc:
                raise serializers.ValidationError({"plano": str(exc)})

        if user_data or senha:
            user = instance.user
            if user_data.get('email'):
                novo_email = user_data['email'].strip().lower()
                if novo_email and novo_email != user.email:
                    if User.objects.filter(email__iexact=novo_email).exclude(pk=user.pk).exists():
                        raise serializers.ValidationError(
                            {"email": "Já existe um usuário com este e-mail."}
                        )
                    user.email = novo_email
                    user.username = novo_email
            if 'first_name' in user_data:
                user.first_name = user_data.get('first_name') or ''
            if 'last_name' in user_data:
                user.last_name = user_data.get('last_name') or ''
            if senha:
                user.set_password(senha)
            user.save()

        return super().update(instance, validated_data)

# ==========================================
# 5. MANUTENCAO PREVENTIVA
# ==========================================

class ManutencaoPreventivaSerializer(serializers.ModelSerializer):
    veiculo_placa = serializers.CharField(source='veiculo.placa', read_only=True)
    veiculo_modelo = serializers.CharField(source='veiculo.modelo', read_only=True)
    class Meta:
        model = ManutencaoPreventiva
        fields = '__all__'
        read_only_fields = ['veiculo', 'os_gerada', 'criado_em', 'atualizado_em']
