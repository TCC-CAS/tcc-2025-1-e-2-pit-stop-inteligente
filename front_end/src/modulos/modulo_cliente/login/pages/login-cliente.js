// login-cliente.js — autenticação do cliente (Código de acesso + CPF/CNPJ).
//
// Fluxo principal:
//   1. Cliente digita o código de 8 caracteres (com ou sem traço) entregue
//      pela oficina + seu CPF/CNPJ.
//   2. Front envia { codigo, cpf_cnpj } para /api/cliente/auth/login/.
//   3. Em caso de sucesso, redireciona ao portal com a OS inicial pré-
//      selecionada.
//
// Fluxo legado (fallback):
//   - Se a OS ainda não tem código gerado, o cliente expande "Recebi apenas
//     o número da OS" e envia { numero_os, cpf_cnpj }.

import {
  loginCliente,
  redirecionarParaPortalCliente,
  carregarPerfilCliente,
} from "../../portal/services/cliente-auth.js";


document.addEventListener("DOMContentLoaded", async () => {
  try {
    const perfil = await carregarPerfilCliente();
    if (perfil) {
      redirecionarParaPortalCliente();
      return;
    }
  } catch {
    /* segue para o formulário */
  }

  const form = document.getElementById("loginForm");
  const inputCodigo = document.getElementById("codigoAcesso");
  const inputCpf = document.getElementById("cpfCnpj");
  const inputOs = document.getElementById("numeroOs");
  const erroCodigo = document.getElementById("erroCodigo");
  const erroCpf = document.getElementById("erroCpf");
  const feedback = document.getElementById("feedbackGlobal");
  const btn = document.getElementById("btnEntrar");

  formatarCodigoAoDigitar(inputCodigo);
  formatarCpfAoDigitar(inputCpf);

  // Auto-foca o código (primeiro campo mais comum)
  inputCodigo.focus();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    erroCodigo.textContent = "";
    erroCpf.textContent = "";
    feedback.textContent = "";
    feedback.className = "form-feedback";

    const codigo = inputCodigo.value.trim();
    const cpf = inputCpf.value.trim();
    const numeroOs = inputOs ? inputOs.value.trim() : "";

    let temErro = false;

    if (apenasDigitos(cpf).length < 11) {
      erroCpf.textContent = "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).";
      inputCpf.setAttribute("aria-invalid", "true");
      temErro = true;
    } else {
      inputCpf.removeAttribute("aria-invalid");
    }

    const codigoNorm = normalizarCodigo(codigo);
    const usandoLegacy = !codigoNorm && /^\d+$/.test(numeroOs);

    if (!codigoNorm && !usandoLegacy) {
      erroCodigo.textContent = "Informe o código de acesso fornecido pela oficina.";
      inputCodigo.setAttribute("aria-invalid", "true");
      temErro = true;
    } else if (codigoNorm && codigoNorm.length < 6) {
      erroCodigo.textContent = "O código tem 8 caracteres. Confira a digitação.";
      inputCodigo.setAttribute("aria-invalid", "true");
      temErro = true;
    } else {
      inputCodigo.removeAttribute("aria-invalid");
    }

    if (temErro) return;

    btn.disabled = true;
    const labelSpan = btn.querySelector("span");
    const textoOriginal = labelSpan?.textContent;
    if (labelSpan) labelSpan.textContent = "Entrando…";

    try {
      const payload = await loginCliente({
        cpfCnpj: cpf,
        codigo: codigoNorm,
        numeroOs: usandoLegacy ? numeroOs : undefined,
      });
      feedback.textContent = "Acesso liberado! Redirecionando…";
      feedback.classList.add("ok");
      redirecionarParaPortalCliente(payload.os_inicial_id);
    } catch (err) {
      btn.disabled = false;
      if (labelSpan && textoOriginal) labelSpan.textContent = textoOriginal;
      feedback.textContent = err.message || "Falha ao entrar.";
      feedback.classList.add("err");
    }
  });
});


function apenasDigitos(str) {
  return (str || "").replace(/\D/g, "");
}


function normalizarCodigo(valor) {
  return (valor || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}


function formatarCodigoAoDigitar(input) {
  input.addEventListener("input", () => {
    const limpo = normalizarCodigo(input.value).slice(0, 12);
    // Aplica máscara visual XXXX-XXXX após 4 caracteres
    input.value = limpo.length > 4 ? `${limpo.slice(0, 4)}-${limpo.slice(4)}` : limpo;
  });
}


function formatarCpfAoDigitar(input) {
  input.addEventListener("input", () => {
    const v = apenasDigitos(input.value).slice(0, 14);
    if (v.length <= 11) {
      input.value = v
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
    } else {
      input.value = v
        .replace(/^(\d{2})(\d)/, "$1.$2")
        .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1/$2")
        .replace(/(\d{4})(\d)/, "$1-$2");
    }
  });
}
