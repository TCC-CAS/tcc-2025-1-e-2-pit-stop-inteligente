import { test, expect } from "@playwright/test";
import { ROTAS } from "../helpers/rotas";

// Cadastro de oficina — percorre os 5 passos do wizard com dados ÚNICOS
// (e-mail/CNPJ por timestamp) e confirma que o registro foi aceito.
//
// Após o registro, o app avança para o fluxo de pagamento: exibe o overlay
// "Redirecionando para o pagamento…" ANTES de qualquer navegação externa.
// Esse overlay é o sinal determinístico de que a oficina + admin foram
// criados no backend — não dependemos do resultado do checkout (AbacatePay).
//
// Requer o backend rodando em :8000. Cria registros reais no banco a cada run.

test.describe("Cadastro de oficina (wizard de 5 passos)", () => {
  test("preenche os 5 passos e conclui o cadastro", async ({ page }) => {
    const ts = Date.now();
    const email = `e2e-cadastro-${ts}@pitstop.test`;
    const cnpj = (String(ts) + "00").slice(0, 14); // 14 dígitos únicos

    // Sem dependência de rede externa: aborta a busca de CEP (ViaCEP) e
    // aceita um eventual alert do pós-cadastro (checkout sem chave em dev).
    await page.route(/viacep\.com\.br/, (route) => route.abort());
    page.on("dialog", (dialog) => dialog.accept());

    await page.goto(ROTAS.cadastroOficina);

    // Passo 1 — conta do administrador
    await expect(page.locator("#stepCounterText")).toHaveText(/Passo 1 de 5/i);
    await page.fill("#adminNome", "Maria");
    await page.fill("#adminSobrenome", "Silva");
    await page.fill("#adminEmail", email);
    await page.fill("#adminSenha", "E2ePass!2024");
    await page.fill("#adminSenhaConfirm", "E2ePass!2024");
    await page.click("#btnProximo");

    // Passo 2 — dados da oficina
    await expect(page.locator("#stepCounterText")).toHaveText(/Passo 2 de 5/i);
    await page.fill("#oficNome", `Oficina E2E ${ts}`);
    await page.fill("#oficCnpj", cnpj);
    await page.click("#btnProximo");

    // Passo 3 — endereço (preenchido manualmente; ViaCEP abortado)
    await expect(page.locator("#stepCounterText")).toHaveText(/Passo 3 de 5/i);
    await page.fill("#cep", "01001000");
    await page.fill("#logradouro", "Praça da Sé");
    await page.fill("#numero", "100");
    await page.fill("#bairro", "Sé");
    await page.fill("#cidade", "São Paulo");
    await page.selectOption("#estado", "SP");
    await page.click("#btnProximo");

    // Passo 4 — funcionamento e plano (premium já vem selecionado).
    // Marca os dias clicando nos labels (o checkbox real costuma ser oculto).
    await expect(page.locator("#stepCounterText")).toHaveText(/Passo 4 de 5/i);
    await page.fill("#horarioAbertura", "08:00");
    await page.fill("#horarioFechamento", "18:00");
    for (const dia of ["seg", "ter", "qua", "qui", "sex"]) {
      await page.locator(`label[for="dia-${dia}"]`).click();
    }
    await page.click("#btnProximo");

    // Passo 5 — termos legais
    await expect(page.locator("#stepCounterText")).toHaveText(/Passo 5 de 5/i);
    await page.check("#chkTermos");
    await page.click("#btnConcluir");

    // Sucesso do cadastro → app avança para o pagamento.
    const overlay = page.locator("#pitstopRedirectOverlay");
    await expect(overlay).toBeVisible({ timeout: 15_000 });
    await expect(overlay).toContainText(/pagamento/i);
  });
});
