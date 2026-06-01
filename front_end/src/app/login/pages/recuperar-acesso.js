// recuperar-acesso.js
//
// Fluxo de recuperação de acesso. A solicitação é persistida no painel
// administrativo (modulo_adm) como uma Notificacao para que a equipe de
// suporte veja em tempo real:
//   - Oficina: a equipe entra em contato e orienta o admin da oficina a
//     redefinir a senha do funcionário em "Administração » Usuários".
//   - Cliente: a equipe orienta o cliente a procurar a oficina para
//     reaver o número/código de acesso da O.S.
//
// Em ambos os casos é gerado um protocolo (SOL-XXXXXX) exibido na tela
// de sucesso para o usuário rastrear o atendimento.

import { API_BASE_URL } from "../../../shared/config/api-config.js";


const ENDPOINT = `${API_BASE_URL}/api/admin/solicitacoes-acesso/`;


const MENSAGENS = {
  oficina: {
    titulo: "Recuperar acesso — Conta da oficina",
    sub: "Informe o e-mail do funcionário cadastrado. A equipe Pit Stop receberá sua solicitação e orientará o administrador da oficina a redefinir sua senha.",
    sucesso: (email, protocolo) =>
      `Recebemos seu pedido vinculado a "${email}".<br>` +
      `Anote o protocolo <strong>${protocolo}</strong> — a equipe de suporte ` +
      `entrará em contato em breve e orientará a oficina a liberar nova senha.`,
  },
  cliente: {
    titulo: "Recuperar acesso — Acompanhar O.S.",
    sub: "O acesso do cliente usa o número da Ordem de Serviço como senha. Informe seu e-mail para que a equipe Pit Stop avise a oficina e te ajude a reaver o número.",
    sucesso: (email, protocolo) =>
      `Recebemos seu pedido vinculado a "${email}".<br>` +
      `Anote o protocolo <strong>${protocolo}</strong> — a equipe de suporte ` +
      `vai acionar a oficina para reenviar o número da sua OS.`,
  },
};


document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const fluxoInicial = params.get("fluxo") === "cliente" ? "cliente" : "oficina";

  const radioOficina = document.querySelector('input[name="modo"][value="oficina"]');
  const radioCliente = document.querySelector('input[name="modo"][value="cliente"]');
  if (fluxoInicial === "cliente" && radioCliente) {
    radioCliente.checked = true;
    radioOficina && (radioOficina.checked = false);
  }
  aplicarTextosModo(fluxoInicial);

  document.querySelectorAll('input[name="modo"]').forEach((r) => {
    r.addEventListener("change", (e) => aplicarTextosModo(e.target.value));
  });

  const form = document.getElementById("recoverForm");
  const sucesso = document.getElementById("recoverSuccess");
  const sucessoMsg = document.getElementById("recoverSuccessMsg");
  const inputEmail = document.getElementById("emailRecover");
  const erroEmail = document.getElementById("erroEmail");
  const feedback = document.getElementById("recoverFeedback");
  const btn = document.getElementById("btnRecuperar");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    erroEmail.textContent = "";
    feedback.textContent = "";
    feedback.className = "form-feedback";

    const email = inputEmail.value.trim();
    if (!isEmailValido(email)) {
      erroEmail.textContent = "Informe um e-mail válido.";
      inputEmail.setAttribute("aria-invalid", "true");
      return;
    }
    inputEmail.removeAttribute("aria-invalid");

    const modo = document.querySelector('input[name="modo"]:checked')?.value || "oficina";

    btn.disabled = true;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = `<span class="btn-text"><i class="fas fa-spinner fa-spin"></i> Enviando…</span>`;

    try {
      const resposta = await enviarSolicitacao({ modo, email });
      const protocolo = resposta?.protocolo || "—";
      sucessoMsg.innerHTML = MENSAGENS[modo].sucesso(email, protocolo);
      form.hidden = true;
      sucesso.hidden = false;
    } catch (err) {
      const msg = err?.payload?.erro || err?.message
        || "Não foi possível enviar agora. Tente novamente em instantes.";
      feedback.textContent = msg;
      feedback.classList.add("err");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  });
});


async function enviarSolicitacao({ modo, email }) {
  // Inferimos o motivo: oficina → "senha" (redefinição), cliente → "acesso_os"
  // (recuperação do acesso à O.S.).
  const motivo = modo === "cliente" ? "acesso_os" : "senha";
  // Honeypot: o input #urlOptional é invisível para humanos (CSS) — se vier
  // preenchido, foi um bot. Mandamos junto e o backend decide.
  const honeypot = document.getElementById("urlOptional")?.value || "";
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modo, email, motivo, url_optional: honeypot }),
    // Endpoint é público (AllowAny) — sem credenciais nem CSRF.
  });
  const ct = response.headers.get("content-type") || "";
  const payload = ct.includes("application/json")
    ? await response.json().catch(() => ({}))
    : null;

  if (!response.ok) {
    const err = new Error(payload?.erro || `Erro HTTP ${response.status}`);
    err.payload = payload;
    err.status = response.status;
    throw err;
  }
  return payload;
}


function aplicarTextosModo(modo) {
  const dados = MENSAGENS[modo] || MENSAGENS.oficina;
  const titulo = document.getElementById("recoverTitle");
  const sub = document.getElementById("recoverSubtitle");
  if (titulo) titulo.textContent = dados.titulo;
  if (sub) sub.textContent = dados.sub;
}


function isEmailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
