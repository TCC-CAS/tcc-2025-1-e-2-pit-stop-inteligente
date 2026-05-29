"""Modelos exclusivos do painel administrativo SaaS.

Estes modelos são internos do `modulo_adm` — não pertencem ao domínio
de oficina e não são manipulados por funcionários comuns. Somente
superusuários acessam.
"""
import hashlib
import re

from django.conf import settings
from django.db import models
from django.utils import timezone


class AuditoriaLog(models.Model):
    """Registro detalhado de ações sensíveis do painel administrativo.

    Recebemos um payload livre (`metadados`) em JSON para que cada
    serviço descreva o que mudou sem precisarmos criar modelos por ação.
    """

    NIVEL_CHOICES = [
        ("info", "Informativo"),
        ("warning", "Atenção"),
        ("critico", "Crítico"),
    ]

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="auditorias_admin",
    )
    nivel = models.CharField(max_length=10, choices=NIVEL_CHOICES, default="info")
    acao = models.CharField(max_length=80)
    recurso = models.CharField(max_length=60, blank=True)
    recurso_id = models.CharField(max_length=40, blank=True)
    descricao = models.CharField(max_length=255)
    metadados = models.JSONField(blank=True, null=True)
    ip = models.GenericIPAddressField(blank=True, null=True)
    user_agent = models.CharField(max_length=255, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "adm_auditoria_log"
        ordering = ("-criado_em",)
        indexes = [
            models.Index(fields=("-criado_em",)),
            models.Index(fields=("acao",)),
            models.Index(fields=("recurso", "recurso_id")),
        ]

    def __str__(self):
        return f"{self.criado_em:%Y-%m-%d %H:%M} · {self.acao}"


class Notificacao(models.Model):
    """Central de notificações da equipe administrativa.

    Cada registro é uma notificação destinada à equipe (staff/superuser).
    A inserção é feita pelos services (ex.: cliente acessou OS, alguém
    solicitou redefinição de senha), via `Notificacao.criar(...)`.
    """

    TIPO_CHOICES = [
        ("acesso_cliente", "Acesso de cliente à OS"),
        ("reset_senha", "Pedido de redefinição de senha"),
        ("os_aprovada", "OS aprovada pelo cliente"),
        ("os_rejeitada", "Item rejeitado pelo cliente"),
        ("backup", "Backup do banco"),
        ("oficina_inativada", "Oficina inativada"),
        ("info", "Informativo"),
        # Solicitações vindas da tela pública "Recuperar acesso" do front:
        ("recuperar_oficina", "Recuperação de acesso (oficina)"),
        ("recuperar_cliente", "Recuperação de acesso (cliente)"),
    ]
    NIVEL_CHOICES = [
        ("info", "Informativo"),
        ("warning", "Atenção"),
        ("critico", "Crítico"),
    ]

    tipo = models.CharField(max_length=30, choices=TIPO_CHOICES, default="info")
    nivel = models.CharField(max_length=10, choices=NIVEL_CHOICES, default="info")
    titulo = models.CharField(max_length=160)
    mensagem = models.TextField(blank=True)
    link = models.CharField(max_length=255, blank=True)
    metadados = models.JSONField(blank=True, null=True)

    lida = models.BooleanField(default=False)
    lida_em = models.DateTimeField(blank=True, null=True)
    destinatario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="notificacoes_admin",
        help_text=(
            "Quando informado, a notificação aparece apenas para esse usuário. "
            "Caso contrário, é visível para todos os staff/superuser."
        ),
    )
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "adm_notificacao"
        ordering = ("-criado_em",)
        indexes = [
            models.Index(fields=("-criado_em",)),
            models.Index(fields=("lida",)),
            models.Index(fields=("destinatario", "-criado_em")),
        ]

    def __str__(self):
        return f"{self.tipo} · {self.titulo}"

    @classmethod
    def criar(cls, tipo, titulo, mensagem="", *, nivel="info", link="",
              metadados=None, destinatario=None):
        return cls.objects.create(
            tipo=tipo,
            nivel=nivel,
            titulo=titulo,
            mensagem=mensagem,
            link=link,
            metadados=metadados,
            destinatario=destinatario,
        )

    def marcar_como_lida(self):
        if not self.lida:
            self.lida = True
            self.lida_em = timezone.now()
            self.save(update_fields=["lida", "lida_em"])


class ConfiguracaoGlobal(models.Model):
    """Singleton-style: chave/valor para parâmetros globais da aplicação.

    Em vez de uma tabela única com colunas específicas, mantemos um
    armazenamento key-value para que novas chaves sejam adicionadas sem
    migração. Use `ConfiguracaoGlobal.obter("chave", default)` no código.
    """

    chave = models.CharField(max_length=80, unique=True)
    valor = models.JSONField(blank=True, null=True)
    descricao = models.CharField(max_length=255, blank=True)
    atualizado_em = models.DateTimeField(auto_now=True)
    atualizado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="configuracoes_atualizadas",
    )

    class Meta:
        db_table = "adm_configuracao_global"
        ordering = ("chave",)

    def __str__(self):
        return self.chave

    @classmethod
    def obter(cls, chave, default=None):
        try:
            return cls.objects.get(chave=chave).valor
        except cls.DoesNotExist:
            return default

    @classmethod
    def definir(cls, chave, valor, usuario=None, descricao=""):
        obj, _ = cls.objects.update_or_create(
            chave=chave,
            defaults={
                "valor": valor,
                "atualizado_por": usuario,
                "descricao": descricao or "",
            },
        )
        return obj


# ---------------------------------------------------------------------------
# Production Health — captura de erros em produção
# ---------------------------------------------------------------------------

# Padrões frequentes em stack traces / paths que adicionam ruído sem
# contribuir para a identidade do erro (linha de código, hex em IDs, etc.).
_PADROES_FINGERPRINT = [
    (re.compile(r"\b0x[0-9a-fA-F]+\b"), "0xADDR"),     # endereços de memória
    (re.compile(r"\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}"), "<ts>"),  # timestamps
    (re.compile(r"/\d+(?=/|$)"), "/<id>"),             # números de id em paths
    (re.compile(r"line \d+"), "line <n>"),             # nº de linha — varia entre versões
]


def gerar_fingerprint(*partes: str) -> str:
    """Calcula um SHA-256 truncado para agrupar erros semelhantes.

    Recebe partes textuais (tipo de exceção, mensagem, frame top, endpoint
    etc.), normaliza pra remover variações superficiais e retorna 16 chars.
    Dois eventos com o mesmo fingerprint são *o mesmo bug*, mesmo que tenham
    payloads diferentes.
    """
    bruto = "|".join(p or "" for p in partes)
    for regex, sub in _PADROES_FINGERPRINT:
        bruto = regex.sub(sub, bruto)
    bruto = bruto.lower().strip()
    return hashlib.sha256(bruto.encode("utf-8", errors="ignore")).hexdigest()[:16]


class GrupoErroProducao(models.Model):
    """Agregação de eventos de erro pelo mesmo fingerprint.

    Cada erro com a mesma stack + endpoint vira *um* grupo. Detalhes
    individuais (request id, payload, version, etc.) vivem em
    `EventoErroProducao`, que aponta para o grupo.

    Foi modelado pensando em volume: o grupo é o que aparece no feed,
    e o detalhe é puxado sob demanda quando o suporte clica.
    """

    SEVERIDADE_CHOICES = [
        ("info", "Informativo"),
        ("warning", "Atenção"),
        ("error", "Erro"),
        ("critical", "Crítico"),
    ]
    STATUS_CHOICES = [
        ("aberto", "Aberto"),
        ("monitorando", "Monitorando"),
        ("silenciado", "Silenciado"),
        ("resolvido", "Resolvido"),
    ]

    fingerprint = models.CharField(max_length=32, unique=True, db_index=True)
    titulo = models.CharField(
        max_length=255,
        help_text="Resumo curto e amigável do erro ('Falha ao gerar boleto', etc.)",
    )
    mensagem_tecnica = models.TextField(
        help_text="Mensagem original da exceção. Usada para debug.",
    )
    tipo_excecao = models.CharField(max_length=120, blank=True, db_index=True)
    endpoint = models.CharField(max_length=255, blank=True, db_index=True)
    metodo_http = models.CharField(max_length=10, blank=True)
    servico = models.CharField(
        max_length=80, blank=True, db_index=True,
        help_text="Componente lógico (ex.: 'modulo_oficina', 'auth', 'boletos').",
    )
    severidade = models.CharField(
        max_length=10, choices=SEVERIDADE_CHOICES, default="error",
    )
    status = models.CharField(
        max_length=12, choices=STATUS_CHOICES, default="aberto", db_index=True,
    )
    ambiente = models.CharField(
        max_length=20, blank=True, default="producao",
        help_text="producao | homologacao | desenvolvimento",
    )

    total_eventos = models.PositiveIntegerField(default=0)
    usuarios_afetados = models.PositiveIntegerField(default=0)

    primeira_ocorrencia = models.DateTimeField(default=timezone.now)
    ultima_ocorrencia = models.DateTimeField(default=timezone.now)

    silenciado_ate = models.DateTimeField(blank=True, null=True)
    silenciado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="grupos_erro_silenciados",
    )
    resolvido_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="grupos_erro_resolvidos",
    )
    resolvido_em = models.DateTimeField(blank=True, null=True)

    versao_app = models.CharField(max_length=50, blank=True)
    metadados = models.JSONField(blank=True, null=True)

    class Meta:
        db_table = "adm_grupo_erro_producao"
        ordering = ("-ultima_ocorrencia",)
        indexes = [
            models.Index(fields=("-ultima_ocorrencia",)),
            models.Index(fields=("status", "-ultima_ocorrencia")),
            models.Index(fields=("severidade",)),
            models.Index(fields=("ambiente", "-ultima_ocorrencia")),
        ]

    def __str__(self):
        return f"{self.tipo_excecao or 'Erro'} · {self.endpoint or '?'}"

    @property
    def silenciado_ativo(self):
        if self.status != "silenciado":
            return False
        return not self.silenciado_ate or self.silenciado_ate > timezone.now()


class EventoSeguranca(models.Model):
    """Eventos de segurança detectados (tentativas suspeitas, blocks, etc.).

    Cada categoria de evento é uma "categoria" lógica:
      - login_falha: senha errada
      - login_lockout: conta bloqueada temporariamente após N falhas
      - rate_limit: requisições demais em janela curta
      - honeypot: bot preencheu campo invisível
      - user_agent_suspeito: UA conhecidamente automatizado (curl, scanner)
      - ip_bloqueado: IP banido após acumular violações
      - 4xx_anomalo: muitos 401/403/404 do mesmo IP em sequência

    O painel admin agrega esses eventos para identificar ataques em
    andamento (picos de tentativas, mesmo IP em vários hosts, etc.).
    """

    CATEGORIA_CHOICES = [
        ("login_falha", "Falha de login"),
        ("login_lockout", "Login bloqueado temporariamente"),
        ("rate_limit", "Limite de requisições excedido"),
        ("honeypot", "Honeypot acionado (bot)"),
        ("user_agent_suspeito", "User-Agent suspeito"),
        ("ip_bloqueado", "IP bloqueado"),
        ("4xx_anomalo", "Padrão anômalo de 4xx"),
        ("cliente_chave_invalida", "Tentativa inválida no portal do cliente"),
        ("recuperacao_abuso", "Abuso no formulário de recuperação"),
    ]
    SEVERIDADE_CHOICES = [
        ("info", "Informativo"),
        ("warning", "Atenção"),
        ("critical", "Crítico"),
    ]

    categoria = models.CharField(max_length=40, choices=CATEGORIA_CHOICES, db_index=True)
    severidade = models.CharField(max_length=10, choices=SEVERIDADE_CHOICES, default="warning")
    ip = models.GenericIPAddressField(blank=True, null=True, db_index=True)
    user_agent = models.CharField(max_length=255, blank=True)
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="eventos_seguranca",
    )
    # Identificador genérico do "alvo" da tentativa (email tentado, etc.)
    alvo = models.CharField(max_length=255, blank=True, db_index=True)
    endpoint = models.CharField(max_length=255, blank=True)
    metadados = models.JSONField(blank=True, null=True)
    criado_em = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "adm_evento_seguranca"
        ordering = ("-criado_em",)
        indexes = [
            models.Index(fields=("categoria", "-criado_em")),
            models.Index(fields=("ip", "-criado_em")),
        ]

    def __str__(self):
        return f"{self.get_categoria_display()} · {self.ip or '?'} · {self.criado_em:%H:%M}"


class EventoErroProducao(models.Model):
    """Ocorrência individual associada a um GrupoErroProducao.

    Mantemos os N eventos mais recentes (rotação feita pelo service para
    não estourar a tabela). Cada evento traz o request_id e payload da
    falha — informações essenciais para o suporte correlacionar com
    outras ferramentas.
    """

    grupo = models.ForeignKey(
        GrupoErroProducao,
        on_delete=models.CASCADE,
        related_name="eventos",
    )
    request_id = models.CharField(max_length=80, blank=True, db_index=True)
    trace_id = models.CharField(max_length=80, blank=True, db_index=True)

    metodo_http = models.CharField(max_length=10, blank=True)
    caminho = models.CharField(max_length=255, blank=True)
    status_http = models.PositiveSmallIntegerField(blank=True, null=True)
    tempo_resposta_ms = models.PositiveIntegerField(blank=True, null=True)

    ip = models.GenericIPAddressField(blank=True, null=True)
    user_agent = models.CharField(max_length=255, blank=True)
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="eventos_erro_producao",
    )

    payload_sanitizado = models.JSONField(blank=True, null=True)
    stack_trace = models.TextField(blank=True)

    versao_app = models.CharField(max_length=50, blank=True)
    pod = models.CharField(max_length=80, blank=True)
    deploy_recente = models.BooleanField(default=False)

    criado_em = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "adm_evento_erro_producao"
        ordering = ("-criado_em",)
        indexes = [
            models.Index(fields=("grupo", "-criado_em")),
            models.Index(fields=("request_id",)),
        ]

    def __str__(self):
        return f"Evt #{self.id} · grupo {self.grupo_id}"
