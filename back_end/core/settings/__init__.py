"""Pacote de settings — seleciona o módulo correto conforme DJANGO_ENV.

Por padrão usa o ambiente local. Para produção, defina:
    DJANGO_ENV=production
"""
import os

_env = os.environ.get("DJANGO_ENV", "local").lower()

if _env == "production":
    from .production import *  # noqa: F401,F403
else:
    from .local import *  # noqa: F401,F403
