"""Endpoints genéricos de pagamento (consulta de status)."""
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import Pagamento
from ..serializers import PagamentoSerializer
from ..services.sincronizacao_service import sincronizar_pagamento_pendente


class StatusPagamentoAPIView(APIView):
    """GET /api/pagamentos/<external_id>/status/

    Endpoint público (mas obscuro por UUID) usado pelo front para fazer
    polling enquanto aguarda a confirmação. Além de ler o banco, dispara
    a reconciliação ativa: se o pagamento ainda está pendente, consulta o
    AbacatePay e aplica o status real — assim funciona mesmo quando o
    webhook não chega (ex.: ambiente local sem URL pública).

    Aceita o `external_id` (UUID) para não vazar a chave primária
    sequencial e permitir consulta sem sessão autenticada (o pagador
    pode estar em um navegador sem login).
    """

    permission_classes = [AllowAny]

    def get(self, request, external_id):
        pagamento = Pagamento.objects.filter(external_id=external_id).first()
        if pagamento is None:
            return Response(
                {"erro": "Pagamento não encontrado."},
                status=status.HTTP_404_NOT_FOUND,
            )
        pagamento = sincronizar_pagamento_pendente(pagamento)
        return Response(PagamentoSerializer(pagamento).data)
