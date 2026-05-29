#!/bin/sh
# Entrypoint do contêiner do backend: prepara o banco/estáticos e sobe o gunicorn.
set -e

echo "==> Aplicando migrações do banco..."
python manage.py migrate --noinput

echo "==> Coletando arquivos estáticos (admin/DRF) para o WhiteNoise..."
python manage.py collectstatic --noinput

echo "==> Iniciando gunicorn em 0.0.0.0:8000..."
exec gunicorn core.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers "${GUNICORN_WORKERS:-3}" \
    --timeout "${GUNICORN_TIMEOUT:-60}" \
    --access-logfile - \
    --error-logfile -
