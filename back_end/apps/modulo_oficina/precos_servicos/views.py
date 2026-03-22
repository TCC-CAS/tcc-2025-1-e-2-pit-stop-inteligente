# back_end/apps/modulo_oficina/precos_servicos/views.py
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView, RetrieveUpdateAPIView
from rest_framework.response import Response
from rest_framework import status
from ..models import ConfiguracaoOficina, CategoriaVeiculo, Servico
from .serializers import (
    ConfiguracaoOficinaSerializer,
    CategoriaVeiculoSerializer,
    ServicoSerializer
)

# --- Views para Serviços ---
class ServicoListCreateView(ListCreateAPIView):
    queryset = Servico.objects.all().order_by('nome')
    serializer_class = ServicoSerializer

class ServicoRetrieveUpdateDestroyView(RetrieveUpdateDestroyAPIView):
    queryset = Servico.objects.all()
    serializer_class = ServicoSerializer

# --- Views para Categorias de Veículos ---
class CategoriaVeiculoListCreateView(ListCreateAPIView):
    queryset = CategoriaVeiculo.objects.all().order_by('nome')
    serializer_class = CategoriaVeiculoSerializer

class CategoriaVeiculoRetrieveUpdateDestroyView(RetrieveUpdateDestroyAPIView):
    queryset = CategoriaVeiculo.objects.all()
    serializer_class = CategoriaVeiculoSerializer

# --- View para Configuração (valor hora) ---
class ConfiguracaoOficinaView(RetrieveUpdateAPIView):
    queryset = ConfiguracaoOficina.objects.all()
    serializer_class = ConfiguracaoOficinaSerializer

    def get_object(self):
        # Garante que exista um único registro de configuração
        obj, created = ConfiguracaoOficina.objects.get_or_create(id=1)
        if created:
            # Define um valor padrão, se necessário
            obj.valor_hora = 150.00
            obj.save()
        return obj

    def put(self, request, *args, **kwargs):
        # Atualiza o valor hora
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def patch(self, request, *args, **kwargs):
        return self.put(request, *args, **kwargs)