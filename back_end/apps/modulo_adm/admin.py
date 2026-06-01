from django.contrib import admin
from django import forms
from apps.modulo_oficina.models import (
    Oficina, ConfigPreco, Servico, Cliente, Veiculo, 
    OrdemServico, ChecklistRecebimento, ItemOrcamento, 
    TarefaExecucao, Documento, HistoricoOS
)

# ==========================================
# INLINES (Formulários Aninhados)
# ==========================================

class ConfigPrecoInline(admin.StackedInline):
    model = ConfigPreco
    can_delete = False

class VeiculoInline(admin.TabularInline):
    model = Veiculo
    extra = 1 # Mostra 1 linha em branco por padrão para facilitar o cadastro

class ChecklistInline(admin.StackedInline):
    model = ChecklistRecebimento
    can_delete = False

class ItemOrcamentoInline(admin.TabularInline):
    model = ItemOrcamento
    extra = 1

class TarefaExecucaoInline(admin.TabularInline):
    model = TarefaExecucao
    extra = 1
    fields = ('descricao', 'status')

class DocumentoInline(admin.TabularInline):
    model = Documento
    extra = 1

class HistoricoOSInline(admin.TabularInline):
    model = HistoricoOS
    extra = 0
    # Atualizado com os nomes exatos do novo models.py
    readonly_fields = ('tipo', 'descricao', 'detalhes', 'usuario', 'data_hora') 
    can_delete = False

# ==========================================
# TELAS DO DJANGO ADMIN
# ==========================================

class OficinaForm(forms.ModelForm):
    # Define o campo com as escolhas e widget de checkboxes
    dias_funcionamento = forms.MultipleChoiceField(
        choices=Oficina.DIAS_CHOICES,
        widget=forms.CheckboxSelectMultiple,
        required=False,
        label="Dias de funcionamento"
    )

    class Meta:
        model = Oficina
        fields = '__all__'

    def clean_dias_funcionamento(self):
        # O MultipleChoiceField já retorna uma lista; só precisa garantir que seja compatível com ArrayField
        return self.cleaned_data['dias_funcionamento'] or []


@admin.register(Oficina)
class OficinaAdmin(admin.ModelAdmin):
    form = OficinaForm  # <-- usa o formulário customizado
    list_display = ('nome', 'cnpj', 'plano_atual', 'cidade', 'estado', 'dias_formatados')
    search_fields = ('nome', 'cnpj', 'email')
    list_filter = ('plano_atual', 'estado')
    inlines = [ConfigPrecoInline]

    def dias_formatados(self, obj):
        if obj.dias_funcionamento:
            return ', '.join(dict(Oficina.DIAS_CHOICES)[d] for d in obj.dias_funcionamento)
        return '-'
    dias_formatados.short_description = 'Dias de funcionamento'

@admin.register(Servico)
class ServicoAdmin(admin.ModelAdmin):
    list_display = ('nome', 'oficina', 'tempo_estimado')
    search_fields = ('nome',)
    list_filter = ('oficina',)

@admin.register(Cliente)
class ClienteAdmin(admin.ModelAdmin):
    list_display = ('nome', 'cpf_cnpj', 'telefone', 'cidade', 'estado', 'oficina')
    search_fields = ('nome', 'cpf_cnpj', 'email')
    list_filter = ('oficina', 'estado', 'contato_whatsapp', 'contato_email')
    inlines = [VeiculoInline] # Permite adicionar veículos na mesma tela do Cliente

@admin.register(Veiculo)
class VeiculoAdmin(admin.ModelAdmin):
    list_display = ('placa', 'marca', 'modelo', 'ano', 'tipo_uso', 'cliente')
    search_fields = ('placa', 'modelo', 'marca', 'chassi', 'cliente__nome')
    list_filter = ('tipo_uso', 'marca')

@admin.register(OrdemServico)
class OrdemServicoAdmin(admin.ModelAdmin):
    list_display = ('id', 'veiculo', 'cliente', 'oficina', 'status', 'criado_em')
    search_fields = ('id', 'veiculo__placa', 'cliente__nome')
    list_filter = ('status', 'oficina', 'criado_em')
    readonly_fields = ('criado_em', 'atualizado_em')
    
    # Tudo centralizado
    inlines = [
        ChecklistInline, 
        ItemOrcamentoInline, 
        TarefaExecucaoInline, 
        DocumentoInline, 
        HistoricoOSInline
    ]

# Ocultando modelos que já estão como inlines para não poluir o menu principal
# (ChecklistRecebimento, ConfigPreco, etc. só serão acessados por dentro das tabelas "pai")

# ==========================================
# CUSTOMIZAÇÃO VISUAL DO PAINEL
# ==========================================
admin.site.site_header = "Administração - Pit Stop"
admin.site.site_title = "Pit Stop Admin"
admin.site.index_title = "Gestão da Plataforma SaaS"