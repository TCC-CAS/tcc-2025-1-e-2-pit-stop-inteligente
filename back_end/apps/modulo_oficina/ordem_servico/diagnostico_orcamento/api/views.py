from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.generics import RetrieveUpdateDestroyAPIView
from apps.modulo_oficina.models import ItemOrcamento
from .serializers import ItemOrcamentoSerializer

class ItensOrcamentoAPIView(APIView):
    def get(self, request, os_id):
        itens = ItemOrcamento.objects.filter(os_id=os_id)
        serializer = ItemOrcamentoSerializer(itens, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, os_id):
        dados = request.data.copy()
        dados['os_id'] = os_id
        serializer = ItemOrcamentoSerializer(data=dados)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ItemOrcamentoDetailAPIView(RetrieveUpdateDestroyAPIView):
    serializer_class = ItemOrcamentoSerializer
    lookup_field = 'pk'

    def get_queryset(self):
        # Filtra pelo os_id para garantir que o item pertence à OS informada
        return ItemOrcamento.objects.filter(os_id=self.kwargs['os_id'])