"""Camada de serviços (business logic) do modulo_oficina.

Cada service encapsula uma regra de negócio ou orquestra múltiplos models.
As views devem permanecer "magras" (apenas validação e resposta HTTP),
delegando a lógica para os services aqui definidos.
"""
from .ordem_servico_service import (
    criar_os_completa,
    finalizar_os,
)
from .aprovacao_service import processar_aprovacao_orcamento
from .envio_aprovacao_service import enviar_para_aprovacao
from .perfil_oficina_service import (
    montar_payload_perfil,
    atualizar_perfil_oficina,
    criar_oficina_e_vincular_admin,
)
from .dashboard_service import montar_dashboard
from .auth_service import (
    SESSION_OFICINA_KEY,
    autenticar_usuario,
    encerrar_sessao,
    montar_perfil_corrente,
    registrar_oficina_completa,
    selecionar_oficina,
)
from .plano_service import (
    StatusPlano,
    status_plano,
    assegurar_pode_criar_funcionario,
    assegurar_pode_reativar,
)
from .insights_service import gerar_analise
from .consumo_service import (
    RecursoConsumo,
    consumo_oficina,
    consumo_os_mes,
    consumo_storage,
    consumo_usuarios,
    assegurar_pode_criar_os,
    assegurar_pode_upload,
)
from .upload_validator import (
    RegrasUpload,
    obter_regras as obter_regras_upload,
    validar_arquivo,
    validar_batch,
)

__all__ = [
    "criar_os_completa",
    "finalizar_os",
    "processar_aprovacao_orcamento",
    "enviar_para_aprovacao",
    "montar_payload_perfil",
    "atualizar_perfil_oficina",
    "criar_oficina_e_vincular_admin",
    "montar_dashboard",
    "SESSION_OFICINA_KEY",
    "autenticar_usuario",
    "encerrar_sessao",
    "montar_perfil_corrente",
    "registrar_oficina_completa",
    "selecionar_oficina",
    "StatusPlano",
    "status_plano",
    "assegurar_pode_criar_funcionario",
    "assegurar_pode_reativar",
    "gerar_analise",
    "RecursoConsumo",
    "consumo_oficina",
    "consumo_os_mes",
    "consumo_storage",
    "consumo_usuarios",
    "assegurar_pode_criar_os",
    "assegurar_pode_upload",
    "RegrasUpload",
    "obter_regras_upload",
    "validar_arquivo",
    "validar_batch",
]
