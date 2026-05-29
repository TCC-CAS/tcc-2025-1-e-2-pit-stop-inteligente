"""Endpoints de backup/restauração do banco (apenas Super Admin)."""
from django.http import FileResponse
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from ..permissions import IsSuperAdmin
from ..services.backup_service import gerar_backup_json, restaurar_backup_json


class BackupExportarAPIView(APIView):
    """GET /api/admin/backup/  — baixa um JSON com o dump completo."""

    permission_classes = [IsSuperAdmin]

    def get(self, request):
        filename, buffer = gerar_backup_json(request=request)
        response = FileResponse(
            buffer,
            content_type="application/json",
            as_attachment=True,
            filename=filename,
        )
        return response


class BackupRestaurarAPIView(APIView):
    """POST /api/admin/backup/restaurar/  multipart com arquivo `.json`."""

    permission_classes = [IsSuperAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        try:
            resultado = restaurar_backup_json(
                request.FILES.get("arquivo"),
                request=request,
            )
        except ValueError as exc:
            return Response({"erro": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:  # noqa: BLE001
            return Response(
                {"erro": f"Falha ao restaurar: {exc}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response({
            "mensagem": "Backup restaurado com sucesso.",
            **resultado,
        })
