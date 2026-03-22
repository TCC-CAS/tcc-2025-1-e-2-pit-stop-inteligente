from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404

from ....models import Documento, OrdemServico
from ....serializers import DocumentoSerializer


class DocumentoListAPIView(APIView):
    def get(self, request, os_id):
        """Lista todos os documentos da OS"""
        os = get_object_or_404(OrdemServico, id=os_id)
        documentos = os.documentos.all()
        serializer = DocumentoSerializer(documentos, many=True)
        return Response(serializer.data)


class DocumentoUploadAPIView(APIView):
    def post(self, request, os_id):
        """Recebe múltiplos arquivos e cria documentos"""
        os = get_object_or_404(OrdemServico, id=os_id)
        files = request.FILES.getlist('files')
        if not files:
            return Response(
                {'error': 'Nenhum arquivo enviado'},
                status=status.HTTP_400_BAD_REQUEST
            )

        documentos_criados = []
        for file in files:
            doc = Documento.objects.create(
                os=os,
                arquivo=file,
                nome=file.name,
                tipo=file.name.split('.')[-1].lower()
            )
            documentos_criados.append(doc)

        serializer = DocumentoSerializer(documentos_criados, many=True)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class DocumentoDetailAPIView(APIView):
    def delete(self, request, pk):
        """Remove um documento específico"""
        documento = get_object_or_404(Documento, id=pk)
        # Opcional: deletar o arquivo do disco
        documento.arquivo.delete(save=False)
        documento.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)