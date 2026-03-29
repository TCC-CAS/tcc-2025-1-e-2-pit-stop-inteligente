from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.generics import ListAPIView, RetrieveAPIView, DestroyAPIView
from .models import Cliente, Veiculo, OrdemServico, ItemOrcamento
from .serializers import (OrdemServicoSerializer, OrdemServicoListaSerializer, 
                          ItemOrcamentoSerializer, ClienteSerializer, VeiculoSerializer)
from .models import Cliente
from .serializers import ClienteSerializer

class ClienteListCreateAPIView(generics.ListCreateAPIView):
    """
    GET: Lista todos os clientes (com suporte a busca por nome ou CPF).
    POST: Cria um novo cliente.
    """
    queryset = Cliente.objects.all()
    serializer_class = ClienteSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    search_fields = ['nome', 'cpf_cnpj', 'telefone']  # Permite buscar na barra de pesquisa

class ClienteRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET: Retorna os detalhes de um cliente específico.
    PUT/PATCH: Atualiza um cliente.
    DELETE: Exclui um cliente.
    """
    queryset = Cliente.objects.all()
    serializer_class = ClienteSerializer

class CriarOrdemServicoAPIView(APIView):
    def post(self, request):
        dados = request.data

        # 1. Cliente
        cliente, _ = Cliente.objects.get_or_create(
            cpf_cnpj=dados.get('cpf_cnpj'),
            defaults={
                'nome': dados.get('nome_cliente'),
                'telefone': dados.get('telefone', '')
            }
        )

        # 2. Veículo (agora inclui ano e cor)
        veiculo, _ = Veiculo.objects.get_or_create(
            placa=dados.get('placa'),
            defaults={
                'cliente': cliente,
                'modelo': dados.get('modelo', 'Não informado'),
                'ano': dados.get('ano'),          # <-- novo campo
                'cor': dados.get('cor')           # <-- novo campo
            }
        )

        # 3. OS
        nova_os = OrdemServico.objects.create(
            veiculo=veiculo,
            km_atual=dados.get('km_atual', 0),
            status='pendente'
        )

        return Response({
            "mensagem": "OS Criada com sucesso!",
            "os_id": nova_os.id,
            "veiculo": veiculo.modelo,
            "placa": veiculo.placa
        }, status=status.HTTP_201_CREATED)

class ListarOrdensServicoAPIView(ListAPIView):
    queryset = OrdemServico.objects.all().order_by('-criado_em')
    serializer_class = OrdemServicoListaSerializer

class DetalheOrdemServicoAPIView(RetrieveAPIView):
    queryset = OrdemServico.objects.all()
    serializer_class = OrdemServicoSerializer

class ExcluirOrdemServicoAPIView(DestroyAPIView):
    """
    View para excluir uma Ordem de Serviço.
    Herda de DestroyAPIView que já implementa o método DELETE.
    """
    queryset = OrdemServico.objects.all()
    serializer_class = OrdemServicoSerializer
    # permission_classes = [IsAuthenticated]  # Descomente se necessário

    def delete(self, request, *args, **kwargs):
        """
        Opcional: personalizar a resposta após a exclusão.
        """
        try:
            instance = self.get_object()
            self.perform_destroy(instance)
            return Response(
                {"mensagem": "OS excluída com sucesso."},
                status=status.HTTP_200_OK
            )
        except OrdemServico.DoesNotExist:
            return Response(
                {"erro": "OS não encontrada."},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"erro": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class AprovacaoAPIView(APIView):
    def post(self, request, os_id):
        itens_aprovados = request.data.get('itens', [])
        for item in itens_aprovados:
            ItemOrcamento.objects.filter(id=item['id'], os_id=os_id).update(status_aprovacao=item['status'])
        return Response({"mensagem": "Status de aprovação atualizado com sucesso!"}, status=status.HTTP_200_OK)

class FinalizarOSAPIView(APIView):
    def post(self, request, os_id):
        try:
            os = OrdemServico.objects.get(id=os_id)
            os.status = 'concluido'
            os.save()
            return Response({"mensagem": "OS finalizada com sucesso!"})
        except OrdemServico.DoesNotExist:
            return Response({"erro": "OS não encontrada"}, status=status.HTTP_404_NOT_FOUND)