"""Regras de negócio do checklist no portal do cliente.

O cliente NÃO altera o conteúdo do checklist — apenas adiciona a sua
assinatura digital (dataURL gerado por um <canvas>). Demais campos
permanecem como foram registrados pelo técnico.
"""
from apps.modulo_oficina.models import ChecklistRecebimento

from ..utils import registrar_evento_cliente


_MAX_ASSINATURA_BYTES = 500_000  # ~500 KB cobre canvas 600x300 em PNG.


def assinar_checklist_cliente(os_obj, assinatura_data_url):
    """Persiste a assinatura do cliente no checklist da OS.

    Lança ValueError se faltar checklist ou se a assinatura for inválida.
    """
    assinatura = (assinatura_data_url or "").strip()
    if not assinatura:
        raise ValueError("Assinatura vazia. Desenhe sua assinatura antes de salvar.")
    if not assinatura.startswith("data:image/"):
        raise ValueError("Formato de assinatura inválido.")
    if len(assinatura) > _MAX_ASSINATURA_BYTES:
        raise ValueError("Assinatura excede o tamanho permitido.")

    try:
        checklist = ChecklistRecebimento.objects.get(os=os_obj)
    except ChecklistRecebimento.DoesNotExist:
        raise ValueError("Checklist ainda não está disponível para assinatura.")

    checklist.assinatura_cliente = assinatura
    checklist.save(update_fields=["assinatura_cliente", "atualizado_em"])

    registrar_evento_cliente(
        os_obj,
        "checklist",
        "Cliente assinou o checklist",
        "O cliente registrou sua assinatura digital no checklist de recebimento.",
    )
    return checklist
