from django.urls import path
from . import views

urlpatterns = [
    # ==========================================
    # 0. CADASTRO DE CLIENTES
    # ==========================================
    path('clientes/', views.ClienteListCreateAPIView.as_view(), name='clientes_list'),
    path('clientes/<int:pk>/', views.ClienteRetrieveUpdateDestroyAPIView.as_view(), name='clientes_detail'),

    # ==========================================
    # 1. ROTAS DA ORDEM DE SERVIÇO (OS)
    # ==========================================
    path('os/', views.ListarOrdensServicoAPIView.as_view(), name='listar_os'),
    path('os/criar/', views.CriarOrdemServicoAPIView.as_view(), name='criar_os'),
    path('os/<int:pk>/', views.DetalheOrdemServicoAPIView.as_view(), name='detalhe_os'),
    path('os/<int:pk>/excluir/', views.ExcluirOrdemServicoAPIView.as_view(), name='excluir_os'),
    path('os/<int:os_id>/finalizar/', views.FinalizarOSAPIView.as_view(), name='finalizar_os'),

    # ==========================================
    # 2. ROTAS DOS PROCESSOS DA OS (ABAS)
    # ==========================================
    # Aba: Checklist
    path('os/<int:os_id>/checklist/', views.ChecklistAPIView.as_view(), name='checklist_os'),
    
    # Aba: Diagnóstico (Itens do Orçamento)
    path('os/<int:os_id>/itens/', views.ItensOrcamentoAPIView.as_view(), name='itens_orcamento'),
    path('os/<int:os_id>/itens/<int:pk>/', views.ItemOrcamentoDetailAPIView.as_view(), name='item_orcamento_detalhe'),
    path('os/<int:os_id>/itens/status/', views.AtualizarStatusItemAPIView.as_view(), name='atualizar_status_itens'), # Nova rota granular
    
    # Aba: Aprovação
    path('os/<int:os_id>/aprovacao/', views.AprovacaoAPIView.as_view(), name='aprovacao_orcamento'),
    
    # Aba: Execução (Tarefas)
    path('os/<int:os_id>/tarefas/', views.TarefaExecucaoAPIView.as_view(), name='tarefas_execucao'),
    path('os/<int:os_id>/tarefas/<int:pk>/', views.TarefaExecucaoDetalheAPIView.as_view(), name='tarefa_execucao_detalhe'),

    # Aba: Documentos
    path('os/<int:os_id>/documentos/', views.DocumentoListAPIView.as_view(), name='documentos_list'),
    path('os/<int:os_id>/documentos/upload/', views.DocumentoUploadAPIView.as_view(), name='documentos_upload'),
    path('documentos/<int:pk>/', views.DocumentoDetailAPIView.as_view(), name='documento_detail'),

    # Aba: Histórico (Linha do Tempo)
    path('os/<int:os_id>/historico/', views.HistoricoOSListAPIView.as_view(), name='historico_os'),

    # ==========================================
    # 3. ROTAS DE CATÁLOGO E CONFIGURAÇÃO
    # ==========================================
    # Configuração Geral (Valor da Hora)
    path('configuracao/', views.ConfiguracaoOficinaView.as_view(), name='configuracao_oficina'),

    # Categorias de Veículos (Adapter Mágico)
    path('categorias/', views.CategoriaVeiculoListCreateView.as_view(), name='categorias_list'),
    path('categorias/<int:pk>/', views.CategoriaVeiculoRetrieveUpdateDestroyView.as_view(), name='categorias_detail'),

    # Serviços (Catálogo de Mão de Obra)
    path('servicos/', views.ServicoListCreateView.as_view(), name='servicos_list'),
    path('servicos/<int:pk>/', views.ServicoRetrieveUpdateDestroyView.as_view(), name='servicos_detail'),
]