// login-page.js
//
// Formulário de login real. Fluxo:
//   1. Usuário digita credenciais → POST /auth/login/.
//   2. Se houver apenas 1 oficina, o back já fixa em sessão → vai para dashboard.
//   3. Se houver mais de 1, o back devolve `oficina_atual_id = null` → vai
//      para a tela de seleção de oficina.

import { login } from "../../../shared/services/auth-service.js";
import { redirecionarPara, ROTAS } from "../../../shared/services/auth-guard.js";


document.addEventListener("DOMContentLoaded", () => {
  const formLogin = document.getElementById("formLogin");
  const inputUsername = document.getElementById("username");
  const inputPassword = document.getElementById("password");
  const btnTogglePass = document.getElementById("btnTogglePass");
  const btnGoogleLogin = document.getElementById("btnGoogleLogin");

  configurarToggleSenha(btnTogglePass, inputPassword);
  configurarSubmit(formLogin, inputUsername, inputPassword);
  configurarGoogleStub(btnGoogleLogin);
});


// ---------------------------------------------------------------------------
// Helpers de UI
// ---------------------------------------------------------------------------

function configurarToggleSenha(btn, inputSenha) {
  if (!btn || !inputSenha) return;
  btn.addEventListener("click", () => {
    const escondido = inputSenha.type === "password";
    inputSenha.type = escondido ? "text" : "password";
    const icon = btn.querySelector("i");
    if (icon) icon.className = escondido ? "fas fa-eye-slash" : "fas fa-eye";
    btn.setAttribute("aria-label", escondido ? "Ocultar senha" : "Mostrar senha");
  });
}


function configurarSubmit(form, inputUsername, inputPassword) {
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    limparErros();

    const username = inputUsername.value.trim();
    const password = inputPassword.value;

    if (!validarEntrada(username, password)) return;

    const btnEntrar = document.getElementById("btnEntrar");
    setEstadoBotao(btnEntrar, true, "Autenticando...");

    try {
      const payload = await login(username, password);
      if (payload.oficina_atual_id) {
        // 1 oficina → vai direto para o dashboard
        redirecionarPara(ROTAS.dashboard);
      } else {
        // 2+ oficinas → tela de seleção
        redirecionarPara(ROTAS.selecionarOficina);
      }
    } catch (error) {
      mostrarErroGeral(error.message);
      setEstadoBotao(btnEntrar, false, "Entrar");
    }
  });
}


function configurarGoogleStub(btn) {
  if (!btn) return;
  btn.addEventListener("click", () => {
    alert(
      "Login com Google ainda não implementado. Use seu e-mail e senha por enquanto.",
    );
  });
}


// ---------------------------------------------------------------------------
// Validação e estado
// ---------------------------------------------------------------------------

function validarEntrada(username, password) {
  let valido = true;
  if (!username) {
    setarErro("error-username", "Informe seu e-mail ou usuário.");
    valido = false;
  }
  if (!password) {
    setarErro("error-password", "Informe sua senha.");
    valido = false;
  }
  return valido;
}


function limparErros() {
  document.querySelectorAll(".error-msg").forEach((el) => (el.textContent = ""));
}


function setarErro(id, mensagem) {
  const el = document.getElementById(id);
  if (el) el.textContent = mensagem;
}


function mostrarErroGeral(mensagem) {
  const erroUser = document.getElementById("error-username");
  if (erroUser) erroUser.textContent = mensagem;
}


function setEstadoBotao(btn, carregando, texto) {
  if (!btn) return;
  const span = btn.querySelector(".btn-text");
  const spinner = btn.querySelector(".btn-spinner");

  btn.disabled = carregando;
  if (span) span.textContent = texto;
  if (spinner) spinner.style.display = carregando ? "inline-block" : "none";
}
