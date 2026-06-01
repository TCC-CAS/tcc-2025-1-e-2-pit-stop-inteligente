"""Pacote de views do modulo_oficina.

Cada submódulo agrupa as views de uma feature (oficina, cliente, ordem de serviço, etc.).
A reexportação abaixo mantém compatibilidade caso outro módulo importe diretamente
da raiz (ex.: `from apps.modulo_oficina.views import ChecklistAPIView`).
"""
from .oficina_views import OficinaPerfilAPIView, AlterarSenhaAPIView
from .cliente_views import (
    ClienteListCreateAPIView,
    ClienteRetrieveUpdateDestroyAPIView,
    ClienteVeiculosAPIView,
)
from .veiculo_views import VeiculoListAPIView, VeiculoHistoricoAPIView
from .ordem_servico_views import (
    CriarOrdemServicoAPIView,
    ListarOrdensServicoAPIView,
    DetalheOrdemServicoAPIView,
    ExcluirOrdemServicoAPIView,
    FinalizarOSAPIView,
)
from .checklist_views import ChecklistAPIView
from .orcamento_views import (
    ItensOrcamentoAPIView,
    AtualizarStatusItemAPIView,
    ItemOrcamentoDetailAPIView,
    AprovacaoAPIView,
    EnviarAprovacaoAPIView,
)
from .tarefa_views import TarefaExecucaoAPIView, TarefaExecucaoDetalheAPIView
from .documento_views import (
    DocumentoListAPIView,
    DocumentoUploadAPIView,
    DocumentoDetailAPIView,
    RegrasUploadOSAPIView,
)
from .historico_views import HistoricoOSListAPIView
from .codigo_acesso_views import CodigoAcessoOSAPIView
from .manutencao_views import (
    ManutencaoListCreateAPIView,
    ManutencaoDetalheAPIView,
    GerarOSDeManutencaoAPIView,
)
from .precos_views import (
    ConfiguracaoOficinaView,
    CategoriaVeiculoListCreateView,
    CategoriaVeiculoRetrieveUpdateDestroyView,
    ServicoListCreateView,
    ServicoRetrieveUpdateDestroyView,
)
from .funcionario_views import (
    FuncionarioListCreateAPIView,
    FuncionarioRetrieveUpdateDestroyAPIView,
)
from .plano_views import StatusPlanoAPIView
from .consumo_views import ConsumoOficinaAPIView
from .dashboard_views import DashboardAPIView, DashboardAnaliseAPIView
from .auth_views import (
    CsrfAPIView,
    LoginAPIView,
    LogoutAPIView,
    MeAPIView,
    RegistrarOficinaAPIView,
    ConfirmarEmailAPIView,
    SelecionarOficinaAPIView,
)

__all__ = [
    "OficinaPerfilAPIView",
    "AlterarSenhaAPIView",
    "ClienteListCreateAPIView",
    "ClienteRetrieveUpdateDestroyAPIView",
    "ClienteVeiculosAPIView",
    "VeiculoListAPIView",
    "VeiculoHistoricoAPIView",
    "CriarOrdemServicoAPIView",
    "ListarOrdensServicoAPIView",
    "DetalheOrdemServicoAPIView",
    "ExcluirOrdemServicoAPIView",
    "FinalizarOSAPIView",
    "ChecklistAPIView",
    "ItensOrcamentoAPIView",
    "AtualizarStatusItemAPIView",
    "ItemOrcamentoDetailAPIView",
    "AprovacaoAPIView",
    "EnviarAprovacaoAPIView",
    "TarefaExecucaoAPIView",
    "TarefaExecucaoDetalheAPIView",
    "DocumentoListAPIView",
    "DocumentoUploadAPIView",
    "DocumentoDetailAPIView",
    "RegrasUploadOSAPIView",
    "HistoricoOSListAPIView",
    "CodigoAcessoOSAPIView",
    "ManutencaoListCreateAPIView",
    "ManutencaoDetalheAPIView",
    "GerarOSDeManutencaoAPIView",
    "ConfiguracaoOficinaView",
    "CategoriaVeiculoListCreateView",
    "CategoriaVeiculoRetrieveUpdateDestroyView",
    "ServicoListCreateView",
    "ServicoRetrieveUpdateDestroyView",
    "FuncionarioListCreateAPIView",
    "FuncionarioRetrieveUpdateDestroyAPIView",
    "StatusPlanoAPIView",
    "ConsumoOficinaAPIView",
    "DashboardAPIView",
    "DashboardAnaliseAPIView",
    "CsrfAPIView",
    "LoginAPIView",
    "LogoutAPIView",
    "MeAPIView",
    "RegistrarOficinaAPIView",
    "ConfirmarEmailAPIView",
    "SelecionarOficinaAPIView",
]
