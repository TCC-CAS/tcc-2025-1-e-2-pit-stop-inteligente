import { test, expect } from "@playwright/test";
import { ROTAS, E2E_CLIENTE } from "../helpers/rotas";

// Ciclo de OS pelo portal do cliente (cross-actor): a oficina já gerou o
// código de acesso (via seed_e2e); aqui o cliente entra com código + CPF,
// vê a OS e aprova os itens do orçamento.
//
// Requer backend em :8000 e `python manage.py seed_e2e` aplicado.

test.describe("Ciclo de OS — portal do cliente", () => {
  test("cliente entra com o código, vê a OS e aprova os itens", async ({ page }) => {
    // Pode haver um alert se o pagamento pós-aprovação não abrir (sem chave).
    page.on("dialog", (dialog) => dialog.accept());

    // --- Login do cliente ---
    await page.goto(ROTAS.loginCliente);
    // O setup do login-cliente.js só termina (e registra o handler de submit)
    // após checar a sessão e focar o campo de código. Esperar o foco evita
    // clicar antes do handler existir (o que dispararia um submit nativo).
    await expect(page.locator("#codigoAcesso")).toBeFocused({ timeout: 10_000 });
    await page.fill("#codigoAcesso", E2E_CLIENTE.codigo);
    await page.fill("#cpfCnpj", E2E_CLIENTE.cpf);
    await page.click("#btnEntrar");

    // --- Portal carrega a OS ---
    await expect(page).toHaveURL(/portal-cliente\.html/, { timeout: 15_000 });
    await expect(page.locator("#osSummary")).toContainText(/OS #\d+/, { timeout: 15_000 });

    // --- Abre a aba "Aprovações" --- (o oficina-tabs clona as abas para o
    // shadow DOM; a versão visível, com o listener, é a que tem :visible)
    await page.locator('[data-target="aprovacoes"]:visible').click();
    const content = page.locator("#contentArea");
    await expect(content.locator(".aprovacao-item").first()).toBeVisible({ timeout: 10_000 });
    await expect(content).toContainText(/Troca de óleo \(E2E\)/);

    // --- Aprova todos os itens pendentes e confirma ---
    await content.locator("#btnAprovarTudo").click();
    await content.locator("#chkTermo").check();
    await content.locator("#btnConfirmar").click();

    // Após confirmar, o orçamento é reprocessado: não há mais pendentes.
    await expect(content).toContainText(/decididos|Valor total aprovado/i, { timeout: 10_000 });
  });
});
