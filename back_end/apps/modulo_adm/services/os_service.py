"""Service para ações administrativas sobre OS (override de status)."""
from apps.modulo_oficina.models import OrdemServico
from apps.modulo_oficina.utils import registrar_historico

from ..utils import registrar_auditoria


_STATUS_VALIDOS = {"pendente", "execucao", "concluido"}


def alterar_status_os_admin(request, os_obj, novo_status, motivo):
    if novo_status not in _STATUS_VALIDOS:
        raise ValueError("Status inválido.")
    motivo = (motivo or "").strip()
    if not motivo:
        raise ValueError("Informe o motivo da alteração administrativa.")

    anterior = os_obj.status
    if anterior == novo_status:
        return os_obj  # idempotente

    os_obj.status = novo_status
    os_obj.save(update_fields=["status", "atualizado_em"])

    # Registra no histórico da própria OS (visível na oficina)
    registrar_historico(
        os_obj,
        "status",
        f"Status alterado para '{novo_status}' (admin)",
        f"Motivo: {motivo}\nAlteração efetuada pelo painel administrativo.",
        request,
    )

    # E também na auditoria global
    registrar_auditoria(
        request,
        acao="os.alterar_status",
        recurso="ordem_servico",
        recurso_id=os_obj.id,
        nivel="critico",
        descricao=f"OS #{os_obj.id}: status '{anterior}' → '{novo_status}'.",
        metadados={"anterior": anterior, "novo": novo_status, "motivo": motivo},
    )
    return os_obj
