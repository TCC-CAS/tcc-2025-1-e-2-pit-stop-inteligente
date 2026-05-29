import { test, expect } from "@playwright/test";
import { ROTAS, E2E_ADMIN } from "../helpers/rotas";

// Requer o backend rodando em :8000 e `python manage.py seed_e2e` aplicado.

test.describe("Autenticação", () => {
  test("login inválido mostra erro e permanece na tela de login", async ({ page }) => {
    await page.goto(ROTAS.login);
    // E-mail descartável (não é o do seed) para não disparar o lockout da conta real.
    await page.fill("#username", "ninguem-e2e@pitstop.test");
    await page.fill("#password", "senha-errada-123");
    await page.click("#btnEntrar");

    await expect(page.locator("#error-username")).toHaveText(/incorret|inválid/i);
    await expect(page).toHaveURL(/login-page\.html/);
  });

  test("login válido redireciona para o dashboard", async ({ page }) => {
    await page.goto(ROTAS.login);
    await page.fill("#username", E2E_ADMIN.email);
    await page.fill("#password", E2E_ADMIN.senha);
    await page.click("#btnEntrar");

    // Uma única oficina vinculada → vai direto ao dashboard (assinatura ativa
    // no seed evita o redirecionamento do paywall).
    await expect(page).toHaveURL(/dashboard\.html/, { timeout: 15_000 });
  });
});
