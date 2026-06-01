"""Views do perfil da oficina e da troca de senha do usuário logado."""
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import Funcionario
from ..permissions import IsAdminOuLeitura
from ..services import (
    atualizar_perfil_oficina,
    criar_oficina_e_vincular_admin,
    montar_payload_perfil,
)
from ..utils import get_oficina_atual


class OficinaPerfilAPIView(APIView):
    """Endpoints do perfil da oficina.

    GET / PUT exigem ser admin (gerentes/atendentes só leem em outras telas).
    POST (cadastro inicial) é aberto: cria a oficina e vincula o user como admin.
    """

    parser_classes = [MultiPartParser, JSONParser]

    def get_permissions(self):
        if self.request.method == "POST":
            # Cadastro inicial — qualquer usuário autenticado pode criar a 1ª oficina
            return [IsAuthenticated()]
        return [IsAdminOuLeitura()]

    def get(self, request):
        oficina = get_oficina_atual(request)
        return Response(montar_payload_perfil(oficina))

    def put(self, request):
        oficina = get_oficina_atual(request)
        arquivo_logo = request.FILES.get("logo")

        # Caso seja apenas upload isolado de logo
        if arquivo_logo and not request.data.get("dadosBasicos") and len(request.FILES) == 1:
            oficina.logo = arquivo_logo
            oficina.save(update_fields=["logo"])
            return Response({
                "mensagem": "Logo atualizada com sucesso!",
                "logo_url": oficina.logo.url,
            })

        atualizar_perfil_oficina(oficina, request.data, arquivo_logo)
        return Response({"mensagem": "Perfil da oficina atualizado com sucesso!"})

    def post(self, request):
        """Cria a oficina e vincula o usuário autenticado como administrador."""
        if request.user.is_authenticated:
            try:
                if request.user.funcionario_oficina.oficina:
                    return Response(
                        {"erro": "Você já possui uma oficina cadastrada."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            except Funcionario.DoesNotExist:
                pass

        oficina = criar_oficina_e_vincular_admin(
            dados=request.data,
            arquivo_logo=request.FILES.get("logo"),
            usuario=request.user,
        )
        return Response(
            {"mensagem": "Oficina cadastrada com sucesso!", "id": oficina.id},
            status=status.HTTP_201_CREATED,
        )


class AlterarSenhaAPIView(APIView):
    """Permite ao usuário logado trocar a própria senha."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        senha_atual = request.data.get("senha_atual")
        nova_senha = request.data.get("nova_senha")

        if not senha_atual or not nova_senha:
            return Response(
                {"erro": "Informe a senha atual e a nova senha."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        if not user.check_password(senha_atual):
            return Response(
                {"erro": "Senha atual incorreta."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(nova_senha)
        user.save()
        return Response({"mensagem": "Senha alterada com sucesso!"})
