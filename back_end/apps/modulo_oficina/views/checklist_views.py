"""View do checklist de recebimento da OS."""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from ..models import ChecklistRecebimento, OrdemServico
from ..permissions import IsTecnicoOuLeitura
from ..serializers import ChecklistSerializer
from ..utils import get_oficina_atual, registrar_historico


_CHECKLIST_FIELDS = (
    "concluido",
    "assinatura_cliente",
    "assinatura_tecnico",
    "data_recebimento",
    "consultor",
    "nivel_combustivel",
    "observacoes_iniciais",
    "lataria_pintura",
    "vidros_farois",
    "possui_manual",
    "possui_estepe_macaco",
    "observacoes_internas",
    "nivel_oleo",
    "fluido_arrefecimento",
    "observacoes_mecanica",
)


class ChecklistAPIView(APIView):
    """Checklist da OS — leitura para todos, escrita para técnico+."""
    permission_classes = [IsTecnicoOuLeitura]

    def get(self, request, os_id):
        os_obj = get_object_or_404(
            OrdemServico, id=os_id, oficina=get_oficina_atual(request)
        )
        try:
            checklist = ChecklistRecebimento.objects.get(os=os_obj)
            return Response(ChecklistSerializer(checklist).data)
        except ChecklistRecebimento.DoesNotExist:
            return Response({"concluido": False}, status=status.HTTP_200_OK)

    def post(self, request, os_id):
        os_obj = get_object_or_404(
            OrdemServico, id=os_id, oficina=get_oficina_atual(request)
        )
        dados = request.data

        if "quilometragem" in dados:
            os_obj.km_atual = dados["quilometragem"]
            os_obj.save(update_fields=["km_atual", "atualizado_em"])

        defaults = {campo: dados.get(campo) for campo in _CHECKLIST_FIELDS}
        defaults["concluido"] = dados.get("concluido", True)
        defaults["possui_manual"] = dados.get("possui_manual", False)
        defaults["possui_estepe_macaco"] = dados.get("possui_estepe_macaco", False)
        defaults["nivel_oleo"] = dados.get("nivel_oleo", "ok")
        defaults["fluido_arrefecimento"] = dados.get("fluido_arrefecimento", "ok")
        defaults["observacoes_mecanica"] = dados.get("observacoes_mecanica", "")

        checklist, _ = ChecklistRecebimento.objects.update_or_create(
            os=os_obj, defaults=defaults
        )
        registrar_historico(
            os_obj, "checklist", "Checklist Preenchido", "Checklist salvo.", request
        )
        return Response(ChecklistSerializer(checklist).data)
