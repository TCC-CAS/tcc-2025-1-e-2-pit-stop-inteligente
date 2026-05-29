"""Service de gestão de usuários (User + Funcionario)."""
from django.contrib.auth import get_user_model
from django.db import transaction

from apps.modulo_oficina.models import Funcionario, Oficina

from ..utils import registrar_auditoria


User = get_user_model()


@transaction.atomic
def criar_usuario_admin(request, dados):
    """Cria User; opcionalmente, cria vínculo `Funcionario` com uma oficina."""
    email = (dados.get("email") or "").strip().lower()
    if not email:
        raise ValueError("E-mail é obrigatório.")
    if User.objects.filter(email__iexact=email).exists() or \
       User.objects.filter(username__iexact=email).exists():
        raise ValueError("Já existe um usuário com este e-mail.")
    senha = dados.get("password") or ""
    if len(senha) < 8:
        raise ValueError("A senha deve ter no mínimo 8 caracteres.")

    is_superuser = bool(dados.get("is_superuser"))
    is_staff = bool(dados.get("is_staff")) or is_superuser

    # Apenas superusers podem criar staff/superuser
    if (is_staff or is_superuser) and not (request.user.is_superuser):
        raise ValueError("Apenas o Super Admin pode criar usuários staff/superuser.")

    user = User.objects.create_user(
        username=email,
        email=email,
        password=senha,
        first_name=(dados.get("first_name") or "").strip(),
        last_name=(dados.get("last_name") or "").strip(),
        is_active=bool(dados.get("is_active", True)),
    )
    user.is_staff = is_staff
    user.is_superuser = is_superuser
    user.save(update_fields=["is_staff", "is_superuser"])

    oficina_id = dados.get("oficina_id")
    permissao = dados.get("permissao") or "visualizador"
    if oficina_id:
        oficina = Oficina.objects.filter(id=oficina_id).first()
        if oficina is None:
            raise ValueError("Oficina informada não encontrada.")
        Funcionario.objects.create(
            user=user, oficina=oficina, permissao=permissao, is_active=True
        )

    registrar_auditoria(
        request,
        acao="usuario.criar",
        recurso="usuario",
        recurso_id=user.id,
        nivel="warning",
        descricao=f"Usuário '{email}' criado.",
        metadados={
            "is_staff": is_staff,
            "is_superuser": is_superuser,
            "oficina_id": oficina_id,
            "permissao": permissao if oficina_id else None,
        },
    )
    return user


@transaction.atomic
def atualizar_usuario_admin(request, user, dados):
    """Atualiza campos do User. Só superuser muda is_superuser/is_staff."""
    mudancas = {}

    if "first_name" in dados:
        user.first_name = (dados.get("first_name") or "").strip()
        mudancas["first_name"] = user.first_name
    if "last_name" in dados:
        user.last_name = (dados.get("last_name") or "").strip()
        mudancas["last_name"] = user.last_name
    if "email" in dados and dados["email"]:
        novo_email = dados["email"].strip().lower()
        if novo_email != user.email:
            if User.objects.filter(email__iexact=novo_email).exclude(pk=user.pk).exists():
                raise ValueError("Já existe um usuário com este e-mail.")
            user.email = novo_email
            user.username = novo_email
            mudancas["email"] = novo_email
    if "is_active" in dados:
        user.is_active = bool(dados["is_active"])
        mudancas["is_active"] = user.is_active

    if "is_staff" in dados or "is_superuser" in dados:
        if not request.user.is_superuser:
            raise ValueError("Apenas o Super Admin pode alterar staff/superuser.")
        if "is_staff" in dados:
            user.is_staff = bool(dados["is_staff"])
            mudancas["is_staff"] = user.is_staff
        if "is_superuser" in dados:
            user.is_superuser = bool(dados["is_superuser"])
            if user.is_superuser:
                user.is_staff = True
            mudancas["is_superuser"] = user.is_superuser

    user.save()

    registrar_auditoria(
        request,
        acao="usuario.atualizar",
        recurso="usuario",
        recurso_id=user.id,
        nivel="info",
        descricao=f"Usuário '{user.email or user.username}' atualizado.",
        metadados=mudancas or None,
    )
    return user


def alterar_senha_usuario(request, user, nova_senha):
    if not nova_senha or len(nova_senha) < 8:
        raise ValueError("A nova senha deve ter no mínimo 8 caracteres.")
    user.set_password(nova_senha)
    user.save(update_fields=["password"])

    # Notifica a equipe sobre a redefinição
    try:
        from ..models import Notificacao
        Notificacao.criar(
            "reset_senha",
            f"Senha redefinida para '{user.email or user.username}'",
            f"O administrador redefiniu a senha do usuário {user.email or user.username}.",
            nivel="warning",
            metadados={"usuario_id": user.id},
        )
    except Exception:
        pass

    registrar_auditoria(
        request,
        acao="usuario.resetar_senha",
        recurso="usuario",
        recurso_id=user.id,
        nivel="warning",
        descricao=f"Senha do usuário '{user.email or user.username}' redefinida.",
    )


def inativar_usuario(request, user, ativo):
    user.is_active = bool(ativo)
    user.save(update_fields=["is_active"])
    registrar_auditoria(
        request,
        acao="usuario.ativar" if ativo else "usuario.inativar",
        recurso="usuario",
        recurso_id=user.id,
        nivel="warning" if not ativo else "info",
        descricao=(
            f"Usuário '{user.email or user.username}' "
            f"{'reativado' if ativo else 'inativado'}."
        ),
    )


def excluir_usuario(request, user):
    if user.is_superuser and not request.user.is_superuser:
        raise ValueError("Apenas o Super Admin pode excluir outro Super Admin.")
    if user.id == request.user.id:
        raise ValueError("Você não pode excluir a si mesmo.")
    email = user.email or user.username
    pk = user.id
    user.delete()
    registrar_auditoria(
        request,
        acao="usuario.excluir",
        recurso="usuario",
        recurso_id=pk,
        nivel="critico",
        descricao=f"Usuário '{email}' excluído.",
    )


def vincular_usuario_oficina(request, user, oficina_id, permissao):
    """Cria/atualiza vínculo Funcionario do usuário com uma oficina."""
    oficina = Oficina.objects.filter(id=oficina_id).first()
    if oficina is None:
        raise ValueError("Oficina não encontrada.")
    funcionario, criado = Funcionario.objects.update_or_create(
        user=user, oficina=oficina,
        defaults={"permissao": permissao or "visualizador", "is_active": True},
    )
    registrar_auditoria(
        request,
        acao="usuario.vincular_oficina",
        recurso="usuario",
        recurso_id=user.id,
        nivel="warning",
        descricao=(
            f"Vínculo {'criado' if criado else 'atualizado'} entre "
            f"'{user.email or user.username}' e oficina '{oficina.nome}' "
            f"(permissão: {funcionario.permissao})."
        ),
        metadados={"oficina_id": oficina.id, "permissao": funcionario.permissao},
    )
    return funcionario
