"""Endpoint público para receber webhooks do AbacatePay.

Características de segurança:
  - isento de CSRF (chamado externamente, sem cookie/sessão);
  - sem autenticação por sessão; a confiança vem da assinatura HMAC
    validada pelo `webhook_service`;
  - body cru é preservado para HMAC: usamos `request.body` direto, sem
    deixar o DRF parsear antes de assinar.

Sempre devolvemos 200 (mesmo para eventos não mapeados) para evitar
retries infinitos do provedor — exceto quando a assinatura falha, caso
em que devolvemos 401.
"""
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from ..services.webhook_service import processar_webhook


@method_decorator(csrf_exempt, name="dispatch")
class WebhookAbacatePayAPIView(APIView):
    """POST /api/pagamentos/webhook/abacatepay/"""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        resultado = processar_webhook(
            body_bytes=request.body or b"",
            meta=request.META,
        )

        if not resultado.aceito and resultado.detalhe == "assinatura inválida.":
            return Response(
                {"erro": "Assinatura inválida.", "detalhe": resultado.detalhe},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not resultado.aceito:
            return Response(
                {"erro": "Payload inválido.", "detalhe": resultado.detalhe},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "duplicado": resultado.duplicado,
                "assinatura_valida": resultado.assinatura_valida,
                "evento": resultado.evento,
                "pagamento_id": resultado.pagamento_id,
                "detalhe": resultado.detalhe,
            },
            status=status.HTTP_200_OK,
        )
