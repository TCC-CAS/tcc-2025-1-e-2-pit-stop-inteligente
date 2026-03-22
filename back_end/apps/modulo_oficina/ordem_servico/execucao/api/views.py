from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from apps.modulo_oficina.models import TarefaExecucao
from .serializers import TarefaExecucaoSerializer

class TarefaExecucaoAPIView(APIView):
    def get(self, request, os_id):
        tarefas = TarefaExecucao.objects.filter(os_id=os_id)
        serializer = TarefaExecucaoSerializer(tarefas, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, os_id):
        serializer = TarefaExecucaoSerializer(data=request.data)
        if serializer.is_valid():
            # Passamos o os_id diretamente no momento de salvar no banco
            serializer.save(os_id=os_id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class TarefaExecucaoDetalheAPIView(APIView):
    def put(self, request, os_id, pk):
        tarefa = get_object_or_404(TarefaExecucao, pk=pk, os_id=os_id)
        # partial=True permite atualizar apenas o campo 'concluida' sem exigir a 'descricao'
        serializer = TarefaExecucaoSerializer(tarefa, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, os_id, pk):
        tarefa = get_object_or_404(TarefaExecucao, pk=pk, os_id=os_id)
        tarefa.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)