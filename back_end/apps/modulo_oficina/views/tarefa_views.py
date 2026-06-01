"""Views de tarefas de execução."""
from rest_framework import status
from rest_framework.generics import RetrieveUpdateDestroyAPIView
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from ..models import OrdemServico, TarefaExecucao
from ..permissions import IsTecnicoOuLeitura
from ..serializers import TarefaExecucaoSerializer
from ..utils import get_oficina_atual


class TarefaExecucaoAPIView(APIView):
    """Tarefas de execução — leitura geral, escrita por técnicos+."""
    permission_classes = [IsTecnicoOuLeitura]

    def get(self, request, os_id):
        get_object_or_404(
            OrdemServico, id=os_id, oficina=get_oficina_atual(request)
        )
        tarefas = TarefaExecucao.objects.filter(os_id=os_id)
        return Response(
            TarefaExecucaoSerializer(tarefas, many=True).data,
            status=status.HTTP_200_OK,
        )

    def post(self, request, os_id):
        get_object_or_404(
            OrdemServico, id=os_id, oficina=get_oficina_atual(request)
        )
        dados = request.data.copy()
        dados["os_id"] = os_id

        serializer = TarefaExecucaoSerializer(data=dados)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TarefaExecucaoDetalheAPIView(RetrieveUpdateDestroyAPIView):
    serializer_class = TarefaExecucaoSerializer
    permission_classes = [IsTecnicoOuLeitura]

    def get_queryset(self):
        return TarefaExecucao.objects.filter(os_id=self.kwargs["os_id"])
