"""Rotas da API REST do modulo_oficina.

Todas as rotas são prefixadas por `/api/oficina/` (ver `core/urls.py`).
Organização por seção/feature para facilitar manutenção.
"""
from django.urls import include, path

from .views import (
    # Perfil da oficina e troca de senha
    OficinaPerfilAPIView,
    AlterarSenhaAPIView,
    # Clientes
    ClienteListCreateAPIView,
    ClienteRetrieveUpdateDestroyAPIView,
    ClienteVeiculosAPIView,
    # Veículos
    VeiculoListAPIView,
    VeiculoHistoricoAPIView,
    # Ordem de Serviço
    CriarOrdemServicoAPIView,
    ListarOrdensServicoAPIView,
    DetalheOrdemServicoAPIView,
    ExcluirOrdemServicoAPIView,
    FinalizarOSAPIView,
    # Checklist
    ChecklistAPIView,
    # Itens de orçamento e aprovação
    ItensOrcamentoAPIView,
    AtualizarStatusItemAPIView,
    ItemOrcamentoDetailAPIView,
    AprovacaoAPIView,
    EnviarAprovacaoAPIView,
    # Tarefas de execução
    TarefaExecucaoAPIView,
    TarefaExecucaoDetalheAPIView,
    # Documentos
    DocumentoListAPIView,
    DocumentoUploadAPIView,
    DocumentoDetailAPIView,
    RegrasUploadOSAPIView,
    # Histórico/timeline
    HistoricoOSListAPIView,
    # Código de acesso do cliente
    CodigoAcessoOSAPIView,
    # Manutenção preventiva
    ManutencaoListCreateAPIView,
    ManutencaoDetalheAPIView,
    GerarOSDeManutencaoAPIView,
    # Preços e catálogo
    ConfiguracaoOficinaView,
    CategoriaVeiculoListCreateView,
    CategoriaVeiculoRetrieveUpdateDestroyView,
    ServicoListCreateView,
    ServicoRetrieveUpdateDestroyView,
    # Funcionários
    FuncionarioListCreateAPIView,
    FuncionarioRetrieveUpdateDestroyAPIView,
    StatusPlanoAPIView,
    ConsumoOficinaAPIView,
    # Dashboard gerencial
    DashboardAPIView,
    DashboardAnaliseAPIView,
    # Autenticação e sessão multi-oficina
    CsrfAPIView,
    LoginAPIView,
    LogoutAPIView,
    MeAPIView,
    RegistrarOficinaAPIView,
    SelecionarOficinaAPIView,
)


urlpatterns = [
    # ----- Perfil da oficina e usuário -----
    path("perfil/", OficinaPerfilAPIView.as_view(), name="oficina-perfil"),
    path("alterar-senha/", AlterarSenhaAPIView.as_view(), name="alterar-senha"),

    # ----- Clientes -----
    path("clientes/", ClienteListCreateAPIView.as_view(), name="clientes-list"),
    path("clientes/<int:pk>/", ClienteRetrieveUpdateDestroyAPIView.as_view(), name="cliente-detail"),
    path("clientes/<int:cliente_id>/veiculos/", ClienteVeiculosAPIView.as_view(), name="cliente-veiculos"),

    # ----- Veículos -----
    path("veiculos/", VeiculoListAPIView.as_view(), name="veiculos-list"),
    path("veiculos/<int:veiculo_id>/historico/", VeiculoHistoricoAPIView.as_view(), name="veiculo-historico"),

    # ----- Ordem de Serviço -----
    path("os/", ListarOrdensServicoAPIView.as_view(), name="os-list"),
    path("os/criar/", CriarOrdemServicoAPIView.as_view(), name="os-criar"),
    path("os/<int:pk>/", DetalheOrdemServicoAPIView.as_view(), name="os-detail"),
    path("os/<int:pk>/excluir/", ExcluirOrdemServicoAPIView.as_view(), name="os-excluir"),
    path("os/<int:os_id>/finalizar/", FinalizarOSAPIView.as_view(), name="os-finalizar"),

    # ----- Checklist da OS (dois formatos aceitos pelo front-end) -----
    path("os/<int:os_id>/checklist/", ChecklistAPIView.as_view(), name="os-checklist"),
    path("checklist/<int:os_id>/", ChecklistAPIView.as_view(), name="checklist-legado"),

    # ----- Itens de orçamento -----
    path("os/<int:os_id>/itens/", ItensOrcamentoAPIView.as_view(), name="os-itens"),
    path("os/<int:os_id>/itens/status/", AtualizarStatusItemAPIView.as_view(), name="os-itens-status"),
    path("os/<int:os_id>/itens/<int:pk>/", ItemOrcamentoDetailAPIView.as_view(), name="os-item-detail"),

    # ----- Aprovação do orçamento -----
    path("os/<int:os_id>/aprovacao/", AprovacaoAPIView.as_view(), name="os-aprovacao"),
    path("os/<int:os_id>/enviar-aprovacao/", EnviarAprovacaoAPIView.as_view(), name="os-enviar-aprovacao"),

    # ----- Tarefas de execução -----
    path("os/<int:os_id>/tarefas/", TarefaExecucaoAPIView.as_view(), name="os-tarefas"),
    path("os/<int:os_id>/tarefas/<int:pk>/", TarefaExecucaoDetalheAPIView.as_view(), name="os-tarefa-detail"),

    # ----- Documentos -----
    path("os/<int:os_id>/documentos/", DocumentoListAPIView.as_view(), name="os-documentos"),
    path("os/<int:os_id>/documentos/upload/", DocumentoUploadAPIView.as_view(), name="os-documentos-upload"),
    path("documentos/<int:pk>/", DocumentoDetailAPIView.as_view(), name="documento-detail"),
    # Regras de upload (tamanho + tipos aceitos) — consultado pelo front
    path("upload-os/regras/", RegrasUploadOSAPIView.as_view(), name="upload-os-regras"),

    # ----- Histórico/timeline -----
    path("os/<int:os_id>/historico/", HistoricoOSListAPIView.as_view(), name="os-historico"),

    # ----- Código de acesso do cliente -----
    path("os/<int:os_id>/codigo-acesso/", CodigoAcessoOSAPIView.as_view(), name="os-codigo-acesso"),

    # ----- Manutenção preventiva -----
    path("veiculos/<int:veiculo_id>/manutencoes/", ManutencaoListCreateAPIView.as_view(), name="manutencao-list"),
    path("manutencoes/<int:pk>/", ManutencaoDetalheAPIView.as_view(), name="manutencao-detail"),
    path("manutencoes/<int:pk>/gerar-os/", GerarOSDeManutencaoAPIView.as_view(), name="manutencao-gerar-os"),

    # ----- Preços e catálogo de serviços -----
    path("configuracao/", ConfiguracaoOficinaView.as_view(), name="config-precos"),
    path("categorias/", CategoriaVeiculoListCreateView.as_view(), name="categorias-list"),
    path("categorias/<int:pk>/", CategoriaVeiculoRetrieveUpdateDestroyView.as_view(), name="categoria-detail"),
    path("servicos/", ServicoListCreateView.as_view(), name="servicos-list"),
    path("servicos/<int:pk>/", ServicoRetrieveUpdateDestroyView.as_view(), name="servico-detail"),

    # ----- Funcionários -----
    path("funcionarios/", FuncionarioListCreateAPIView.as_view(), name="funcionarios-list"),
    path("funcionarios/<int:pk>/", FuncionarioRetrieveUpdateDestroyAPIView.as_view(), name="funcionario-detail"),

    # ----- Plano SaaS (consumo de usuários) -----
    path("plano/status/", StatusPlanoAPIView.as_view(), name="plano-status"),

    # ----- Consumo SaaS consolidado (usuários, OS/mês, storage) -----
    path("consumo/", ConsumoOficinaAPIView.as_view(), name="consumo-oficina"),

    # ----- Dashboard gerencial -----
    path("dashboard/", DashboardAPIView.as_view(), name="dashboard"),
    path("dashboard/analise/", DashboardAnaliseAPIView.as_view(), name="dashboard-analise"),

    # ----- Autenticação e sessão multi-oficina -----
    path("auth/csrf/", CsrfAPIView.as_view(), name="auth-csrf"),
    path("auth/login/", LoginAPIView.as_view(), name="auth-login"),
    path("auth/logout/", LogoutAPIView.as_view(), name="auth-logout"),
    path("auth/me/", MeAPIView.as_view(), name="auth-me"),
    path("auth/oficinas/<int:oficina_id>/selecionar/", SelecionarOficinaAPIView.as_view(), name="auth-selecionar-oficina"),
    path("auth/registrar-oficina/", RegistrarOficinaAPIView.as_view(), name="auth-registrar-oficina"),

    # ----- Suporte (delegado ao app modulo_suporte) -----
    path("suporte/", include("apps.modulo_suporte.urls_oficina")),
]
