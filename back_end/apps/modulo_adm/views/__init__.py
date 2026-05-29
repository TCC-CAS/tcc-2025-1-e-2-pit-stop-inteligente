"""Views do painel administrativo SaaS."""
from .dashboard_views import DashboardAdminAPIView
from .oficinas_views import (
    OficinaListAdminAPIView,
    OficinaDetalheAdminAPIView,
    OficinaInativarAdminAPIView,
)
from .usuarios_views import (
    UsuarioListCreateAdminAPIView,
    UsuarioDetalheAdminAPIView,
    UsuarioInativarAdminAPIView,
    UsuarioResetarSenhaAdminAPIView,
    UsuarioVinculoOficinaAdminAPIView,
)
from .configuracoes_views import (
    ConfiguracaoListAdminAPIView,
    ConfiguracaoDetalheAdminAPIView,
)
from .auditoria_views import AuditoriaListAdminAPIView
from .os_views import (
    OrdemServicoListAdminAPIView,
    OrdemServicoStatusAdminAPIView,
)
from .backup_views import BackupExportarAPIView, BackupRestaurarAPIView
from .notificacoes_views import (
    NotificacaoListAPIView,
    NotificacaoMarcarLidaAPIView,
    NotificacaoMarcarTodasAPIView,
    NotificacaoSumarioAPIView,
)
from .solicitacoes_views import SolicitacaoAcessoAPIView
from .status_publico_views import StatusPublicoAPIView
from .consumo_views import (
    ConsumoGlobalAdminAPIView,
    OficinaConsumoAdminAPIView,
    OficinaLimitesAdminAPIView,
)
from .production_health_views import (
    ProductionHealthFeedAPIView,
    ProductionHealthGrupoAPIView,
    ProductionHealthGrupoEventosAPIView,
    ProductionHealthGerarTicketAPIView,
    ProductionHealthSumarioAPIView,
)
from .seguranca_views import (
    SegurancaSumarioAPIView,
    SegurancaEventosAPIView,
    SegurancaBloquearIpAPIView,
    SegurancaDesbloquearIpAPIView,
)

__all__ = [
    "DashboardAdminAPIView",
    "OficinaListAdminAPIView",
    "OficinaDetalheAdminAPIView",
    "OficinaInativarAdminAPIView",
    "UsuarioListCreateAdminAPIView",
    "UsuarioDetalheAdminAPIView",
    "UsuarioInativarAdminAPIView",
    "UsuarioResetarSenhaAdminAPIView",
    "UsuarioVinculoOficinaAdminAPIView",
    "ConfiguracaoListAdminAPIView",
    "ConfiguracaoDetalheAdminAPIView",
    "AuditoriaListAdminAPIView",
    "OrdemServicoListAdminAPIView",
    "OrdemServicoStatusAdminAPIView",
    "BackupExportarAPIView",
    "BackupRestaurarAPIView",
    "NotificacaoListAPIView",
    "NotificacaoMarcarLidaAPIView",
    "NotificacaoMarcarTodasAPIView",
    "NotificacaoSumarioAPIView",
    "SolicitacaoAcessoAPIView",
    "StatusPublicoAPIView",
    "ConsumoGlobalAdminAPIView",
    "OficinaConsumoAdminAPIView",
    "OficinaLimitesAdminAPIView",
    "ProductionHealthFeedAPIView",
    "ProductionHealthGerarTicketAPIView",
    "ProductionHealthGrupoAPIView",
    "ProductionHealthGrupoEventosAPIView",
    "ProductionHealthSumarioAPIView",
    "SegurancaSumarioAPIView",
    "SegurancaEventosAPIView",
    "SegurancaBloquearIpAPIView",
    "SegurancaDesbloquearIpAPIView",
]
