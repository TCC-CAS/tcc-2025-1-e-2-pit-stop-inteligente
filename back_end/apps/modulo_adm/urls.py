"""Rotas REST do painel administrativo SaaS.

Prefixadas com `/api/admin/` em `core/urls.py`. Toda rota exige
`IsAdminGlobal` (staff/superuser do Django) — vide `permissions.py`.
"""
from django.urls import include, path

from .views import (
    DashboardAdminAPIView,
    OficinaListAdminAPIView,
    OficinaDetalheAdminAPIView,
    OficinaInativarAdminAPIView,
    UsuarioListCreateAdminAPIView,
    UsuarioDetalheAdminAPIView,
    UsuarioInativarAdminAPIView,
    UsuarioResetarSenhaAdminAPIView,
    UsuarioVinculoOficinaAdminAPIView,
    ConfiguracaoListAdminAPIView,
    ConfiguracaoDetalheAdminAPIView,
    AuditoriaListAdminAPIView,
    OrdemServicoListAdminAPIView,
    OrdemServicoStatusAdminAPIView,
    BackupExportarAPIView,
    BackupRestaurarAPIView,
    NotificacaoListAPIView,
    NotificacaoMarcarLidaAPIView,
    NotificacaoMarcarTodasAPIView,
    NotificacaoSumarioAPIView,
    SolicitacaoAcessoAPIView,
    StatusPublicoAPIView,
    ConsumoGlobalAdminAPIView,
    OficinaConsumoAdminAPIView,
    OficinaLimitesAdminAPIView,
    ProductionHealthFeedAPIView,
    ProductionHealthGrupoAPIView,
    ProductionHealthGrupoEventosAPIView,
    ProductionHealthGerarTicketAPIView,
    ProductionHealthSumarioAPIView,
    SegurancaSumarioAPIView,
    SegurancaEventosAPIView,
    SegurancaBloquearIpAPIView,
    SegurancaDesbloquearIpAPIView,
)


urlpatterns = [
    # ----- Dashboard -----
    path("dashboard/", DashboardAdminAPIView.as_view(), name="adm-dashboard"),

    # ----- Oficinas -----
    path("oficinas/", OficinaListAdminAPIView.as_view(), name="adm-oficinas-list"),
    path("oficinas/<int:pk>/", OficinaDetalheAdminAPIView.as_view(), name="adm-oficina-detail"),
    path("oficinas/<int:pk>/inativar/", OficinaInativarAdminAPIView.as_view(), name="adm-oficina-inativar"),

    # ----- Usuários -----
    path("usuarios/", UsuarioListCreateAdminAPIView.as_view(), name="adm-usuarios-list"),
    path("usuarios/<int:pk>/", UsuarioDetalheAdminAPIView.as_view(), name="adm-usuario-detail"),
    path("usuarios/<int:pk>/ativar/", UsuarioInativarAdminAPIView.as_view(), name="adm-usuario-ativar"),
    path("usuarios/<int:pk>/senha/", UsuarioResetarSenhaAdminAPIView.as_view(), name="adm-usuario-senha"),
    path("usuarios/<int:pk>/vinculos/", UsuarioVinculoOficinaAdminAPIView.as_view(), name="adm-usuario-vinculo"),

    # ----- Configurações -----
    path("configuracoes/", ConfiguracaoListAdminAPIView.as_view(), name="adm-configs-list"),
    path("configuracoes/<str:chave>/", ConfiguracaoDetalheAdminAPIView.as_view(), name="adm-config-detail"),

    # ----- Auditoria -----
    path("auditoria/", AuditoriaListAdminAPIView.as_view(), name="adm-auditoria"),

    # ----- Ordens de Serviço -----
    path("os/", OrdemServicoListAdminAPIView.as_view(), name="adm-os-list"),
    path("os/<int:pk>/status/", OrdemServicoStatusAdminAPIView.as_view(), name="adm-os-status"),

    # ----- Backup / restauração -----
    path("backup/", BackupExportarAPIView.as_view(), name="adm-backup-export"),
    path("backup/restaurar/", BackupRestaurarAPIView.as_view(), name="adm-backup-restore"),

    # ----- Notificações -----
    path("notificacoes/", NotificacaoListAPIView.as_view(), name="adm-notif-list"),
    path("notificacoes/sumario/", NotificacaoSumarioAPIView.as_view(), name="adm-notif-sumario"),
    path("notificacoes/lidas/", NotificacaoMarcarTodasAPIView.as_view(), name="adm-notif-todas-lidas"),
    path("notificacoes/<int:pk>/lida/", NotificacaoMarcarLidaAPIView.as_view(), name="adm-notif-lida"),

    # ----- Suporte (delegado ao app modulo_suporte) -----
    path("suporte/", include("apps.modulo_suporte.urls_admin")),

    # ----- Solicitações públicas (sem auth admin) -----
    # Recebe pedidos da tela "Recuperar acesso" e gera Notificacao para a equipe.
    path("solicitacoes-acesso/", SolicitacaoAcessoAPIView.as_view(),
         name="adm-solicitacao-acesso"),

    # Status público (manutenção, ambiente) — consultado pelo front
    # mesmo quando o resto do sistema está em manutenção.
    path("status-publico/", StatusPublicoAPIView.as_view(), name="adm-status-publico"),

    # ----- Consumo SaaS por oficina + visão consolidada -----
    path("consumo/", ConsumoGlobalAdminAPIView.as_view(), name="adm-consumo-global"),
    path("oficinas/<int:pk>/consumo/", OficinaConsumoAdminAPIView.as_view(),
         name="adm-oficina-consumo"),
    path("oficinas/<int:pk>/limites/", OficinaLimitesAdminAPIView.as_view(),
         name="adm-oficina-limites"),

    # ----- Production Health (aba "Saúde da aplicação") -----
    path("saude/sumario/", ProductionHealthSumarioAPIView.as_view(),
         name="adm-saude-sumario"),
    path("saude/erros/", ProductionHealthFeedAPIView.as_view(),
         name="adm-saude-erros"),
    path("saude/erros/<int:pk>/", ProductionHealthGrupoAPIView.as_view(),
         name="adm-saude-erro-detail"),
    path("saude/erros/<int:pk>/eventos/", ProductionHealthGrupoEventosAPIView.as_view(),
         name="adm-saude-erro-eventos"),
    path("saude/erros/<int:pk>/ticket/", ProductionHealthGerarTicketAPIView.as_view(),
         name="adm-saude-erro-gerar-ticket"),

    # ----- Segurança -----
    path("seguranca/sumario/", SegurancaSumarioAPIView.as_view(),
         name="adm-seguranca-sumario"),
    path("seguranca/eventos/", SegurancaEventosAPIView.as_view(),
         name="adm-seguranca-eventos"),
    path("seguranca/bloquear-ip/", SegurancaBloquearIpAPIView.as_view(),
         name="adm-seguranca-bloquear-ip"),
    path("seguranca/desbloquear-ip/", SegurancaDesbloquearIpAPIView.as_view(),
         name="adm-seguranca-desbloquear-ip"),
]
