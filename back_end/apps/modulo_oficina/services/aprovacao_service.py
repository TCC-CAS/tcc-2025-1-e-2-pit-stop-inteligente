"""Regras de negócio para aprovação do orçamento e geração de tarefas."""
from ..models import ItemOrcamento, TarefaExecucao
from ..utils import registrar_historico


def _gerar_tarefas_para_item(os_obj, item_banco):
    """Cria as tarefas de execução para um item aprovado.

    Regra:
      - Se o item aponta para um Servico do catálogo (servico_catalogo) E
        esse serviço tem `tarefas_padrao` ativas, criamos UMA TarefaExecucao
        para cada tarefa-padrão (em ordem, com tempo estimado e descrição
        prefixada pelo nome do serviço). Isso popula a aba Execução com o
        checklist completo do serviço.
      - Caso contrário, cai no comportamento legado: uma única tarefa com
        a descrição do item.

    Não cria duplicatas se já houver uma TarefaExecucao com a mesma
    descrição na OS (proteção contra reprocessamento de aprovações).
    """
    descricoes_existentes = set(
        TarefaExecucao.objects.filter(os=os_obj).values_list("descricao", flat=True)
    )

    if item_banco.servico_catalogo_id:
        padroes = list(
            item_banco.servico_catalogo.tarefas_padrao.filter(ativa=True)
            .order_by("ordem", "id")
        )
    else:
        padroes = []

    if padroes:
        prefixo = item_banco.servico_catalogo.nome
        for ordem_idx, padrao in enumerate(padroes, start=1):
            descricao = f"{prefixo} · {padrao.descricao}"
            if descricao in descricoes_existentes:
                continue
            TarefaExecucao.objects.create(
                os=os_obj,
                descricao=descricao,
                status="pendente",
                tempo_estimado_h=padrao.tempo_estimado_h or 0,
            )
            descricoes_existentes.add(descricao)
        return

    # Fallback: item avulso ou serviço sem tarefas padrão configuradas
    if item_banco.nome_descricao in descricoes_existentes:
        return
    TarefaExecucao.objects.create(
        os=os_obj,
        descricao=item_banco.nome_descricao,
        status="pendente",
    )


def processar_aprovacao_orcamento(os_obj, itens_payload, request=None):
    """Aplica o status de cada item do orçamento e gera tarefas para os aprovados.

    Retorna a OS atualizada.
    """
    for item in itens_payload:
        ItemOrcamento.objects.filter(id=item["id"], os_id=os_obj.id).update(
            status_aprovacao=item["status"]
        )

        if item["status"] == "aprovado":
            try:
                item_banco = ItemOrcamento.objects.select_related(
                    "servico_catalogo"
                ).get(id=item["id"])
            except ItemOrcamento.DoesNotExist:
                continue

            _gerar_tarefas_para_item(os_obj, item_banco)

    # Status "aprovado" não existe nos CHOICES da OS (apenas pendente/execucao/concluido).
    # Após a aprovação do orçamento, a OS entra na fila de execução.
    os_obj.status = "execucao"
    os_obj.save(update_fields=["status", "atualizado_em"])
    registrar_historico(
        os_obj,
        "aprovacao",
        "Orçamento Aprovado",
        "Orçamento finalizado e tarefas geradas. OS movida para execução.",
        request,
    )
    return os_obj
