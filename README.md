# Pit Stop Inteligente

> Plataforma SaaS de gestão para oficinas mecânicas — TCC.
> Stack: **Django 4.2 + DRF + PostgreSQL** (back-end) e **HTML/CSS/JavaScript vanilla com Web Components** (front-end).

---

## Estrutura do projeto

```
Projeto/
├── back_end/                       # API Django REST
│   ├── apps/
│   │   ├── modulo_adm/             # Administrativo (SaaS)
│   │   └── modulo_oficina/         # Domínio principal
│   │       ├── models.py           # Models por domínio (oficina, OS, etc.)
│   │       ├── serializers.py      # Serializers DRF
│   │       ├── admin.py            # Django Admin
│   │       ├── urls.py             # urlpatterns da API
│   │       ├── utils.py            # Helpers compartilhados
│   │       ├── services/           # Camada de regras de negócio
│   │       │   ├── ordem_servico_service.py
│   │       │   ├── aprovacao_service.py
│   │       │   └── perfil_oficina_service.py
│   │       └── views/              # Views (controllers) por feature
│   │           ├── oficina_views.py
│   │           ├── cliente_views.py
│   │           ├── veiculo_views.py
│   │           ├── ordem_servico_views.py
│   │           ├── checklist_views.py
│   │           ├── orcamento_views.py
│   │           ├── tarefa_views.py
│   │           ├── documento_views.py
│   │           ├── historico_views.py
│   │           ├── precos_views.py
│   │           └── funcionario_views.py
│   ├── core/
│   │   ├── settings/               # Configuração por ambiente
│   │   │   ├── base.py
│   │   │   ├── local.py
│   │   │   └── production.py
│   │   ├── urls.py
│   │   ├── wsgi.py
│   │   └── asgi.py
│   ├── manage.py
│   ├── requirements.txt
│   └── .env.example                # Modelo de configuração (copie para .env)
└── front_end/
    └── src/
        ├── app/login/              # Landing + tela de login
        ├── modulos/modulo_oficina/ # Módulos funcionais
        │   ├── dashboard/
        │   ├── cadastro_cliente/
        │   ├── cadastro_oficina/
        │   ├── atualizar_dados_oficina/
        │   ├── precos_servicos/
        │   └── ordem_servico/
        │       ├── checklist/
        │       ├── diagnostico_orcamento/
        │       ├── aprovacao/
        │       ├── execucao/
        │       ├── documentos/
        │       ├── historico/
        │       └── shared/
        └── shared/
            ├── components/         # Web Components (header, sidebar, modal, tabs, …)
            ├── config/             # Configuração central (api-config.js)
            └── styles/             # Design system (variables, global, responsive)
```

Cada feature segue o padrão `components/`, `services/`, `style/`, `pages/` para que tanto a tela quanto sua lógica e seus estilos vivam juntos.

---

## Pré-requisitos

- **Python 3.11+**
- **PostgreSQL 14+** com um banco vazio chamado `pitstop_db` (configurável via `.env`)
- Um servidor estático leve para o front-end (recomendado: extensão **Live Server** do VS Code, que sobe em `http://127.0.0.1:5500`)

---

## Configuração — back-end

```bash
cd back_end

# 1. Criar e ativar o ambiente virtual
python -m venv venv
# Windows
venv\Scripts\activate
# Linux/macOS
source venv/bin/activate

# 2. Instalar dependências
pip install -r requirements.txt

# 3. Configurar variáveis de ambiente
copy .env.example .env          # Windows
cp .env.example .env            # Linux/macOS
# edite o .env com a senha do seu PostgreSQL

# 4. Aplicar migrações e (opcional) criar superusuário
python manage.py migrate
python manage.py createsuperuser

# 5. Subir o servidor de desenvolvimento
python manage.py runserver
```

Servidor disponível em `http://127.0.0.1:8000`.
- Painel administrativo: `http://127.0.0.1:8000/admin/`
- Endpoints da API: `http://127.0.0.1:8000/api/oficina/...`

### Ambientes

A configuração é selecionada pela variável `DJANGO_ENV`:

| Valor          | Arquivo carregado            | DEBUG |
|----------------|------------------------------|-------|
| `local` (padrão) | `core/settings/local.py`   | `True` |
| `production`   | `core/settings/production.py`| `False` (HTTPS, HSTS, CORS restrito) |

Para produção, todas as variáveis sensíveis (`DJANGO_SECRET_KEY`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, credenciais do banco) **devem** vir do ambiente — não há fallback hard-coded.

---

## Configuração — front-end

O front-end é estático e roda em qualquer servidor de arquivos local.

1. Abra o VS Code na raiz do projeto.
2. Clique com o botão direito em `front_end/src/app/login/pages/index.html` → **Open with Live Server**.
3. A landing page sobe em `http://127.0.0.1:5500/...`.

A URL da API é resolvida automaticamente em `front_end/src/shared/config/api-config.js`. Para apontar para outro back-end (ex.: ambiente em nuvem), basta adicionar uma meta tag no `<head>` da página:

```html
<meta name="api-base-url" content="https://api.pitstop.com.br">
```

---

## Padrões adotados

### Back-end

- **Settings por ambiente** (`base` / `local` / `production`) com leitura de `.env` via `python-decouple`.
- **Clean Architecture pragmática:** views finas (entrada/saída HTTP) → services (regra de negócio) → models (persistência).
- **SOLID:** cada view atende uma única responsabilidade; services isolam regras complexas (criação de OS, aprovação de orçamento, perfil da oficina).
- **DRY:** helpers comuns (`get_oficina_atual`, `registrar_historico`) ficam em `utils.py`.

### Front-end

- **HTML semântico:** `<header>`, `<main>`, `<section>`, `<nav>`, `<aside>`, `<footer>`.
- **W3C / WCAG 2.1 AA:**
  - `lang="pt-BR"` em todas as páginas
  - Skip-link como primeiro elemento focável
  - Foco visível (`:focus-visible`) com anel de alto contraste
  - Áreas de toque ergonômicas (mín. 44×44 px)
  - `prefers-reduced-motion` respeitado
  - Mensagens de erro com `role="alert"` e `aria-live="polite"`
  - Ícones decorativos com `aria-hidden="true"`
- **Mobile-first:** base CSS começa pelo mobile e expande para tablet/desktop via `@media (min-width: ...)`.
- **Design tokens** centralizados em `variables.css` (cores, tipografia, espaçamento, sombras, transições, breakpoints).
- **Separação estrita:** estrutura (HTML), apresentação (CSS) e comportamento (JS) sempre em arquivos diferentes.
- **Web Components** isolam componentes compartilhados (`<oficina-header>`, `<oficina-sidebar>`, `<oficina-tabs>`, `<oficina-modal>`).

---

## Testes

A suite de testes do back-end usa **pytest-django** e cobre os _services_ de regra de negócio (criação de OS, aprovação de orçamento, perfil da oficina).

```bash
cd back_end

# Instalar deps de desenvolvimento (inclui pytest)
pip install -r requirements-dev.txt

# Rodar a suite completa
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
- `--reuse-db` no `pytest.ini` evita recriar o banco entre execuções (mais rápido).

---

## CI / CD

Pipeline configurado em `.github/workflows/ci.yml`. Roda automaticamente em pushes/PRs para `main`, `master` e `develop`.

| Job | O que faz |
| --- | --- |
| `backend-tests` | Sobe Postgres 16 efêmero → instala `requirements-dev.txt` → migra → roda `pytest`. |
| `frontend-checks` | Garante que nenhum `.js` tem URL absoluta `http://127.0.0.1:8000` (use `apiUrl()`); valida `lang` e `viewport` em todos os HTMLs. |
| `python-lint` | Roda `ruff check` no back-end (não-bloqueante por enquanto). |

---

## Comandos úteis

```bash
# Validação completa do projeto Django
python manage.py check

# Criar nova migração após alterar models
python manage.py makemigrations
python manage.py migrate

# Listar todas as rotas registradas
python manage.py show_urls   # requer django-extensions (opcional)

# Coletar arquivos estáticos para deploy
python manage.py collectstatic

# Rodar a suite de testes
pytest -v
```

---

## Roadmap de evolução (cloud-ready)

A estrutura já está preparada para deploy em nuvem (Azure, AWS, GCP). Próximos passos sugeridos:

- Criar `Dockerfile` e `docker-compose.yml` (back-end + Postgres + servidor estático).
- Adicionar storage gerenciado (S3/Azure Blob) para `MEDIA_ROOT`.
- Trocar PostgreSQL local por instância gerenciada (RDS / Azure Database / Cloud SQL).
- Estender a suite de testes para cobrir as views (camada HTTP) usando `APIClient`.
- Tornar o lint (`ruff`) bloqueante no CI e adicionar `prettier` para o front-end.

---

## Licença

Ver [LICENSE](LICENSE).
