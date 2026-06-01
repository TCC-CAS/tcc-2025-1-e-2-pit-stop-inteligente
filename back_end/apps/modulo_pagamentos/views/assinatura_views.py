"""Endpoints de assinatura SaaS da oficina."""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.modulo_oficina.utils import get_oficina_atual

from ..permissions import IsAdmin, IsFuncionario
from ..serializers import (
    AssinaturaOficinaSerializer,
    IniciarCheckoutAssinaturaSerializer,
)
from ..services.abacatepay_client import (
    AbacatePayAPIError,
    AbacatePayConfigError,
)
from ..services.assinatura_service import (
    iniciar_checkout_assinatura,
    obter_ou_criar_assinatura,
)


class StatusAssinaturaAPIView(APIView):
    """GET /api/pagamentos/assinatura/status/

    Devolve o estado atual da assinatura da oficina logada. Usado pela
    aba "Renovação de Plano" para exibir plano vigente, vencimento e
    bloqueios.
    """

    permission_classes = [IsFuncionario]

    def get(self, request):
        oficina = get_oficina_atual(request)
        if oficina is None:
            return Response(
                {"erro": "Oficina não selecionada."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        assinatura = obter_ou_criar_assinatura(oficina)
        return Response(AssinaturaOficinaSerializer(assinatura).data)


class CriarCheckoutAssinaturaAPIView(APIView):
    """POST /api/pagamentos/assinatura/checkout/

    Body: ``{"plano": "premium", "metodos": ["PIX", "CARD", "BOLETO"]}``

    Cria um checkout AbacatePay e devolve a URL hospedada para a oficina
    pagar. Restrito a usuário admin (decisão financeira).
    """

    permission_classes = [IsAdmin]

    def post(self, request):
        oficina = get_oficina_atual(request)
        if oficina is None:
            return Response(
                {"erro": "Oficina não selecionada."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = IniciarCheckoutAssinaturaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        dados = serializer.validated_data

        try:
            resultado = iniciar_checkout_assinatura(
                oficina=oficina,
                plano_codigo=dados["plano"],
                metodos=dados.get("metodos"),
                usuario=request.user if request.user.is_authenticated else None,
            )
        except AbacatePayConfigError as exc:
            return Response(
                {"erro": "Integração AbacatePay não configurada.", "detalhe": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except AbacatePayAPIError as exc:
            return Response(
                {
                    "erro": exc.mensagem_usuario,
                    "detalhe": str(exc),
                    "status_upstream": exc.status_code,
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except ValueError as exc:
            return Response(
                {"erro": str(exc)}, status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "pagamento_id": resultado.pagamento_id,
                "external_id": resultado.external_id,
                "abacatepay_id": resultado.abacatepay_id,
                "url_checkout": resultado.url_checkout,
                "valor_centavos": resultado.valor_centavos,
                "plano": resultado.plano_codigo,
                "metodos": resultado.metodos,
            },
            status=status.HTTP_201_CREATED,
        )
