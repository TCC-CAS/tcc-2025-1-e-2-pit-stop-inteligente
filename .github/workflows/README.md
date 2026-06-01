# Workflows de CI

## `ci.yml`

Roda automaticamente em pushes/PRs para `main`, `master` e `develop`.

### Jobs

| Job | Responsabilidade |
| --- | --- |
| `backend-tests` | Sobe Postgres 16 como serviço, instala `requirements-dev.txt` em Python 3.13, aplica migrações e executa `pytest`. |
| `frontend-checks` | Garante que nenhum `.js` do front contenha URL absoluta `http://127.0.0.1:8000` (use `apiUrl()` de `shared/config/api-config.js`) e que cada HTML tenha `lang` + `viewport`. |
| `python-lint` | Executa `ruff check` no back-end. **Não bloqueante** por enquanto — quando o código estiver limpo, remova o `|| true` para tornar a verificação obrigatória. |
| `e2e-tests` | Sobe Postgres, aplica `migrate` + `seed_e2e`, inicia o Django em background, instala o Playwright (Chromium) e roda a suíte E2E de `front_end/tests-e2e`. Publica o relatório HTML como artifact (`playwright-report`). |

### Como rodar localmente

```bash
# Back-end
cd back_end
pip install -r requirements-dev.txt
pytest -v

# Lint
ruff check apps core

# Front-end (manual): abra o front_end/src/app/login/pages/index.html no Live Server.

# E2E (Playwright) — precisa do backend rodando + dados de teste
cd back_end
python manage.py seed_e2e
python manage.py runserver 8000 &        # deixe rodando
cd ../front_end/tests-e2e
npm ci && npx playwright install chromium
npm test
```

### Variáveis e segredos

A CI usa um Postgres efêmero (sem segredos), portanto as credenciais (`postgres`/`postgres`) ficam diretamente no `env:` do workflow.

Em ambiente local, William usa um `.env` próprio (não versionado). Não há segredos no repositório.
