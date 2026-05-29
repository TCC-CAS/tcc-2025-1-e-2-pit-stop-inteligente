"""Views de configuração de preços, categorias de veículo e catálogo de serviços."""
from rest_framework import status
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import CategoriaVeiculoCustom, ConfigPreco, Servico
from ..permissions import IsGestaoOuLeitura
from ..serializers import ServicoSerializer
from ..utils import get_oficina_atual


# Mapeia o ID público (front-end) para o campo persistido no banco.
# Categorias fixas (de 1 a 6); IDs customizadas começam em 1000 para evitar
# colisão com as fixas e simplificar o roteamento por id.
_CATEGORIAS_FRONT = [
    {"id": 1, "nome": "Carros Populares",         "campo": "percentual_popular",     "icone": "fa-car-side",       "cor": "#22c55e"},
    {"id": 2, "nome": "Carros Elétricos",         "campo": "percentual_eletrico",    "icone": "fa-bolt",           "cor": "#0ea5e9"},
    {"id": 3, "nome": "Carros de Luxo",           "campo": "percentual_luxo",        "icone": "fa-gem",            "cor": "#8b5cf6"},
    {"id": 4, "nome": "Esportivos",               "campo": "percentual_esportivo",   "icone": "fa-flag-checkered", "cor": "#ef4444"},
    {"id": 5, "nome": "Utilitários e Comerciais", "campo": "percentual_utilitario",  "icone": "fa-truck",          "cor": "#f59e0b"},
    {"id": 6, "nome": "Minivans e Familiares",    "campo": "percentual_minivan",     "icone": "fa-shuttle-van",    "cor": "#6366f1"},
]

# Offset para distinguir categoria custom (id >= 1000) de fixa (1..6).
_CUSTOM_OFFSET = 1000


class ConfiguracaoOficinaView(APIView):
    """Valor-hora do mecânico — leitura para todos, edição apenas gestão."""
    permission_classes = [IsGestaoOuLeitura]

    def get(self, request):
        config, _ = ConfigPreco.objects.get_or_create(
            oficina=get_oficina_atual(request)
        )
        return Response({"valor_hora": config.valor_hora_mecanico})

    def put(self, request):
        config, _ = ConfigPreco.objects.get_or_create(
            oficina=get_oficina_atual(request)
        )
        valor = request.data.get("valor_hora")
        if valor is not None:
            config.valor_hora_mecanico = valor
            config.save(update_fields=["valor_hora_mecanico", "atualizado_em"])
        return Response({"mensagem": "Valor salvo"})


class CategoriaVeiculoListCreateView(APIView):
    """Lista categorias (fixas + customizadas) e cria novas customizadas.

    GET retorna 6 fixas (ids 1..6) seguidas das custom (ids >= 1000).
    POST cria uma categoria customizada com campos {nome, percentual, icone, cor}.
    """
    permission_classes = [IsGestaoOuLeitura]

    def get(self, request):
        oficina = get_oficina_atual(request)
        config, _ = ConfigPreco.objects.get_or_create(oficina=oficina)

        categorias = [
            {
                "id": cat["id"],
                "nome": cat["nome"],
                "percentual": getattr(config, cat["campo"]),
                "icone": cat["icone"],
                "cor": cat["cor"],
                "tipo": "fixa",
            }
            for cat in _CATEGORIAS_FRONT
        ]

        customs = CategoriaVeiculoCustom.objects.filter(
            oficina=oficina, ativa=True,
        ).order_by("nome")
        for cc in customs:
            categorias.append({
                "id": _CUSTOM_OFFSET + cc.id,
                "nome": cc.nome,
                "percentual": cc.percentual,
                "icone": cc.icone,
                "cor": cc.cor,
                "tipo": "custom",
            })
        return Response(categorias)

    def post(self, request):
        oficina = get_oficina_atual(request)
        nome = (request.data.get("nome") or "").strip()
        if len(nome) < 2:
            return Response(
                {"erro": "Informe um nome para a categoria."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Não permite duplicar nomes de fixas (manter UI limpa)
        if any(c["nome"].lower() == nome.lower() for c in _CATEGORIAS_FRONT):
            return Response(
                {"erro": "Já existe uma categoria fixa com esse nome."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            cc = CategoriaVeiculoCustom.objects.create(
                oficina=oficina,
                nome=nome[:80],
                percentual=request.data.get("percentual", 0) or 0,
                icone=request.data.get("icone") or "fa-circle-plus",
                cor=request.data.get("cor") or "#64748b",
            )
        except Exception:
            return Response(
                {"erro": "Já existe uma categoria com esse nome nesta oficina."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({
            "id": _CUSTOM_OFFSET + cc.id,
            "nome": cc.nome,
            "percentual": cc.percentual,
            "icone": cc.icone,
            "cor": cc.cor,
            "tipo": "custom",
        }, status=status.HTTP_201_CREATED)


class CategoriaVeiculoRetrieveUpdateDestroyView(APIView):
    """Atualiza/exclui uma categoria.

    Para ids 1..6 (fixas): só permite alterar o percentual.
    Para ids >= 1000 (custom): altera todos os campos e/ou exclui.
    """
    permission_classes = [IsGestaoOuLeitura]

    def put(self, request, pk):
        oficina = get_oficina_atual(request)

        # Categoria fixa
        if pk < _CUSTOM_OFFSET:
            config, _ = ConfigPreco.objects.get_or_create(oficina=oficina)
            campo = next(
                (cat["campo"] for cat in _CATEGORIAS_FRONT if cat["id"] == pk), None
            )
            if campo is None:
                return Response(
                    {"erro": "Categoria inexistente"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            novo_percentual = request.data.get("percentual", 0)
            setattr(config, campo, novo_percentual)
            config.save(update_fields=[campo, "atualizado_em"])
            return Response({
                "id": pk,
                "percentual": novo_percentual,
                "mensagem": "Categoria atualizada!",
            })

        # Categoria custom
        custom_id = pk - _CUSTOM_OFFSET
        try:
            cc = CategoriaVeiculoCustom.objects.get(id=custom_id, oficina=oficina)
        except CategoriaVeiculoCustom.DoesNotExist:
            return Response(
                {"erro": "Categoria inexistente"},
                status=status.HTTP_404_NOT_FOUND,
            )
        if "nome" in request.data:
            cc.nome = str(request.data["nome"]).strip()[:80] or cc.nome
        if "percentual" in request.data:
            cc.percentual = request.data["percentual"] or 0
        if "icone" in request.data:
            cc.icone = str(request.data["icone"])[:40] or cc.icone
        if "cor" in request.data:
            cc.cor = str(request.data["cor"])[:20] or cc.cor
        cc.save()
        return Response({
            "id": pk,
            "nome": cc.nome,
            "percentual": cc.percentual,
            "icone": cc.icone,
            "cor": cc.cor,
            "mensagem": "Categoria atualizada!",
        })

    def patch(self, request, pk):
        return self.put(request, pk)

    def delete(self, request, pk):
        if pk < _CUSTOM_OFFSET:
            return Response(
                {"erro": "Categorias fixas não podem ser excluídas."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        oficina = get_oficina_atual(request)
        custom_id = pk - _CUSTOM_OFFSET
        deletadas, _ = CategoriaVeiculoCustom.objects.filter(
            id=custom_id, oficina=oficina,
        ).delete()
        if not deletadas:
            return Response(
                {"erro": "Categoria inexistente"},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({"mensagem": "Categoria removida."})


class ServicoListCreateView(ListCreateAPIView):
    """Catálogo de serviços — leitura geral, escrita só gestão."""
    serializer_class = ServicoSerializer
    permission_classes = [IsGestaoOuLeitura]

    def get_queryset(self):
        return Servico.objects.filter(
            oficina=get_oficina_atual(self.request)
        ).order_by("nome")

    def perform_create(self, serializer):
        serializer.save(oficina=get_oficina_atual(self.request))


class ServicoRetrieveUpdateDestroyView(RetrieveUpdateDestroyAPIView):
    """Detalhe/edição/exclusão de serviço — leitura geral, escrita só gestão."""
    serializer_class = ServicoSerializer
    permission_classes = [IsGestaoOuLeitura]

    def get_queryset(self):
        return Servico.objects.filter(
            oficina=get_oficina_atual(self.request)
        )
