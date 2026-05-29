"""Views da timeline (histórico) da OS."""
from rest_framework.generics import ListAPIView
from django.shortcuts import get_object_or_404

from ..models import OrdemServico
from ..permissions import IsFuncionario
from ..serializers import HistoricoOSSerializer
from ..utils import get_oficina_atual


class HistoricoOSListAPIView(ListAPIView):
    """Timeline da OS — qualquer funcionário ativo pode ler."""
    serializer_class = HistoricoOSSerializer
    permission_classes = [IsFuncionario]

    def get_queryset(self):
        os_obj = get_object_or_404(
            OrdemServico,
            id=self.kwargs["os_id"],
            oficina=get_oficina_atual(self.request),
        )
        return os_obj.historico.all().order_by("-data_hora")
