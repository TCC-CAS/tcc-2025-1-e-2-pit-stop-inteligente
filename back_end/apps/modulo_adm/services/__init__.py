"""Services do painel administrativo SaaS."""
from .dashboard_service import montar_dashboard_admin
from .oficinas_service import (
    listar_oficinas_com_agregados,
    inativar_oficina,
    excluir_oficina,
)
from .usuarios_service import (
    criar_usuario_admin,
    atualizar_usuario_admin,
    alterar_senha_usuario,
    inativar_usuario,
    excluir_usuario,
    vincular_usuario_oficina,
)
from .configuracoes_service import (
    listar_configuracoes,
    atualizar_configuracao,
    aplicar_seed_inicial,
    obter_flag,
    invalidar_cache,
)
from .os_service import alterar_status_os_admin
from . import seguranca_service  # exporta o módulo inteiro

__all__ = [
    "montar_dashboard_admin",
    "listar_oficinas_com_agregados",
    "inativar_oficina",
    "excluir_oficina",
    "criar_usuario_admin",
    "atualizar_usuario_admin",
    "alterar_senha_usuario",
    "inativar_usuario",
    "excluir_usuario",
    "vincular_usuario_oficina",
    "listar_configuracoes",
    "atualizar_configuracao",
    "aplicar_seed_inicial",
    "obter_flag",
    "invalidar_cache",
    "alterar_status_os_admin",
    "seguranca_service",
]
