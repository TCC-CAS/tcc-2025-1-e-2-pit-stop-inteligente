from django.db import models
from django.conf import settings

# ==========================================================
# CHECKLIST
# ==========================================================
class ChecklistRecebimento(models.Model):
    os = models.OneToOneField('OrdemServico', models.DO_NOTHING, blank=True, null=True)
    concluido = models.BooleanField(blank=True, null=True)
    assinatura_cliente = models.TextField(blank=True, null=True)
    assinatura_tecnico = models.TextField(blank=True, null=True)
    criado_em = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'checklist_recebimento'


# ==========================================================
# CLIENTE
# ==========================================================
class Cliente(models.Model):
    nome = models.CharField(max_length=255, db_index=True)
    documento = models.CharField(max_length=20, unique=False, null=True, blank=True, db_index=True)
    telefone = models.CharField(max_length=20, blank=True, default='')
    email = models.EmailField(max_length=255, blank=True, default='')

    cep = models.CharField(max_length=10, blank=True, default='')
    logradouro = models.CharField(max_length=255, blank=True, default='')
    numero = models.CharField(max_length=20, blank=True, default='')
    complemento = models.CharField(max_length=100, blank=True, default='')
    bairro = models.CharField(max_length=100, blank=True, default='')
    cidade = models.CharField(max_length=100, blank=True, default='')
    estado = models.CharField(max_length=2, blank=True, default='')

    preferencias = models.JSONField(default=dict, blank=True)

    criado_em = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        managed = True
        db_table = 'cliente'
        ordering = ['-criado_em']

    def __str__(self):
        return f"{self.nome} ({self.documento})"


# ==========================================================
# DOCUMENTO OS
# ==========================================================
class DocumentoOs(models.Model):
    os = models.ForeignKey('OrdemServico', models.DO_NOTHING, blank=True, null=True)
    nome = models.CharField(max_length=255)
    arquivo = models.CharField(max_length=500)
    enviado_em = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'documento_os'


# ==========================================================
# FOTO CHECKLIST
# ==========================================================
class FotoChecklist(models.Model):
    checklist = models.ForeignKey(ChecklistRecebimento, models.DO_NOTHING, blank=True, null=True)
    imagem = models.CharField(max_length=500)
    criado_em = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'foto_checklist'


# ==========================================================
# ITEM ORÇAMENTO
# ==========================================================
class ItemOrcamento(models.Model):
    os = models.ForeignKey('OrdemServico', models.DO_NOTHING, blank=True, null=True)
    tipo = models.CharField(max_length=10, blank=True, null=True)
    nome_descricao = models.CharField(max_length=255)
    quantidade = models.IntegerField(blank=True, null=True)
    valor_unitario = models.DecimalField(max_digits=10, decimal_places=2)
    dificuldade = models.CharField(max_length=50, blank=True, null=True)
    status_aprovacao = models.CharField(max_length=20, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'item_orcamento'


# ==========================================================
# ORDEM DE SERVIÇO
# ==========================================================
class OrdemServico(models.Model):
    veiculo = models.ForeignKey('Veiculo', models.DO_NOTHING, blank=True, null=True)
    status = models.CharField(max_length=20, blank=True, null=True)
    km_atual = models.IntegerField()
    criado_em = models.DateTimeField(blank=True, null=True)
    atualizado_em = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'ordem_servico'


# ==========================================================
# EXECUÇÃO
# ==========================================================
class TarefaExecucao(models.Model):
    STATUS_CHOICES = [
        ('pendente', 'Pendente'),
        ('em_execucao', 'Em Execução'),
        ('concluido', 'Concluído'),
    ]

    os = models.ForeignKey('OrdemServico', on_delete=models.CASCADE, related_name='tarefas')
    descricao = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pendente')
    atualizado_em = models.DateTimeField(auto_now=True)

    @property
    def concluida(self):
        return self.status == 'concluido'

    def __str__(self):
        return f"{self.descricao} ({self.get_status_display()})"


# ==========================================================
# VEÍCULO
# ==========================================================
class Veiculo(models.Model):
    cliente = models.ForeignKey(Cliente, models.DO_NOTHING, blank=True, null=True)
    placa = models.CharField(unique=True, max_length=10)
    modelo = models.CharField(max_length=100)
    ano = models.IntegerField(blank=True, null=True)
    cor = models.CharField(max_length=50, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'veiculo'


# ==========================================================
# DOCUMENTOS DE UPLOAD
# ==========================================================
class Documento(models.Model):
    os = models.ForeignKey(OrdemServico, on_delete=models.CASCADE, related_name='documentos')
    arquivo = models.FileField(upload_to='documentos/os_%Y/%m/')
    nome = models.CharField(max_length=255)
    tipo = models.CharField(max_length=50, blank=True)
    data_inclusao = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.nome:
            self.nome = self.arquivo.name.split('/')[-1]
        if not self.tipo:
            self.tipo = self.arquivo.name.split('.')[-1].lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.nome


# ==========================================================
# HISTÓRICO
# ==========================================================
class HistoricoOS(models.Model):
    TIPO_CHOICES = [
        ('criacao', 'Criação'),
        ('checklist', 'Checklist'),
        ('diagnostico', 'Diagnóstico'),
        ('aprovacao', 'Aprovação'),
        ('execucao', 'Execução'),
        ('conclusao', 'Conclusão'),
        ('status', 'Mudança de Status'),
        ('default', 'Geral'),
    ]

    os = models.ForeignKey('OrdemServico', on_delete=models.CASCADE, related_name='historico')
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES, default='default')
    descricao = models.CharField(max_length=255)
    detalhes = models.TextField(blank=True, null=True)
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    data_hora = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'historico_os'
        ordering = ['-data_hora']

    def __str__(self):
        return f"{self.os} - {self.tipo} - {self.data_hora}"


# ==========================================================
# CONFIGURAÇÃO DA OFICINA
# ==========================================================
class ConfiguracaoOficina(models.Model):
    valor_hora = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Configuração da Oficina"
        verbose_name_plural = "Configurações da Oficina"

    def __str__(self):
        return f"Valor Hora: R$ {self.valor_hora}"


# ==========================================================
# CATEGORIA DO VEÍCULO
# ==========================================================
class CategoriaVeiculo(models.Model):
    nome = models.CharField(max_length=100, unique=True)
    percentual = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    icone = models.CharField(max_length=50, blank=True, default='fa-car')
    cor = models.CharField(max_length=20, blank=True, default='#22c55e')

    class Meta:
        verbose_name = "Categoria de Veículo"
        verbose_name_plural = "Categorias de Veículos"

    def __str__(self):
        return self.nome


# ==========================================================
# SERVIÇO
# ==========================================================
class Servico(models.Model):
    nome = models.CharField(max_length=255)
    descricao = models.TextField(blank=True, null=True)
    tempo = models.DecimalField(max_digits=5, decimal_places=2, help_text="Horas estimadas")
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Serviço"
        verbose_name_plural = "Serviços"

    def __str__(self):
        return self.nome