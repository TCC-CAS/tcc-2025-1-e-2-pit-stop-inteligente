import { test, expect } from "@playwright/test";
import { ROTAS } from "../helpers/rotas";

// Smoke: garante que o front carrega e a navegação básica funciona.
// Não depende do backend (não dispara chamadas de API no load).

test.describe("Smoke — páginas públicas", () => {
  test("a página de login renderiza os campos essenciais", async ({ page }) => {
    await page.goto(ROTAS.login);
    await expect(page).toHaveTitle(/Login \| Pit Stop/i);
    await expect(page.locator("#username")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator("#btnEntrar")).toBeVisible();
  });

  test("o link 'Esqueceu a senha?' leva à recuperação de acesso", async ({ page }) => {
    await page.goto(ROTAS.login);
    await page.getByRole("link", { name: /esqueceu a senha/i }).click();
    await expect(page).toHaveURL(/recuperar-acesso\.html/);
    await expect(page.locator("#recoverForm")).toBeVisible();
  });

  test("o link de cadastro leva ao wizard de cadastro de oficina", async ({ page }) => {
    await page.goto(ROTAS.login);
    await page.getByRole("link", { name: /cadastre sua oficina/i }).click();
    await expect(page).toHaveURL(/cadastro-oficina\.html/);
  });
});
