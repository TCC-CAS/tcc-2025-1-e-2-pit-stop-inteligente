from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, JSONParser 
from rest_framework import status, filters
from datetime import datetime
from django.utils import timezone
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
                          HistoricoOSSerializer, ServicoSerializer, ClienteSerializer, VeiculoSerializer)

# ==========================================
# UTILITÁRIOS INTERNOS DA API
# ==========================================

# ALTERAÇÃO PENDENTE
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
# 0. OFICINA E CADASTRO DE CLIENTES
# ==========================================

class OficinaPerfilAPIView(APIView):

    parser_classes = [MultiPartParser, JSONParser]


    def get(self, request):
        oficina = _get_oficina_atual(request)
        
        # Histórico virtual usando campos de auditoria
        # Isso atende o visual da tela sem poluir o banco de dados
        # MOCK
        historico_virtual = [
            {
                "acao": "Criação da Oficina",
                "data": oficina.criado_em.strftime('%d/%m/%Y %H:%M'),
                "usuario": "Sistema"
            }
        ]
        
        # Se a oficina já foi editada, adicionamos o evento de atualização
        # MOCK
        if oficina.atualizado_em > oficina.criado_em:
            historico_virtual.append({
                "acao": "Última Atualização Cadastral",
                "data": oficina.atualizado_em.strftime('%d/%m/%Y %H:%M'),
                "usuario": "Administrador"
            })

        # Cálculo do horário (status "aberto") 
        agora = timezone.localtime(timezone.now())  # horário atual no fuso da oficina (America/Sao_Paulo)
        hora_atual = agora.time()
        dia_semana = agora.strftime('%a').lower()   # seg, ter, qua, qui, sex, sab, dom
        # Mapeamento do Django (segunda=1?) - mesmo padrão do model
        dias_map = {
            'mon': 'seg', 'tue': 'ter', 'wed': 'qua', 'thu': 'qui',
            'fri': 'sex', 'sat': 'sab', 'sun': 'dom'
        }
        dia_atual = dias_map.get(dia_semana)

        aberto = False
        if (oficina.horario_abertura and oficina.horario_fechamento and 
            oficina.dias_funcionamento and dia_atual in oficina.dias_funcionamento):
            aberto = (oficina.horario_abertura <= hora_atual <= oficina.horario_fechamento)


        return Response({
            'dadosBasicos': {
                'nome': oficina.nome,
                'cnpj': oficina.cnpj,
                'email': oficina.email,
                'telefone': oficina.telefone,
                'especialidade': oficina.especialidade
            },
            'endereco': {
                'cep': oficina.cep,
                'logradouro': oficina.logradouro,
                'numero': oficina.numero,
                'complemento': oficina.complemento or '',
                'bairro': oficina.bairro,
                'cidade': oficina.cidade,
                'estado': oficina.estado
            },
            'horarios': {
                'abertura': oficina.horario_abertura.strftime('%H:%M') if oficina.horario_abertura else '',
                'fechamento': oficina.horario_fechamento.strftime('%H:%M') if oficina.horario_fechamento else '',
                'diasFuncionamento': oficina.dias_funcionamento or []
            },
            'plano': {
                'tipo': oficina.plano_atual, 
                'status': 'Ativo',
                'expiracao': '01/01/2027' # Valor fictício para o front
            },
            'historico': historico_virtual,
            'status': {
                'ultimaAtualizacao': oficina.atualizado_em.strftime('%d/%m/%Y'),
                'logoEnviada': bool(oficina.logo)
            },
            'logo_url': oficina.logo.url if oficina.logo else '',
            'aberto_agora': aberto,
        })

    def put(self, request):
        oficina = _get_oficina_atual(request)

        ## Tratar upload de logo vindo de multipart/form-data
        if 'logo' in request.FILES:
            oficina.logo = request.FILES['logo']
            oficina.save()
            # Se apenas a logo foi enviada, podemos retornar imediatamente
            if len(request.FILES) == 1 and not request.data.get('dadosBasicos'):
                return Response({"mensagem": "Logo atualizada com sucesso!", "logo_url": oficina.logo.url})

        dados = request.data
        
        basicos = dados.get('dadosBasicos', {})
        end = dados.get('endereco', {})
        horarios = dados.get('horarios', {})

        # Atualização dos campos
        oficina.nome = basicos.get('nome', oficina.nome)
        oficina.email = basicos.get('email', oficina.email)
        oficina.telefone = basicos.get('telefone', oficina.telefone)
        oficina.especialidade = basicos.get('especialidade', oficina.especialidade)
        
        oficina.cep = end.get('cep', oficina.cep)
        oficina.logradouro = end.get('logradouro', oficina.logradouro)
        oficina.numero = end.get('numero', oficina.numero)
        oficina.complemento = end.get('complemento', oficina.complemento)
        oficina.bairro = end.get('bairro', oficina.bairro)
        oficina.cidade = end.get('cidade', oficina.cidade)
        oficina.estado = end.get('estado', oficina.estado)

        # Lógica para Horários (converte string "08:00" para objeto time)
        if horarios.get('abertura'):
            oficina.horario_abertura = datetime.strptime(horarios['abertura'], '%H:%M').time()
        if horarios.get('fechamento'):
            oficina.horario_fechamento = datetime.strptime(horarios['fechamento'], '%H:%M').time()
        
        # Dias de funcionamento (recebe array ['seg', 'ter'] e salva "seg,ter")
        dias = horarios.get('diasFuncionamento', [])
        oficina.dias_funcionamento = dias

        plano_dados = dados.get('plano', {})
        if 'tipo' in plano_dados:
            oficina.plano_atual = plano_dados['tipo'] 

        oficina.save()
        return Response({"mensagem": "Perfil da oficina atualizado com sucesso!"})

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

    def update(self, request, *args, **kwargs):
        # Como o front-end envia dados estranhos (ex: "preferencias": {...}),
        # o partial=True ignora campos que não existem no banco de dados e salva o resto.
        kwargs['partial'] = True
        return super().update(request, *args, **kwargs)

class VeiculoListAPIView(ListAPIView):
    serializer_class = VeiculoSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['placa']  # permite busca por placa

    def get_queryset(self):
        return Veiculo.objects.filter(cliente__oficina=_get_oficina_atual(self.request))


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
        # Atualiza e-mail mesmo se cliente já existia
        if dados.get('email'):
            cliente.email = dados.get('email')
            cliente.save()

        # 2. Busca ou cria Veículo (sem bloqueio)
        veiculo, _ = Veiculo.objects.get_or_create(
        placa=dados.get('placa'), cliente=cliente,
        defaults={
            'modelo': dados.get('modelo', 'Não informado'),
            'marca': dados.get('marca', ''),
            'ano': dados.get('ano', ''),
            'cor': dados.get('cor', ''),
            'chassi': dados.get('chassi', ''),
            'tipo_uso': dados.get('tipo_uso', 'particular')
        }
        )
        # Atualiza campos extras se o veículo já existia
        veiculo.marca = dados.get('marca', veiculo.marca)
        veiculo.chassi = dados.get('chassi', veiculo.chassi)
        veiculo.ano = dados.get('ano', veiculo.ano)
        veiculo.cor = dados.get('cor', veiculo.cor)
        veiculo.tipo_uso = dados.get('tipo_uso', veiculo.tipo_uso)
        veiculo.save()

        # 3. Cria OS
        nova_os = OrdemServico.objects.create(
            oficina=oficina_atual, veiculo=veiculo, cliente=cliente,
            km_atual=dados.get('km_atual'), status='pendente'   
        )

        _registrar_historico(nova_os, 'criacao', 'O.S. Criada', 'Ordem de Serviço aberta no sistema.', request)
        
        serializer = OrdemServicoSerializer(nova_os)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ListarOrdensServicoAPIView(APIView):
    def get(self, request):
        ordens = OrdemServico.objects.filter(oficina=_get_oficina_atual(request)).order_by('-criado_em')
        serializer = OrdemServicoListaSerializer(ordens, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class DetalheOrdemServicoAPIView(RetrieveUpdateDestroyAPIView): # Mudou de APIView para RetrieveUpdateDestroyAPIView para aceitar PATCH/PUT
    serializer_class = OrdemServicoSerializer
    
    def get_queryset(self):
        return OrdemServico.objects.filter(oficina=_get_oficina_atual(self.request))


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
        data = request.data
        
        # Atualizar quilometragem na OS se fornecida
        if 'quilometragem' in data:
            os.km_atual = data['quilometragem']
            os.save()
        
        # Salvar todos os campos do checklist
        defaults = {
            'concluido': data.get('concluido', True),
            'assinatura_cliente': data.get('assinatura_cliente'),
            'assinatura_tecnico': data.get('assinatura_tecnico'),
            'data_recebimento': data.get('data_recebimento'),
            'consultor': data.get('consultor'),
            'nivel_combustivel': data.get('nivel_combustivel'),
            'observacoes_iniciais': data.get('observacoes_iniciais'),
            'lataria_pintura': data.get('lataria_pintura'),
            'vidros_farois': data.get('vidros_farois'),
            'possui_manual': data.get('possui_manual', False),
            'possui_estepe_macaco': data.get('possui_estepe_macaco', False),
            'observacoes_internas': data.get('observacoes_internas'),
            'nivel_oleo': data.get('nivel_oleo', 'ok'),
            'fluido_arrefecimento': data.get('fluido_arrefecimento', 'ok'),
        }
        checklist, _ = ChecklistRecebimento.objects.update_or_create(os=os, defaults=defaults)
        _registrar_historico(os, 'checklist', 'Checklist Preenchido', 'Checklist salvo.', request)
        return Response(ChecklistSerializer(checklist).data)


# ==========================================
# 3. ITENS DE ORÇAMENTO E APROVAÇÃO 
# ==========================================

class ItensOrcamentoAPIView(APIView):
    def get(self, request, os_id):
        get_object_or_404(OrdemServico, id=os_id, oficina=_get_oficina_atual(request))
        itens = ItemOrcamento.objects.filter(os_id=os_id)
        return Response(ItemOrcamentoSerializer(itens, many=True).data, status=status.HTTP_200_OK)

    def post(self, request, os_id):
        os = get_object_or_404(OrdemServico, id=os_id, oficina=_get_oficina_atual(request))
        
        # MODO BLINDADO: Pega os dados, garante que o OS ID está certo para o Django não estourar Erro 500
        dados = request.data.copy()
        dados['os'] = os.id # Usa 'os' ao invés de 'os_id' dependendo de como o DRF mapeia
        
        serializer = ItemOrcamentoSerializer(data=dados)
        if serializer.is_valid():
            serializer.save(os=os) # Injeta o objeto diretamente no salvamento
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        
        # Se falhar, agora ele devolve o Erro 400 com o motivo, em vez de explodir um Erro 500 silencioso
        print("Erros do serializer:", serializer.errors)
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
    """View de aprovação completa da OS com checagem OBRIGATÓRIA de Termo"""
    def post(self, request, os_id):
        os = get_object_or_404(OrdemServico, id=os_id, oficina=_get_oficina_atual(request))
        
        # Exige que o termo venha na requisição e seja verdadeiro
        termo_aceito = request.data.get('termo_aceito')
        if not termo_aceito:
             return Response(
                 {'erro': 'É obrigatório confirmar o termo de aceite para aprovar o orçamento.'}, 
                 status=status.HTTP_400_BAD_REQUEST
             )

        itens_aprovados = request.data.get('itens', [])
        
        for req_item in itens_aprovados:
            ItemOrcamento.objects.filter(id=req_item['id'], os_id=os_id).update(status_aprovacao=req_item['status'])
            
            # Gera tarefa automaticamente se aprovado
            if req_item['status'] == 'aprovado':
                item_banco = ItemOrcamento.objects.get(id=req_item['id'])
                if not TarefaExecucao.objects.filter(os=os, descricao=item_banco.nome_descricao).exists():
                    TarefaExecucao.objects.create(
                        os=os, 
                        descricao=item_banco.nome_descricao, 
                        status='pendente',
                    )

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
            # Lê a origem do request.data (se não vier, usa 'geral')
            origem = request.data.get('origem', 'geral')
            doc = Documento.objects.create(
                os=os, 
                arquivo=file, 
                nome_arquivo=file.name, 
                origem=origem
            )
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
            novo_percentual = request.data.get('percentual', 0)
            setattr(config, campo, novo_percentual)
            config.save()
            return Response({'id': pk, 'percentual': novo_percentual, 'mensagem': 'Categoria atualizada!'})
        return Response({'erro': 'Categoria inexistente'}, status=status.HTTP_400_BAD_REQUEST)
    
    def patch(self, request, pk):
       return self.put(request, pk)   # reutiliza a lógica do put

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