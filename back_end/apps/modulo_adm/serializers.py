"""Serializers do painel administrativo SaaS."""
from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.modulo_oficina.models import Funcionario, Oficina, OrdemServico

from .models import AuditoriaLog, ConfiguracaoGlobal, Notificacao


User = get_user_model()


# ---------------------------------------------------------------------------
# Oficinas
# ---------------------------------------------------------------------------

class OficinaAdminListaSerializer(serializers.ModelSerializer):
    """Listagem simplificada com indicadores agregados.

    Inclui status de pagamento (vigente/pendente/vencida/cancelada) e
    detalhes do último pagamento — visível no painel admin para decisão
    rápida sobre cobrança de cada oficina.
    """

    total_funcionarios = serializers.IntegerField(read_only=True)
    funcionarios_ativos = serializers.IntegerField(read_only=True)
    total_clientes = serializers.IntegerField(read_only=True)
    total_os = serializers.IntegerField(read_only=True)
    total_pagamentos_pagos = serializers.IntegerField(read_only=True)
    criado_em = serializers.DateTimeField(format="%d/%m/%Y", read_only=True)
    inativa = serializers.SerializerMethodField()

    # ---- Pagamento / Assinatura ----
    pagamento = serializers.SerializerMethodField()

    class Meta:
        model = Oficina
        fields = [
            "id", "nome", "cnpj", "email", "telefone",
            "cidade", "estado", "plano_atual",
            "total_funcionarios", "funcionarios_ativos",
            "total_clientes", "total_os",
            "total_pagamentos_pagos",
            "inativa", "criado_em",
            "pagamento",
        ]

    def get_inativa(self, obj):
        # Considera "inativa" quando há funcionários cadastrados mas todos
        # estão desativados (que é o efeito da ação "inativar oficina")
        total = getattr(obj, "total_funcionarios", None)
        ativos = getattr(obj, "funcionarios_ativos", None)
        if total is None or ativos is None:
            return False
        return total > 0 and ativos == 0

    def get_pagamento(self, obj):
        """Resumo do status financeiro: assinatura vigente + último pagamento.

        Retorna sempre um objeto não-nulo. Quando a oficina nunca teve
        assinatura registrada, o status fica "sem_assinatura" — útil para
        o painel admin destacar oficinas que ainda não pagaram.
        """
        # Assinatura vigente (via select_related no service)
        assinatura = getattr(obj, "assinatura", None)
        if assinatura is None:
            status_codigo = "sem_assinatura"
            status_label = "Sem assinatura"
            plano_nome = obj.plano_atual or "—"
            expira_em = None
        else:
            status_codigo = assinatura.status
            status_label = dict(assinatura.STATUS_CHOICES).get(
                assinatura.status, assinatura.status,
            )
            plano = assinatura.plano
            plano_nome = plano.nome if plano else (obj.plano_atual or "—")
            expira_em = assinatura.expira_em

        # Status agregado para a UI (semáforo verde/amarelo/vermelho/cinza)
        if status_codigo == "ativa":
            cor = "ok"
            resumo = "Aprovado"
        elif status_codigo in ("vencida", "cancelada"):
            cor = "erro"
            resumo = "Falha/Vencido"
        elif status_codigo == "sem_assinatura":
            cor = "neutro"
            resumo = "Sem cobrança"
        else:  # pendente
            cor = "atencao"
            resumo = "Pendente"

        # Sobreposição: se o último pagamento individual falhou,
        # destacamos como "falha" mesmo que a assinatura ainda esteja "ativa".
        ultimo_status = getattr(obj, "ultimo_pagamento_status", None)
        ultimo_em = getattr(obj, "ultimo_pagamento_em", None)
        ultimo_metodo = getattr(obj, "ultimo_pagamento_metodo", None) or ""
        if ultimo_status == "falha":
            cor = "erro"
            resumo = "Pagamento recusado"
        elif ultimo_status == "expirado" and status_codigo != "ativa":
            cor = "erro"
            resumo = "Cobrança expirou"

        return {
            "status": status_codigo,
            "status_label": status_label,
            "resumo": resumo,
            "cor": cor,
            "plano_nome": plano_nome,
            "expira_em": expira_em,
            "ultimo_pagamento_status": ultimo_status,
            "ultimo_pagamento_em": ultimo_em,
            "ultimo_pagamento_metodo": ultimo_metodo,
            "total_pagamentos_pagos": getattr(obj, "total_pagamentos_pagos", 0),
        }


class OficinaAdminDetalheSerializer(serializers.ModelSerializer):
    class Meta:
        model = Oficina
        fields = "__all__"


# ---------------------------------------------------------------------------
# Usuários
# ---------------------------------------------------------------------------

class _OficinaResumoSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    nome = serializers.CharField()
    permissao = serializers.CharField()


class UsuarioAdminSerializer(serializers.ModelSerializer):
    nome_completo = serializers.SerializerMethodField()
    vinculos = serializers.SerializerMethodField()
    ultimo_login = serializers.DateTimeField(source="last_login", format="%d/%m/%Y %H:%M", read_only=True)
    criado_em = serializers.DateTimeField(source="date_joined", format="%d/%m/%Y %H:%M", read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name", "nome_completo",
            "is_active", "is_staff", "is_superuser",
            "ultimo_login", "criado_em", "vinculos",
        ]
        read_only_fields = ["id", "criado_em", "ultimo_login"]

    def get_nome_completo(self, obj):
        return obj.get_full_name() or obj.username

    def get_vinculos(self, obj):
        funcs = getattr(obj, "_prefetch_funcionarios", None)
        if funcs is None:
            funcs = list(
                Funcionario.objects.filter(user=obj).select_related("oficina")
            )
        return [
            {
                "id": f.oficina.id,
                "nome": f.oficina.nome,
                "permissao": f.permissao,
                "is_active": f.is_active,
            }
            for f in funcs
        ]


class UsuarioCriacaoAdminSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    password = serializers.CharField(min_length=8, write_only=True)
    is_active = serializers.BooleanField(default=True)
    is_staff = serializers.BooleanField(default=False)
    is_superuser = serializers.BooleanField(default=False)
    oficina_id = serializers.IntegerField(required=False, allow_null=True)
    permissao = serializers.ChoiceField(
        choices=Funcionario.PERMISSOES, required=False, allow_blank=True
    )


# ---------------------------------------------------------------------------
# Ordens de Serviço
# ---------------------------------------------------------------------------

class OSAdminSerializer(serializers.ModelSerializer):
    cliente_nome = serializers.CharField(source="cliente.nome", read_only=True)
    oficina_nome = serializers.CharField(source="oficina.nome", read_only=True)
    veiculo_placa = serializers.CharField(source="veiculo.placa", read_only=True)
    veiculo_modelo = serializers.CharField(source="veiculo.modelo", read_only=True)
    criado_em = serializers.DateTimeField(format="%d/%m/%Y %H:%M", read_only=True)
    atualizado_em = serializers.DateTimeField(format="%d/%m/%Y %H:%M", read_only=True)

    class Meta:
        model = OrdemServico
        fields = [
            "id", "status", "km_atual", "criado_em", "atualizado_em",
            "cliente_nome", "oficina_nome", "veiculo_placa", "veiculo_modelo",
        ]


# ---------------------------------------------------------------------------
# Configurações globais
# ---------------------------------------------------------------------------

class ConfiguracaoGlobalSerializer(serializers.ModelSerializer):
    atualizado_por_nome = serializers.SerializerMethodField()
    # Metadados anexados pelo service.listar_configuracoes (ver categoria/tipo).
    tipo = serializers.SerializerMethodField()
    categoria = serializers.SerializerMethodField()
    ambiente = serializers.SerializerMethodField()

    class Meta:
        model = ConfiguracaoGlobal
        fields = [
            "id", "chave", "valor", "descricao",
            "tipo", "categoria", "ambiente",
            "atualizado_em", "atualizado_por_nome",
        ]
        read_only_fields = ["atualizado_em", "atualizado_por_nome", "tipo", "categoria", "ambiente"]

    def get_atualizado_por_nome(self, obj):
        if obj.atualizado_por:
            return obj.atualizado_por.get_full_name() or obj.atualizado_por.username
        return "Sistema"

    def get_tipo(self, obj):
        return getattr(obj, "_meta_tipo", "json")

    def get_categoria(self, obj):
        return getattr(obj, "_meta_categoria", "Outros")

    def get_ambiente(self, obj):
        return getattr(obj, "_meta_ambiente", "todos")


# ---------------------------------------------------------------------------
# Auditoria
# ---------------------------------------------------------------------------

class AuditoriaLogSerializer(serializers.ModelSerializer):
    usuario_nome = serializers.SerializerMethodField()
    criado_em = serializers.DateTimeField(format="%d/%m/%Y %H:%M:%S", read_only=True)

    class Meta:
        model = AuditoriaLog
        fields = [
            "id", "criado_em", "nivel", "acao",
            "recurso", "recurso_id", "descricao",
            "metadados", "ip", "user_agent", "usuario_nome",
        ]

    def get_usuario_nome(self, obj):
        if obj.usuario:
            return obj.usuario.get_full_name() or obj.usuario.username
        return "Sistema"


# ---------------------------------------------------------------------------
# Notificacoes
# ---------------------------------------------------------------------------

class NotificacaoSerializer(serializers.ModelSerializer):
    criado_em = serializers.DateTimeField(format="%d/%m/%Y %H:%M", read_only=True)
    lida_em = serializers.DateTimeField(format="%d/%m/%Y %H:%M", read_only=True, allow_null=True)

    class Meta:
        model = Notificacao
        fields = [
            "id", "tipo", "nivel", "titulo", "mensagem", "link",
            "metadados", "lida", "lida_em", "criado_em",
        ]
