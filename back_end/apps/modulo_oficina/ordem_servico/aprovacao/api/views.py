from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from apps.modulo_oficina.models import OrdemServico, ItemOrcamento
from apps.modulo_oficina.serializers import OrdemServicoSerializer, ItemOrcamentoSerializer

class ResumoAprovacaoOSAPIView(APIView):
    """Recupera os dados da O.S. e a lista de itens do orçamento"""
    def get(self, request, os_id):
        try:
            os = OrdemServico.objects.get(id=os_id)
        except OrdemServico.DoesNotExist:
            return Response(
                {'erro': f'Ordem de Serviço {os_id} não encontrada.'},
                status=status.HTTP_404_NOT_FOUND
            )

        itens = ItemOrcamento.objects.filter(os_id=os_id)

        return Response({
            'ordem_servico': OrdemServicoSerializer(os).data,
            'itens': ItemOrcamentoSerializer(itens, many=True).data
        }, status=status.HTTP_200_OK)


class AtualizarStatusItemAPIView(APIView):
    """Aprova ou rejeita (individualmente) um item do orçamento"""
    def patch(self, request, os_id, item_id):
        try:
            item = ItemOrcamento.objects.get(id=item_id, os_id=os_id)
        except ItemOrcamento.DoesNotExist:
            return Response(
                {'erro': 'Item não encontrado.'},
                status=status.HTTP_404_NOT_FOUND
            )

        novo_status = request.data.get('status_aprovacao')
        if novo_status not in ['aprovado', 'reprovado', 'pendente']:
            return Response(
                {'erro': 'Status inválido.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        item.status_aprovacao = novo_status
        item.save()

        return Response(
            {'mensagem': 'Status atualizado!', 'status': novo_status},
            status=status.HTTP_200_OK
        )


class AprovarOrcamentoCompletoAPIView(APIView):
    """Aprova todos os itens pendentes do orçamento e valida o Checkbox"""
    def post(self, request, os_id):
        termo_aceito = request.data.get('termo_aceito', False)

        if not termo_aceito:
            return Response(
                {'erro': 'É obrigatório confirmar a leitura no checkbox.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            os = OrdemServico.objects.get(id=os_id)
        except OrdemServico.DoesNotExist:
            return Response(
                {'erro': 'Ordem de Serviço não encontrada.'},
                status=status.HTTP_404_NOT_FOUND
            )

        itens = ItemOrcamento.objects.filter(os_id=os_id).exclude(status_aprovacao='aprovado')
        if not itens.exists():
            return Response(
                {'mensagem': 'Todos os itens já foram avaliados.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        itens.update(status_aprovacao='aprovado')
        os.status = 'aprovado'
        os.save()

        return Response(
            {'mensagem': 'Orçamento aprovado com sucesso!'},
            status=status.HTTP_200_OK
        )