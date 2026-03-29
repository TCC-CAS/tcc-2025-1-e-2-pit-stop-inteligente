from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, generics, filters
from django_filters.rest_framework import DjangoFilterBackend

from .models import Cliente, Veiculo, OrdemServico, ItemOrcamento
from .serializers import (
    OrdemServicoSerializer,
    OrdemServicoListaSerializer,
    ItemOrcamentoSerializer,
    ClienteSerializer,
    VeiculoSerializer,
)

# ==========================================================
# CLIENTES
# ==========================================================
class ClienteListCreateAPIView(generics.ListCreateAPIView):
    queryset = Cliente.objects.all()
    serializer_class = ClienteSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    search_fields = ['nome', 'documento', 'telefone']


class ClienteRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Cliente.objects.all()
    serializer_class = ClienteSerializer


# ==========================================================
# ORDEM DE SERVIÇO (OS)
# ==========================================================
class CriarOrdemServicoAPIView(APIView):
    def post(self, request):
        dados = request.data

        # 1. Recupera ou cria cliente
        cliente, _ = Cliente.objects.get_or_create(
            documento=dados.get('documento', dados.get('cpf_cnpj', '')),
            defaults={
                'nome': dados.get('nome_cliente'),
                'telefone': dados.get('telefone', '')
            }
        )

        # 2. Recupera ou cria veículo
        veiculo, _ = Veiculo.objects.get_or_create(
            placa=dados.get('placa'),
            defaults={
                'cliente': cliente,
                'modelo': dados.get('modelo', 'Não informado'),
                'ano': dados.get('ano'),
                'cor': dados.get('cor')
            }
        )

        # 3. Cria OS
        nova_os = OrdemServico.objects.create(
            veiculo=veiculo,
            km_atual=dados.get('km_atual', 0),
            status='pendente'
        )

        return Response(
            {
                "mensagem": "OS Criada com sucesso!",
                "os_id": nova_os.id,
                "veiculo": veiculo.modelo,
                "placa": veiculo.placa
            },
            status=status.HTTP_201_CREATED
        )


class ListarOrdensServicoAPIView(generics.ListAPIView):
    queryset = OrdemServico.objects.all().order_by('-criado_em')
    serializer_class = OrdemServicoListaSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    search_fields = ['veiculo__placa', 'veiculo__cliente__nome', 'id']


class OrdemServicoRetrieveAPIView(generics.RetrieveAPIView):
    queryset = OrdemServico.objects.all()
    serializer_class = OrdemServicoSerializer


class OrdemServicoDestroyAPIView(generics.DestroyAPIView):
    queryset = OrdemServico.objects.all()

    def destroy(self, request, *args, **kwargs):
        try:
            instance = self.get_object()
            self.perform_destroy(instance)
            return Response(
                {"mensagem": "OS excluída com sucesso."},
                status=status.HTTP_200_OK
            )
        except Exception as e:
            return Response(
                {"erro": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ==========================================================
# APROVAÇÃO & FINALIZAÇÃO
# ==========================================================
class AprovacaoAPIView(APIView):
    def post(self, request, os_id):
        itens_aprovados = request.data.get('itens', [])
        for item in itens_aprovados:
            ItemOrcamento.objects.filter(
                id=item['id'],
                os_id=os_id
            ).update(status_aprovacao=item['status'])

        return Response(
            {"mensagem": "Status de aprovação atualizado com sucesso!"},
            status=status.HTTP_200_OK
        )


class FinalizarOSAPIView(APIView):
    def post(self, request, os_id):
        try:
            os = OrdemServico.objects.get(id=os_id)
            os.status = 'concluido'
            os.save()
            return Response(
                {"mensagem": "Ordem de Serviço finalizada com sucesso!"},
                status=status.HTTP_200_OK
            )
        except OrdemServico.DoesNotExist:
            return Response(
                {"erro": "OS não encontrada."},
                status=status.HTTP_404_NOT_FOUND
            )
