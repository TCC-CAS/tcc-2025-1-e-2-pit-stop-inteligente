# Guia de Deploy — Pit Stop Inteligente (VPS)

Passo a passo para colocar a aplicação no ar em um **VPS Linux** (ex.: Hostinger,
Ubuntu 22.04+) usando **Docker Compose**.

---

## Arquitetura

```
                Internet
                   │  (porta 80/443)
            ┌──────▼───────┐
            │    nginx     │  serve o front-end estático (front_end/src)
            │ (proxy rev.) │  e roteia /api, /admin, /static, /media
            └──────┬───────┘
                   │ (rede interna do compose)
        ┌──────────▼──────────┐
        │  web  (Django +     │  gunicorn :8000  (não exposto à internet)
        │       gunicorn)     │
        └──────────┬──────────┘
                   │
            ┌──────▼───────┐
            │  db (Postgres │  volume persistente (postgres_data)
            │   16-alpine)  │
            └──────────────┘
```

Tudo no **mesmo domínio** (same-origin): o front chama `/api/...` no próprio host,
então não há CORS cross-site. O front é 100% self-hosted (sem CDN).

---

## Pré-requisitos

- VPS com **Ubuntu 22.04+**, acesso **SSH** (root ou usuário com `sudo`).
- Portas **80** (e **443** para HTTPS) liberadas no firewall do painel da Hostinger.
- **Recomendado:** um domínio (ex.: `pitstop.com.br`) com registro **A** apontando
  para o IP do VPS. Sem domínio, dá para subir só em HTTP pelo IP (sem TLS).
- A pasta do projeto (`back_end/`, `front_end/`, `docker-compose.yml`, `deploy/`)
  disponível para enviar ao servidor — **sem** `venv/` nem `node_modules/`.

---

## 1. Instalar o Docker no VPS

```bash
ssh root@SEU_IP

# Docker + Compose plugin (script oficial)
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# Confirme
docker --version
docker compose version
```

---

## 2. Enviar o código para o VPS

**Opção A — Git (recomendado):** crie um repositório próprio do Pit Stop, faça push,
e no VPS:
```bash
cd /opt
git clone https://github.com/SEU_USUARIO/pitstop.git
cd pitstop
```

**Opção B — rsync/scp** (do seu PC, dentro da pasta do projeto), excluindo o que é
gerado localmente:
```bash
rsync -av --exclude 'venv' --exclude 'node_modules' --exclude '.env' \
      --exclude 'staticfiles' --exclude '__pycache__' \
      ./ root@SEU_IP:/opt/pitstop/
```

> O contêiner `web` faz build de `back_end/` (sem o `venv`) e o `nginx` monta
> `front_end/src` direto — por isso ambas as pastas precisam estar no servidor.

---

## 3. Configurar o `.env` de produção

Na raiz do projeto (mesma pasta do `docker-compose.yml`):

```bash
cp .env.production.example .env
nano .env
```

Preencha:

| Variável | O que pôr |
| --- | --- |
| `DJANGO_SECRET_KEY` | Gere: `python3 -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `ALLOWED_HOSTS` | `pitstop.com.br,www.pitstop.com.br` (ou o IP, sem `http://`) |
| `SECURE_SSL_REDIRECT` | **`False`** por enquanto (sem TLS ainda) |
| `CSRF_TRUSTED_ORIGINS` | `https://pitstop.com.br` (ou `http://SEU_IP` enquanto sem TLS) |
| `CORS_ALLOWED_ORIGINS` | igual ao CSRF |
| `DB_PASSWORD` | uma senha **forte** (gere uma aleatória) |
| `ABACATEPAY_API_KEY` | a chave do AbacatePay (`abc_dev_*` para simulação) |
| `ABACATEPAY_RETURN_URL_BASE` | `https://pitstop.com.br` (ou `http://SEU_IP`) |

> `DJANGO_ENV=production` e `DB_HOST=db` já são forçados pelo `docker-compose.yml`.
> **Nunca** versione o `.env` (já está no `.gitignore`).

---

## 4. Subir os contêineres

```bash
docker compose up -d --build
```

No primeiro start, o `entrypoint` do `web` roda **automaticamente**:
`migrate` (cria o schema) e `collectstatic` (estáticos do admin/DRF).

Verifique:
```bash
docker compose ps          # os 3 serviços "Up" (db saudável)
docker compose logs -f web # acompanha o boot do gunicorn
```

---

## 5. Criar o administrador e validar

```bash
# Superusuário do Django (acesso ao /admin e ao Painel SaaS)
docker compose exec web python manage.py createsuperuser

# Health check (deve responder {"status": "ok"})
curl http://SEU_IP/healthz
```

Abra `http://SEU_IP` no navegador — você cai na tela de login.

> ⚠️ **Nunca** rode `seed_e2e` em produção — ele é bloqueado quando `DEBUG=False`,
> mas não tente forçá-lo: cria dados de teste com senhas conhecidas.

---

## 6. HTTPS (domínio + TLS com Let's Encrypt)

Faça **depois** que o domínio estiver apontando para o VPS e o site rodando em HTTP.

```bash
# 1. Instale o certbot no host e gere o certificado (libere a porta 80)
sudo apt update && sudo apt install -y certbot
docker compose stop nginx
sudo certbot certonly --standalone -d pitstop.com.br -d www.pitstop.com.br
# certificados ficam em /etc/letsencrypt/live/pitstop.com.br/
```

**2.** No `docker-compose.yml`, no serviço `nginx`, habilite a porta 443 e monte os
certificados:
```yaml
  nginx:
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./deploy/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
      - ./front_end/src:/usr/share/nginx/front:ro
      - static_data:/usr/share/nginx/static:ro
      - media_data:/usr/share/nginx/media:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro      # <-- adicionar
```

**3.** Em `deploy/nginx/default.conf`, faça o `server` da porta 80 redirecionar e
adicione um `server` 443 (copie os `location` do bloco atual). Esqueleto:
```nginx
server {
    listen 80;
    server_name pitstop.com.br www.pitstop.com.br;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    server_name pitstop.com.br www.pitstop.com.br;
    ssl_certificate     /etc/letsencrypt/live/pitstop.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pitstop.com.br/privkey.pem;

    client_max_body_size 50m;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    root /usr/share/nginx/front;
    index index.html;
    location = / { return 302 /app/login/pages/login-page.html; }
    location /api/    { proxy_pass http://pitstop_web; }
    location /admin/  { proxy_pass http://pitstop_web; }
    location /static/ { alias /usr/share/nginx/static/; access_log off; expires 30d; }
    location /media/  { alias /usr/share/nginx/media/; access_log off; expires 7d; }
    location / { try_files $uri $uri/ =404; }
}
```

**4.** No `.env`, troque para HTTPS e suba de novo:
```bash
# .env: SECURE_SSL_REDIRECT=True
#       CSRF_TRUSTED_ORIGINS=https://pitstop.com.br
#       CORS_ALLOWED_ORIGINS=https://pitstop.com.br
#       ABACATEPAY_RETURN_URL_BASE=https://pitstop.com.br
docker compose up -d
```

**5. Renovação automática** (o cert expira em 90 dias):
```bash
# Renova e recarrega o nginx do compose
echo '0 3 * * * certbot renew --quiet --deploy-hook "docker compose -f /opt/pitstop/docker-compose.yml exec nginx nginx -s reload"' | sudo crontab -
```

---

## 7. AbacatePay (cobrança)

- A integração funciona em **modo simulação** com chave `abc_dev_*` (nenhuma cobrança
  real). Para produção real, troque por `abc_live_*`.
- Configure o **webhook** no painel da AbacatePay apontando para:
  `https://pitstop.com.br/api/pagamentos/webhook/abacatepay/` e preencha
  `ABACATEPAY_WEBHOOK_SECRET` no `.env`.

---

## 8. Operação do dia a dia

```bash
docker compose logs -f web          # logs da aplicação
docker compose ps                   # status dos serviços
docker compose restart web          # reiniciar a aplicação
docker compose down                 # parar tudo (dados do banco persistem no volume)

# Atualizar para uma nova versão do código:
git pull                            # (ou rsync de novo)
docker compose up -d --build        # rebuild + migrate/collectstatic automáticos
```

---

## 9. Backup do banco de dados

```bash
# Backup (gera um .sql com data)
docker compose exec -T db pg_dump -U pitstop pitstop_db > backup_$(date +%F).sql

# Restaurar
cat backup_2026-05-29.sql | docker compose exec -T db psql -U pitstop -d pitstop_db
```
> Agende um backup diário (cron) e leve a cópia para fora do VPS.

---

## 10. Checklist final

- [ ] `DJANGO_SECRET_KEY` forte e único; `DB_PASSWORD` forte.
- [ ] `ALLOWED_HOSTS` e `CSRF_TRUSTED_ORIGINS` com o domínio/IP corretos.
- [ ] HTTP funcionando pelo IP (`/healthz` → ok).
- [ ] Domínio + TLS configurados; `SECURE_SSL_REDIRECT=True`.
- [ ] Superusuário criado; login e dashboard abrindo.
- [ ] Webhook do AbacatePay apontando para o domínio (se for cobrar).
- [ ] Backup do Postgres agendado.
- [ ] Firewall: só 80/443 abertos (e 22 para SSH).

---

## 11. Problemas comuns

| Sintoma | Causa provável / solução |
| --- | --- |
| `DisallowedHost` no log | Domínio/IP faltando em `ALLOWED_HOSTS`. |
| Loop de redirecionamento | `SECURE_SSL_REDIRECT=True` sem TLS. Deixe `False` até configurar HTTPS. |
| Login falha (403 CSRF) | `CSRF_TRUSTED_ORIGINS` sem o esquema/origem corretos (`https://...`). |
| `db` não sobe | `DB_PASSWORD` vazio no `.env` (o compose exige). |
| 502 Bad Gateway | O `web` ainda está subindo ou caiu — veja `docker compose logs web`. |
| Estáticos do admin sem estilo | `collectstatic` falhou no boot — veja os logs do `web`. |
