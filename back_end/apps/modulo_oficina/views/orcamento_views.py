"""Views de itens de orçamento e aprovação da OS."""
from rest_framework import status
from rest_framework.generics import RetrieveUpdateDestroyAPIView
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from ..models import ItemOrcamento, OrdemServico
from ..permissions import IsFuncionario, IsOperacional, IsOperacionalOuLeitura
from ..serializers import ItemOrcamentoSerializer
from ..services import enviar_para_aprovacao, processar_aprovacao_orcamento
from ..utils import get_oficina_atual


class ItensOrcamentoAPIView(APIView):
    """Lista e cria itens de orçamento. Listar é livre; criar exige operacional."""
    permission_classes = [IsOperacionalOuLeitura]

    def get(self, request, os_id):
        get_object_or_404(
            OrdemServico, id=os_id, oficina=get_oficina_atual(request)
        )
        itens = ItemOrcamento.objects.filter(os_id=os_id)
        return Response(
            ItemOrcamentoSerializer(itens, many=True).data,
            status=status.HTTP_200_OK,
        )

    def post(self, request, os_id):
        os_obj = get_object_or_404(
            OrdemServico, id=os_id, oficina=get_oficina_atual(request)
        )

        dados = request.data.copy()
        dados["os"] = os_obj.id

        serializer = ItemOrcamentoSerializer(data=dados)
        if serializer.is_valid():
            serializer.save(os=os_obj)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AtualizarStatusItemAPIView(APIView):
    """Aprovação/reprovação granular de itens (sem termo de aceite)."""
    permission_classes = [IsOperacional]

    def patch(self, request, os_id):
        get_object_or_404(
            OrdemServico, id=os_id, oficina=get_oficina_atual(request)
        )
        for req_item in request.data.get("itens", []):
            ItemOrcamento.objects.filter(
                id=req_item["id"], os_id=os_id
            ).update(status_aprovacao=req_item["status"])
        return Response(
            {"mensagem": "Status dos itens atualizado!"},
            status=status.HTTP_200_OK,
        )


class ItemOrcamentoDetailAPIView(RetrieveUpdateDestroyAPIView):
    serializer_class = ItemOrcamentoSerializer
    permission_classes = [IsOperacionalOuLeitura]

    def get_queryset(self):
        return ItemOrcamento.objects.filter(os_id=self.kwargs["os_id"])


class AprovacaoAPIView(APIView):
    """Aprovação completa do orçamento. Exige termo de aceite e gera tarefas."""
    permission_classes = [IsOperacional]

    def post(self, request, os_id):
        os_obj = get_object_or_404(
            OrdemServico, id=os_id, oficina=get_oficina_atual(request)
        )

        if not request.data.get("termo_aceito"):
            return Response(
                {"erro": "É obrigatório confirmar o termo de aceite para aprovar o orçamento."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        processar_aprovacao_orcamento(
            os_obj=os_obj,
            itens_payload=request.data.get("itens", []),
            request=request,
        )
        return Response(
            {"mensagem": "Orçamento aprovado com sucesso!"},
            status=status.HTTP_200_OK,
        )


class EnviarAprovacaoAPIView(APIView):
    """POST /os/<id>/enviar-aprovacao/

    Encaminha o diagnóstico para a aba de Aprovação E para o portal do
    cliente em uma única ação:
        - reseta itens para `pendente`;
        - gera um código de acesso (com validade);
        - registra histórico;
        - retorna o código gerado para o front exibir/compartilhar.

    Body opcional:
        { "validade_dias": 7, "max_tentativas": 5 }
    """

    permission_classes = [IsOperacional]

    def post(self, request, os_id):
        os_obj = get_object_or_404(
            OrdemServico, id=os_id, oficina=get_oficina_atual(request)
        )
        try:
            codigo, itens = enviar_para_aprovacao(
                os_obj,
                request=request,
                validade_dias=int(request.data.get("validade_dias") or 7),
                max_tentativas=int(request.data.get("max_tentativas") or 5),
            )
        except ValueError as exc:
            return Response({"erro": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "mensagem": "Diagnóstico enviado para aprovação do cliente.",
            "total_itens": len(itens),
            "codigo": {
                "codigo": codigo.codigo,
                "expira_em": codigo.expira_em.strftime("%d/%m/%Y %H:%M"),
                "max_tentativas": codigo.max_tentativas,
            },
        }, status=status.HTTP_200_OK)
