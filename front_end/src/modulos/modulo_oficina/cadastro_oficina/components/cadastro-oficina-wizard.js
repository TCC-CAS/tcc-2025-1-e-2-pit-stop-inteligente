// cadastro-oficina-wizard.js
//
// Wizard de cadastro de oficina + administrador. 5 passos:
//   1. Conta do administrador (nome, email, senha)
//   2. Dados da oficina (nome, CNPJ, contatos, especialidade, logo)
//   3. Endereço (com busca por CEP via ViaCEP)
//   4. Horário e plano
//   5. Termos legais (aceite obrigatório)
//
// Fluxo:
//   - Validação por passo antes de avançar
//   - Submit no último passo → POST /auth/registrar-oficina/
//   - Em sucesso: usuário já está autenticado pelo back → vai para dashboard.

import { CadastroOficinaService } from "../services/cadastro-oficina-service.js";
import { iniciarCheckoutAssinatura } from "../../pagamentos/services/pagamentos-service.js";
import {
  avaliarSenha,
  vincularValidacaoSenha,
} from "../../../../shared/services/password-strength.js";


const ESTADOS_BR = [
  ["", "Selecione..."], ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"],
  ["AM", "Amazonas"], ["BA", "Bahia"], ["CE", "Ceará"], ["DF", "Distrito Federal"],
  ["ES", "Espírito Santo"], ["GO", "Goiás"], ["MA", "Maranhão"], ["MT", "Mato Grosso"],
  ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"], ["PA", "Pará"], ["PB", "Paraíba"],
  ["PR", "Paraná"], ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"],
  ["RN", "Rio Grande do Norte"], ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"],
  ["RR", "Roraima"], ["SC", "Santa Catarina"], ["SP", "São Paulo"], ["SE", "Sergipe"],
  ["TO", "Tocantins"],
];


const TOTAL_PASSOS = 5;
let currentStep = 1;
let logoFile = null;


// Validadores por passo
const validadores = {
  1: () => {
    const nome = $("#adminNome").value.trim();
    const email = $("#adminEmail").value.trim();
    const senha = $("#adminSenha").value;
    const senhaConfirm = $("#adminSenhaConfirm").value;

    if (nome.length < 2) return "Informe seu nome (mínimo 2 caracteres).";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Informe um e-mail válido.";

    // A politica de senha esta sincronizada com o back-end. O front so
    // bloqueia o avanco se nem todas as regras forem atendidas — alem
    // de mostrar feedback visual em tempo real (via password-strength.js).
    const estado = avaliarSenha(senha);
    if (!estado.atendeTudo) {
      return (
        "A senha não atende a política de segurança. " +
        "Garanta: 8+ caracteres, com letra MAIÚSCULA, minúscula, número e " +
        "caractere especial (!@#$ etc.)."
      );
    }
    if (senha !== senhaConfirm) return "A confirmação de senha não confere.";
    return null;
  },
  2: () => {
    if (!$("#oficNome").value.trim()) return "Informe o nome da oficina.";
    if (!$("#oficCnpj").value.trim()) return "Informe o CNPJ.";
    return null;
  },
  3: () => {
    const cep = onlyDigits($("#cep").value);
    if (cep.length !== 8) return "Informe um CEP válido (8 dígitos).";
    if (!$("#logradouro").value.trim()) return "Informe o logradouro.";
    if (!$("#cidade").value.trim()) return "Informe a cidade.";
    if (!$("#estado").value) return "Selecione o estado.";
    return null;
  },
  4: () => {
    if (!$$(".week-checkbox:checked").length) return "Selecione pelo menos um dia de funcionamento.";
    return null;
  },
  5: () => {
    if (!$("#chkTermos").checked) {
      return "Aceite os Termos de Uso e a Política de Privacidade para continuar.";
    }
    return null;
  },
};


// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  popularEstados();
  configurarStepper();
  configurarBotoesNav();
  configurarLogo();
  configurarMascaras();
  configurarBuscaCep();
  configurarPlanos();
  configurarValidacaoSenha();
  configurarSubmit();
  atualizarUI();
});


function configurarValidacaoSenha() {
  vincularValidacaoSenha({
    senhaInput:     $("#adminSenha"),
    confirmInput:   $("#adminSenhaConfirm"),
    listaRegras:    $("#passwordRules"),
    msgConfirmacao: $("#passwordMatchMsg"),
  });
}


// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function popularEstados() {
  const select = $("[data-estados]");
  if (!select) return;
  select.innerHTML = ESTADOS_BR.map(
    ([uf, nome]) => `<option value="${uf}">${nome}</option>`,
  ).join("");
}


function configurarStepper() {
  $$(".stepper .step").forEach((step) => {
    step.addEventListener("click", () => {
      const alvo = parseInt(step.dataset.step, 10);
      if (alvo === currentStep) return;
      if (alvo > currentStep) {
        for (let s = currentStep; s < alvo; s++) {
          const erro = validadores[s]();
          if (erro) return mostrarErroNoStep(erro);
        }
      }
      currentStep = alvo;
      atualizarUI();
    });
  });
}


function configurarBotoesNav() {
  $("#btnVoltar").addEventListener("click", () => {
    if (currentStep > 1) {
      currentStep--;
      atualizarUI();
    }
  });
  $("#btnProximo").addEventListener("click", () => {
    const erro = validadores[currentStep]();
    if (erro) return mostrarErroNoStep(erro);
    if (currentStep < TOTAL_PASSOS) {
      currentStep++;
      atualizarUI();
    }
  });
}


function configurarLogo() {
  const dz = $("#logoDropzone");
  const input = $("#inputLogo");
  if (!dz || !input) return;

  const aplicarArquivo = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Logo muito grande. Máximo 2 MB.");
      return;
    }
    logoFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = $("#previewLogo");
      img.src = e.target.result;
      img.hidden = false;
      $("#logoPlaceholder").hidden = true;
    };
    reader.readAsDataURL(file);
  };

  dz.addEventListener("click", () => input.click());
  dz.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.click();
    }
  });

  ["dragover", "dragenter"].forEach((evt) =>
    dz.addEventListener(evt, (e) => {
      e.preventDefault();
      dz.classList.add("dragging");
    }),
  );
  ["dragleave", "drop"].forEach((evt) =>
    dz.addEventListener(evt, () => dz.classList.remove("dragging")),
  );
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    aplicarArquivo(e.dataTransfer.files[0]);
  });
  input.addEventListener("change", () => aplicarArquivo(input.files[0]));
}


function configurarMascaras() {
  // CNPJ
  $("#oficCnpj")?.addEventListener("input", (e) => {
    let v = onlyDigits(e.target.value).slice(0, 14);
    v = v.replace(/^(\d{2})(\d)/, "$1.$2");
    v = v.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
    v = v.replace(/\.(\d{3})(\d)/, ".$1/$2");
    v = v.replace(/(\d{4})(\d)/, "$1-$2");
    e.target.value = v;
  });

  // Telefone
  $("#oficTelefone")?.addEventListener("input", (e) => {
    let v = onlyDigits(e.target.value).slice(0, 11);
    v = v.replace(/^(\d{2})(\d)/g, "($1) $2");
    v = v.replace(/(\d)(\d{4})$/, "$1-$2");
    e.target.value = v;
  });

  // CEP
  $("#cep")?.addEventListener("input", (e) => {
    let v = onlyDigits(e.target.value).slice(0, 8);
    v = v.replace(/(\d{5})(\d)/, "$1-$2");
    e.target.value = v;
  });
}


function configurarBuscaCep() {
  const input = $("#cep");
  const btn = $("#btnBuscarCep");
  const feedback = $("#cepFeedback");
  if (!input || !btn) return;

  const buscar = async () => {
    const cep = onlyDigits(input.value);
    if (cep.length !== 8) {
      feedback.textContent = "Digite os 8 dígitos do CEP.";
      feedback.dataset.tipo = "warning";
      return;
    }
    feedback.textContent = "Buscando endereço...";
    feedback.dataset.tipo = "info";
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await resp.json();
      if (data.erro) {
        feedback.textContent = "CEP não encontrado.";
        feedback.dataset.tipo = "error";
        return;
      }
      $("#logradouro").value = data.logradouro || "";
      $("#bairro").value = data.bairro || "";
      $("#cidade").value = data.localidade || "";
      $("#estado").value = data.uf || "";
      feedback.textContent = "Endereço encontrado.";
      feedback.dataset.tipo = "success";
      $("#numero").focus();
    } catch {
      feedback.textContent = "Falha ao consultar o CEP. Tente novamente.";
      feedback.dataset.tipo = "error";
    }
  };

  btn.addEventListener("click", buscar);
  input.addEventListener("blur", () => {
    if (onlyDigits(input.value).length === 8) buscar();
  });
}


function configurarPlanos() {
  const cards = $$(".plan-card");
  const hidden = document.querySelector('[name="plano"]');
  cards.forEach((card) => {
    card.addEventListener("click", () => {
      cards.forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      hidden.value = card.dataset.plan;
    });
  });
}


function configurarSubmit() {
  const form = $("#formCadastro");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (currentStep !== TOTAL_PASSOS) return;

    const erro = validadores[5]();
    if (erro) return mostrarErroNoStep(erro);

    const btn = $("#btnConcluir");
    setEstadoBotao(btn, true, "Cadastrando...");
    limparMensagemPasso();

    try {
      const formData = montarFormData(form);
      const resposta = await CadastroOficinaService.registrar(formData);
      const plano = (form.querySelector('[name="plano"]')?.value || "basico").trim();

      // Quando o backend ja ativou um plano gratuito (Teste), nao ha
      // checkout para iniciar — basta levar o usuario direto ao dashboard
      // para comecar a usar a aplicacao imediatamente.
      if (resposta?.plano_gratuito_ativado) {
        setEstadoBotao(btn, true, "Liberando seu acesso...");
        // Pequeno delay so para o feedback visual ser percebido.
        await new Promise((r) => setTimeout(r, 350));
        window.location.href = "../../dashboard/pages/dashboard.html";
        return;
      }

      // Caso contrario (planos pagos), dispara o checkout AbacatePay.
      await prosseguirParaCheckout(plano, btn);
    } catch (error) {
      mostrarErroNoStep(error.message);
      setEstadoBotao(btn, false, "Concluir cadastro");
    }
  });
}


/**
 * Após o cadastro, leva o admin direto à página de pagamento do plano
 * escolhido. Exibe um overlay enquanto prepara a cobrança para deixar
 * óbvio que está acontecendo algo. Em qualquer falha, caímos no painel
 * de Renovação de Plano com aviso visível.
 */
async function prosseguirParaCheckout(planoCodigo, btn) {
  setEstadoBotao(btn, true, "Preparando pagamento...");
  mostrarOverlayRedirecionando(planoCodigo);
  try {
    const checkout = await iniciarCheckoutAssinatura(planoCodigo);
    if (!checkout?.url_checkout) {
      throw new Error("URL de pagamento não recebida do servidor.");
    }
    // Pequeno delay para o usuário ver o overlay (UX) antes do redirect.
    await new Promise((r) => setTimeout(r, 350));
    window.location.href = checkout.url_checkout;
  } catch (err) {
    console.error("[cadastro] falha ao iniciar checkout pós-registro:", err);
    removerOverlayRedirecionando();
    try {
      sessionStorage.setItem(
        "pitstop:pagamento_pendente",
        JSON.stringify({
          plano: planoCodigo,
          motivo: err.message || "Falha ao iniciar pagamento.",
          quando: new Date().toISOString(),
        }),
      );
    } catch { /* sessionStorage indisponível: tolerável */ }
    alert(
      "Cadastro concluído com sucesso!\n\n" +
      "Não foi possível abrir o pagamento agora: " + (err.message || "tente novamente.") +
      "\n\nVocê será levado ao painel para finalizar o pagamento.",
    );
    window.location.href = "../../atualizar_dados_oficina/pages/atualizacao_dados_oficina.html#plan";
  }
}


function mostrarOverlayRedirecionando(planoCodigo) {
  if (document.getElementById("pitstopRedirectOverlay")) return;
  const div = document.createElement("div");
  div.id = "pitstopRedirectOverlay";
  div.setAttribute("role", "status");
  div.setAttribute("aria-live", "polite");
  div.innerHTML = `
    <div class="pso-card">
      <div class="pso-spinner" aria-hidden="true"></div>
      <h3>Redirecionando para o pagamento…</h3>
      <p>Estamos preparando a cobrança do plano
         <strong>${(planoCodigo || "").toUpperCase()}</strong>
         na AbacatePay. Não feche a janela.</p>
    </div>
  `;
  document.body.appendChild(div);

  if (!document.getElementById("pitstopRedirectOverlayCSS")) {
    const style = document.createElement("style");
    style.id = "pitstopRedirectOverlayCSS";
    style.textContent = `
      #pitstopRedirectOverlay {
        position: fixed; inset: 0;
        background: rgba(15, 23, 42, 0.75);
        display: flex; align-items: center; justify-content: center;
        z-index: 9999;
        backdrop-filter: blur(4px);
      }
      #pitstopRedirectOverlay .pso-card {
        background: #fff;
        padding: 2rem 2.25rem;
        border-radius: 16px;
        max-width: 380px;
        text-align: center;
        box-shadow: 0 30px 60px -20px rgba(0,0,0,0.45);
      }
      #pitstopRedirectOverlay .pso-spinner {
        width: 56px; height: 56px;
        border: 4px solid rgba(37,99,235,0.18);
        border-top-color: #2563eb;
        border-radius: 50%;
        margin: 0 auto 1rem;
        animation: pso-spin 0.9s linear infinite;
      }
      #pitstopRedirectOverlay h3 {
        margin: 0 0 0.5rem;
        font-size: 1.1rem;
        color: #0f172a;
      }
      #pitstopRedirectOverlay p {
        margin: 0;
        color: #64748b;
        font-size: 0.9rem;
        line-height: 1.45;
      }
      @keyframes pso-spin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
  }
}


function removerOverlayRedirecionando() {
  document.getElementById("pitstopRedirectOverlay")?.remove();
}


// ---------------------------------------------------------------------------
// UI / estado
// ---------------------------------------------------------------------------

function atualizarUI() {
  // Painéis: aplica a classe .active só ao painel atual
  $$(".wizard-panel").forEach((panel) => {
    panel.classList.toggle(
      "active",
      parseInt(panel.dataset.step, 10) === currentStep,
    );
  });

  // Stepper: marca completed nos anteriores e active no atual
  $$(".stepper .step").forEach((step) => {
    const num = parseInt(step.dataset.step, 10);
    step.classList.toggle("active", num === currentStep);
    step.classList.toggle("completed", num < currentStep);
  });

  // Botões da nav
  $("#btnVoltar").hidden = currentStep === 1;
  $("#btnProximo").hidden = currentStep === TOTAL_PASSOS;
  $("#btnConcluir").hidden = currentStep !== TOTAL_PASSOS;

  // Indicador "Passo X de N" + barra de progresso
  const counterText = $("#stepCounterText");
  const counterFill = $("#stepCounterFill");
  if (counterText) counterText.textContent = `Passo ${currentStep} de ${TOTAL_PASSOS}`;
  if (counterFill) counterFill.style.width = `${(currentStep / TOTAL_PASSOS) * 100}%`;

  // Limpa mensagem de erro de passos anteriores e leva o foco ao primeiro campo
  limparMensagemPasso();
  focarPrimeiroCampoDoPasso();

  // Garante que o card volta para o topo ao trocar de passo
  $(".signup-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
}


function focarPrimeiroCampoDoPasso() {
  const primeiro = document.querySelector(
    `.wizard-panel.active input:not([type=hidden]), .wizard-panel.active select`,
  );
  if (primeiro) {
    setTimeout(() => primeiro.focus({ preventScroll: true }), 80);
  }
}


function montarFormData(form) {
  const formData = new FormData(form);
  // Dias de funcionamento como JSON-array
  const dias = $$(".week-checkbox:checked").map((c) => c.value);
  formData.set("dias_funcionamento", JSON.stringify(dias));
  // Termos: checkbox vira "true" para o back
  formData.set("termos_aceitos", $("#chkTermos").checked ? "true" : "false");
  if (logoFile) formData.set("logo", logoFile);
  return formData;
}


// ---------------------------------------------------------------------------
// Mensagens inline (substitui alert() do fluxo antigo)
// ---------------------------------------------------------------------------

function mostrarErroNoStep(mensagem) {
  const el = $("#mensagemPasso");
  if (!el) return;
  el.textContent = mensagem;
  el.dataset.tipo = "error";
  el.hidden = false;
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}


function limparMensagemPasso() {
  const el = $("#mensagemPasso");
  if (!el) return;
  el.textContent = "";
  el.hidden = true;
  delete el.dataset.tipo;
}


function setEstadoBotao(btn, carregando, texto) {
  if (!btn) return;
  btn.disabled = carregando;
  const span = btn.querySelector(".btn-text");
  const spinner = btn.querySelector(".btn-spinner");
  if (span) span.textContent = texto;
  if (spinner) spinner.hidden = !carregando;
}


// ---------------------------------------------------------------------------
// Helpers utilitários
// ---------------------------------------------------------------------------

function $(sel)  { return document.querySelector(sel); }
function $$(sel) { return Array.from(document.querySelectorAll(sel)); }
function onlyDigits(s) { return (s || "").replace(/\D/g, ""); }
