import { test, expect } from "@playwright/test";
import { ROTAS } from "../helpers/rotas";

// Fluxo público (endpoint AllowAny). Requer o backend rodando em :8000.

test.describe("Recuperação de acesso", () => {
  test("envia a solicitação e exibe o protocolo de sucesso", async ({ page }) => {
    await page.goto(ROTAS.recuperar);
    await expect(page.locator("#recoverForm")).toBeVisible();

    await page.fill("#emailRecover", "william@pitstop.test");
    await page.click("#btnRecuperar");

    // Form some e o bloco de sucesso aparece com o protocolo (SOL-xxxx).
    await expect(page.locator("#recoverSuccess")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#recoverSuccessMsg")).toContainText(/protocolo|SOL-/i);
  });

  test("e-mail inválido bloqueia o envio com mensagem de erro", async ({ page }) => {
    await page.goto(ROTAS.recuperar);
    await page.fill("#emailRecover", "email-invalido");
    await page.click("#btnRecuperar");

    await expect(page.locator("#erroEmail")).toHaveText(/e-mail válido/i);
    await expect(page.locator("#recoverSuccess")).toBeHidden();
  });
});
