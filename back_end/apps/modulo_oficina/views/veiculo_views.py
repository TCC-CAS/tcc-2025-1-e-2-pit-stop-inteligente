"""Views relacionadas a veículos."""
from rest_framework import filters, status
from rest_framework.generics import ListCreateAPIView
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from ..models import ChecklistRecebimento, Cliente, OrdemServico, Veiculo
from ..permissions import IsFuncionario, IsOperacionalOuLeitura
from ..serializers import VeiculoSerializer
from ..utils import get_oficina_atual


class VeiculoListAPIView(ListCreateAPIView):
    """GET: lista veículos (qualquer funcionário). POST: cria veículo (operacional)."""

    serializer_class = VeiculoSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["placa"]
    permission_classes = [IsOperacionalOuLeitura]

    def get_queryset(self):
        return Veiculo.objects.filter(
            cliente__oficina=get_oficina_atual(self.request)
        )

    def create(self, request, *args, **kwargs):
        cliente_id = request.data.get("cliente")
        cliente = get_object_or_404(
            Cliente, pk=cliente_id, oficina=get_oficina_atual(request),
        )
        # Garante que o veículo pertença ao cliente da oficina ativa
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(cliente=cliente)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class VeiculoHistoricoAPIView(APIView):
    """Histórico de OS associadas a um veículo, com resumo do checklist."""
    permission_classes = [IsFuncionario]

    def get(self, request, veiculo_id):
        oficina = get_oficina_atual(request)
        veiculo = get_object_or_404(
            Veiculo, id=veiculo_id, cliente__oficina=oficina
        )
        ordens = OrdemServico.objects.filter(
            veiculo=veiculo, oficina=oficina
        ).order_by("-criado_em")

        resultado = []
        for os_obj in ordens:
            resultado.append({
                "id": os_obj.id,
                "status": os_obj.status,
                "km_atual": os_obj.km_atual,
                "criado_em": os_obj.criado_em,
                "checklist": self._resumo_checklist(os_obj),
            })

        return Response(resultado)

    @staticmethod
    def _resumo_checklist(os_obj):
        try:
            checklist = os_obj.checklist
        except ChecklistRecebimento.DoesNotExist:
            return None

        return {
            "concluido": checklist.concluido,
            "data_recebimento": checklist.data_recebimento,
            "consultor": checklist.consultor,
            "nivel_combustivel": checklist.nivel_combustivel,
            "observacoes_iniciais": checklist.observacoes_iniciais,
        }
