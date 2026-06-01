"""Cálculo de valores para cobrança de OS.

O valor a cobrar do cliente é a soma dos itens de orçamento APROVADOS:
quantidade × valor_unitário. Itens pendentes ou reprovados são ignorados.

A unidade é centavos (PositiveInteger) para evitar imprecisão de float e
para casar com o formato esperado pelo AbacatePay.
"""
from __future__ import annotations

from decimal import Decimal

from apps.modulo_oficina.models import ItemOrcamento, OrdemServico


def calcular_valor_os_centavos(os: OrdemServico) -> int:
    """Soma o valor de todos os itens aprovados da OS, em centavos."""
    total = Decimal("0")
    qs = ItemOrcamento.objects.filter(os=os, status_aprovacao="aprovado")
    for item in qs:
        if item.valor_unitario is None or not item.quantidade:
            continue
        total += Decimal(item.quantidade) * Decimal(item.valor_unitario)
    return int(round(total * 100))


def descricao_curta_os(os: OrdemServico) -> str:
    """Descrição usada no checkout AbacatePay (limite ~200 chars)."""
    cliente_nome = getattr(os.cliente, "nome", "") if os.cliente_id else ""
    veiculo = ""
    if os.veiculo_id:
        modelo = getattr(os.veiculo, "modelo", "")
        placa = getattr(os.veiculo, "placa", "")
        veiculo = f"{modelo} ({placa})".strip()
    base = f"OS #{os.id}"
    if cliente_nome:
        base += f" — {cliente_nome}"
    if veiculo:
        base += f" — {veiculo}"
    return base[:200]
