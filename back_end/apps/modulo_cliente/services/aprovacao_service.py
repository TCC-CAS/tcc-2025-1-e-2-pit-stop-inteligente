"""Regras de aprovação/rejeição de orçamento exercidas pelo cliente."""
from apps.modulo_oficina.models import ItemOrcamento, TarefaExecucao

from ..utils import registrar_evento_cliente


_STATUS_PERMITIDOS = {"aprovado", "reprovado"}


def atualizar_status_item_cliente(os_obj, item_id, novo_status, justificativa=""):
    """Atualiza o status de UM item — usado para aprovações item a item.

    Diferente do fluxo da oficina, o cliente só pode definir 'aprovado'
    ou 'reprovado'. Se aprovado, geramos a tarefa de execução (idempotente).
    """
    if novo_status not in _STATUS_PERMITIDOS:
        raise ValueError("Status inválido. Use 'aprovado' ou 'reprovado'.")

    item = ItemOrcamento.objects.filter(id=item_id, os_id=os_obj.id).first()
    if item is None:
        raise ValueError("Item de orçamento não encontrado nesta OS.")

    if item.status_aprovacao == novo_status:
        return item  # idempotente

    item.status_aprovacao = novo_status
    item.save(update_fields=["status_aprovacao", "atualizado_em"])

    if novo_status == "aprovado":
        TarefaExecucao.objects.get_or_create(
            os=os_obj,
            descricao=item.nome_descricao,
            defaults={"status": "pendente"},
        )

    label = "aprovou" if novo_status == "aprovado" else "rejeitou"
    detalhe = f"Cliente {label} o item: {item.nome_descricao}."
    if justificativa.strip():
        detalhe += f"\nJustificativa: {justificativa.strip()}"
    registrar_evento_cliente(
        os_obj,
        "aprovacao",
        f"Item {label}: {item.nome_descricao}",
        detalhe,
    )
    return item


def aprovar_orcamento_cliente(os_obj, itens_payload, termo_aceito):
    """Aprovação em lote — espelha o fluxo da oficina sem exigir login.

    `itens_payload`: lista de {id, status} para cada item do orçamento.
    """
    if not termo_aceito:
        raise ValueError(
            "É obrigatório confirmar o termo de aceite para aprovar o orçamento."
        )
    if not isinstance(itens_payload, list) or not itens_payload:
        raise ValueError("Envie ao menos um item para aprovar/rejeitar.")

    aprovados = 0
    rejeitados = 0
    for item in itens_payload:
        status = item.get("status")
        if status not in _STATUS_PERMITIDOS:
            continue
        atualizar_status_item_cliente(
            os_obj=os_obj,
            item_id=item.get("id"),
            novo_status=status,
            justificativa=item.get("justificativa", ""),
        )
        if status == "aprovado":
            aprovados += 1
        else:
            rejeitados += 1

    os_obj.status = "execucao" if aprovados else os_obj.status
    if aprovados:
        os_obj.save(update_fields=["status", "atualizado_em"])

    registrar_evento_cliente(
        os_obj,
        "aprovacao",
        "Orçamento revisado pelo cliente",
        f"Itens aprovados: {aprovados}. Itens rejeitados: {rejeitados}.",
    )
    return {"aprovados": aprovados, "rejeitados": rejeitados}
