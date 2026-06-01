"""Regras de negócio relacionadas à Ordem de Serviço."""
from ..models import Cliente, Veiculo, OrdemServico
from ..utils import registrar_historico


def _upsert_cliente(oficina, dados):
    cliente, _ = Cliente.objects.get_or_create(
        cpf_cnpj=dados.get("cpf_cnpj"),
        oficina=oficina,
        defaults={
            "nome": dados.get("nome_cliente"),
            "telefone": dados.get("telefone", ""),
        },
    )
    if dados.get("email"):
        cliente.email = dados["email"]
        cliente.save(update_fields=["email"])
    return cliente


def _upsert_veiculo(cliente, dados):
    veiculo, _ = Veiculo.objects.get_or_create(
        placa=dados.get("placa"),
        cliente=cliente,
        defaults={
            "modelo": dados.get("modelo", "Não informado"),
            "marca": dados.get("marca", ""),
            "ano": dados.get("ano", ""),
            "cor": dados.get("cor", ""),
            "chassi": dados.get("chassi", ""),
            "tipo_uso": dados.get("tipo_uso", "particular"),
        },
    )
    veiculo.marca = dados.get("marca", veiculo.marca)
    veiculo.chassi = dados.get("chassi", veiculo.chassi)
    veiculo.ano = dados.get("ano", veiculo.ano)
    veiculo.cor = dados.get("cor", veiculo.cor)
    veiculo.tipo_uso = dados.get("tipo_uso", veiculo.tipo_uso)
    veiculo.save()
    return veiculo


def criar_os_completa(oficina, dados, request=None):
    """Cria (ou reaproveita) cliente/veículo e abre uma nova OS.

    Antes de tudo, valida a cota mensal do plano. Se já estourou e a flag
    `bloquear_ao_atingir_limite_os` está ativa, levanta ValueError —
    a view converte em 400/402 para o front exibir a mensagem.
    """
    from .consumo_service import assegurar_pode_criar_os
    assegurar_pode_criar_os(oficina)

    cliente = _upsert_cliente(oficina, dados)
    veiculo = _upsert_veiculo(cliente, dados)

    os_obj = OrdemServico.objects.create(
        oficina=oficina,
        veiculo=veiculo,
        cliente=cliente,
        km_atual=dados.get("km_atual"),
        status="pendente",
    )
    registrar_historico(
        os_obj,
        "criacao",
        "O.S. Criada",
        "Ordem de Serviço aberta no sistema.",
        request,
    )
    return os_obj


def finalizar_os(os_obj, request=None):
    """Marca a OS como concluída e registra evento."""
    os_obj.status = "concluido"
    os_obj.save(update_fields=["status", "atualizado_em"])
    registrar_historico(
        os_obj,
        "conclusao",
        "O.S. Finalizada",
        "Serviço concluído e veículo liberado.",
        request,
    )
    return os_obj
