from django.urls import path
from . import views

# --- CLIENTES ---
from .views import (
    ClienteListCreateAPIView,
    ClienteRetrieveUpdateDestroyAPIView,
)

# --- ORDEM DE SERVIÇO (Views presentes no seu views.py real) ---
from .views import (
    ListarOrdensServicoAPIView,
    OrdemServicoRetrieveAPIView,
    OrdemServicoDestroyAPIView,
    CriarOrdemServicoAPIView,
    AprovacaoAPIView,
    FinalizarOSAPIView,
)

# --- CHECKLIST ---
from .ordem_servico.checklist.api.views import ChecklistAPIView

# --- DIAGNÓSTICO / ORÇAMENTO ---
from .ordem_servico.diagnostico_orcamento.api.views import (
    ItensOrcamentoAPIView,
    ItemOrcamentoDetailAPIView,
)

# --- EXECUÇÃO ---
from .ordem_servico.execucao.api.views import (
    TarefaExecucaoAPIView,
    TarefaExecucaoDetalheAPIView,
)

# --- HISTÓRICO ---
from .ordem_servico.historico.api.views import HistoricoOSListAPIView

# --- DOCUMENTOS ---
from .ordem_servico.documentos.api.views import (
    DocumentoListAPIView,
    DocumentoUploadAPIView,
    DocumentoDetailAPIView,
)

# --- SERVIÇOS ---
from .precos_servicos.views import (
    ServicoListCreateView,
    ServicoRetrieveUpdateDestroyView,
    CategoriaVeiculoListCreateView,
    CategoriaVeiculoRetrieveUpdateDestroyView,
    ConfiguracaoOficinaView,
)

urlpatterns = [

    # ===========================
    # CLIENTES
    # ===========================
    path("clientes/", ClienteListCreateAPIView.as_view(), name="cliente-list-create"),
    path("clientes/<int:pk>/", ClienteRetrieveUpdateDestroyAPIView.as_view(), name="cliente-detail"),

    # ===========================
    # ORDEM DE SERVIÇO
    # ===========================
    path("os/", ListarOrdensServicoAPIView.as_view(), name="listar_os"),
    path("os/<int:pk>/", OrdemServicoRetrieveAPIView.as_view(), name="detalhe_os"),
    path("os/<int:pk>/excluir/", OrdemServicoDestroyAPIView.as_view(), name="excluir_os"),
    path("os/criar/", CriarOrdemServicoAPIView.as_view(), name="criar_os"),
    path("os/<int:os_id>/finalizar/", FinalizarOSAPIView.as_view(), name="finalizar_os"),
    path("os/<int:os_id>/aprovacao/", AprovacaoAPIView.as_view(), name="aprovacao"),

    # Checklist
    path("os/<int:os_id>/checklist/", ChecklistAPIView.as_view(), name="checklist"),

    # Orçamento
    path("os/<int:os_id>/itens/", ItensOrcamentoAPIView.as_view(), name="itens_orcamento"),
    path("os/<int:os_id>/itens/<int:pk>/", ItemOrcamentoDetailAPIView.as_view(), name="item_orcamento_detail"),

    # Execução
    path("os/<int:os_id>/tarefas/", TarefaExecucaoAPIView.as_view(), name="tarefas"),
    path("os/<int:os_id>/tarefas/<int:pk>/", TarefaExecucaoDetalheAPIView.as_view(), name="tarefa_detalhe"),

    # Histórico
    path("os/<int:os_id>/historico/", HistoricoOSListAPIView.as_view(), name="os_historico"),

    # ===========================
    # DOCUMENTOS
    # ===========================
    path("os/<int:os_id>/documentos/", DocumentoListAPIView.as_view(), name="documentos_list"),
    path("os/<int:os_id>/documentos/upload/", DocumentoUploadAPIView.as_view(), name="documentos_upload"),
    path("documentos/<int:pk>/", DocumentoDetailAPIView.as_view(), name="documento_detail"),

    # ===========================
    # SERVIÇOS
    # ===========================
    path("servicos/", ServicoListCreateView.as_view(), name="servicos-list-create"),
    path("servicos/<int:pk>/", ServicoRetrieveUpdateDestroyView.as_view(), name="servicos-detail"),

    # ===========================
    # CATEGORIAS
    # ===========================
    path("categorias/", CategoriaVeiculoListCreateView.as_view(), name="categorias-list-create"),
    path("categorias/<int:pk>/", CategoriaVeiculoRetrieveUpdateDestroyView.as_view(), name="categorias-detail"),

    # ===========================
    # CONFIGURAÇÃO OFICINA
    # ===========================
    path("configuracao/", ConfiguracaoOficinaView.as_view(), name="configuracao"),
]