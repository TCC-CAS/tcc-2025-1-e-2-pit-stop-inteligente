"""Endpoints de cobrança de Ordem de Serviço.

Duas variantes do mesmo recurso, com autenticação distinta:

  - **Funcionário da oficina** (`POST /api/pagamentos/os/<os_id>/checkout/`):
    gera o link e devolve para a tela da OS no painel da oficina.

  - **Cliente final** (`GET /api/pagamentos/cliente/os/<os_id>/checkout/`):
    usado pelo portal do cliente. Reaproveita o pagamento pendente se já
    existir, ou cria um novo.

Reutilizamos a mesma camada de service (`pagamento_os_service`); muda
apenas a autenticação e o ownership check.
"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.modulo_cliente.permissions import (
    ClienteSessionAuthentication,
    IsClienteAutenticado,
)
from apps.modulo_cliente.utils import get_os_do_cliente
from apps.modulo_oficina.models import OrdemServico
from apps.modulo_oficina.utils import get_oficina_atual

from ..permissions import IsOperacional
from ..services.abacatepay_client import (
    AbacatePayAPIError,
    AbacatePayConfigError,
)
from ..services.pagamento_os_service import (
    iniciar_checkout_os,
    obter_pagamento_pendente_os,
)
from ..services.valor_service import calcular_valor_os_centavos


def _resposta_checkout(resultado) -> Response:
    return Response(
        {
            "pagamento_id": resultado.pagamento_id,
            "external_id": resultado.external_id,
            "abacatepay_id": resultado.abacatepay_id,
            "url_checkout": resultado.url_checkout,
            "valor_centavos": resultado.valor_centavos,
            "descricao": resultado.descricao,
        },
        status=status.HTTP_201_CREATED,
    )


def _erro_integracao(exc: Exception, http_status: int) -> Response:
    mensagem = getattr(exc, "mensagem_usuario", None) or "Falha ao iniciar checkout no AbacatePay."
    return Response(
        {
            "erro": mensagem,
            "detalhe": str(exc),
            "status_upstream": getattr(exc, "status_code", 0),
        },
        status=http_status,
    )


class CriarCheckoutOSAPIView(APIView):
    """POST /api/pagamentos/os/<os_id>/checkout/

    Cria (ou reaproveita) o checkout para uma OS da oficina logada.
    Restrito a funcionários operacionais (admin/gerente/atendente).
    """

    permission_classes = [IsOperacional]

    def post(self, request, os_id):
        oficina = get_oficina_atual(request)
        if oficina is None:
            return Response(
                {"erro": "Oficina não selecionada."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        os_obj = OrdemServico.objects.filter(pk=os_id, oficina=oficina).first()
        if os_obj is None:
            return Response(
                {"erro": "OS não encontrada nesta oficina."},
                status=status.HTTP_404_NOT_FOUND,
            )

        metodos = request.data.get("metodos") if hasattr(request, "data") else None
        forcar_novo = bool(request.data.get("forcar_novo")) if hasattr(request, "data") else False

        try:
            resultado = iniciar_checkout_os(
                os=os_obj,
                usuario=request.user if request.user.is_authenticated else None,
                metodos=metodos,
                forcar_novo=forcar_novo,
            )
        except AbacatePayConfigError as exc:
            return _erro_integracao(exc, status.HTTP_503_SERVICE_UNAVAILABLE)
        except AbacatePayAPIError as exc:
            return _erro_integracao(exc, status.HTTP_502_BAD_GATEWAY)
        except ValueError as exc:
            return Response({"erro": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return _resposta_checkout(resultado)


class CheckoutOSPortalClienteAPIView(APIView):
    """GET /api/pagamentos/cliente/os/<os_id>/checkout/

    Usado pelo portal do cliente. Devolve detalhes do pagamento da OS:
    URL do checkout, valor, status. Cria um novo caso ainda não exista.

    O ownership check é feito por `get_os_do_cliente`, que retorna 404
    se a OS não pertencer ao cliente logado.
    """

    authentication_classes = [ClienteSessionAuthentication]
    permission_classes = [IsClienteAutenticado]

    def get(self, request, os_id):
        os_obj = get_os_do_cliente(request, os_id)
        valor = calcular_valor_os_centavos(os_obj)
        if valor <= 0:
            return Response(
                {
                    "erro": "Sua OS ainda não possui itens aprovados para cobrança.",
                    "valor_centavos": 0,
                    "valor_reais": 0.0,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        pendente = obter_pagamento_pendente_os(os_obj)
        if pendente and pendente.abacatepay_url:
            return Response(
                {
                    "pagamento_id": pendente.id,
                    "external_id": str(pendente.external_id),
                    "abacatepay_id": pendente.abacatepay_id,
                    "url_checkout": pendente.abacatepay_url,
                    "valor_centavos": pendente.valor_centavos,
                    "valor_reais": pendente.valor_reais,
                    "descricao": pendente.descricao,
                    "criado_em": pendente.criado_em,
                }
            )

        try:
            resultado = iniciar_checkout_os(os=os_obj)
        except AbacatePayConfigError as exc:
            return _erro_integracao(exc, status.HTTP_503_SERVICE_UNAVAILABLE)
        except AbacatePayAPIError as exc:
            return _erro_integracao(exc, status.HTTP_502_BAD_GATEWAY)
        except ValueError as exc:
            return Response({"erro": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return _resposta_checkout(resultado)
