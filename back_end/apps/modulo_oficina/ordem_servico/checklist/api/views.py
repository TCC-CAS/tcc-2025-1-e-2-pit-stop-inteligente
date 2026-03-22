from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from apps.modulo_oficina.models import ChecklistRecebimento, OrdemServico

class ChecklistAPIView(APIView):
    def get(self, request, os_id):
        try:
            checklist = ChecklistRecebimento.objects.get(os_id=os_id)
            return Response({
                'concluido': checklist.concluido,
                'assinatura_cliente': checklist.assinatura_cliente,
                'assinatura_tecnico': checklist.assinatura_tecnico,
                'criado_em': checklist.criado_em
            }, status=status.HTTP_200_OK)
        except ChecklistRecebimento.DoesNotExist:
            # CORREÇÃO DO 404: Em vez de HTTP_404_NOT_FOUND, retornamos 200 OK.
            # Assim, o frontend do JavaScript entende que não está concluído, mas sem gerar erros vermelhos no console.
            return Response({'concluido': False}, status=status.HTTP_200_OK)

    def post(self, request, os_id):
        dados = request.data
        checklist, created = ChecklistRecebimento.objects.update_or_create(
            os_id=os_id,
            defaults={
                'concluido': dados.get('concluido', True),
                'assinatura_cliente': dados.get('assinatura_cliente'),
                'assinatura_tecnico': dados.get('assinatura_tecnico')
            }
        )
        # Se checklist foi concluído, atualiza status da OS para 'em_execucao' (ou próximo estágio)
        if checklist.concluido:
            OrdemServico.objects.filter(id=os_id).update(status='em_execucao')
            
        return Response({'concluido': checklist.concluido}, status=status.HTTP_200_OK)