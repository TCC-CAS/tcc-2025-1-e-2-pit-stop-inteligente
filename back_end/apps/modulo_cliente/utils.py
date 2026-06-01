"""Utilitários internos do modulo_cliente."""
import re

from django.shortcuts import get_object_or_404

from apps.modulo_oficina.models import Cliente, HistoricoOS, OrdemServico

from .permissions import get_cliente_session_id


def somente_digitos(valor):
    """Remove tudo que não é dígito (útil para CPF/CNPJ vindo do front)."""
    return re.sub(r"\D", "", (valor or "").strip())


def get_cliente_atual(request):
    """Recupera o cliente da sessão. Retorna None se não houver."""
    cliente_id = get_cliente_session_id(request)
    if cliente_id is None:
        return None
    return Cliente.objects.filter(id=cliente_id).select_related("oficina").first()


def get_os_do_cliente(request, os_id):
    """Carrega uma OS garantindo que pertence ao cliente da sessão.

    Lança 404 se a OS não existir, não pertencer ao cliente, ou se não
    houver cliente em sessão. Isso evita expor o id da OS para terceiros.
    """
    cliente_id = get_cliente_session_id(request)
    if cliente_id is None:
        # Forçando 404 para não vazar "existe mas você não vê"
        return get_object_or_404(OrdemServico, id=os_id, cliente_id=-1)
    return get_object_or_404(OrdemServico, id=os_id, cliente_id=cliente_id)


def registrar_evento_cliente(os_obj, tipo, descricao, detalhes=""):
    """Cria um registro de histórico marcado como ação do cliente.

    O cliente não é `User`, portanto `usuario` fica como None — o
    `HistoricoOSSerializer` já trata isso retornando "Sistema". Adicionamos
    a marca "(Cliente)" no detalhe para auditoria humana.
    """
    detalhes_com_origem = (
        f"{detalhes}\n\n— Registro originado pelo portal do cliente."
        if detalhes
        else "Registro originado pelo portal do cliente."
    )
    return HistoricoOS.objects.create(
        os=os_obj,
        tipo=tipo,
        descricao=descricao,
        detalhes=detalhes_com_origem,
        usuario=None,
    )
