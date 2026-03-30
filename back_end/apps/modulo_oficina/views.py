from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, filters
from rest_framework.generics import RetrieveUpdateDestroyAPIView, ListCreateAPIView, ListAPIView
from django.shortcuts import get_object_or_404

# Nossos Models
from .models import (Oficina, Cliente, Veiculo, OrdemServico, ItemOrcamento, 
                     ChecklistRecebimento, TarefaExecucao, Documento, HistoricoOS, 
                     Servico, ConfigPreco)

# Nossos Serializers
from .serializers import (OrdemServicoSerializer, OrdemServicoListaSerializer, 
                          ItemOrcamentoSerializer, ChecklistSerializer, 
                          TarefaExecucaoSerializer, DocumentoSerializer, 
                          HistoricoOSSerializer, ServicoSerializer, ClienteSerializer)

# ==========================================
# UTILITÁRIOS INTERNOS DA API
# ==========================================
def _get_oficina_atual(request):
    """Simula o usuário logado pegando a primeira oficina do banco."""
    oficina, _ = Oficina.objects.get_or_create(id=1, defaults={'nome': 'Pit Stop Padrão', 'cnpj': '00000000000'})
    return oficina

def _registrar_historico(os, tipo, descricao, detalhes="", request=None):
    """Gera a linha do tempo da OS automaticamente nos bastidores."""
    usuario_logado = request.user if request and request.user.is_authenticated else None
    HistoricoOS.objects.create(
        os=os, tipo=tipo, descricao=descricao, detalhes=detalhes, usuario=usuario_logado
    )

# ==========================================
# 0. CADASTRO DE CLIENTES
# ==========================================

class ClienteListCreateAPIView(ListCreateAPIView):
    serializer_class = ClienteSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['nome', 'cpf_cnpj', 'telefone', 'email'] # Permite busca rápida pelo front-end

    def get_queryset(self):
        return Cliente.objects.filter(oficina=_get_oficina_atual(self.request)).order_by('nome')

    def perform_create(self, serializer):
        serializer.save(oficina=_get_oficina_atual(self.request))

class ClienteRetrieveUpdateDestroyAPIView(RetrieveUpdateDestroyAPIView):
    serializer_class = ClienteSerializer
    
    def get_queryset(self):
        return Cliente.objects.filter(oficina=_get_oficina_atual(self.request))


# ==========================================
# 1. ORDEM DE SERVIÇO (CRUD)
# ==========================================

class CriarOrdemServicoAPIView(APIView):
    def post(self, request):
        dados = request.data
        oficina_atual = _get_oficina_atual(request)

        # 1. Busca ou cria Cliente (Autocomplete)
        # O get_or_create garante que se o JS mandar um cliente já existente, não haverá duplicidade
        cliente, _ = Cliente.objects.get_or_create(
            cpf_cnpj=dados.get('cpf_cnpj'), oficina=oficina_atual,
            defaults={'nome': dados.get('nome_cliente'), 'telefone': dados.get('telefone', '')}
        )

        # 2. Busca ou cria Veículo
        veiculo, _ = Veiculo.objects.get_or_create(
            placa=dados.get('placa'), cliente=cliente,
            defaults={
                'modelo': dados.get('modelo', 'Não informado'), 'marca': dados.get('marca'),
                'ano': dados.get('ano'), 'cor': dados.get('cor'), 'chassi': dados.get('chassi'),
                'tipo_uso': dados.get('tipo_uso', 'particular')
            }
        )

        # 3. Cria OS
        nova_os = OrdemServico.objects.create(
            oficina=oficina_atual, veiculo=veiculo, cliente=cliente,
            km_atual=dados.get('km_atual'), status='orcamento'
        )

        _registrar_historico(nova_os, 'criacao', 'O.S. Criada', 'Ordem de Serviço aberta no sistema.', request)
        
        serializer = OrdemServicoSerializer(nova_os)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ListarOrdensServicoAPIView(APIView):
    def get(self, request):
        ordens = OrdemServico.objects.filter(oficina=_get_oficina_atual(request)).order_by('-criado_em')
        serializer = OrdemServicoListaSerializer(ordens, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class DetalheOrdemServicoAPIView(APIView):
    def get(self, request, pk):
        os = get_object_or_404(OrdemServico, id=pk, oficina=_get_oficina_atual(request))
        serializer = OrdemServicoSerializer(os)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ExcluirOrdemServicoAPIView(APIView):
    def delete(self, request, pk):
        os = get_object_or_404(OrdemServico, id=pk, oficina=_get_oficina_atual(request))
        os.delete()
        return Response({"mensagem": "OS excluída com sucesso."}, status=status.HTTP_200_OK)


class FinalizarOSAPIView(APIView):
    def post(self, request, os_id):
        os = get_object_or_404(OrdemServico, id=os_id, oficina=_get_oficina_atual(request))
        os.status = 'concluido'
        os.save()
        _registrar_historico(os, 'conclusao', 'O.S. Finalizada', 'Serviço concluído e veículo liberado.', request)
        return Response({"mensagem": "OS finalizada!"}, status=status.HTTP_200_OK)


# ==========================================
# 2. CHECKLIST DE RECEBIMENTO
# ==========================================

class ChecklistAPIView(APIView):
    def get(self, request, os_id):
        os = get_object_or_404(OrdemServico, id=os_id, oficina=_get_oficina_atual(request))
        try:
            checklist = ChecklistRecebimento.objects.get(os=os)
            serializer = ChecklistSerializer(checklist)
            return Response(serializer.data)
        except ChecklistRecebimento.DoesNotExist:
            return Response({'concluido': False}, status=status.HTTP_200_OK)

    def post(self, request, os_id):
        os = get_object_or_404(OrdemServico, id=os_id, oficina=_get_oficina_atual(request))
        checklist, _ = ChecklistRecebimento.objects.update_or_create(
            os=os,
            defaults={
                'concluido': request.data.get('concluido', True),
                'assinatura_cliente': request.data.get('assinatura_cliente'),
                'assinatura_tecnico': request.data.get('assinatura_tecnico')
            }
        )
        _registrar_historico(os, 'checklist', 'Checklist Preenchido', 'O checklist de recebimento foi salvo.', request)
        return Response(ChecklistSerializer(checklist).data, status=status.HTTP_200_OK)


# ==========================================
# 3. ITENS DE ORÇAMENTO E APROVAÇÃO 
# ==========================================

class ItensOrcamentoAPIView(APIView):
    def get(self, request, os_id):
        get_object_or_404(OrdemServico, id=os_id, oficina=_get_oficina_atual(request))
        itens = ItemOrcamento.objects.filter(os_id=os_id)
        return Response(ItemOrcamentoSerializer(itens, many=True).data, status=status.HTTP_200_OK)

    def post(self, request, os_id):
        get_object_or_404(OrdemServico, id=os_id, oficina=_get_oficina_atual(request))
        dados = request.data.copy()
        dados['os_id'] = os_id
        serializer = ItemOrcamentoSerializer(data=dados)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class AtualizarStatusItemAPIView(APIView):
    """Nova view: permite aprovar/reprovar um único item (Granular)"""
    def patch(self, request, os_id):
        get_object_or_404(OrdemServico, id=os_id, oficina=_get_oficina_atual(request))
        itens_status = request.data.get('itens', [])
        
        for req_item in itens_status:
            ItemOrcamento.objects.filter(id=req_item['id'], os_id=os_id).update(status_aprovacao=req_item['status'])
            
        return Response({"mensagem": "Status dos itens atualizado!"}, status=status.HTTP_200_OK)

class ItemOrcamentoDetailAPIView(RetrieveUpdateDestroyAPIView):
    serializer_class = ItemOrcamentoSerializer
    def get_queryset(self):
        return ItemOrcamento.objects.filter(os_id=self.kwargs['os_id'])

class AprovacaoAPIView(APIView):
    """View de aprovação completa da OS com checagem de Termo"""
    def post(self, request, os_id):
        os = get_object_or_404(OrdemServico, id=os_id, oficina=_get_oficina_atual(request))
        
        # Validação do Checkbox (Termo de aceite) se enviado pelo front
        if 'termo_aceito' in request.data and not request.data.get('termo_aceito'):
             return Response({'erro': 'É obrigatório confirmar o termo de aceite.'}, status=status.HTTP_400_BAD_REQUEST)

        itens_aprovados = request.data.get('itens', [])
        
        for req_item in itens_aprovados:
            # 1. Atualiza o status do item
            ItemOrcamento.objects.filter(id=req_item['id'], os_id=os_id).update(status_aprovacao=req_item['status'])
            
            # 2. Se aprovou, cria Tarefa de Execução automaticamente
            if req_item['status'] == 'aprovado':
                item_banco = ItemOrcamento.objects.get(id=req_item['id'])
                # Previne duplicação se clicar duas vezes
                if not TarefaExecucao.objects.filter(os=os, descricao=item_banco.nome_descricao).exists():
                    TarefaExecucao.objects.create(os=os, descricao=item_banco.nome_descricao, status='pendente')

        os.status = 'aprovado'
        os.save()
        _registrar_historico(os, 'aprovacao', 'Orçamento Aprovado', 'Orçamento finalizado e tarefas geradas.', request)
        
        return Response({"mensagem": "Orçamento aprovado com sucesso!"}, status=status.HTTP_200_OK)


# ==========================================
# 4. TAREFAS DE EXECUÇÃO
# ==========================================

class TarefaExecucaoAPIView(APIView):
    def get(self, request, os_id):
        get_object_or_404(OrdemServico, id=os_id, oficina=_get_oficina_atual(request))
        tarefas = TarefaExecucao.objects.filter(os_id=os_id)
        return Response(TarefaExecucaoSerializer(tarefas, many=True).data, status=status.HTTP_200_OK)

    def post(self, request, os_id):
        get_object_or_404(OrdemServico, id=os_id, oficina=_get_oficina_atual(request))
        dados = request.data.copy()
        dados['os_id'] = os_id
        serializer = TarefaExecucaoSerializer(data=dados)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class TarefaExecucaoDetalheAPIView(RetrieveUpdateDestroyAPIView):
    serializer_class = TarefaExecucaoSerializer
    def get_queryset(self):
        return TarefaExecucao.objects.filter(os_id=self.kwargs['os_id'])


# ==========================================
# 5. DOCUMENTOS E HISTÓRICO
# ==========================================

class DocumentoListAPIView(APIView):
    def get(self, request, os_id):
        os = get_object_or_404(OrdemServico, id=os_id, oficina=_get_oficina_atual(request))
        return Response(DocumentoSerializer(os.documentos.all(), many=True).data)

class DocumentoUploadAPIView(APIView):
    def post(self, request, os_id):
        os = get_object_or_404(OrdemServico, id=os_id, oficina=_get_oficina_atual(request))
        files = request.FILES.getlist('files')
        
        if not files:
            return Response({'error': 'Nenhum arquivo enviado'}, status=status.HTTP_400_BAD_REQUEST)

        docs_criados = []
        for file in files:
            doc = Documento.objects.create(os=os, arquivo=file, nome_arquivo=file.name, origem='geral')
            docs_criados.append(doc)
            
        _registrar_historico(os, 'default', 'Documentos Adicionados', f'{len(files)} arquivo(s) anexado(s).', request)
        return Response(DocumentoSerializer(docs_criados, many=True).data, status=status.HTTP_201_CREATED)

class DocumentoDetailAPIView(RetrieveUpdateDestroyAPIView):
    serializer_class = DocumentoSerializer
    queryset = Documento.objects.all()

class HistoricoOSListAPIView(ListAPIView):
    serializer_class = HistoricoOSSerializer
    def get_queryset(self):
        os = get_object_or_404(OrdemServico, id=self.kwargs['os_id'], oficina=_get_oficina_atual(self.request))
        return os.historico.all().order_by('-data_hora')


# ===========================================================
# 6. CATÁLOGO E PREÇOS DE SERVIÇOS (Configurações e Adapters)
# =============================================================

class ConfiguracaoOficinaView(APIView):
    def get(self, request):
        config, _ = ConfigPreco.objects.get_or_create(oficina=_get_oficina_atual(request))
        return Response({'valor_hora': config.valor_hora_mecanico})

    def put(self, request):
        config, _ = ConfigPreco.objects.get_or_create(oficina=_get_oficina_atual(request))
        valor = request.data.get('valor_hora')
        if valor is not None:
            config.valor_hora_mecanico = valor
            config.save()
        return Response({'mensagem': 'Valor salvo'})


class CategoriaVeiculoListCreateView(APIView):
    def get(self, request):
        config, _ = ConfigPreco.objects.get_or_create(oficina=_get_oficina_atual(request))
        # Adapter: Pega as colunas únicas do banco e converte numa lista JSON
        categorias = [
            {'id': 1, 'nome': 'Carros Populares', 'percentual': config.percentual_popular, 'icone': 'fa-car-side', 'cor': '#22c55e'},
            {'id': 2, 'nome': 'Carros Elétricos', 'percentual': config.percentual_eletrico, 'icone': 'fa-bolt', 'cor': '#0ea5e9'},
            {'id': 3, 'nome': 'Carros de Luxo', 'percentual': config.percentual_luxo, 'icone': 'fa-gem', 'cor': '#8b5cf6'},
            {'id': 4, 'nome': 'Esportivos', 'percentual': config.percentual_esportivo, 'icone': 'fa-flag-checkered', 'cor': '#ef4444'},
            {'id': 5, 'nome': 'Utilitários e Comerciais', 'percentual': config.percentual_utilitario, 'icone': 'fa-truck', 'cor': '#f59e0b'},
            {'id': 6, 'nome': 'Minivans e Familiares', 'percentual': config.percentual_minivan, 'icone': 'fa-shuttle-van', 'cor': '#6366f1'}
        ]
        return Response(categorias)

class CategoriaVeiculoRetrieveUpdateDestroyView(APIView):
    def put(self, request, pk):
        config = ConfigPreco.objects.get(oficina=_get_oficina_atual(request))
        # Mapeia o ID que o Front-end mandou para o campo real do banco de dados
        mapeamento = {
            1: 'percentual_popular', 2: 'percentual_eletrico', 3: 'percentual_luxo',
            4: 'percentual_esportivo', 5: 'percentual_utilitario', 6: 'percentual_minivan'
        }
        campo = mapeamento.get(pk)
        if campo:
            setattr(config, campo, request.data.get('percentual', 0))
            config.save()
            return Response({'mensagem': 'Categoria atualizada!'})
        return Response({'erro': 'Categoria inexistente'}, status=status.HTTP_400_BAD_REQUEST)


class ServicoListCreateView(ListCreateAPIView):
    serializer_class = ServicoSerializer
    def get_queryset(self):
        return Servico.objects.filter(oficina=_get_oficina_atual(self.request)).order_by('nome')
    def perform_create(self, serializer):
        serializer.save(oficina=_get_oficina_atual(self.request))

class ServicoRetrieveUpdateDestroyView(RetrieveUpdateDestroyAPIView):
    serializer_class = ServicoSerializer
    def get_queryset(self):
        return Servico.objects.filter(oficina=_get_oficina_atual(self.request))