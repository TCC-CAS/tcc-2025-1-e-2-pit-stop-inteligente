# Pit Stop Inteligente

> Plataforma SaaS de gestão para oficinas mecânicas — Trabalho de Conclusão de Curso (TCC).
> Stack: **Django 4.2 + DRF + PostgreSQL** no back-end e **HTML/CSS/JavaScript vanilla** com Web Components no front-end.

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![Django](https://img.shields.io/badge/Django-4.2-092E20?style=flat&logo=django&logoColor=white)](https://www.djangoproject.com/)
[![DRF](https://img.shields.io/badge/DRF-3.17-A30000?style=flat&logo=django&logoColor=white)](https://www.django-rest-framework.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Nginx](https://img.shields.io/badge/Nginx-1.18%2B-009639?style=flat&logo=nginx&logoColor=white)](https://nginx.org/)
[![Gunicorn](https://img.shields.io/badge/Gunicorn-23.0-499848?style=flat&logo=gunicorn&logoColor=white)](https://gunicorn.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=flat&logo=javascript&logoColor=black)](https://developer.mozilla.org/docs/Web/JavaScript)
[![Web Components](https://img.shields.io/badge/Web%20Components-Custom%20Elements-29ABE2?style=flat&logo=webcomponents.org&logoColor=white)](https://www.webcomponents.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 📑 Sumário

- [Sobre o projeto](#-sobre-o-projeto)
- [Tecnologias](#-tecnologias)
- [Estrutura do projeto](#-estrutura-do-projeto)
- [Pré-requisitos e Instalação local](#-pré-requisitos-e-instalação-local)
- [Deployment em produção (VPS)](#-deployment-em-produção-vps)
- [Exemplos de uso](#-exemplos-de-uso)
- [Testes](#-testes)
- [CI / CD](#-ci--cd)
- [Contribuindo](#-contribuindo)
- [Licença](#-licença)
- [Autores](#-autores)

---

## 🎯 Sobre o projeto

O **Pit Stop Inteligente** é uma plataforma SaaS multi-tenant de gestão para oficinas mecânicas. Ele cobre o ciclo completo de atendimento:

1. **Cadastro** do cliente, veículo e Ordem de Serviço (OS).
2. **Checklist** de recebimento (lataria, vidros, interior, mecânica, fotos e assinaturas digitais).
3. **Diagnóstico e orçamento** item a item, com cálculo dinâmico por categoria de veículo.
4. **Aprovação granular** pelo cliente no portal sem cadastro (código + CPF/CNPJ).
5. **Execução** das tarefas e registro de evidências.
6. **Documentos** anexos com validação de imagens e quota de armazenamento.
7. **Histórico** auditável de cada OS.

A plataforma resolve dores reais de micro e pequenas oficinas: orçamentos por WhatsApp ou papel, falta de rastreabilidade, retrabalho por aprovações verbais e ausência de indicadores de gestão.

### Funcionalidades-chave

- Multi-tenant por oficina (cada oficina enxerga apenas seus dados)
- Multi-papel (admin, gerente, mecânico, atendente, visualizador)
- Precificação dinâmica de serviços por categoria de veículo
- Portal do cliente sem senha (acesso por código + CPF/CNPJ)
- Assinatura digital (técnico + cliente) embutida no checklist
- Upload de fotos com validação magic-bytes e moderação opcional (Sightengine)
- Cobrança via AbacatePay (PIX/cartão/boleto) com webhooks
- Painel administrativo SaaS (gestão das oficinas assinantes)
- 3 planos: **Teste** (grátis, 7 dias, 10 OS), **Básico** (R$ 99,90/mês, 30 OS, 2 usuários, 1 GB), **Premium** (R$ 199,90/mês, 50 OS, 5 usuários, 5 GB)

---

## 🛠 Tecnologias

### Back-end
- **Linguagem:** Python 3.10+
- **Framework web:** Django 4.2 (LTS)
- **API REST:** Django REST Framework 3.17
- **Banco de dados:** PostgreSQL 14+
- **Servidor de aplicação:** Gunicorn 23.0 (WSGI)
- **Servidor web / proxy reverso:** Nginx 1.18+
- **Processamento de imagens:** Pillow 12.1 (magic-bytes + resize)
- **Cobrança SaaS:** Integração com AbacatePay (PIX / cartão / boleto)
- **Configuração por ambiente:** python-decouple (`.env`)
- **HTTPS:** Let's Encrypt (Certbot)

### Front-end
- **HTML5** semântico (WCAG 2.1 AA)
- **CSS3** com design tokens (variáveis CSS), mobile-first
- **JavaScript vanilla** (ES2022, módulos)
- **Web Components** (Custom Elements para header, sidebar, modal, tabs, status badges, etc.)
- **Chart.js** para gráficos de KPI no dashboard
- **html2pdf.js** para geração de relatório PDF do orçamento

### Infraestrutura / Operação
- **VPS Linux** (Ubuntu 22.04 LTS na Hostinger)
- **UFW** (firewall) + **fail2ban** (proteção SSH)
- **systemd** para gerenciar Gunicorn como serviço
- **GitHub Actions** para CI (testes back-end, lint, validações front-end)

### Testes e qualidade
- **pytest-django** para suíte de testes do back-end
- **ruff** para linting Python
- **factory-boy + faker** para fixtures de teste

---

## 📂 Estrutura do projeto

```
tcc-2025-1-e-2-pit-stop-inteligente/
├── back_end/
│   ├── apps/
│   │   ├── modulo_oficina/      # Domínio principal (OS, clientes, veículos, checklist)
│   │   ├── modulo_adm/          # Painel SaaS (oficinas assinantes, configurações)
│   │   ├── modulo_cliente/      # Portal do cliente (sem cadastro)
│   │   ├── modulo_suporte/      # Tickets de suporte
│   │   └── modulo_pagamentos/   # AbacatePay, assinaturas, planos
│   ├── core/
│   │   ├── settings/            # base.py | local.py | production.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   ├── manage.py
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   └── .env.example             # Modelo de configuração
└── front_end/
    └── src/
        ├── app/login/           # Landing e login do usuário oficina
        ├── modulos/
        │   ├── modulo_oficina/
        │   │   ├── dashboard/
        │   │   ├── cadastro_cliente/
        │   │   ├── cadastro_oficina/
        │   │   ├── atualizar_dados_oficina/
        │   │   ├── precos_servicos/
        │   │   ├── pagamentos/
        │   │   ├── suporte/
        │   │   └── ordem_servico/
        │   ├── modulo_cliente/  # Portal do cliente (login + visualização)
        │   └── modulo_adm/      # UI do painel SaaS
        └── shared/
            ├── components/      # Web Components reutilizáveis
            ├── config/          # api-config.js (descoberta dinâmica da URL)
            ├── services/        # auth-guard, password-strength, chart-theme...
            └── styles/          # Design system (variables, global, responsive)
```

---

## ⚙️ Pré-requisitos e Instalação local

### Pré-requisitos
- **Python 3.10+**
- **PostgreSQL 14+** com um banco vazio chamado `pitstop_db` (configurável via `.env`)
- **Git**
- Um servidor estático leve para o front (recomendado: extensão **Live Server** do VS Code)

### Passo a passo

```bash
# 1. Clonar o repositório
git clone https://github.com/TCC-CAS/tcc-2025-1-e-2-pit-stop-inteligente.git
cd tcc-2025-1-e-2-pit-stop-inteligente

# 2. Configurar o back-end
cd back_end
python -m venv venv

# 2.1 Ativar o venv (Windows)
venv\Scripts\activate
# 2.1 Ou ativar o venv (Linux/macOS)
source venv/bin/activate

# 3. Instalar dependências
pip install -r requirements.txt

# 4. Configurar variáveis de ambiente
copy .env.example .env          # Windows
# cp .env.example .env          # Linux/macOS
# Edite o .env com a senha do seu PostgreSQL

# 5. Criar banco PostgreSQL (uma vez)
# Em outro terminal, conecte-se ao psql e execute:
#   CREATE DATABASE pitstop_db;
#   CREATE USER pitstop WITH PASSWORD 'sua_senha';
#   GRANT ALL PRIVILEGES ON DATABASE pitstop_db TO pitstop;
#   ALTER DATABASE pitstop_db OWNER TO pitstop;

# 6. Aplicar migrações
python manage.py migrate

# 7. (Opcional) Criar superusuário pra acessar /admin/
python manage.py createsuperuser

# 8. Subir o servidor de desenvolvimento
python manage.py runserver
```

O back-end fica disponível em `http://127.0.0.1:8000`:

- Painel administrativo Django: `http://127.0.0.1:8000/admin/`
- Endpoints da API: `http://127.0.0.1:8000/api/oficina/...`

Para subir o **front-end** localmente:

1. Abra o VS Code na raiz do projeto.
2. Clique com o botão direito em `front_end/src/app/login/pages/index.html` → **Open with Live Server**.
3. A landing abre em `http://127.0.0.1:5500/...`.

### Ambientes Django

A configuração é selecionada pela variável `DJANGO_ENV`:

| Valor             | Arquivo carregado            | DEBUG  |
|-------------------|------------------------------|--------|
| `local` (default) | `core/settings/local.py`     | `True` |
| `production`      | `core/settings/production.py`| `False` (HTTPS, HSTS, CORS restrito) |

---

## 🚀 Deployment em produção (VPS)

A aplicação está hospedada em **VPS Hostinger KVM 1** (Ubuntu 22.04 LTS, São Paulo) com domínio próprio (`pitstops.com.br`) e HTTPS via Let's Encrypt. Esta seção descreve o roteiro completo para reproduzir o ambiente.

### Pré-requisitos
- VPS Linux (Ubuntu 22.04 LTS recomendado) com acesso root
- Domínio próprio com DNS apontando para o IP do VPS (registros A para `@` e `www`)

### Passo a passo resumido

#### 1. Setup inicial do servidor

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Configurar timezone e hostname
sudo hostnamectl set-hostname pitstop-vps
sudo timedatectl set-timezone America/Sao_Paulo

# Criar usuário dedicado para a aplicação
sudo adduser pitstop_user
sudo usermod -aG sudo pitstop_user

# Firewall + proteção contra força bruta
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban
```

#### 2. Instalar dependências do sistema

```bash
sudo apt install -y \
  python3 python3-venv python3-pip python3-dev \
  postgresql postgresql-contrib \
  nginx \
  git \
  build-essential \
  libpq-dev libjpeg-dev zlib1g-dev \
  certbot python3-certbot-nginx
```

#### 3. Configurar PostgreSQL

```bash
sudo -u postgres psql
```

```sql
CREATE DATABASE pitstop_db;
CREATE USER pitstop WITH PASSWORD '<senha-forte-aqui>';
ALTER ROLE pitstop SET client_encoding TO 'utf8';
ALTER ROLE pitstop SET default_transaction_isolation TO 'read committed';
ALTER ROLE pitstop SET timezone TO 'America/Sao_Paulo';
ALTER DATABASE pitstop_db OWNER TO pitstop;
GRANT ALL PRIVILEGES ON DATABASE pitstop_db TO pitstop;
\q
```

#### 4. Clonar e configurar a aplicação

```bash
cd /home/pitstop_user
git clone https://github.com/TCC-CAS/tcc-2025-1-e-2-pit-stop-inteligente.git pitstop
cd pitstop/back_end
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Copiar e editar o .env (DJANGO_ENV=production, DJANGO_SECRET_KEY, DB_*, etc.)
cp .env.example .env
nano .env

python manage.py migrate
python manage.py collectstatic --noinput
python manage.py createsuperuser
```

#### 5. Gunicorn como serviço systemd

Crie `/etc/systemd/system/gunicorn.socket`:

```ini
[Unit]
Description=gunicorn socket

[Socket]
ListenStream=/run/gunicorn.sock
SocketUser=www-data
SocketGroup=www-data
SocketMode=0660

[Install]
WantedBy=sockets.target
```

E `/etc/systemd/system/gunicorn.service`:

```ini
[Unit]
Description=Gunicorn daemon (Pit Stop Django)
Requires=gunicorn.socket
After=network.target

[Service]
User=pitstop_user
Group=www-data
WorkingDirectory=/home/pitstop_user/pitstop/back_end
Environment="DJANGO_ENV=production"
ExecStart=/home/pitstop_user/pitstop/back_end/venv/bin/gunicorn \
          --workers 3 \
          --bind unix:/run/gunicorn.sock \
          --access-logfile - \
          --error-logfile - \
          core.wsgi:application
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo chmod 755 /home/pitstop_user   # permite Nginx atravessar a home
sudo systemctl daemon-reload
sudo systemctl enable --now gunicorn.socket gunicorn.service
```

#### 6. Configurar Nginx

Crie `/etc/nginx/sites-available/pitstop`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name pitstops.com.br www.pitstops.com.br;

    client_max_body_size 50M;

    access_log /var/log/nginx/pitstop_access.log;
    error_log  /var/log/nginx/pitstop_error.log;

    location = / {
        return 302 /app/login/pages/index.html;
    }

    location /api/ {
        include proxy_params;
        proxy_pass http://unix:/run/gunicorn.sock;
    }

    location /admin/ {
        include proxy_params;
        proxy_pass http://unix:/run/gunicorn.sock;
    }

    location /static/ {
        alias /home/pitstop_user/pitstop/back_end/staticfiles/;
        expires 30d;
        access_log off;
    }

    location /media/ {
        alias /home/pitstop_user/pitstop/back_end/media/;
        expires 7d;
    }

    location / {
        root /home/pitstop_user/pitstop/front_end/src;
        try_files $uri $uri/ =404;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/pitstop /etc/nginx/sites-enabled/pitstop
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

#### 7. HTTPS com Let's Encrypt

```bash
sudo certbot --nginx -d pitstops.com.br -d www.pitstops.com.br
```

Aceite os termos, escolha a opção de **redirect HTTP → HTTPS**. A renovação é automática (timer do systemd).

#### 8. Atualizações futuras (deploy contínuo)

Após cada commit em `main`:

```bash
cd /home/pitstop_user/pitstop
git pull origin main
cd back_end && source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate --noinput
python manage.py collectstatic --noinput
sudo systemctl restart gunicorn
sudo systemctl reload nginx
```

Você pode salvar isso como `/home/pitstop_user/deploy.sh` e rodar com um único comando.

---

## 💡 Exemplos de uso

### 1. Cadastro de uma oficina (plano Teste)

1. Acesse `https://pitstops.com.br`
2. Clique em **"Começar grátis"**
3. Preencha o wizard de 5 passos (admin → oficina → endereço → plano → termos)
4. Escolha o plano **Teste** (gratuito, 7 dias, 10 OS) — pré-selecionado
5. Conclua o cadastro → você é redirecionado direto para o dashboard (sem AbacatePay)

### 2. Criar uma OS e enviar pro cliente aprovar

1. Menu lateral → **Ordens de Serviço** → botão **Nova OS**
2. Informe cliente (autocomplete por CPF/CNPJ), veículo e dados iniciais
3. Aba **Checklist** → preencha o recebimento (lataria, vidros, interior, mecânica) + fotos + assinatura do técnico
4. Aba **Diagnóstico** → adicione itens do orçamento
5. Aba **Aprovação** → botão **"Gerar código de acesso para o cliente"**
6. Envie o código (6 dígitos) + CPF do cliente por WhatsApp/SMS
7. Cliente acessa `https://pitstops.com.br/modulos/modulo_cliente/login/pages/login-cliente.html`, digita código + CPF e aprova/recusa cada item

### 3. Acompanhamento pela oficina

- **Dashboard** (planos pagos): KPIs de OS abertas, ticket médio, ranking de serviços
- **Lista lateral de OS** com filtro por status (Pendente, Em execução, Concluído)
- **Histórico** auditável de cada mudança em cada OS

### 4. Pagamento da assinatura

- Renovação mensal automática via AbacatePay (PIX/cartão/boleto)
- Banner amarelo no topo a partir de **7 dias antes** do vencimento
- Em caso de inadimplência: bloqueio gradual com preservação dos dados por 90 dias

---

## 🧪 Testes

A suíte de testes do back-end usa **pytest-django** e cobre os _services_ de regra de negócio.

```bash
cd back_end

# Instalar deps de desenvolvimento (inclui pytest)
pip install -r requirements-dev.txt

# Rodar a suíte completa
pytest -v

# Rodar um arquivo específico
pytest apps/modulo_oficina/tests/test_aprovacao_service.py -v
```

Layout dos testes:

```
back_end/apps/modulo_oficina/tests/
├── conftest.py                          # Fixtures (user, oficina, cliente, OS, itens)
├── test_ordem_servico_service.py        # Criação e finalização de OS
├── test_aprovacao_service.py            # Aprovação de itens + geração de tarefas
└── test_perfil_oficina_service.py       # CRUD do perfil da oficina
```

Convenções:

- Cada teste usa `@pytest.mark.django_db` (transações revertidas ao final).
- Fixtures organizadas em três níveis: identidade → estrutura organizacional → domínio operacional.
- `--reuse-db` no `pytest.ini` evita recriar o banco entre execuções.

---

## 🔄 CI / CD

Pipeline configurado em `.github/workflows/ci.yml`. Roda automaticamente em pushes e PRs para `main`, `master` e `develop`.

| Job              | O que faz |
| ---------------- | --------- |
| `backend-tests`  | Sobe Postgres 16 efêmero → instala `requirements-dev.txt` → migra → roda `pytest`. |
| `frontend-checks`| Garante que nenhum `.js` tem URL absoluta `http://127.0.0.1:8000` (use `apiUrl()`); valida `lang` e `viewport` em todos os HTMLs. |
| `python-lint`    | Roda `ruff check` no back-end (não-bloqueante por enquanto). |

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Este projeto foi desenvolvido como TCC, mas está aberto a sugestões e melhorias.

### Fluxo recomendado

1. **Fork** este repositório.
2. Crie uma **branch** descritiva: `git checkout -b feat/minha-melhoria`
3. **Commit** suas mudanças seguindo o padrão [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/):
   ```
   feat: nova funcionalidade
   fix: correção de bug
   docs: atualização de documentação
   refactor: refatoração sem mudança de comportamento
   test: adição ou ajuste de testes
   ```
4. **Push** da branch: `git push origin feat/minha-melhoria`
5. Abra um **Pull Request** descrevendo claramente o que mudou e por quê.

### Padrões de código

- **Python**: PEP 8 + ruff (configuração em `back_end/pyproject.toml`)
- **JavaScript**: vanilla ES2022, módulos, sem framework
- **HTML/CSS**: WCAG 2.1 AA, mobile-first, design tokens em `variables.css`
- **Testes**: cobertura mínima recomendada para novas regras de negócio

### Reportando bugs

Abra uma **Issue** no GitHub descrevendo:
- O que aconteceu
- O que era esperado
- Passos para reproduzir
- Print/log (se possível)

---

## 📄 Licença

Este projeto está licenciado sob a **Licença MIT** — veja o arquivo [LICENSE](LICENSE) para detalhes.

Em resumo: você pode usar, copiar, modificar, mesclar, publicar, distribuir, sublicenciar e/ou vender cópias do software, desde que o aviso de copyright e a permissão sejam incluídos em todas as cópias ou partes substanciais do software.

---

## 👥 Autores

- **Guilherme Costa da Silva** — Desenvolvimento back-end e front-end
- **William dos Santos Marciano** — Desenvolvimento back-end e infraestrutura

Trabalho de Conclusão de Curso (TCC) — 2026.

---

## 📚 Documentação adicional

- 📘 [Política de Privacidade](docs/Politica_de_Privacidade.docx) — em conformidade com LGPD (Lei nº 13.709/2018)
- 📘 [Termos de Uso](docs/Termos_de_Uso.docx)
- 📘 Capítulo 6 do TCC: **Precificação da aplicação** (metodologia value-based pricing)

---

<p align="center">
  Desenvolvido com ❤️ para micro e pequenas oficinas mecânicas.
</p>
