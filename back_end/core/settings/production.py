"""Configurações de produção (deploy em nuvem / VPS).

Em produção é OBRIGATÓRIO definir as seguintes variáveis no .env:
    DJANGO_SECRET_KEY
    ALLOWED_HOSTS
    CSRF_TRUSTED_ORIGINS
    DB_PASSWORD (ou usar credenciais gerenciadas pelo provedor)

Quando o front é servido pelo mesmo domínio (nginx faz proxy de /api),
não há requisição cross-origin e o CORS pode ficar restrito apenas ao
próprio domínio.
"""
import sys

from decouple import Csv, config

from .base import *  # noqa: F401,F403


DEBUG = False

# Em produção, a SECRET_KEY é obrigatória (sem default). Falha imediata
# ao iniciar caso a variável não esteja definida no ambiente.
SECRET_KEY = config("DJANGO_SECRET_KEY")

ALLOWED_HOSTS = config("ALLOWED_HOSTS", cast=Csv())

# ---- Segurança HTTPS ----------------------------------------------------
# Ative SECURE_SSL_REDIRECT só quando houver TLS terminando no nginx
# (ex.: certificado Let's Encrypt). ENQUANTO o servidor responder só em
# HTTP (ex.: testando pelo IP do VPS), defina SECURE_SSL_REDIRECT=False no
# .env para não cair em loop de redirecionamento.
SECURE_SSL_REDIRECT = config("SECURE_SSL_REDIRECT", default=True, cast=bool)
SECURE_HSTS_SECONDS = config("SECURE_HSTS_SECONDS", default=31536000, cast=int)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
# O nginx (proxy reverso) encerra o TLS e repassa o protocolo neste header.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

# Em produção, CORS é estritamente restrito ao que estiver listado no .env.
CORS_ALLOW_ALL_ORIGINS = False

# ---- Arquivos estáticos (WhiteNoise) ------------------------------------
# O nginx serve o front-end (front_end/src) diretamente; o Django só
# precisa servir os PRÓPRIOS estáticos (admin e DRF browsable API) via
# WhiteNoise. Por isso STATICFILES_DIRS fica vazio aqui — evita que o
# collectstatic copie todo o front desnecessariamente para staticfiles/.
STATICFILES_DIRS = []

# WhiteNoise deve vir logo após o SecurityMiddleware (recomendação oficial).
if "whitenoise.middleware.WhiteNoiseMiddleware" not in MIDDLEWARE:
    _security_idx = MIDDLEWARE.index("django.middleware.security.SecurityMiddleware")
    MIDDLEWARE.insert(_security_idx + 1, "whitenoise.middleware.WhiteNoiseMiddleware")

# URLs absolutas (barra inicial) — necessário para o admin funcionar
# corretamente atrás do nginx. O base.py usa "static/" (sem barra), ok
# em dev mas problemático em produção.
STATIC_URL = "/static/"

# CompressedStaticFilesStorage comprime (gzip/brotli) sem versionar por
# hash — robusto para este projeto (não falha por url() externa em CSS).
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

# ---- REST Framework ----
# Em produção expõe somente JSON — desativa a Browsable API (HTML navegável),
# que vazaria a estrutura dos endpoints. REST_FRAMEWORK herda de base.py.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
}

# ---- Banco de dados -----------------------------------------------------
# Conexões persistentes reduzem latência (reaproveita a conexão por N seg).
DATABASES["default"]["CONN_MAX_AGE"] = config("DB_CONN_MAX_AGE", default=60, cast=int)

# ---- Logging para stdout (capturado pelo Docker / journald) -------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "simples": {
            "format": "[{asctime}] {levelname} {name}: {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "stream": sys.stdout,
            "formatter": "simples",
        },
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "django.request": {"handlers": ["console"], "level": "WARNING", "propagate": False},
    },
}
