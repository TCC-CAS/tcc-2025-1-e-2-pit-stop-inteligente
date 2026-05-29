"""Configurações base compartilhadas entre todos os ambientes.

Variáveis sensíveis (SECRET_KEY, banco, etc.) NÃO devem ser definidas aqui:
elas vivem em local.py / production.py e leem do .env via python-decouple.
"""
import os
from pathlib import Path

from decouple import Csv, config

# ----------------------------------------------------------------------
# Paths
# ----------------------------------------------------------------------
# BASE_DIR aponta para back_end/ (raiz do projeto Django)
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# FRONT_END_DIR aponta para front_end/src/ (compartilhado com o back-end
# como TEMPLATES e STATICFILES_DIRS)
FRONT_END_DIR = BASE_DIR.parent / "front_end" / "src"


# ----------------------------------------------------------------------
# Aplicações
# ----------------------------------------------------------------------
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # Bibliotecas de terceiros
    "rest_framework",
    "corsheaders",

    # Apps internos
    "apps.modulo_oficina",
    "apps.modulo_adm",
    "apps.modulo_cliente",
    "apps.modulo_suporte",
    "apps.modulo_pagamentos",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # Captura exceções/5xx e popula o feed do Production Health.
    # Tem que ficar DEPOIS de Auth para que request.user já esteja
    # resolvido na hora de salvar o evento.
    "apps.modulo_adm.middleware.ProductionHealthMiddleware",
    # Aplica defesas anti-bot/anti-abuso (IP block + headers de segurança).
    "apps.modulo_adm.middleware.SegurancaMiddleware",
    # Paywall — bloqueia endpoints da oficina quando assinatura não vigente.
    # Liberados: Dados da Oficina, Suporte, Auth e Pagamentos. Desativável
    # via PAGAMENTOS_PAYWALL_HABILITADO=False (útil em testes legados).
    "apps.modulo_pagamentos.middleware.AssinaturaPaywallMiddleware",
]


# ----------------------------------------------------------------------
# Cabeçalhos / hardening
# ----------------------------------------------------------------------
# Headers HTTP de segurança aplicados em TODA resposta.
# Em produção (HTTPS) o SecurityMiddleware do Django adiciona HSTS etc.
SECURE_BROWSER_XSS_FILTER = True          # X-XSS-Protection: 1; mode=block
SECURE_CONTENT_TYPE_NOSNIFF = True        # X-Content-Type-Options: nosniff
X_FRAME_OPTIONS = "DENY"                   # bloqueia iframes (clickjacking)
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"

# Senhas precisam ter mínimo 8 chars + não comuns + não numéricas
# (já configurado em AUTH_PASSWORD_VALIDATORS acima).

# Limites de tamanho de request — barra payloads excessivos.
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024     # 5 MB para JSON/form
FILE_UPLOAD_MAX_MEMORY_SIZE = 50 * 1024 * 1024    # 50 MB para upload binário
DATA_UPLOAD_MAX_NUMBER_FIELDS = 1000              # protege contra DoS de muitos campos


# Production Health: pode ser desativado por ambiente, e ambiente lógico
# é exposto à UI para que a equipe distinga prod x homolog. Versão do app
# aparece nos detalhes dos eventos.
PITSTOP_PRODUCTION_HEALTH_ENABLED = config(
    "PITSTOP_PRODUCTION_HEALTH_ENABLED", default=True, cast=bool,
)
PITSTOP_AMBIENTE = config("PITSTOP_AMBIENTE", default="")
PITSTOP_VERSAO_APP = config("PITSTOP_VERSAO_APP", default="")

ROOT_URLCONF = "core.urls"
WSGI_APPLICATION = "core.wsgi.application"
ASGI_APPLICATION = "core.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]


# ----------------------------------------------------------------------
# Banco de dados (parâmetros lidos do .env)
# ----------------------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": config("DB_ENGINE", default="django.db.backends.postgresql"),
        "NAME": config("DB_NAME", default="pitstop_db"),
        "USER": config("DB_USER", default="postgres"),
        "PASSWORD": config("DB_PASSWORD", default=""),
        "HOST": config("DB_HOST", default="localhost"),
        "PORT": config("DB_PORT", default="5432"),
    }
}


# ----------------------------------------------------------------------
# Validação de senha
# ----------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# ----------------------------------------------------------------------
# Internacionalização
# ----------------------------------------------------------------------
LANGUAGE_CODE = "pt-br"
TIME_ZONE = "America/Sao_Paulo"
USE_I18N = True
USE_TZ = True


# ----------------------------------------------------------------------
# Static / Media
# ----------------------------------------------------------------------
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [str(FRONT_END_DIR)]

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# ----------------------------------------------------------------------
# REST Framework — defesa em profundidade
# ----------------------------------------------------------------------
# Toda view do projeto DEVE declarar `permission_classes` explicitamente.
# Caso alguém esqueça, este default garante que a view fique fechada
# (IsAuthenticated) — evita exposição acidental de endpoints sensíveis.
REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "UNAUTHENTICATED_USER": "django.contrib.auth.models.AnonymousUser",
}


# ----------------------------------------------------------------------
# CORS / CSRF (lidos do .env, com fallback para localhost)
# ----------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS",
    default="http://127.0.0.1:5500,http://localhost:5500,http://127.0.0.1:3000,http://localhost:3000",
    cast=Csv(),
)

CSRF_TRUSTED_ORIGINS = config(
    "CSRF_TRUSTED_ORIGINS",
    default="http://127.0.0.1:5500,http://localhost:5500,http://127.0.0.1:3000,http://localhost:3000",
    cast=Csv(),
)

CORS_ALLOW_CREDENTIALS = True

CORS_ALLOW_METHODS = [
    "DELETE",
    "GET",
    "OPTIONS",
    "PATCH",
    "POST",
    "PUT",
]

CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
]


# ----------------------------------------------------------------------
# Sessão e CSRF (cookies usados por front em outra porta — Live Server)
# ----------------------------------------------------------------------
# CSRF_COOKIE_HTTPONLY=False permite que o JS leia document.cookie e
# envie o token no header X-CSRFToken. SECURE=False pois rodamos HTTP
# em desenvolvimento (production.py sobrescreve).
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = False

CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SECURE = False


# ----------------------------------------------------------------------
# Segredos (sempre via .env)
#
# IMPORTANTE: em local.py mantemos um fallback explícito apenas para
# evitar que o servidor de desenvolvimento se recuse a iniciar antes
# do aluno copiar o .env.example. Em production.py este default é
# sobrescrito por uma chamada SEM default — garantindo que o deploy
# falhe imediatamente se a variável não estiver no ambiente.
# ----------------------------------------------------------------------
SECRET_KEY = config(
    "DJANGO_SECRET_KEY",
    default="django-insecure-dev-only-change-me-in-production",
)


# ----------------------------------------------------------------------
# AbacatePay (cobrança SaaS e cobrança de OS)
# ----------------------------------------------------------------------
# A mesma URL atende dev e produção; o "ambiente" é determinado pelo
# prefixo da chave (abc_dev_* simula; abc_live_* processa real).
# ABACATEPAY_DEV_KEY é aceita como fallback para compatibilidade com
# .env existentes — prefira ABACATEPAY_API_KEY em novos ambientes.
ABACATEPAY_API_KEY = config(
    "ABACATEPAY_API_KEY",
    default=config("ABACATEPAY_DEV_KEY", default=""),
)
ABACATEPAY_BASE_URL = config(
    "ABACATEPAY_BASE_URL", default="https://api.abacatepay.com",
)
ABACATEPAY_WEBHOOK_SECRET = config(
    "ABACATEPAY_WEBHOOK_SECRET", default="",
)
# Base de URL do front (Live Server local ou domínio de produção) usada
# para montar `returnUrl` / `completionUrl` do checkout AbacatePay.
ABACATEPAY_RETURN_URL_BASE = config(
    "ABACATEPAY_RETURN_URL_BASE", default="http://localhost:5500",
)
# Caminho até a página de retorno dentro do front. Default reflete a
# estrutura padrão do repo (Live Server servindo a partir da raiz do
# projeto). Em deploy onde o front está em outra raiz, ajuste no .env.
ABACATEPAY_RETORNO_URL_PATH = config(
    "ABACATEPAY_RETORNO_URL_PATH",
    default="/front_end/src/modulos/modulo_oficina/pagamentos/pages/retorno-pagamento.html",
)
