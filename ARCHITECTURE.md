# Arquitetura — Pit Stop Inteligente

> Documento de referência das decisões arquiteturais do projeto.
> Complementa o `README.md` (orientado a quem vai **rodar** o projeto)
> com foco em quem precisa **entender ou estender** o código.

---

## Visão de alto nível

```
┌─────────────────────┐         HTTP / JSON        ┌────────────────────────┐
│   Front-end (SPA-   │ ◄─────────────────────────►│   Back-end (Django +   │
│   like estático)    │   /api/oficina/*           │     DRF + Postgres)    │
│                     │                            │                        │
│  HTML + CSS + JS    │                            │  Views → Services →    │
│  vanilla            │                            │  Models                │
│  Web Components     │                            │                        │
└─────────────────────┘                            └────────────────────────┘
```

- O front-end é **100% estático** (servido por Live Server / Nginx em produção).
- A comunicação acontece exclusivamente via REST sob `/api/oficina/`.
- A URL base da API é centralizada em `shared/config/api-config.js` — em
  produção, basta apontar uma `<meta name="api-base-url">` para o domínio
  correto e o front-end inteiro segue funcionando.

---

## Back-end · Camadas

A app `modulo_oficina` segue o estilo **Clean Architecture pragmática**:

```
                       ┌────────────────────────────────────────┐
                       │  views/                                │
                       │  (entrada HTTP - parsing, status code) │
                       └────────────────┬───────────────────────┘
                                        │ chama
                                        ▼
                       ┌────────────────────────────────────────┐
                       │  services/                             │
                       │  (regras de negócio, orquestração)     │
                       └────────────────┬───────────────────────┘
                                        │ usa
                                        ▼
                       ┌────────────────────────────────────────┐
                       │  models.py / serializers.py            │
                       │  (persistência + tradução para JSON)   │
                       └────────────────────────────────────────┘
```

### Por que essa separação?

| Camada | Responsabilidade | O que NUNCA deve ter |
| --- | --- | --- |
| `views/` | Validar request, chamar service, formatar response | `objects.create(...)`, `if/else` de regra de negócio |
| `services/` | Regras de negócio puras | `request.data`, `Response(...)` (zero acoplamento HTTP) |
| `models.py` | Estrutura dos dados, constraints, `Meta` | Lógica de negócio que não é invariante do dado |

Isso traz três benefícios concretos:

1. **Testabilidade.** Os services são funções simples, testáveis sem
   `APIClient`/HTTP — daí `test_*_service.py` ser tão rápido (2 segundos
   para 26 testes).
2. **Reuso.** O mesmo service pode ser chamado por uma view, um command
   `manage.py`, ou um job assíncrono no futuro.
3. **Refatoração segura.** Mudar uma view não quebra teste de service e
   vice-versa.

### Convenção de nomes

- `views/<feature>_views.py` — uma view por feature (cliente, OS, checklist…).
- `services/<feature>_service.py` — funções (não classes) que recebem
  modelos e retornam modelos. Sem dependência de Django REST.
- `utils.py` — helpers cross-feature (`get_oficina_atual`,
  `registrar_historico`).

---

## Back-end · Settings por ambiente

Configurações vivem em `core/settings/`, dividas em três arquivos:

```
core/settings/
├── base.py        # Tudo que vale para qualquer ambiente
├── local.py       # DEBUG=True, CORS livre, fallback para Postgres local
└── production.py  # HTTPS, HSTS, CORS restrito; falha se .env não tiver as chaves
```

A variável `DJANGO_ENV` (lida do `.env`) seleciona qual módulo carregar
em `manage.py`. Tudo que é sensível (`SECRET_KEY`, senha do banco,
hosts permitidos) é injetado via `python-decouple` — **nada de
credenciais no Git.**

---

## Front-end · Estrutura modular

```
front_end/src/
├── app/                       # Aplicação "raiz" (landing + login)
│   └── login/
├── modulos/modulo_oficina/    # Funcionalidades de domínio
│   ├── dashboard/
│   ├── cadastro_cliente/
│   ├── cadastro_oficina/
│   ├── atualizar_dados_oficina/
│   ├── precos_servicos/
│   └── ordem_servico/
│       ├── checklist/         # Cada feature da OS é independente
│       ├── diagnostico_orcamento/
│       ├── aprovacao/
│       ├── execucao/
│       ├── documentos/
│       ├── historico/
│       └── shared/
└── shared/                    # Compartilhado entre todas as features
    ├── components/            # Web Components (header, sidebar, modal, tabs)
    ├── config/                # api-config.js (URL base + helpers)
    └── styles/                # Design tokens + global + responsive
```

### Princípio: pasta espelha responsabilidade

Cada módulo de feature segue o mesmo padrão **a fim de minimizar surpresa**:

```
<feature>/
├── components/   # JS dos Web Components ou scripts de página
├── services/     # Funções que falam com a API (use sempre apiUrl())
├── style/        # CSS específico da feature
└── pages/        # HTML da tela
```

### Exemplo concreto: como o `checklist-tab.js` foi quebrado

O monolito original tinha **822 linhas**. Foi dividido em 6 arquivos
focados:

```
ordem_servico/checklist/components/
├── checklist-tab.js              (entry: orquestra wizard ≈ 280 linhas)
└── parts/
    ├── checklist-state.js        (state + validação por passo)
    ├── checklist-summary.js      (card de resumo na tela principal)
    ├── checklist-photos.js       (uploads, dropzone, prévias)
    ├── checklist-signatures.js   (canvas de assinaturas)
    └── checklist-save.js         (persistência + upload)
```

**Por quê dessa forma?** Cada arquivo tem **uma única razão para mudar**:

- `state.js` muda quando uma regra de validação muda.
- `photos.js` muda quando o fluxo de upload muda.
- `signatures.js` muda quando a captura de assinatura muda.
- O entry só muda quando a navegação do wizard muda.

Isso é **SRP (Single Responsibility Principle)** aplicado a JavaScript.

---

## Comunicação Front ↔ Back

Toda chamada à API passa pelo helper centralizado em
`shared/config/api-config.js`:

```js
import { apiUrl, getCsrfToken } from "shared/config/api-config.js";

// Em vez de: fetch("http://127.0.0.1:8000/api/oficina/os/")
// Use:
fetch(apiUrl("/os/"));
```

### Por que isso importa?

- **Trocar de ambiente é uma linha:** uma `<meta name="api-base-url">` no
  HTML aponta o front-end para qualquer back-end (local, staging, prod).
- **CSRF correto sem boilerplate:** `getCsrfToken()` lê o cookie do
  Django automaticamente.
- **Garantia automatizada:** o CI falha se aparecer
  `http://127.0.0.1:8000` em qualquer `.js` (exceto o próprio
  `api-config.js`).

---

## Acessibilidade (WCAG 2.1 AA)

Aplicada de forma **estrutural**, não como hotfix:

| Requisito | Onde está aplicado |
| --- | --- |
| `lang="pt-BR"` em todas as páginas | `<html>` raiz dos HTMLs |
| Skip-link como primeiro foco | Já presente no layout principal |
| Foco visível com alto contraste | `:focus-visible` em `global.css` |
| Toque ergonômico (≥ 44×44 px) | Botões dimensionados via tokens |
| `prefers-reduced-motion` | Animações respeitam a preferência |
| Anúncio de erros para leitores | `role="alert"` + `aria-live="polite"` |
| Ícones decorativos | `aria-hidden="true"` |

O CI verifica `lang` e `viewport` em todos os HTMLs.

---

## Testes

A pirâmide de testes começa pelo **service layer** porque é onde a
maior parte das regras de negócio vive. Hoje cobrimos:

- `ordem_servico_service` — fluxo completo de criação + finalização.
- `aprovacao_service` — atualização granular, geração de tarefas, idempotência.
- `perfil_oficina_service` — CRUD do perfil + criação inicial da oficina.

**Por que não testar as views diretamente?** Porque a view é "casca":
toda lógica importante já está coberta no nível de service. Quando
houver tempo, o próximo passo é adicionar testes de integração HTTP
com `APIClient` para garantir o contrato da API.

---

## Decisões deliberadas

### Por que vanilla JS e não React/Vue?

- Foco do TCC é demonstrar domínio dos fundamentos (W3C, WCAG, Web
  Components nativos).
- Build-step zero → menor curva de avaliação para o examinador.
- Web Components garantem encapsulamento sem framework.

### Por que monolito Django, não microsserviços?

- Escopo de TCC: complexidade adicional não traria valor pedagógico.
- A estrutura por **services** já permite extrair domínios para
  microsserviços no futuro (cada service pode virar um endpoint
  próprio).

### Por que PostgreSQL e não SQLite?

- O modelo usa `ArrayField` (campo de lista de strings em
  `Oficina.dias_funcionamento`), exclusivo do Postgres.
- Espelha o ambiente de produção (RDS / Azure Database for PostgreSQL).

---

## O que está pronto para nuvem

| Item | Status | Notas |
| --- | --- | --- |
| Settings por ambiente | ✅ | `local.py` / `production.py` separados |
| Variáveis sensíveis em `.env` | ✅ | Lidas via `python-decouple` |
| API base configurável no front | ✅ | `<meta name="api-base-url">` |
| Suite de testes automatizados | ✅ | pytest-django, 26 testes |
| Pipeline CI | ✅ | `.github/workflows/ci.yml` |
| Containerização | ⏳ | Próximo passo (fora do escopo atual) |
| Storage gerenciado para mídia | ⏳ | Atualmente local em `media/` |

---

## Referências internas

- [`README.md`](./README.md) — instruções de setup e execução.
- [`back_end/.env.example`](./back_end/.env.example) — variáveis de ambiente.
- [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) — pipeline CI.
- [`back_end/apps/modulo_oficina/tests/`](./back_end/apps/modulo_oficina/tests/) — exemplos de teste.
