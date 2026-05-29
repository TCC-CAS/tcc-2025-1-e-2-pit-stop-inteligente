import { test, expect } from "@playwright/test";
import { ROTAS, E2E_ADMIN } from "../helpers/rotas";

// Suporte — a oficina (admin) abre um chamado na página dedicada de suporte.
// (A página de suporte é liberada mesmo sob paywall; o seed deixa a
// assinatura ativa.) Requer backend em :8000 e `seed_e2e` aplicado.

test.describe("Suporte — abrir chamado pela oficina", () => {
  test("admin abre um novo chamado e vê o detalhe", async ({ page }) => {
    page.on("dialog", (dialog) => dialog.accept());

    // --- Login da oficina ---
    await page.goto(ROTAS.login);
    await page.fill("#username", E2E_ADMIN.email);
    await page.fill("#password", E2E_ADMIN.senha);
    await page.click("#btnEntrar");
    await expect(page).toHaveURL(/dashboard\.html/, { timeout: 15_000 });

    // --- Página de suporte da oficina (sessão já ativa) ---
    await page.goto(ROTAS.suporteOficina);
    await expect(page.locator("#btnNovoTicket")).toBeVisible({ timeout: 15_000 });

    // --- Abre o modal e preenche o chamado ---
    const titulo = `Chamado Oficina E2E ${Date.now()}`;
    await page.click("#btnNovoTicket");
    await page.fill("#novoTitulo", titulo);
    await page.fill(
      "#novoDescricao",
      "Mensagem de teste E2E com detalhes suficientes para abrir o chamado.",
    );
    await page.locator("#suporteFormNovo button[type=submit]").click();

    // --- O chamado é criado e o detalhe abre com o título informado ---
    await expect(page.locator("#ticketDetalhe")).toContainText(titulo, { timeout: 10_000 });
  });
});
