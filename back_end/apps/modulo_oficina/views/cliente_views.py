"""Views relacionadas a clientes da oficina."""
from rest_framework import filters
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from ..models import Cliente, Veiculo
from ..permissions import IsFuncionario, IsOperacionalOuLeitura
from ..serializers import ClienteSerializer, VeiculoSerializer
from ..utils import get_oficina_atual


class ClienteListCreateAPIView(ListCreateAPIView):
    """Lista clientes (qualquer funcionário) e cria (apenas operacional)."""
    serializer_class = ClienteSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["nome", "cpf_cnpj", "telefone", "email"]
    permission_classes = [IsOperacionalOuLeitura]

    def get_queryset(self):
        return Cliente.objects.filter(
            oficina=get_oficina_atual(self.request)
        ).order_by("nome")

    def perform_create(self, serializer):
        serializer.save(oficina=get_oficina_atual(self.request))


class ClienteRetrieveUpdateDestroyAPIView(RetrieveUpdateDestroyAPIView):
    serializer_class = ClienteSerializer
    permission_classes = [IsOperacionalOuLeitura]

    def get_queryset(self):
        return Cliente.objects.filter(oficina=get_oficina_atual(self.request))

    def update(self, request, *args, **kwargs):
        # partial=True permite ignorar campos extras enviados pelo front-end.
        kwargs["partial"] = True
        return super().update(request, *args, **kwargs)


class ClienteVeiculosAPIView(APIView):
    """Lista todos os veículos de um cliente específico da oficina logada."""
    permission_classes = [IsFuncionario]

    def get(self, request, cliente_id):
        cliente = get_object_or_404(
            Cliente, id=cliente_id, oficina=get_oficina_atual(request)
        )
        veiculos = Veiculo.objects.filter(cliente=cliente).order_by("-atualizado_em")
        return Response(VeiculoSerializer(veiculos, many=True).data)
