"""Endpoints da manutenção preventiva (plano de revisão por veículo).

Rotas:
    GET  /veiculos/<id>/manutencoes/             — lista plano do veículo.
    POST /veiculos/<id>/manutencoes/             — cria item de plano.
    GET  /manutencoes/<id>/                      — detalhe.
    PATCH/PUT /manutencoes/<id>/                 — edita.
    DELETE /manutencoes/<id>/                    — remove.
    POST /manutencoes/<id>/gerar-os/             — gera OS a partir do plano.

A geração de OS reaproveita os mesmos serviços já usados em criação manual.
"""
from datetime import date

from rest_framework import status as http_status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from ..models import ManutencaoPreventiva, OrdemServico, Veiculo
from ..permissions import IsFuncionario, IsOperacional
from ..serializers import (
    ManutencaoPreventivaSerializer,
)
from ..utils import get_oficina_atual, registrar_historico


def _veiculo_da_oficina(request, veiculo_id):
    return get_object_or_404(
        Veiculo, id=veiculo_id, cliente__oficina=get_oficina_atual(request)
    )


def _manutencao_da_oficina(request, pk):
    return get_object_or_404(
        ManutencaoPreventiva,
        id=pk,
        veiculo__cliente__oficina=get_oficina_atual(request),
    )


class ManutencaoListCreateAPIView(APIView):
    """GET (qualquer funcionário) / POST (operacional) — manutenções do veículo."""

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsOperacional()]
        return [IsFuncionario()]

    def get(self, request, veiculo_id):
        veiculo = _veiculo_da_oficina(request, veiculo_id)
        qs = veiculo.manutencoes_preventivas.all()
        _atualizar_status_vencidos(qs, veiculo)
        return Response(ManutencaoPreventivaSerializer(qs, many=True).data)

    def post(self, request, veiculo_id):
        veiculo = _veiculo_da_oficina(request, veiculo_id)
        serializer = ManutencaoPreventivaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(veiculo=veiculo)
        return Response(serializer.data, status=http_status.HTTP_201_CREATED)


class ManutencaoDetalheAPIView(APIView):
    """GET/PATCH/DELETE de uma manutenção preventiva."""

    def get_permissions(self):
        if self.request.method in ("PATCH", "PUT", "DELETE"):
            return [IsOperacional()]
        return [IsFuncionario()]

    def get(self, request, pk):
        manut = _manutencao_da_oficina(request, pk)
        return Response(ManutencaoPreventivaSerializer(manut).data)

    def patch(self, request, pk):
        manut = _manutencao_da_oficina(request, pk)
        serializer = ManutencaoPreventivaSerializer(manut, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        manut = _manutencao_da_oficina(request, pk)
        manut.delete()
        return Response(status=http_status.HTTP_204_NO_CONTENT)


class GerarOSDeManutencaoAPIView(APIView):
    """POST /manutencoes/<id>/gerar-os/ — gera OS já vinculada à manutenção."""

    permission_classes = [IsOperacional]

    def post(self, request, pk):
        manut = _manutencao_da_oficina(request, pk)
        veiculo = manut.veiculo

        oficina = get_oficina_atual(request)
        os_obj = OrdemServico.objects.create(
            oficina=oficina,
            cliente=veiculo.cliente,
            veiculo=veiculo,
            status="pendente",
            km_atual=manut.ultima_revisao_km or 0,
        )
        manut.os_gerada = os_obj
        manut.status = "agendado"
        manut.save(update_fields=["os_gerada", "status", "atualizado_em"])

        registrar_historico(
            os_obj,
            "default",
            "OS gerada a partir do plano preventivo",
            f"Originada da manutenção '{manut.titulo}'.",
            request,
        )
        return Response({
            "os_id": os_obj.id,
            "mensagem": "Ordem de Serviço criada a partir do plano de manutenção.",
        }, status=http_status.HTTP_201_CREATED)


def _atualizar_status_vencidos(queryset, veiculo):
    """Marca como 'vencido' as manutenções cuja data já passou (e ainda pendentes)."""
    hoje = date.today()
    queryset.filter(
        status="pendente", data_proxima__lt=hoje,
    ).update(status="vencido")
