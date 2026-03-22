from rest_framework import generics
from django.shortcuts import get_object_or_404
from apps.modulo_oficina.models import OrdemServico, HistoricoOS
from .serializers import HistoricoOSSerializer

class HistoricoOSListAPIView(generics.ListAPIView):
    serializer_class = HistoricoOSSerializer

    def get_queryset(self):
        os_id = self.kwargs['os_id']
        os = get_object_or_404(OrdemServico, id=os_id)
        return os.historico.all()