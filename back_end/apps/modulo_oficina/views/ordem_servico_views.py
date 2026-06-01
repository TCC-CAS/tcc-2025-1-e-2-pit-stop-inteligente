"""Views da Ordem de Serviço (CRUD principal)."""
from rest_framework import status
from rest_framework.generics import RetrieveUpdateDestroyAPIView
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from ..models import OrdemServico
from ..permissions import IsAdmin, IsFuncionario, IsOperacional, IsTecnico
from ..serializers import OrdemServicoListaSerializer, OrdemServicoSerializer
from ..services import criar_os_completa, finalizar_os
from ..utils import get_oficina_atual


class CriarOrdemServicoAPIView(APIView):
    """Cria uma nova OS — apenas operacional (admin/gerente/atendente).

    Pode retornar 402 (Payment Required) quando a oficina atingiu a quota
    mensal de O.S. do seu plano e o bloqueio está ativo no painel SaaS.
    """
    permission_classes = [IsOperacional]

    def post(self, request):
        try:
            nova_os = criar_os_completa(
                oficina=get_oficina_atual(request),
                dados=request.data,
                request=request,
            )
        except ValueError as exc:
            return Response(
                {"erro": str(exc), "quota_estourada": True},
                status=status.HTTP_402_PAYMENT_REQUIRED,
            )
        return Response(
            OrdemServicoSerializer(nova_os).data,
            status=status.HTTP_201_CREATED,
        )


class ListarOrdensServicoAPIView(APIView):
    """Qualquer funcionário ativo lista as OS da oficina."""
    permission_classes = [IsFuncionario]

    def get(self, request):
        ordens = OrdemServico.objects.filter(
            oficina=get_oficina_atual(request)
        ).order_by("-criado_em")
        return Response(
            OrdemServicoListaSerializer(ordens, many=True).data,
            status=status.HTTP_200_OK,
        )


class DetalheOrdemServicoAPIView(RetrieveUpdateDestroyAPIView):
    """GET livre p/ qualquer funcionário; PUT/PATCH/DELETE só admin (ver delete também)."""
    serializer_class = OrdemServicoSerializer

    def get_permissions(self):
        if self.request.method in ("PUT", "PATCH"):
            return [IsOperacional()]
        if self.request.method == "DELETE":
            return [IsAdmin()]
        return [IsFuncionario()]

    def get_queryset(self):
        return OrdemServico.objects.filter(
            oficina=get_oficina_atual(self.request)
        )


class ExcluirOrdemServicoAPIView(APIView):
    """Exclusão dura — restrito a admin."""
    permission_classes = [IsAdmin]

    def delete(self, request, pk):
        os_obj = get_object_or_404(
            OrdemServico, id=pk, oficina=get_oficina_atual(request)
        )
        os_obj.delete()
        return Response(
            {"mensagem": "OS excluída com sucesso."},
            status=status.HTTP_200_OK,
        )


class FinalizarOSAPIView(APIView):
    """Finaliza OS — operacional (admin/gerente/atendente).

    NOTA: Mecânicos NÃO podem finalizar a OS porque "concluído" é um
    status crítico que altera SLA, libera fatura e impede edição posterior.
    A regra de negócio é: mecânico executa tarefas → operacional valida
    e finaliza.
    """
    permission_classes = [IsOperacional]

    def post(self, request, os_id):
        os_obj = get_object_or_404(
            OrdemServico, id=os_id, oficina=get_oficina_atual(request)
        )
        finalizar_os(os_obj, request)
        return Response(
            {"mensagem": "OS finalizada!"},
            status=status.HTTP_200_OK,
        )
