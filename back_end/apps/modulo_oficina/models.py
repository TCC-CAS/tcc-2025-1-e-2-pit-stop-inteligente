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

class Servico(models.Model):
    
    oficina = models.ForeignKey(Oficina, on_delete=models.CASCADE, related_name='catalogo_servicos')

    nome = models.CharField(max_length=255)
    descricao = models.TextField(blank=True, null=True)
    tempo_estimado = models.DecimalField(max_digits=5, decimal_places=2) # Em horas (ex: 1.5 Hrs)
    
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
        # Evita clientes duplicados na mesma oficina
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
    
    # Auditoria
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tarefa_execucao'

class Documento(models.Model):
    ORIGEM_CHOICES = [
        ('checklist', 'Checklist Inicial'),
        ('geral', 'Anexo Geral (NF, Orçamento)'),
    ]
    
    os = models.ForeignKey(OrdemServico, on_delete=models.CASCADE, related_name='documentos')
    
    arquivo = models.FileField(upload_to='documentos_os/')
    nome_arquivo = models.CharField(max_length=255, blank=True, null=True) 
    origem = models.CharField(max_length=20, choices=ORIGEM_CHOICES, default='geral')
    
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