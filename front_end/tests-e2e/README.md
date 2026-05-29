# Testes E2E — Pit Stop Inteligente

Testes end-to-end com [Playwright](https://playwright.dev), exercitando os
fluxos de ponta a ponta (front → back → banco). Referência:
`Outros/ESTRATEGIA_DE_TESTES.md`.

## Pré-requisitos
- Node.js 18+ e npm
- Backend rodando em `http://localhost:8000`, com o banco migrado
- Python no PATH (o Playwright sobe o front com `python -m http.server`)

## Setup (uma vez)
```bash
cd front_end/tests-e2e
npm install
npm run install:browsers   # baixa o Chromium do Playwright
```

## Antes de cada execução: backend + seed
Em outro terminal, com o venv ativado:
```bash
cd back_end
venv\Scripts\activate              # Windows  (Linux/macOS: source venv/bin/activate)
python manage.py seed_e2e          # cria oficina + admin de teste (idempotente)
python manage.py runserver 8000    # deixe rodando
```
> O front é servido automaticamente pelo Playwright (porta 5500, a partir de
> `front_end/src` — a mesma raiz que o nginx usa). Só o backend precisa ser iniciado manualmente.

## Rodar
```bash
cd front_end/tests-e2e
npm test              # headless
npm run test:headed   # com navegador visível
npm run test:ui       # modo interativo (debug)
npm run report        # abre o último relatório HTML
```

## Credenciais de teste
Criadas por `seed_e2e` (NÃO usar em produção):
- Oficina (admin): `e2e-admin@pitstop.test` / `E2eAdmin!2024`
- Portal do cliente: código `E2EOS123` + CPF `12345678909`
- Painel SaaS (superuser): `e2e-super@pitstop.test` / `E2eSuper!2024`

## Estrutura
- `specs/smoke.spec.ts` — render das páginas públicas e navegação (não exige login).
- `specs/auth.spec.ts` — login inválido (erro) e login válido (→ dashboard).
- `specs/recuperar-acesso.spec.ts` — fluxo público de recuperação de acesso.
- `specs/cadastro-oficina.spec.ts` — wizard de 5 passos até o registro da oficina.
- `specs/ciclo-os.spec.ts` — cliente entra no portal (código + CPF), vê a OS e aprova itens.
- `specs/suporte.spec.ts` — oficina abre um chamado de suporte.
- `specs/production-health.spec.ts` — superusuário acessa a aba Saúde do painel SaaS.

## Observações
- Execução **serial** (`workers: 1`): os fluxos compartilham o mesmo banco.
- Os testes de login com credenciais inválidas usam um e-mail descartável
  para não disparar o *lockout* da conta real de teste.
