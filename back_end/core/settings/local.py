"""Configurações de desenvolvimento local."""
import logging

from decouple import Csv, config

from .base import *  # noqa: F401,F403


DEBUG = True

ALLOWED_HOSTS = config(
    "ALLOWED_HOSTS",
    default="localhost,127.0.0.1",
    cast=Csv(),
)

# IMPORTANTE: CORS_ALLOW_ALL_ORIGINS=True é INCOMPATÍVEL com cookies
# (CORS_ALLOW_CREDENTIALS=True). Como precisamos enviar a sessão do Django
# entre o Live Server (:5500) e o Django (:8000), mantemos OFF e confiamos
# na lista CORS_ALLOWED_ORIGINS de base.py.
CORS_ALLOW_ALL_ORIGINS = config(
    "CORS_ALLOW_ALL_ORIGINS",
    default=False,
    cast=bool,
)
# Defesa: se o .env do dev tiver acidentalmente CORS_ALLOW_ALL_ORIGINS=True
# e credentials estiver ativo (default), o browser bloqueia cookies — o
# login "passa" mas o /me/ devolve 403. Forçamos False com aviso visível.
if CORS_ALLOW_ALL_ORIGINS and globals().get("CORS_ALLOW_CREDENTIALS", True):
    logging.getLogger(__name__).warning(
        "Forçando CORS_ALLOW_ALL_ORIGINS=False porque CORS_ALLOW_CREDENTIALS=True. "
        "Cookies de sessão NÃO funcionam com Allow-Origin: * — use a lista "
        "CORS_ALLOWED_ORIGINS para liberar as origens necessárias."
    )
    CORS_ALLOW_ALL_ORIGINS = False
