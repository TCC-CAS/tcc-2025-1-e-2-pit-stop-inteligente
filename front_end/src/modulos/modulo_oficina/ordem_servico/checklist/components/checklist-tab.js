// checklist-tab.js
//
// Ponto de entrada da aba "Checklist". Mantém apenas a orquestração:
//  - inicializa a aba (initChecklist) e expõe-a para outras telas
//  - controla a abertura do wizard (modo edição vs. somente leitura)
//  - cuida da navegação entre passos (UI + stepper + botões)
//
// Toda a lógica de domínio vive em ./parts/* (state, summary, photos,
// signatures, save), mantendo este arquivo coeso e fácil de ler.

import { stepValidationMap, state, validarPassoAtual } from "./parts/checklist-state.js";
import { carregarResumoChecklist } from "./parts/checklist-summary.js";
import {
  atualizarPreviewCategoria,
  atualizarTodasAsPrevias,
  carregarFotosDoServidor,
  configurarUploads,
} from "./parts/checklist-photos.js";
import {
  carregarAssinaturasNosCanvas,
  configurarAssinaturas,
  reajustarCanvases,
} from "./parts/checklist-signatures.js";
import { finalizarChecklist } from "./parts/checklist-save.js";


// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export function initChecklist(tabsComponent, osId) {
  state.tabsRef = tabsComponent;
  state.currentOsId = osId;

  document
    .getElementById("btnOpenChecklist")
    ?.addEventListener("click", () => openWizard(false));
  document
    .getElementById("btnViewChecklist")
    ?.addEventListener("click", viewChecklist);

  if (osId) carregarResumoChecklist(osId);
}


// ---------------------------------------------------------------------------
// Wizard (abertura, navegação, atualização de UI)
// ---------------------------------------------------------------------------

async function openWizard(isReadOnly = false) {
  state.isReadOnlyMode = isReadOnly;

  const modal = document.getElementById("modalChecklist");
  const body = document.getElementById("checklist-wizard-body");
  const template = document.getElementById("wizardTemplate");
  if (!modal || !body || !template) {
    console.error("Elementos do modal não encontrados");
    return;
  }

  body.innerHTML = "";
  body.appendChild(template.content.cloneNode(true));
  state.currentStep = 1;

  if (isReadOnly) {
    await prepararModoLeitura();
  } else {
    prepararModoEdicao();
  }

  configurarStepperNavegacao();
  atualizarUI();
  configurarBotoesNav();
  atualizarBotoesNavegacao();

  abrirModal(modal);
}


async function prepararModoLeitura() {
  if (state.checklistDataCache) preencherFormularioComDados(state.checklistDataCache);
  desabilitarFormulario(true);

  const btnFinalizar = document.getElementById("btnFinalizarChecklist");
  if (btnFinalizar) btnFinalizar.style.display = "none";

  await carregarFotosDoServidor();
  setTimeout(atualizarTodasAsPrevias, 100);
  carregarAssinaturasNosCanvas();
}


function prepararModoEdicao() {
  state.fotosExterno.length = 0;
  state.fotosInterno.length = 0;
  state.fotosMecanica.length = 0;

  if (state.checklistDataCache && !state.checklistDataCache.concluido) {
    preencherFormularioComDados(state.checklistDataCache);
  }
  desabilitarFormulario(false);

  setTimeout(() => {
    configurarUploads();
    configurarAssinaturas();
  }, 200);

  const btnFinalizar = document.getElementById("btnFinalizarChecklist");
  if (btnFinalizar) btnFinalizar.onclick = () => finalizarChecklist();
}


function abrirModal(modal) {
  if (typeof modal.open === "function") return modal.open();
  if (typeof modal.showModal === "function") return modal.showModal();
  modal.setAttribute("open", "");
}


function viewChecklist() {
  if (!state.checklistDataCache || !state.checklistDataCache.concluido) {
    alert("Nenhum checklist concluído para visualizar.");
    return;
  }
  openWizard(true);
}


function configurarBotoesNav() {
  const btnProximo = document.getElementById("btnProximoPasso");
  const btnAnterior = document.getElementById("btnAnteriorPasso");

  if (btnProximo) {
    btnProximo.onclick = () => {
      if (state.currentStep < 6) {
        state.currentStep++;
        atualizarUI();
      }
    };
  }
  if (btnAnterior) {
    btnAnterior.onclick = () => {
      if (state.currentStep > 1) {
        state.currentStep--;
        atualizarUI();
      }
    };
  }
}


function atualizarBotoesNavegacao() {
  const btnProximo = document.getElementById("btnProximoPasso");
  const btnAnterior = document.getElementById("btnAnteriorPasso");

  if (btnProximo)
    btnProximo.style.display = state.currentStep === 6 ? "none" : "inline-block";
  if (btnAnterior)
    btnAnterior.style.display = state.currentStep === 1 ? "none" : "inline-block";
}


function configurarStepperNavegacao() {
  document.querySelectorAll(".step-item").forEach((step) => {
    step.addEventListener("click", async () => {
      const targetStep = parseInt(step.dataset.step);

      if (state.isReadOnlyMode) {
        state.currentStep = targetStep;
        atualizarUI();
        return;
      }

      if (targetStep === state.currentStep) return;

      if (targetStep > state.currentStep) {
        const isValid = await validarPassoAtual();
        if (!isValid) {
          alert("Preencha os campos obrigatórios antes de prosseguir.");
          return;
        }
      }

      state.currentStep = targetStep;
      atualizarUI();
    });
  });
}


function atualizarUI() {
  document.querySelectorAll(".wizard-panel").forEach((panel) => {
    panel.style.display =
      parseInt(panel.dataset.step) === state.currentStep ? "block" : "none";
  });

  document.querySelectorAll(".step-item").forEach((step) => {
    const stepNum = parseInt(step.dataset.step);
    step.classList.toggle("active", stepNum === state.currentStep);

    if (!state.isReadOnlyMode) {
      if (stepNum < state.currentStep) {
        const isValid = stepValidationMap[stepNum]
          ? stepValidationMap[stepNum]()
          : true;
        step.classList.toggle("completed", isValid);
      } else {
        step.classList.remove("completed");
      }
      step.style.opacity =
        stepNum < state.currentStep ? 0.8 : stepNum > state.currentStep ? 0.5 : 1;
    } else {
      step.style.opacity = 1;
    }

    if (state.currentStep === 6 && !state.isReadOnlyMode) {
      setTimeout(() => reajustarCanvases(), 50);
    }
  });

  atualizarBotoesNavegacao();
}


// ---------------------------------------------------------------------------
// Form helpers
// ---------------------------------------------------------------------------

function preencherFormularioComDados(dados) {
  const setarValor = (selector, valor) => {
    const el = document.querySelector(selector);
    if (el && valor !== undefined && valor !== null) el.value = valor;
  };
  const setarCheckbox = (id, marcado) => {
    const el = document.getElementById(id);
    if (el && marcado) el.checked = true;
  };

  setarValor('[name="data_recebimento"]', dados.data_recebimento);
  setarValor('[name="consultor"]', dados.consultor);
  setarValor('[name="km"]', dados.quilometragem);
  setarValor('[name="fuel"]', dados.nivel_combustivel);
  setarValor('[name="obs_inicial"]', dados.observacoes_iniciais);
  setarValor('[name="ext_body"]', dados.lataria_pintura);
  setarValor('[name="ext_glass"]', dados.vidros_farois);
  setarValor('[name="int_obs"]', dados.observacoes_internas);
  setarValor('[name="mech_oil"]', dados.nivel_oleo);
  setarValor('[name="mech_coolant"]', dados.fluido_arrefecimento);
  setarValor('[name="mec_obs"]', dados.observacoes_mecanica);

  setarCheckbox("chk_manual", dados.possui_manual);
  setarCheckbox("chk_step", dados.possui_estepe_macaco);
}


function desabilitarFormulario(disabled) {
  const form = document.getElementById("checklistForm");
  if (!form) return;

  const inputs = form.querySelectorAll(
    "input, select, textarea, .photo-dropzone, .btn-clear",
  );
  inputs.forEach((el) => {
    if (el.classList.contains("photo-dropzone")) {
      el.style.pointerEvents = disabled ? "none" : "auto";
      el.style.opacity = disabled ? "0.6" : "1";
    } else if (el.classList.contains("btn-clear")) {
      el.disabled = disabled;
      el.style.opacity = disabled ? "0.5" : "1";
    } else {
      el.disabled = disabled;
    }
  });

  document.querySelectorAll(".signature-pad").forEach((c) => {
    c.style.pointerEvents = disabled ? "none" : "auto";
  });
}


// Re-exporta atualizarPreviewCategoria para retrocompatibilidade caso outros módulos
// importem direto deste arquivo (ex.: testes legados).
export { atualizarPreviewCategoria };
