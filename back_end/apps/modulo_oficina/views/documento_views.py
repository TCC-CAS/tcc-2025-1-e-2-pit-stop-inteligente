"""Views de documentos anexados à OS."""
from rest_framework import status
from rest_framework.generics import RetrieveUpdateDestroyAPIView
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from ..models import Documento, OrdemServico
from ..permissions import IsFuncionario, IsTecnico, IsTecnicoOuLeitura
from ..serializers import DocumentoSerializer
from ..utils import get_oficina_atual, registrar_historico


class DocumentoListAPIView(APIView):
    """Listar documentos da OS — qualquer funcionário ativo."""
    permission_classes = [IsFuncionario]

    def get(self, request, os_id):
        os_obj = get_object_or_404(
            OrdemServico, id=os_id, oficina=get_oficina_atual(request)
        )
        return Response(
            DocumentoSerializer(os_obj.documentos.all(), many=True).data
        )


class DocumentoUploadAPIView(APIView):
    """Upload de novos documentos — técnicos+ podem anexar.

    Antes de gravar, valida a cota de armazenamento do plano. Se este
    upload ultrapassaria a cota e o bloqueio está ativo, retorna 402
    com mensagem clara para o front exibir.
    """
    permission_classes = [IsTecnico]

    def post(self, request, os_id):
        oficina = get_oficina_atual(request)
        os_obj = get_object_or_404(
            OrdemServico, id=os_id, oficina=oficina
        )
        files = request.FILES.getlist("files")

        if not files:
            return Response(
                {"error": "Nenhum arquivo enviado"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 1) Valida cada arquivo (tamanho + MIME + extensão) ANTES de qualquer
        # gravação. Se algum não passar, devolve 400 com a mensagem específica.
        from ..services import assegurar_pode_upload, validar_batch
        try:
            validar_batch(files)
        except ValueError as exc:
            return Response(
                {"erro": str(exc), "arquivo_invalido": True},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 2) Soma o tamanho de todos os arquivos do batch para checar a quota
        # de armazenamento de uma vez (evita "metade subiu, metade não").
        tamanho_batch = sum(getattr(f, "size", 0) or 0 for f in files)
        try:
            assegurar_pode_upload(oficina, tamanho_batch)
        except ValueError as exc:
            return Response(
                {"erro": str(exc), "quota_estourada": True},
                status=status.HTTP_402_PAYMENT_REQUIRED,
            )

        origem = request.data.get("origem", "geral")
        categoria = request.data.get("categoria", None)

        docs_criados = [
            Documento.objects.create(
                os=os_obj,
                arquivo=file,
                nome_arquivo=file.name,
                origem=origem,
                categoria=categoria,
            )
            for file in files
        ]

        registrar_historico(
            os_obj,
            "default",
            "Documentos Adicionados",
            f"{len(files)} arquivo(s) anexado(s).",
            request,
        )
        return Response(
            DocumentoSerializer(docs_criados, many=True).data,
            status=status.HTTP_201_CREATED,
        )


class DocumentoDetailAPIView(RetrieveUpdateDestroyAPIView):
    """Ver/editar/excluir documento — leitura geral, escrita técnico+."""
    serializer_class = DocumentoSerializer
    queryset = Documento.objects.all()
    permission_classes = [IsTecnicoOuLeitura]


class RegrasUploadOSAPIView(APIView):
    """GET /api/oficina/upload-os/regras/

    Devolve {tamanho_max_mb, tamanho_max_bytes, mimes_permitidos[],
    extensoes_permitidas[]} para o front:
      - mostrar a regra ao usuário ("PDF, JPG, PNG até 10 MB")
      - validar no navegador antes de subir (UX)
      - configurar `<input type="file" accept="...">`
    """

    permission_classes = [IsFuncionario]

    def get(self, request):
        from ..services import obter_regras_upload
        return Response(obter_regras_upload().to_dict())
