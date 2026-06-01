import { test, expect } from "@playwright/test";
import { ROTAS, E2E_SUPER } from "../helpers/rotas";

// Production Health — o superusuário acessa o painel SaaS e abre a aba
// "Saúde da aplicação" (feed de eventos). Smoke do painel admin: valida o
// acesso restrito a staff/superuser e o carregamento da seção.
// Requer backend em :8000 e `seed_e2e` aplicado.

test.describe("Production Health — painel SaaS", () => {
  test("superusuário acessa a aba Saúde da aplicação", async ({ page }) => {
    page.on("dialog", (dialog) => dialog.accept());

    // --- Login do superusuário ---
    await page.goto(ROTAS.login);
    await page.fill("#username", E2E_SUPER.email);
    await page.fill("#password", E2E_SUPER.senha);
    await page.click("#btnEntrar");
    await page.waitForURL(/dashboard|selecionar-oficina/, { timeout: 15_000 });

    // O superuser enxerga várias oficinas → seleciona uma para criar a
    // sessão de oficina (o painel admin exige uma oficina selecionada).
    if (page.url().includes("selecionar-oficina")) {
      await page.getByRole("button", { name: /Selecionar oficina/i }).first().click();
      await page.waitForURL(/dashboard/, { timeout: 15_000 });
    }

    // --- Painel SaaS: espera inicializar e abre a aba Saúde ---
    await page.goto(ROTAS.adminPainel);
    await expect(page.locator("#adminContent")).not.toContainText(/Inicializando/, {
      timeout: 15_000,
    });
    await page.locator('[data-tab="saude"]').click();

    // A seção de Saúde fica ativa e o título reflete isso.
    await expect(page.locator('[data-tab="saude"]')).toHaveClass(/active/, { timeout: 10_000 });
    await expect(page.locator("#adminPageTitle")).toContainText(/sa[úu]de/i, { timeout: 10_000 });
  });
});
