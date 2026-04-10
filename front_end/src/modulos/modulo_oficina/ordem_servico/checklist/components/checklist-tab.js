// front_end/src/modulos/modulo_oficina/ordem_servico/checklist/components/checklist-tab.js

import { ChecklistService } from "../services/checklist-service.js";

function getCSRFToken() {
  const name = "csrftoken";
  const cookies = document.cookie.split(";");
  for (let cookie of cookies) {
    const [key, value] = cookie.trim().split("=");
    if (key === name) return value;
  }
  return "";
}

let currentStep = 1;
let tabsRef = null;
let photos = [];
let currentOsId = null;

export function initChecklist(tabsComponent, osId) {
  tabsRef = tabsComponent;
  currentOsId = osId;

  const btnOpen = document.getElementById("btnOpenChecklist");
  if (btnOpen) {
    btnOpen.onclick = openWizard;
  }

  if (osId) {
    carregarResumoChecklist(osId);
  }
}

async function carregarResumoChecklist(osId) {
  try {
    const dados = await ChecklistService.buscarChecklist(osId);
    const statusTitle = document.getElementById("statusTitle");
    const statusDesc = document.getElementById("statusDesc");
    const btnOpen = document.getElementById("btnOpenChecklist");
    const summaryStatus = document.getElementById("summaryStatus");
    const summaryDate = document.getElementById("summaryDate");
    const summaryResponsible = document.getElementById("summaryResponsible");
    const summarySignClient = document.getElementById("summarySignClient");
    const summarySignTech = document.getElementById("summarySignTech");
    const summaryPhotosCount = document.getElementById("summaryPhotosCount");

    // --- Buscar documentos para contar as fotos do checklist ---
    let totalFotos = 0;
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/oficina/os/${osId}/documentos/`);
      if (response.ok) {
        const docs = await response.json();
        totalFotos = docs.filter(doc => doc.origem === 'checklist').length;
      }
    } catch (e) {
      console.warn('Não foi possível carregar documentos:', e);
    }

    if (dados && dados.concluido) {
      // Checklist concluído
      statusTitle.innerHTML = '<i class="fas fa-check-circle"></i> Checklist Concluído';
      statusDesc.innerText = "Checklist já foi preenchido e assinado. As demais etapas estão liberadas.";
      if (btnOpen) btnOpen.style.display = "none";
      summaryStatus.innerText = "Concluído";
      summaryStatus.className = "badge badge-success";
      summarySignClient.innerHTML = '<i class="fas fa-check-circle"></i> Assinado';
      summarySignTech.innerHTML = '<i class="fas fa-check-circle"></i> Assinado';
      summaryDate.innerText = dados.criado_em ? new Date(dados.criado_em).toLocaleDateString() : "-";
      summaryResponsible.innerText = dados.consultor || "-";
      summaryPhotosCount.innerText = `${totalFotos} foto(s)`;

      if (tabsRef && typeof tabsRef.setLockedByChecklist === "function") {
        tabsRef.setLockedByChecklist(true);
      }
    } else {
      // Checklist pendente
      statusTitle.innerHTML = '<i class="fas fa-exclamation-circle"></i> Checklist Pendente';
      statusDesc.innerText = "A O.S. está bloqueada. O preenchimento e assinatura são obrigatórios para liberar as demais etapas.";
      if (btnOpen) btnOpen.style.display = "inline-block";
      summaryStatus.innerText = "Pendente";
      summaryStatus.className = "badge badge-warning";
      summarySignClient.innerHTML = '<i class="fas fa-times-circle"></i> Não assinado';
      summarySignTech.innerHTML = '<i class="fas fa-times-circle"></i> Não assinado';
      summaryDate.innerText = "-";
      summaryResponsible.innerText = dados?.consultor || "-";
      summaryPhotosCount.innerText = `${totalFotos} foto(s)`;

      if (tabsRef && typeof tabsRef.setLockedByChecklist === "function") {
        tabsRef.setLockedByChecklist(false);
      }
    }
  } catch (error) {
    console.log("Nenhum checklist encontrado para esta OS.", error);
    // Tratamento de erro (já existente)
    const statusTitle = document.getElementById("statusTitle");
    const statusDesc = document.getElementById("statusDesc");
    const btnOpen = document.getElementById("btnOpenChecklist");
    if (statusTitle) statusTitle.innerHTML = '<i class="fas fa-exclamation-circle"></i> Checklist Pendente';
    if (statusDesc) statusDesc.innerText = "A O.S. está bloqueada. O preenchimento e assinatura são obrigatórios para liberar as demais etapas.";
    if (btnOpen) btnOpen.style.display = "inline-block";
  }
}

function openWizard() {
  const modal = document.getElementById("modalChecklist");
  const body = document.getElementById("checklist-wizard-body");
  const temp = document.getElementById("wizardTemplate");

  if (temp && body) {
    body.innerHTML = "";
    body.appendChild(temp.content.cloneNode(true));
  }

  currentStep = 1;
  photos = [];

  setupWizardListeners();
  updateUI();

  if (modal && typeof modal.open === "function") {
    modal.open();
  } else {
    console.error("Modal não encontrada ou método open inexistente");
  }
}

function setupWizardListeners() {
  const btnNext = document.getElementById("btnProximoPasso");
  const btnPrev = document.getElementById("btnAnteriorPasso");
  const btnSave = document.getElementById("btnSalvarChecklist");

  if (btnNext) {
    btnNext.onclick = () => {
      if (currentStep < 6) {
        currentStep++;
        updateUI();
      }
    };
  }

  if (btnPrev) {
    btnPrev.onclick = () => {
      if (currentStep > 1) {
        currentStep--;
        updateUI();
      }
    };
  }

  if (btnSave) {
    btnSave.onclick = finishChecklist;
  }

  setTimeout(() => {
    configurarCanvas("sigClient");
    configurarCanvas("sigTech");
  }, 100);

  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");

  if (dropZone && fileInput) {
    dropZone.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
      const files = Array.from(e.target.files);
      files.forEach((file) => photos.push(file));
      atualizarPreviewFotos();
    };
  }

  atualizarPassosWizard();
}

function atualizarPassosWizard() {
  const steps = document.querySelectorAll(".wizard-step");
  steps.forEach((step) => {
    step.classList.remove("active");
    if (parseInt(step.dataset.step) === currentStep) {
      step.classList.add("active");
    }
  });
}

// CORREÇÃO: Coletar todos os campos do wizard
async function finishChecklist() {
  const sigClient = document.getElementById("sigClient");
  const sigTech = document.getElementById("sigTech");

  // Validação das assinaturas
  if (isCanvasBlank(sigClient)) {
    alert("Assinatura do cliente é obrigatória!");
    return;
  }
  if (isCanvasBlank(sigTech)) {
    alert("Assinatura do técnico é obrigatória!");
    return;
  }

  const dadosParaSalvar = {
    concluido: true,
    assinatura_cliente: sigClient.toDataURL("image/png"),
    assinatura_tecnico: sigTech.toDataURL("image/png"),
    data_recebimento: document.querySelector('[name="data_recebimento"]')
      ?.value,
    consultor: document.querySelector('[name="consultor"]')?.value,
    quilometragem: document.querySelector('[name="km"]')?.value,
    nivel_combustivel: document.querySelector('[name="fuel"]')?.value,
    observacoes_iniciais: document.querySelector('[name="obs_inicial"]')?.value,
    lataria_pintura: document.querySelector('[name="ext_body"]')?.value,
    vidros_farois: document.querySelector('[name="ext_glass"]')?.value,
    possui_manual: document.getElementById("chk_manual")?.checked || false,
    possui_estepe_macaco: document.getElementById("chk_step")?.checked || false,
    observacoes_internas: document.querySelector('[name="int_obs"]')?.value,
    nivel_oleo: document.querySelector('[name="mech_oil"]')?.value,
    fluido_arrefecimento: document.querySelector('[name="mech_coolant"]')
      ?.value,
  };

  const btnSave = document.getElementById("btnSalvarChecklist");
  btnSave.disabled = true;
  btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

  try {
    await ChecklistService.salvarChecklist(currentOsId, dadosParaSalvar);

    if (photos.length > 0) {
      const formData = new FormData();
      photos.forEach((photo) => formData.append("files", photo));
      formData.append('origem', 'checklist');
      await fetch(
        `http://127.0.0.1:8000/api/oficina/os/${currentOsId}/documentos/upload/`,
        {
          method: "POST",
          credentials: "include",
          headers: { "X-CSRFToken": getCSRFToken() },
          body: formData,
        },
      );
    }

    // Atualiza o contador de fotos no resumo
    const summaryPhotosCount = document.getElementById("summaryPhotosCount");
    if (summaryPhotosCount) {
      summaryPhotosCount.innerText = `${photos.length} foto(s)`;
    }

    alert("Checklist salvo com sucesso!");
    document.getElementById("modalChecklist").close();
    await carregarResumoChecklist(currentOsId); // recarrega o resumo (e desbloqueia as abas)
  } catch (erro) {
    console.error("Erro ao salvar checklist:", erro);
    alert("Erro ao salvar checklist. Verifique o console.");
  } finally {
    btnSave.disabled = false;
    btnSave.innerHTML = "Salvar e Concluir";
  }
}

function updateUI() {
  const panels = document.querySelectorAll(".wizard-panel");
  panels.forEach((p) => {
    p.style.display =
      parseInt(p.dataset.step) === currentStep ? "block" : "none";
  });

  const btnNext = document.getElementById("btnProximoPasso");
  const btnPrev = document.getElementById("btnAnteriorPasso");
  const btnSave = document.getElementById("btnSalvarChecklist");

  if (currentStep === 6) {
    if (btnNext) btnNext.style.display = "none";
    if (btnPrev) btnPrev.style.display = "inline-block";
    if (btnSave) btnSave.style.display = "inline-block";
  } else {
    if (btnNext) btnNext.style.display = "inline-block";
    if (btnPrev)
      btnPrev.style.display = currentStep > 1 ? "inline-block" : "none";
    if (btnSave) btnSave.style.display = "none";
  }

  atualizarPassosWizard();
}

function isCanvasBlank(canvas) {
  if (!canvas) return true;
  const blank = document.createElement("canvas");
  blank.width = canvas.width;
  blank.height = canvas.height;
  return canvas.toDataURL() === blank.toDataURL();
}

window.clearSig = function (id) {
  const canvas = document.getElementById(id);
  if (canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
};

function configurarCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let desenhando = false;

  canvas.width = canvas.parentElement.offsetWidth || 400;
  canvas.height = canvas.parentElement.offsetHeight || 150;

  const iniciarDesenho = (e) => {
    desenhando = true;
    desenhar(e);
  };

  const pararDesenho = () => {
    desenhando = false;
    ctx.beginPath();
  };

  const desenhar = (e) => {
    if (!desenhando) return;
    e.preventDefault();

    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";

    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  canvas.addEventListener("mousedown", iniciarDesenho);
  canvas.addEventListener("mouseup", pararDesenho);
  canvas.addEventListener("mousemove", desenhar);
  canvas.addEventListener("mouseout", pararDesenho);

  canvas.addEventListener("touchstart", iniciarDesenho, { passive: false });
  canvas.addEventListener("touchend", pararDesenho);
  canvas.addEventListener("touchmove", desenhar, { passive: false });
}

function atualizarPreviewFotos() {
  const grid = document.getElementById("photoPreviewGrid");
  if (!grid) return;
  grid.innerHTML = "";
  photos.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const div = document.createElement("div");
      div.style.cssText = `
                width: 80px; height: 80px;
                background-image: url(${e.target.result});
                background-size: cover;
                background-position: center;
                border-radius: 8px; border: 1px solid #cbd5e1;
            `;
      grid.appendChild(div);
    };
    reader.readAsDataURL(file);
  });
}
