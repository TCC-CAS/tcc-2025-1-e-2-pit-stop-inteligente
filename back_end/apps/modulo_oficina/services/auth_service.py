"""Regras de negócio de autenticação e sessão multi-oficina.

Modelo: a aplicação usa autenticação por sessão do Django (cookie). O
usuário pode estar vinculado a 1+ oficinas como `Funcionario`. Quando faz
login, o front recebe a lista de vínculos; se houver mais de um, o usuário
escolhe qual oficina assumir e o ID fica gravado em `request.session`.

Chave de sessão: SESSION_OFICINA_KEY ('oficina_atual_id').
Esse mesmo ID é lido em `utils.get_oficina_atual` para isolar as queries
por oficina (multi-tenant).
"""
from django.conf import settings
from django.contrib.auth import authenticate, login as django_login, logout as django_logout
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone

from ..models import Funcionario, Oficina, RegistroCadastroIP
from .perfil_oficina_service import criar_oficina_e_vincular_admin


SESSION_OFICINA_KEY = "oficina_atual_id"

# Controle anti-abuso por IP no cadastro publico de oficinas.
# Configuravel por env var; o default e conservador o suficiente para nao
# bloquear cenarios legitimos (uma familia/escritorio compartilhando IP).
LIMITE_CADASTROS_POR_IP = int(
    getattr(settings, "ANTIABUSO_LIMITE_CADASTROS_POR_IP", 3),
)
JANELA_ANTIABUSO_HORAS = int(
    getattr(settings, "ANTIABUSO_JANELA_HORAS", 24),
)


def _ip_da_request(request):
    """Extrai o IP real do cliente.

    Como o Nginx fica em frente ao Gunicorn, o IP do cliente vem em
    X-Forwarded-For. Se nao estiver presente (chamada direta em dev),
    cai no REMOTE_ADDR.
    """
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR") or ""


def _assegurar_limite_cadastros_ip(request):
    """Levanta ValueError quando o IP da request ja criou contas demais.

    A janela e LIMITE_CADASTROS_POR_IP por JANELA_ANTIABUSO_HORAS. IPs
    invalidos (string vazia) sao ignorados para nao bloquear chamadas
    de testes automatizados que nao preenchem REMOTE_ADDR.
    """
    ip = _ip_da_request(request)
    if not ip:
        return
    inicio_janela = timezone.now() - timezone.timedelta(
        hours=JANELA_ANTIABUSO_HORAS,
    )
    qtd = RegistroCadastroIP.objects.filter(
        ip=ip, criado_em__gte=inicio_janela,
    ).count()
    if qtd >= LIMITE_CADASTROS_POR_IP:
        raise ValueError(
            f"Detectamos {qtd} cadastros do seu endereço nas últimas "
            f"{JANELA_ANTIABUSO_HORAS} horas. Para evitar uso indevido, "
            "novos cadastros foram suspensos temporariamente. Tente novamente "
            "mais tarde ou entre em contato com nosso suporte."
        )


# ---------------------------------------------------------------------------
# Login / logout
# ---------------------------------------------------------------------------

def autenticar_usuario(request, username, password):
    """Autentica e cria sessão. Retorna dict com user + lista de vínculos.

    Aplica camadas de defesa antes de acessar o banco:
      - **rate limit** combinado IP+email (15 tentativas / 10 min);
      - **lockout** por e-mail (5 falhas → 15 min de bloqueio);
      - **honeypot** (campo `url_optional` no payload = bot).

    Lança ValueError com mensagem amigável em caso de falha.
    """
    from apps.modulo_adm.services.seguranca_service import (
        consumir_rate_limit_login,
        detectar_honeypot,
        login_esta_bloqueado,
        registrar_falha_login,
        resetar_falhas_login,
    )

    if not username or not password:
        raise ValueError("Informe usuário e senha.")

    # Honeypot — bot preencheu o campo invisível
    if detectar_honeypot(request):
        raise ValueError("Acesso recusado.")

    # Rate limit — protege contra brute-force massivo do mesmo IP
    rl = consumir_rate_limit_login(request, username)
    if not rl.permitido:
        raise ValueError(
            "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente."
        )

    # Lockout do e-mail (independente do IP)
    if login_esta_bloqueado(username):
        raise ValueError(
            "Sua conta está temporariamente bloqueada após várias tentativas falhas. "
            "Tente novamente em alguns minutos ou use 'Recuperar acesso'."
        )

    user = authenticate(request, username=username, password=password)
    if user is None:
        # Tenta também buscar pelo email (se username veio como email)
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            user_by_email = User.objects.get(email__iexact=username)
            user = authenticate(
                request, username=user_by_email.username, password=password
            )
        except User.DoesNotExist:
            user = None

    if user is None:
        registrar_falha_login(request, username)
        # Resposta genérica — não revela se o e-mail existe (evita user enumeration)
        raise ValueError("Usuário ou senha incorretos.")
    if not user.is_active:
        registrar_falha_login(request, username)
        raise ValueError("Conta desativada. Procure o administrador.")

    # Sucesso — zera contadores de falha do email
    resetar_falhas_login(username)

    django_login(request, user)
    vinculos = _listar_vinculos(user)

    # Auto-seleciona a oficina se houver apenas uma
    if len(vinculos) == 1:
        request.session[SESSION_OFICINA_KEY] = vinculos[0]["oficina"]["id"]
    else:
        request.session.pop(SESSION_OFICINA_KEY, None)

    return {
        "user": _dados_usuario(user),
        "oficinas": vinculos,
        "oficina_atual_id": request.session.get(SESSION_OFICINA_KEY),
    }


def encerrar_sessao(request):
    """Logout: limpa sessão e oficina atual."""
    request.session.pop(SESSION_OFICINA_KEY, None)
    django_logout(request)


# ---------------------------------------------------------------------------
# Registro público de oficina + administrador
# ---------------------------------------------------------------------------

@transaction.atomic
def registrar_oficina_completa(request, dados, arquivo_logo=None):
    """Cria, em uma única transação, User + Oficina + Funcionario(admin)
    e autentica o usuário em sequência.

    `dados` deve conter: admin_nome, admin_sobrenome (opcional), admin_email,
    admin_senha, admin_senha_confirmacao, termos_aceitos (truthy) e os
    campos da oficina (nome, cnpj, endereço, horários, plano, etc.).

    Antes de criar qualquer registro, dispara o controle anti-abuso por IP
    (LIMITE_CADASTROS_POR_IP cadastros em JANELA_ANTIABUSO_HORAS horas).

    Lança ValueError com mensagem amigável em caso de validação inválida.
    """
    _assegurar_limite_cadastros_ip(request)
    _validar_dados_admin(dados)

    User = get_user_model()
    email = dados["admin_email"].strip().lower()
    if User.objects.filter(email__iexact=email).exists() or \
       User.objects.filter(username__iexact=email).exists():
        raise ValueError("Já existe uma conta com este e-mail.")

    # Aplica a politica completa de senhas configurada em
    # AUTH_PASSWORD_VALIDATORS (tamanho, maiuscula+minuscula, numero,
    # caractere especial, sem ser comum, sem similaridade com username).
    # Validamos com um user "fantasma" so para alimentar o validator de
    # similaridade — assim a senha nao pode replicar o e-mail.
    senha = dados.get("admin_senha") or ""
    user_fantasma = User(username=email, email=email,
                         first_name=(dados.get("admin_nome") or "").strip())
    try:
        validate_password(senha, user_fantasma)
    except DjangoValidationError as exc:
        raise ValueError(" ".join(exc.messages))

    novo_user = User.objects.create_user(
        username=email,
        email=email,
        password=senha,
        first_name=(dados.get("admin_nome") or "").strip(),
        last_name=(dados.get("admin_sobrenome") or "").strip(),
    )

    oficina = criar_oficina_e_vincular_admin(
        dados=dados,
        arquivo_logo=arquivo_logo,
        usuario=novo_user,
    )

    # Registra o IP/UA do cadastro para futuras checagens anti-abuso.
    # Usa truncate manual pois o User-Agent pode ser arbitrariamente longo.
    ua = (request.META.get("HTTP_USER_AGENT") or "")[:400]
    RegistroCadastroIP.objects.create(
        ip=_ip_da_request(request) or "0.0.0.0",
        user_agent=ua,
        user=novo_user,
        oficina=oficina,
    )

    # Dispara o e-mail de confirmacao apos a criacao bem-sucedida. Falhas no
    # SMTP nao bloqueiam o cadastro (token fica salvo e pode ser reenviado).
    try:
        from .email_confirmacao_service import gerar_token_e_enviar
        gerar_token_e_enviar(novo_user, request)
    except Exception:  # pragma: no cover — defesa contra import circular
        # Logado pelo proprio service; aqui apenas garantimos que o
        # registro nao falhe se algo der errado no envio.
        pass

    # Quando o plano escolhido e gratuito (preco zero — atualmente o "Teste"),
    # ativamos a assinatura diretamente, SEM passar pelo AbacatePay. Isso
    # libera as funcionalidades basicas imediatamente para o usuario conhecer
    # a aplicacao. O front consulta `plano_gratuito_ativado` para decidir
    # entre ir para o dashboard ou para o checkout.
    plano_gratuito_ativado = False
    try:
        from apps.modulo_pagamentos.models import PlanoSaaS
        from apps.modulo_pagamentos.services.assinatura_service import (
            ativar_plano_gratuito,
        )
        plano_obj = PlanoSaaS.objects.filter(
            codigo=oficina.plano_atual or "", ativo=True,
        ).first()
        if plano_obj is not None and plano_obj.preco_centavos == 0:
            ativar_plano_gratuito(
                oficina=oficina, plano_codigo=plano_obj.codigo, usuario=novo_user,
            )
            plano_gratuito_ativado = True
    except Exception:  # pragma: no cover — nao bloqueia o cadastro
        # Se algo der errado na ativacao, o fluxo cai no caminho de checkout
        # tradicional — usuario nao fica trancado.
        plano_gratuito_ativado = False

    # Login automático após o registro
    novo_user.backend = "django.contrib.auth.backends.ModelBackend"
    django_login(request, novo_user)
    request.session[SESSION_OFICINA_KEY] = oficina.id

    return {
        "user": _dados_usuario(novo_user),
        "oficinas": _listar_vinculos(novo_user),
        "oficina_atual_id": oficina.id,
        "plano_gratuito_ativado": plano_gratuito_ativado,
    }


def _validar_dados_admin(dados):
    if not _eh_truthy(dados.get("termos_aceitos")):
        raise ValueError(
            "É necessário aceitar os Termos de Uso e a Política de Privacidade."
        )

    nome = (dados.get("admin_nome") or "").strip()
    if len(nome) < 2:
        raise ValueError("Informe seu nome (mínimo 2 caracteres).")

    email = (dados.get("admin_email") or "").strip()
    try:
        validate_email(email)
    except DjangoValidationError:
        raise ValueError("E-mail inválido.")

    senha = dados.get("admin_senha") or ""
    if len(senha) < 8:
        raise ValueError("A senha deve ter pelo menos 8 caracteres.")
    if senha != dados.get("admin_senha_confirmacao", senha):
        raise ValueError("A confirmação de senha não confere.")

    if not (dados.get("nome") or "").strip():
        raise ValueError("Informe o nome da oficina.")
    cnpj = (dados.get("cnpj") or "").strip()
    if not cnpj:
        raise ValueError("Informe o CNPJ da oficina.")
    if Oficina.objects.filter(cnpj=cnpj).exists():
        raise ValueError("Já existe uma oficina cadastrada com este CNPJ.")


def _eh_truthy(valor):
    """Aceita True, "true", "on", "1" — útil para FormData multipart."""
    if isinstance(valor, bool):
        return valor
    if valor is None:
        return False
    return str(valor).strip().lower() in {"true", "1", "on", "sim", "yes"}


# ---------------------------------------------------------------------------
# Sessão / multi-oficina
# ---------------------------------------------------------------------------

def montar_perfil_corrente(request):
    """Snapshot do usuário logado: dados + oficina ativa + lista de oficinas."""
    user = request.user
    if not user.is_authenticated:
        return None

    vinculos = _listar_vinculos(user)
    return {
        "user": _dados_usuario(user),
        "oficinas": vinculos,
        "oficina_atual_id": request.session.get(SESSION_OFICINA_KEY),
        "oficina_atual": _oficina_atual_resumo(request, vinculos),
    }


def selecionar_oficina(request, oficina_id):
    """Define qual oficina o usuário está usando agora.

    Lança ValueError se o usuário não tiver vínculo com a oficina.
    """
    if not request.user.is_authenticated:
        raise ValueError("Sessão expirada. Faça login novamente.")

    oficina_id = int(oficina_id)
    funcionario_qs = Funcionario.objects.filter(
        user=request.user, oficina_id=oficina_id, is_active=True
    )
    if request.user.is_superuser:
        # Superuser pode "entrar" em qualquer oficina existente
        if not Oficina.objects.filter(id=oficina_id).exists():
            raise ValueError("Oficina não encontrada.")
    elif not funcionario_qs.exists():
        raise ValueError("Você não tem vínculo com esta oficina.")

    request.session[SESSION_OFICINA_KEY] = oficina_id
    return oficina_id


# ---------------------------------------------------------------------------
# Helpers privados
# ---------------------------------------------------------------------------

def _listar_vinculos(user):
    """Lista de oficinas (com papel) onde o usuário é funcionário ativo."""
    if user.is_superuser:
        # Superuser enxerga todas as oficinas como admin
        return [
            {
                "oficina": {"id": o.id, "nome": o.nome, "cnpj": o.cnpj},
                "permissao": "admin",
                "is_active": True,
            }
            for o in Oficina.objects.all().order_by("nome")
        ]

    funcionarios = (
        Funcionario.objects.filter(user=user, is_active=True)
        .select_related("oficina")
        .order_by("oficina__nome")
    )
    return [
        {
            # `plano` (codigo do PlanoSaaS contratado) e exposto para o front
            # decidir quais itens de menu exibir conforme o plano corrente.
            "oficina": {
                "id": f.oficina.id,
                "nome": f.oficina.nome,
                "cnpj": f.oficina.cnpj,
                "plano": (f.oficina.plano_atual or "basico").lower(),
            },
            "permissao": f.permissao,
            "is_active": f.is_active,
        }
        for f in funcionarios
    ]


def _dados_usuario(user):
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "nome_completo": (user.get_full_name() or user.username),
        "is_superuser": user.is_superuser,
        "is_staff": user.is_staff,
    }


def _oficina_atual_resumo(request, vinculos):
    """Resumo da oficina ativa (id, nome, papel) ou None."""
    oficina_id = request.session.get(SESSION_OFICINA_KEY)
    if not oficina_id:
        return None
    for v in vinculos:
        if v["oficina"]["id"] == oficina_id:
            return {**v["oficina"], "permissao": v["permissao"]}
    # Sessão tinha id de oficina à qual o user perdeu vínculo: limpa
    request.session.pop(SESSION_OFICINA_KEY, None)
    return None
