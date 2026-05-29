# Imagem de produção do backend Django (Pit Stop Inteligente).
FROM python:3.13-slim

# Sem .pyc; logs sem buffer (aparecem imediatamente em `docker logs`).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DJANGO_ENV=production

WORKDIR /app

# Dependências de sistema: libpq5 (runtime do PostgreSQL) e curl (healthcheck).
# psycopg2-binary e pillow vêm com wheels, então não é preciso compilador.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

# Instala dependências primeiro para aproveitar o cache de camadas.
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copia o restante do código do backend.
COPY . .

# Cria os diretórios de estáticos/uploads ANTES dos volumes: assim os
# volumes nomeados herdam o dono (appuser) e o collectstatic consegue
# escrever neles. Usuário não-root por segurança.
RUN mkdir -p /app/staticfiles /app/media \
    && useradd -m -u 1000 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# `sh` explícito evita depender do bit de execução (build no Windows).
ENTRYPOINT ["sh", "/app/entrypoint.sh"]
