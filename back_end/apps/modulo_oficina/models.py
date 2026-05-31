from django.db import models
from django.conf import settings
from django.contrib.postgres.fields import ArrayField

# ==========================================
# ADMINISTRATIVO (SAAS)
# ==========================================

class Oficina(models.Model):
    PLANOS_CHOICES = [
        ('basico', 'Básico'),
        ('premium', 'Premium'),
    ]

    ESPECIALIDADE_CHOICES = [                     
        ('geral', 'Mecânica Geral'),
        ('eletrica', 'Elétrica'),
        ('funilaria', 'Funilaria e Pintura'),
    ]

    DIAS_CHOICES = [                                   
        ('seg', 'Segunda-feira'),
        ('ter', 'Terça-feira'),
        ('qua', 'Quarta-feira'),
        ('qui', 'Quinta-feira'),
        ('sex', 'Sexta-feira'),
        ('sab', 'Sábado'),
        ('dom', 'Domingo'),
    ]

    nome = models.CharField(max_length=255)
    cnpj = models.CharField(max_length=20, unique=True)
    email = models.EmailField(blank=True, null=True)
    telefone = models.CharField(max_length=20, blank=True, null=True)
    
   
    especialidade = models.CharField(max_length=100, choices=ESPECIALIDADE_CHOICES, blank=True, null=True)

    horario_abertura = models.TimeField(blank=True, null=True)
    horario_fechamento = models.TimeField(blank=True, null=True)
    dias_funcionamento = ArrayField(models.CharField(max_length=3, choices=DIAS_CHOICES), blank=True, null=True, default=list)       
    # ImageField para validar que é realmente uma imagem
    logo = models.ImageField(upload_to='logos_oficina/', blank=True, null=True)
    cep = models.CharField(max_length=10, blank=True, null=True)
    logradouro = models.CharField(max_length=255, blank=True, null=True)
    numero = models.CharField(max_length=20, blank=True, null=True)
    complemento = models.CharField(max_length=100, blank=True, null=True)
    bairro = models.CharField(max_length=100, blank=True, null=True)
    cidade = models.CharField(max_length=100, blank=True, null=True)

    
    estado = models.CharField(max_length=2, blank=True, null=True)
    
    plano_atual = models.CharField(max_length=20, choices=PLANOS_CHOICES, default='basico')
    
    # Auditoria
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'oficina'
        verbose_name = 'Oficina'

    def __str__(self):
        return self.nome


class OficinaLimitesOverride(models.Model):
    """Limites SaaS customizados por oficina.

    O default vem das `ConfiguracaoGlobal` (`limite_<recurso>_<plano>`).
    Este modelo permite ao admin SaaS sobrescrever individualmente — útil
    para clientes em piloto, acordos comerciais, contas internas, etc.

    Campo `None`/`null` significa "usar o default do plano". Apenas valores
    explicitamente preenchidos sobrescrevem.
    """

    oficina = models.OneToOneField(
        Oficina,
        on_delete=models.CASCADE,
        related_name="limites_override",
    )
    limite_usuarios = models.PositiveIntegerField(
        blank=True, null=True,
        help_text="Sobrescreve `limite_usuarios_<plano>` para esta oficina.",
    )
    limite_os_mensal = models.PositiveIntegerField(
        blank=True, null=True,
        help_text="Sobrescreve `limite_os_mensal_<plano>` para esta oficina.",
    )
    limite_storage_mb = models.PositiveIntegerField(
        blank=True, null=True,
        help_text="Sobrescreve `limite_storage_mb_<plano>` para esta oficina.",
    )
    motivo = models.CharField(
        max_length=255, blank=True,
        help_text="Justificativa para auditoria (ex.: 'piloto comercial', 'TCC').",
    )
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)
    atualizado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="overrides_oficina",
    )

    class Meta:
        db_table = "oficina_limites_override"

    def __str__(self):
        return f"Override {self.oficina.nome}"

# ==========================================
# PRECIFICAÇÃO E CATÁLOGO DE SERVIÇOS
# ==========================================

class ConfigPreco(models.Model):

    oficina = models.OneToOneField(Oficina, on_delete=models.CASCADE, related_name='config_preco')

    valor_hora_mecanico = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)

    # Categorias de Veículo
    percentual_popular = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    percentual_eletrico = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    percentual_luxo = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    percentual_esportivo = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    percentual_utilitario = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    percentual_minivan = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)

    # Auditoria
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'config_preco'


class CategoriaVeiculoCustom(models.Model):
    """Categoria de veículo personalizada criada pela oficina ("Outros").

    As 6 categorias fixas (popular, elétrico, luxo, esportivo, utilitário,
    minivan) ficam em colunas de `ConfigPreco` por questão histórica. Quando
    a oficina precisar de categorias adicionais — frota agrícola, motos
    customizadas, caminhões — cria entradas neste modelo.

    O endpoint /categorias/ agrega as 6 fixas + N custom em uma lista única
    para o front, mantendo a UI homogênea.
    """

    oficina = models.ForeignKey(
        Oficina,
        on_delete=models.CASCADE,
        related_name='categorias_custom',
    )
    nome = models.CharField(max_length=80)
    percentual = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    icone = models.CharField(
        max_length=40, default='fa-circle-plus',
        help_text='Classe Font Awesome (ex: "fa-tractor", "fa-motorcycle").',
    )
    cor = models.CharField(
        max_length=20, default='#64748b',
        help_text='Cor hex usada para o card no painel de preços.',
    )
    ativa = models.BooleanField(default=True)

    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'categoria_veiculo_custom'
        ordering = ('nome',)
        unique_together = ('oficina', 'nome')

    def __str__(self):
        return f"{self.nome} ({self.oficina.nome})"

class Servico(models.Model):

    oficina = models.ForeignKey(Oficina, on_delete=models.CASCADE, related_name='catalogo_servicos')

    nome = models.CharField(max_length=255)
    descricao = models.TextField(blank=True, null=True)
    tempo_estimado = models.DecimalField(max_digits=5, decimal_places=2) # Em horas (ex: 1.5 Hrs)
    # Preço sugerido base — opcional. Usado para pré-preencher o valor
    # unitário quando o serviço é adicionado ao orçamento.
    preco_sugerido = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        help_text="Preço sugerido (R$) usado como sugestão no orçamento.",
    )

    # Auditoria
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'servico'

    def __str__(self):
        return self.nome

# ==========================================
# CLIENTE E VEÍCULO
# ==========================================

class Cliente(models.Model):

    oficina = models.ForeignKey(Oficina, on_delete=models.CASCADE, related_name='clientes')
    nome = models.CharField(max_length=255)
    cpf_cnpj = models.CharField(max_length=20)
    telefone = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)

    cep = models.CharField(max_length=10, blank=True, null=True)
    logradouro = models.CharField(max_length=255, blank=True, null=True)
    numero = models.CharField(max_length=20, blank=True, null=True)
    complemento = models.CharField(max_length=100, blank=True, null=True)
    bairro = models.CharField(max_length=100, blank=True, null=True)
    cidade = models.CharField(max_length=100, blank=True, null=True)
    estado = models.CharField(max_length=2, blank=True, null=True)

    # --- Preferências de Contato ---
    contato_whatsapp = models.BooleanField(default=False)
    contato_email = models.BooleanField(default=False)
    contato_sms = models.BooleanField(default=False)
    
    # Auditoria
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'cliente'
        unique_together = ('oficina', 'cpf_cnpj')

    def __str__(self):
        return self.nome

class Veiculo(models.Model): 

    TIPO_USO_CHOICES = [
        ('particular', 'Particular'),
        ('comercial', 'Comercial/Frota'),
    ]

    cliente = models.ForeignKey(Cliente, on_delete=models.CASCADE, related_name='veiculos')
    
    placa = models.CharField(max_length=10)
    marca = models.CharField(max_length=100, blank=True, null=True) # Novo campo
    modelo = models.CharField(max_length=100)
    ano = models.CharField(max_length=4, blank=True, null=True)
    cor = models.CharField(max_length=50, blank=True, null=True)
    chassi = models.CharField(max_length=50, blank=True, null=True) # Novo campo
    tipo_uso = models.CharField(max_length=20, choices=TIPO_USO_CHOICES, default='particular') # Novo campo

    
    # Auditoria
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'veiculo'

    def __str__(self):
        return f"{self.modelo} - {self.placa}"

# ==========================================
# ORDEM DE SERVIÇO
# ==========================================

class OrdemServico(models.Model):
    STATUS_CHOICES = [
        ('pendente', 'Pendente'),
        ('execucao', 'Em Execução'),
        ('concluido', 'Concluído'),
    ]
    
    oficina = models.ForeignKey(Oficina, on_delete=models.CASCADE, related_name='ordens_servico')
    cliente = models.ForeignKey(Cliente, on_delete=models.CASCADE, related_name='ordens_servico')
    veiculo = models.ForeignKey(Veiculo, on_delete=models.CASCADE, related_name='ordens_servico')
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pendente')
    km_atual = models.IntegerField(blank=True, null=True)
    
    # Auditoria
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'ordem_servico'

class ChecklistRecebimento(models.Model):
    NIVEL_COMBUSTIVEL_CHOICES = [
        ('reserva', 'Reserva'),
        ('1/4', '1/4'),
        ('1/2', '1/2 (Meio Tanque)'),
        ('3/4', '3/4'),
        ('cheio', 'Cheio')
    ]

    NIVEL_OLEO_CHOICES = [
        ('ok', 'Nível Normal'),
        ('low', 'Baixo'),
        ('crit', 'Crítico/Vazio')
    ]

    FLUIDO_ARREFECIMENTO_CHOICES = [
        ('ok', 'Nível Normal'),
        ('low', 'Baixo')
    ]

    os = models.OneToOneField(OrdemServico, on_delete=models.CASCADE, related_name='checklist')
    concluido = models.BooleanField(default=False)
    
    # --- Passo 1: Informações Iniciais ---
    data_recebimento = models.DateField(blank=True, null=True)
    consultor = models.CharField(max_length=255, blank=True, null=True)
    nivel_combustivel = models.CharField(max_length=20, choices=NIVEL_COMBUSTIVEL_CHOICES, blank=True, null=True)
    observacoes_iniciais = models.TextField(blank=True, null=True)

    # --- Passo 2: Inspeção Externa ---
    lataria_pintura = models.TextField(blank=True, null=True)
    vidros_farois = models.TextField(blank=True, null=True)

    # --- Passo 3: Inspeção Interna ---
    possui_manual = models.BooleanField(default=False)
    possui_estepe_macaco = models.BooleanField(default=False)
    observacoes_internas = models.TextField(blank=True, null=True)

    # --- Passo 4: Mecânica ---
    nivel_oleo = models.CharField(max_length=20, choices=NIVEL_OLEO_CHOICES, default='ok')
    fluido_arrefecimento = models.CharField(max_length=20, choices=FLUIDO_ARREFECIMENTO_CHOICES, default='ok')
    observacoes_mecanica = models.TextField(blank=True, null=True)

    # --- Passo 6: Assinaturas ---
    assinatura_cliente = models.TextField(blank=True, null=True)
    assinatura_tecnico = models.TextField(blank=True, null=True)
    
    # Auditoria
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'checklist_recebimento'

class ItemOrcamento(models.Model):
    TIPO_CHOICES = [('peca', 'Peça'), ('servico', 'Serviço')]
    STATUS_APROVACAO = [
        ('pendente', 'Pendente'),
        ('aprovado', 'Aprovado'),
        ('reprovado', 'Reprovado'),
    ]

    os = models.ForeignKey(OrdemServico, on_delete=models.CASCADE, related_name='itens_orcamento')
    
    # Fica null=True para permitir peças ou serviços "avulsos" (que não estão no catálogo)
    servico_catalogo = models.ForeignKey(Servico, on_delete=models.SET_NULL, null=True, blank=True)


    tipo = models.CharField(max_length=10, choices=TIPO_CHOICES)
    nome_descricao = models.CharField(max_length=255)
    quantidade = models.IntegerField(default=1)
    valor_unitario = models.DecimalField(max_digits=10, decimal_places=2)
    categoria_veiculo = models.CharField(max_length=50, blank=True, null=True) # Antigo "dificuldade"
    
    status_aprovacao = models.CharField(max_length=20, choices=STATUS_APROVACAO, default='pendente')

    # Auditoria
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'item_orcamento'

class TarefaExecucao(models.Model):

    STATUS_CHOICES = [
        ('pendente', 'Pendente'),
        ('execucao', 'Em Execução'),
        ('concluido', 'Concluído'),
    ]

    os = models.ForeignKey(OrdemServico, on_delete=models.CASCADE, related_name='tarefas')

    descricao = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pendente')

    # Atribuição: múltiplos responsáveis (mecânicos) podem ser alocados na
    # mesma tarefa. Quando vazia, qualquer técnico pode pegar.
    responsaveis = models.ManyToManyField(
        'Funcionario',
        blank=True,
        related_name='tarefas_atribuidas',
        help_text='Funcionários responsáveis pela execução desta tarefa.',
    )

    # Tempo: estimativa em horas (vem da tarefa padrão do serviço quando
    # gerada automaticamente) e marcações de início/fim para calcular o
    # tempo gasto real.
    tempo_estimado_h = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        help_text='Tempo estimado em horas.',
    )
    iniciada_em = models.DateTimeField(blank=True, null=True)
    concluida_em = models.DateTimeField(blank=True, null=True)
    tempo_gasto_minutos = models.PositiveIntegerField(
        default=0,
        help_text='Tempo gasto real em minutos. Calculado quando a tarefa é concluída.',
    )

    # Auditoria
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tarefa_execucao'

    def __str__(self):
        return f"{self.descricao} ({self.get_status_display()})"


class ServicoTarefaPadrao(models.Model):
    """Tarefa-padrão associada a um Servico do catálogo.

    Quando o cliente aprova um item de orçamento que aponta para um
    `Servico`, criamos automaticamente uma `TarefaExecucao` para cada
    `ServicoTarefaPadrao` ativo do serviço — assim o mecânico já encontra
    o checklist pronto na aba Execução.

    Exemplo:
        Servico("Troca de óleo") tem tarefas padrão:
          ordem=1 "Remover óleo antigo" · 0.5h · obrigatória
          ordem=2 "Substituir filtro"   · 0.3h · obrigatória
          ordem=3 "Adicionar novo óleo" · 0.4h · obrigatória
    """

    servico = models.ForeignKey(
        Servico,
        on_delete=models.CASCADE,
        related_name='tarefas_padrao',
    )
    descricao = models.CharField(max_length=255)
    ordem = models.PositiveSmallIntegerField(
        default=0,
        help_text='Ordem de exibição/execução dentro do serviço.',
    )
    tempo_estimado_h = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        help_text='Tempo estimado em horas para esta tarefa.',
    )
    obrigatoria = models.BooleanField(
        default=True,
        help_text='Quando True, marca o checklist como obrigatório.',
    )
    ativa = models.BooleanField(
        default=True,
        help_text='Quando False, deixa de ser usada para popular novas OS.',
    )

    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'servico_tarefa_padrao'
        ordering = ('servico', 'ordem', 'id')
        indexes = [
            models.Index(fields=('servico', 'ordem')),
        ]

    def __str__(self):
        return f"{self.servico.nome} · {self.descricao}"

class Documento(models.Model):
    ORIGEM_CHOICES = [
        ('checklist', 'Checklist Inicial'),
        ('geral', 'Anexo Geral (NF, Orçamento)'),
    ]

    CATEGORIA_CHOICES = [                     
        ('externo', 'Parte Externa'),
        ('interno', 'Parte Interna'),
        ('mecanica', 'Mecânica'),
    ]

    os = models.ForeignKey(OrdemServico, on_delete=models.CASCADE, related_name='documentos')
    
    arquivo = models.FileField(upload_to='documentos_os/')
    nome_arquivo = models.CharField(max_length=255, blank=True, null=True) 
    origem = models.CharField(max_length=20, choices=ORIGEM_CHOICES, default='geral')
    categoria = models.CharField(max_length=20, choices=CATEGORIA_CHOICES, blank=True, null=True)      
    
    # Auditoria 
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'documentos'

class HistoricoOS(models.Model):
    TIPO_CHOICES = [
        ('criacao', 'Criação'),
        ('checklist', 'Checklist'),
        ('diagnostico', 'Diagnóstico'),
        ('aprovacao', 'Aprovação'),
        ('execucao', 'Execução'),
        ('conclusao', 'Conclusão'),
        ('status', 'Mudança de Status'),
        ('default', 'Outros'),
    ]

    os = models.ForeignKey('OrdemServico', on_delete=models.CASCADE, related_name='historico')

    # Novos campos exigidos pelo Front-end:
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES, default='default')
    descricao = models.CharField(max_length=255) # O título do evento (Ex: "Orçamento Aprovado")
    detalhes = models.TextField(blank=True, null=True) # O texto longo opcional
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='historicos_os'
    )
    data_hora = models.DateTimeField(auto_now_add=True) # O JS do William espera este nome exato

    class Meta:
        db_table = 'historico_os'

    def __str__(self):
        return f"{self.os} - {self.descricao}"


# ==========================================
# GERENCIAMENTO DE USUÁRIOS DA OFICINA
# ==========================================

class ManutencaoPreventiva(models.Model):
    """Plano de manutenção preventiva associado a um veículo.

    Cada item representa uma manutenção esperada (ex.: troca de óleo a cada
    10.000 km / 6 meses). O sistema avisa quando o alvo é atingido (por
    quilometragem OU por data) e permite gerar uma OS diretamente a partir
    do plano.
    """

    PERIODICIDADE_CHOICES = [
        ("km", "Por quilometragem"),
        ("tempo", "Por tempo"),
        ("ambos", "Quilometragem ou tempo"),
    ]
    STATUS_CHOICES = [
        ("pendente", "Pendente"),
        ("agendado", "Agendado"),
        ("realizado", "Realizado"),
        ("vencido", "Vencido"),
    ]

    veiculo = models.ForeignKey(
        "Veiculo",
        on_delete=models.CASCADE,
        related_name="manutencoes_preventivas",
    )
    titulo = models.CharField(max_length=120)
    descricao = models.TextField(blank=True)
    periodicidade = models.CharField(
        max_length=10, choices=PERIODICIDADE_CHOICES, default="ambos",
    )
    intervalo_km = models.IntegerField(blank=True, null=True)
    intervalo_meses = models.IntegerField(blank=True, null=True)
    km_proxima = models.IntegerField(blank=True, null=True)
    data_proxima = models.DateField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pendente")
    ultima_revisao_em = models.DateField(blank=True, null=True)
    ultima_revisao_km = models.IntegerField(blank=True, null=True)
    os_gerada = models.ForeignKey(
        "OrdemServico",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="manutencoes_origem",
    )
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "manutencao_preventiva"
        ordering = ("data_proxima", "km_proxima")
        indexes = [
            models.Index(fields=("veiculo", "status")),
        ]

    def __str__(self):
        return f"{self.titulo} ({self.veiculo})"


class Funcionario(models.Model):
    PERMISSOES = [
        ('admin', 'Administrador'),
        ('gerente', 'Gerente'),
        ('mecanico', 'Mecânico'),
        ('atendente', 'Atendente'),
        ('visualizador', 'Visualizador'),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='funcionario_oficina'
    )
    oficina = models.ForeignKey(
        Oficina,
        on_delete=models.CASCADE,
        related_name='funcionarios'
    )
    permissao = models.CharField(max_length=20, choices=PERMISSOES, default='visualizador')
    is_active = models.BooleanField(default=True)

    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'funcionario'
        unique_together = ('oficina', 'user')

    def __str__(self):
        return f"{self.user.get_full_name() or self.user.email} - {self.oficina.nome}"


class TokenConfirmacaoEmail(models.Model):
    """Token de confirmação de e-mail enviado no cadastro.

    Cada novo cadastro gera UM token de 64 caracteres com validade de 72 h.
    O usuário clica no link recebido por e-mail, o endpoint
    `/api/oficina/auth/confirmar-email/<token>/` marca o token como usado
    e seta `Funcionario.email_verificado=True` para todos os vínculos do
    usuário.

    A regra de "bloqueio até confirmar" é controlada pela flag
    `EMAIL_CONFIRMACAO_OBRIGATORIA` em settings — quando False (padrão
    seguro para apresentações), o token é gerado e enviado mas o acesso
    não é bloqueado. Quando True, o middleware de paywall pode passar a
    bloquear contas com `email_verificado=False`.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='tokens_email',
    )
    token = models.CharField(max_length=64, unique=True, db_index=True)
    criado_em = models.DateTimeField(auto_now_add=True, db_index=True)
    expira_em = models.DateTimeField()
    usado_em = models.DateTimeField(blank=True, null=True)
    enviado_para = models.EmailField(blank=True)

    class Meta:
        db_table = 'token_confirmacao_email'
        ordering = ('-criado_em',)
        verbose_name = 'Token de confirmação de e-mail'
        verbose_name_plural = 'Tokens de confirmação de e-mail'

    def __str__(self):
        status = "usado" if self.usado_em else "pendente"
        return f"{self.user.email} · {status}"

    @property
    def expirado(self) -> bool:
        from django.utils import timezone
        return timezone.now() >= self.expira_em

    @property
    def valido(self) -> bool:
        return self.usado_em is None and not self.expirado


class RegistroCadastroIP(models.Model):
    """Rastreia cadastros públicos por origem para conter abuso.

    Cada novo cadastro de oficina via formulário público gera um registro
    aqui, com IP, User-Agent, User criado e Oficina criada. O serviço de
    registro consulta esta tabela antes de aceitar uma nova requisição —
    se o IP já criou contas além do limite na janela definida (24 h por
    padrão), a operação é rejeitada.
    """

    ip = models.GenericIPAddressField(db_index=True)
    user_agent = models.CharField(max_length=400, blank=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='registros_ip',
    )
    oficina = models.ForeignKey(
        Oficina,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='registros_ip',
    )
    criado_em = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'registro_cadastro_ip'
        ordering = ('-criado_em',)
        indexes = [
            models.Index(fields=('ip', '-criado_em')),
        ]
        verbose_name = 'Registro de cadastro por IP'
        verbose_name_plural = 'Registros de cadastro por IP'

    def __str__(self):
        quem = self.user.email if self.user_id else "(removido)"
        return f"{self.ip} -> {quem} em {self.criado_em:%Y-%m-%d %H:%M}"