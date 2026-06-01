"""Views para geração/consulta de códigos de acesso da OS (lado oficina).

A oficina é responsável por entregar o código ao cliente. Permitimos:
- Operacional (admin/gerente/atendente) gerar e revogar códigos.
- Qualquer funcionário ativo consultar o último código vigente.
"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from apps.modulo_cliente.models import CodigoAcessoOS

from ..models import OrdemServico
from ..permissions import IsFuncionario, IsOperacional
from ..utils import get_oficina_atual, registrar_historico


def _serializar(codigo):
    return {
        "id": codigo.id,
        "codigo": codigo.codigo,
        "expira_em": codigo.expira_em.strftime("%d/%m/%Y %H:%M"),
        "tentativas": codigo.tentativas,
        "max_tentativas": codigo.max_tentativas,
        "revogado": codigo.revogado,
        "expirado": codigo.expirado,
        "bloqueado": codigo.bloqueado,
        "valido": codigo.valido,
        "ultimo_uso_em": codigo.ultimo_uso_em.strftime("%d/%m/%Y %H:%M") if codigo.ultimo_uso_em else None,
        "criado_em": codigo.criado_em.strftime("%d/%m/%Y %H:%M"),
    }


class CodigoAcessoOSAPIView(APIView):
    """GET /os/<id>/codigo-acesso/  — retorna o código vigente (último ativo).
    POST /os/<id>/codigo-acesso/ — gera um novo (revogando anteriores).
    DELETE /os/<id>/codigo-acesso/ — revoga o código ativo.
    """

    def get_permissions(self):
        if self.request.method in ("POST", "DELETE"):
            return [IsOperacional()]
        return [IsFuncionario()]

    def _get_os(self, request, os_id):
        return get_object_or_404(
            OrdemServico, id=os_id, oficina=get_oficina_atual(request)
        )

    def get(self, request, os_id):
        os_obj = self._get_os(request, os_id)
        codigo = (
            CodigoAcessoOS.objects.filter(os=os_obj, revogado=False)
            .order_by("-criado_em")
            .first()
        )
        if codigo is None:
            return Response({"existe": False})
        return Response({"existe": True, **_serializar(codigo)})

    def post(self, request, os_id):
        os_obj = self._get_os(request, os_id)
        validade = int(request.data.get("validade_dias") or 7)
        max_tent = int(request.data.get("max_tentativas") or 5)
        if validade < 1 or validade > 60:
            return Response({"erro": "Validade deve estar entre 1 e 60 dias."}, status=status.HTTP_400_BAD_REQUEST)
        if max_tent < 1 or max_tent > 20:
            return Response({"erro": "Máx. de tentativas deve estar entre 1 e 20."}, status=status.HTTP_400_BAD_REQUEST)
        codigo = CodigoAcessoOS.gerar(
            os_obj,
            gerado_por=request.user if request.user.is_authenticated else None,
            validade_dias=validade,
            max_tentativas=max_tent,
        )
        registrar_historico(
            os_obj,
            "default",
            "Código de acesso gerado para o cliente",
            f"Validade: {validade} dia(s) · Tentativas: {max_tent}.",
            request,
        )
        return Response(_serializar(codigo), status=status.HTTP_201_CREATED)

    def delete(self, request, os_id):
        os_obj = self._get_os(request, os_id)
        ativos = CodigoAcessoOS.objects.filter(os=os_obj, revogado=False)
        if not ativos.exists():
            return Response({"mensagem": "Não há código ativo para revogar."})
        ativos.update(revogado=True)
        registrar_historico(
            os_obj,
            "default",
            "Código de acesso revogado",
            "Acesso do cliente via portal foi suspenso até nova geração.",
            request,
        )
        return Response({"mensagem": "Código revogado."})
