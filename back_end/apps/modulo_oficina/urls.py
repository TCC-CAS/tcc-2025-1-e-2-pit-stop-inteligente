from django.urls import path
from . import views

# --- Imports de Ordem de Serviço (Módulos Internos) ---
from .ordem_servico.checklist.api.views import ChecklistAPIView
from .ordem_servico.diagnostico_orcamento.api.views import ItensOrcamentoAPIView, ItemOrcamentoDetailAPIView
from .ordem_servico.execucao.api.views import TarefaExecucaoAPIView, TarefaExecucaoDetalheAPIView
from .ordem_servico.historico.api.views import HistoricoOSListAPIView

from .views import (
    ClienteListCreateAPIView, 
    ClienteRetrieveUpdateDestroyAPIView
)

urlpatterns = [

    # --- Imports de Clientes ---
    path('api/clientes/', ClienteListCreateAPIView.as_view(), name='cliente-list-create'),
    path('api/clientes/<int:pk>/', ClienteRetrieveUpdateDestroyAPIView.as_view(), name='cliente-detail'),

]

# --- Imports de Documentos ---
from .ordem_servico.documentos.api.views import (
    DocumentoListAPIView,
    DocumentoUploadAPIView,
    DocumentoDetailAPIView
)

# --- Imports de Preços, Serviços e Configurações (CORREÇÃO) ---
from .precos_servicos.views import (
    ServicoListCreateView,
    ServicoRetrieveUpdateDestroyView,
    CategoriaVeiculoListCreateView,
    CategoriaVeiculoRetrieveUpdateDestroyView,
    ConfiguracaoOficinaView
)

urlpatterns = [
    # ==========================================
    # Rotas de Ordem de Serviço (OS)
    # ==========================================
    path('os/', views.ListarOrdensServicoAPIView.as_view(), name='listar_os'),
    path('os/<int:pk>/', views.DetalheOrdemServicoAPIView.as_view(), name='detalhe_os'),
    path('os/<int:pk>/excluir/', views.ExcluirOrdemServicoAPIView.as_view(), name='excluir_os'),
    path('os/criar/', views.CriarOrdemServicoAPIView.as_view(), name='criar_os'),
    path('os/<int:os_id>/finalizar/', views.FinalizarOSAPIView.as_view(), name='finalizar_os'),
    path('os/<int:os_id>/aprovacao/', views.AprovacaoAPIView.as_view(), name='aprovacao'),

    # ==========================================
    # Rotas de Módulos da OS (Checklist, Orçamento, Execução, Histórico)
    # ==========================================
    # Checklist
    path('os/<int:os_id>/checklist/', ChecklistAPIView.as_view(), name='checklist'),

    # Itens do orçamento (diagnóstico)
    path('os/<int:os_id>/itens/', ItensOrcamentoAPIView.as_view(), name='itens_orcamento'),
    path('os/<int:os_id>/itens/<int:pk>/', ItemOrcamentoDetailAPIView.as_view(), name='item_orcamento_detail'),

    # Tarefas de execução
    path('os/<int:os_id>/tarefas/', TarefaExecucaoAPIView.as_view(), name='tarefas'),
    path('os/<int:os_id>/tarefas/<int:pk>/', TarefaExecucaoDetalheAPIView.as_view(), name='tarefa_detalhe'),

    # Histórico
    path('os/<int:os_id>/historico/', HistoricoOSListAPIView.as_view(), name='os_historico'),

    # ==========================================
    # Rotas de Documentos
    # ==========================================
    path('os/<int:os_id>/documentos/', DocumentoListAPIView.as_view(), name='documentos_list'),
    path('os/<int:os_id>/documentos/upload/', DocumentoUploadAPIView.as_view(), name='documentos_upload'),
    path('documentos/<int:pk>/', DocumentoDetailAPIView.as_view(), name='documento_detail'),

    # ==========================================
    # Rotas de Serviços e Categorias
    # ==========================================
    # Serviços
    path('servicos/', ServicoListCreateView.as_view(), name='servicos-list-create'),
    path('servicos/<int:pk>/', ServicoRetrieveUpdateDestroyView.as_view(), name='servicos-detail'),

    # Categorias de Veículos
    path('categorias/', CategoriaVeiculoListCreateView.as_view(), name='categorias-list-create'),
    path('categorias/<int:pk>/', CategoriaVeiculoRetrieveUpdateDestroyView.as_view(), name='categorias-detail'),

    # ==========================================
    # Rotas de Configuração da Oficina
    # ==========================================
    # Configuração (valor hora)
    path('configuracao/', ConfiguracaoOficinaView.as_view(), name='configuracao'),
]