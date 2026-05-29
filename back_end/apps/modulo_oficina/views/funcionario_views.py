"""Views de gerenciamento de funcionários da oficina.

Apenas o administrador da oficina (papel 'admin') pode listar/criar/editar/
excluir funcionários — é a fronteira de "controle da conta SaaS".
"""
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView

from ..models import Funcionario
from ..permissions import IsAdmin
from ..serializers import FuncionarioSerializer
from ..utils import get_oficina_atual


class FuncionarioListCreateAPIView(ListCreateAPIView):
    serializer_class = FuncionarioSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        return Funcionario.objects.filter(
            oficina=get_oficina_atual(self.request),
            is_active=True,
        ).select_related("user")

    def perform_create(self, serializer):
        serializer.save(oficina=get_oficina_atual(self.request))


class FuncionarioRetrieveUpdateDestroyAPIView(RetrieveUpdateDestroyAPIView):
    serializer_class = FuncionarioSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        return Funcionario.objects.filter(
            oficina=get_oficina_atual(self.request)
        )
