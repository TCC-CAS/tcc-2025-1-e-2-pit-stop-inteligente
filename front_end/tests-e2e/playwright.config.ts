import { defineConfig, devices } from "@playwright/test";

/**
 * Configuração E2E do Pit Stop.
 *
 * O front é servido na porta 5500 a partir de `front_end/src` — a MESMA raiz
 * que o nginx usa em produção. Isso valida que a navegação funciona sem o
 * prefixo /front_end/src/ (graças ao base-path.js). Nessa porta, o
 * api-config.js aponta a API para http://localhost:8000 (Django), que deve
 * estar rodando à parte.
 */
const FRONT_PORT = 5500;
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${FRONT_PORT}`;

export default defineConfig({
  testDir: "./specs",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  // Os fluxos compartilham o mesmo banco/seed — execução serial evita corrida.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  // Sobe apenas o servidor estático do front. O BACK-END (Django :8000)
  // precisa estar rodando à parte, com `seed_e2e` aplicado — veja o README.
  webServer: {
    command: "python -m http.server 5500",
    cwd: "../src",
    url: `${BASE_URL}/app/login/pages/login-page.html`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
