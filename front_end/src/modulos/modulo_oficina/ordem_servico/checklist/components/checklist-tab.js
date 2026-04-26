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
let currentOsId = null;

let fotosExterno = [];
let fotosInterno = [];
let fotosMecanica = [];

let checklistDataCache = null;
let isReadOnlyMode = false;
const DJANGO_BASE_URL = "http://127.0.0.1:8000";

const stepValidationMap = {
  1: () => {
    const data = document.querySelector('[name="data_recebimento"]')?.value;
    const consultor = document.querySelector('[name="consultor"]')?.value;
    const km = document.querySelector('[name="km"]')?.value;
    return !!(data && consultor && km);
  },
  2: () => true,
  3: () => true,
  4: () => true,
  5: () =>
    fotosExterno.length + fotosInterno.length + fotosMecanica.length >= 4,
  6: () => {
    const sigClient = document.getElementById("sigClient");
    const sigTech = document.getElementById("sigTech");
    return !isCanvasBlank(sigClient) && !isCanvasBlank(sigTech);
  },
};

export function initChecklist(tabsComponent, osId) {
  tabsRef = tabsComponent;
  currentOsId = osId;
  document
    .getElementById("btnOpenChecklist")
    ?.addEventListener("click", () => openWizard(false));
  document
    .getElementById("btnViewChecklist")
    ?.addEventListener("click", viewChecklist);
  if (osId) carregarResumoChecklist(osId);
}

async function carregarResumoChecklist(osId) {
  try {
    const dados = await ChecklistService.buscarChecklist(osId);
    checklistDataCache = dados;
    const totalFotos = await contarFotosServidor(osId);
    atualizarInterfacePorStatus(dados, totalFotos);
  } catch (error) {
    console.log("Nenhum checklist encontrado", error);
    atualizarInterfacePorStatus(null, 0);
  }
}

async function contarFotosServidor(osId) {
  try {
    const res = await fetch(
      `http://127.0.0.1:8000/api/oficina/os/${osId}/documentos/`,
    );
    if (res.ok) {
      const docs = await res.json();
      return docs.filter((doc) => doc.origem === "checklist").length;
    }
  } catch (e) {}
  return 0;
}

function atualizarInterfacePorStatus(dados, totalFotos) {
  const concluido = dados && dados.concluido;
  const statusTitle = document.getElementById("statusTitle");
  const statusDesc = document.getElementById("statusDesc");
  const statusIcon = document.getElementById("statusIcon");
  const btnOpen = document.getElementById("btnOpenChecklist");
  const btnView = document.getElementById("btnViewChecklist");
  const statusCard = document.getElementById("checklistStatusCard");
  const summaryStatus = document.getElementById("summaryStatus");
  const summaryDate = document.getElementById("summaryDate");
  const summaryResponsible = document.getElementById("summaryResponsible");
  const summarySignClient = document.getElementById("summarySignClient");
  const summarySignTech = document.getElementById("summarySignTech");
  const summaryPhotosCount = document.getElementById("summaryPhotosCount");

  if (concluido) {
    statusTitle.innerHTML = "Checklist Concluído";
    statusDesc.innerText =
      "Checklist já foi preenchido e assinado. Etapas liberadas.";
    statusIcon.className = "fas fa-check-circle";
    statusCard.classList.add("completed");
    btnOpen.style.display = "none";
    btnView.style.display = "inline-flex";
    summaryStatus.innerText = "Concluído";
    summaryStatus.className = "resumo-value badge badge-success";
    summarySignClient.innerHTML =
      '<i class="fas fa-check-circle"></i> Assinado';
    summarySignTech.innerHTML = '<i class="fas fa-check-circle"></i> Assinado';
    summaryDate.innerText = dados.criado_em
      ? new Date(dados.criado_em).toLocaleDateString()
      : "-";
    summaryResponsible.innerText = dados.consultor || "-";
    summaryPhotosCount.innerText = `${totalFotos} foto(s)`;
    tabsRef?.setLockedByChecklist?.(true);
  } else {
    statusTitle.innerHTML = "Checklist Pendente";
    statusDesc.innerText = "A O.S. está bloqueada. Preenchimento obrigatório.";
    statusIcon.className = "fas fa-exclamation-circle";
    statusCard.classList.remove("completed");
    btnOpen.style.display = "inline-flex";
    btnView.style.display = "none";
    summaryStatus.innerText = "Pendente";
    summaryStatus.className = "resumo-value badge badge-warning";
    summarySignClient.innerHTML =
      '<i class="fas fa-times-circle"></i> Não assinado';
    summarySignTech.innerHTML =
      '<i class="fas fa-times-circle"></i> Não assinado';
    summaryDate.innerText = "-";
    summaryResponsible.innerText = dados?.consultor || "-";
    summaryPhotosCount.innerText = `${totalFotos} foto(s)`;
    tabsRef?.setLockedByChecklist?.(false);
  }
}

async function openWizard(isReadOnly = false) {
  isReadOnlyMode = isReadOnly;
  const modal = document.getElementById("modalChecklist");
  const body = document.getElementById("checklist-wizard-body");
  const temp = document.getElementById("wizardTemplate");
  if (!modal || !body || !temp) {
    console.error("Elementos do modal não encontrados");
    return;
  }

  body.innerHTML = "";
  body.appendChild(temp.content.cloneNode(true));
  currentStep = 1;

  if (isReadOnly) {
    if (checklistDataCache) preencherFormularioComDados(checklistDataCache);
    desabilitarFormulario(true);
    const btnFinalizar = document.getElementById("btnFinalizarChecklist");
    if (btnFinalizar) btnFinalizar.style.display = "none";

    // Carrega as fotos e atualiza as grades
    await carregarFotosDoServidor();

    // Força uma nova tentativa de atualização após um pequeno delay (garante que o DOM esteja pronto)
    setTimeout(() => {
      atualizarPreviewCategoria(
        ".preview-externo",
        ".count-externo",
        fotosExterno,
      );
      atualizarPreviewCategoria(
        ".preview-interno",
        ".count-interno",
        fotosInterno,
      );
      atualizarPreviewCategoria(
        ".preview-mecanica",
        ".count-mecanica",
        fotosMecanica,
      );
    }, 100);

    carregarAssinaturasNosCanvas();
  } else {
    // ... modo edição
    fotosExterno = [];
    fotosInterno = [];
    fotosMecanica = [];
    if (checklistDataCache && !checklistDataCache.concluido) {
      preencherFormularioComDados(checklistDataCache);
    }
    desabilitarFormulario(false);

    // Aguarda o DOM do wizard ficar pronto antes de configurar uploads e assinaturas
    setTimeout(() => {
      configurarUploads();
      configurarAssinaturas();
    }, 200); 

    const btnFinalizar = document.getElementById("btnFinalizarChecklist");
    if (btnFinalizar) btnFinalizar.onclick = () => finalizarChecklist();
  }

  configurarStepperNavegacao();
  atualizarUI();

  // CORREÇÃO: Configurar botões "Próximo" e "Anterior" do modal
  const btnProximo = document.getElementById("btnProximoPasso");
  const btnAnterior = document.getElementById("btnAnteriorPasso");
  if (btnProximo) {
    btnProximo.onclick = () => {
      if (currentStep < 6) {
        currentStep++;
        atualizarUI();
      }
    };
  }
  if (btnAnterior) {
    btnAnterior.onclick = () => {
      if (currentStep > 1) {
        currentStep--;
        atualizarUI();
      }
    };
  }
  atualizarBotoesNavegacao();

  if (typeof modal.open === "function") {
    modal.open();
  } else if (typeof modal.showModal === "function") {
    modal.showModal();
  } else {
    modal.setAttribute("open", "");
  }
}

function atualizarBotoesNavegacao() {
  const btnProximo = document.getElementById("btnProximoPasso");
  const btnAnterior = document.getElementById("btnAnteriorPasso");
  if (btnProximo)
    btnProximo.style.display = currentStep === 6 ? "none" : "inline-block";
  if (btnAnterior)
    btnAnterior.style.display = currentStep === 1 ? "none" : "inline-block";
}

function preencherFormularioComDados(dados) {
  if (dados.data_recebimento)
    document.querySelector('[name="data_recebimento"]').value =
      dados.data_recebimento;
  if (dados.consultor)
    document.querySelector('[name="consultor"]').value = dados.consultor;
  if (dados.quilometragem)
    document.querySelector('[name="km"]').value = dados.quilometragem;
  if (dados.nivel_combustivel)
    document.querySelector('[name="fuel"]').value = dados.nivel_combustivel;
  if (dados.observacoes_iniciais)
    document.querySelector('[name="obs_inicial"]').value =
      dados.observacoes_iniciais;
  if (dados.lataria_pintura)
    document.querySelector('[name="ext_body"]').value = dados.lataria_pintura;
  if (dados.vidros_farois)
    document.querySelector('[name="ext_glass"]').value = dados.vidros_farois;
  if (dados.observacoes_internas)
    document.querySelector('[name="int_obs"]').value =
      dados.observacoes_internas;
  if (dados.nivel_oleo)
    document.querySelector('[name="mech_oil"]').value = dados.nivel_oleo;
  if (dados.fluido_arrefecimento)
    document.querySelector('[name="mech_coolant"]').value =
      dados.fluido_arrefecimento;
  if (dados.observacoes_mecanica)
    document.querySelector('[name="mec_obs"]').value =
      dados.observacoes_mecanica;
  if (dados.possui_manual) document.getElementById("chk_manual").checked = true;
  if (dados.possui_estepe_macaco)
    document.getElementById("chk_step").checked = true;
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

function configurarStepperNavegacao() {
  const steps = document.querySelectorAll(".step-item");
  steps.forEach((step) => {
    step.addEventListener("click", async (e) => {
      if (isReadOnlyMode) {
        currentStep = parseInt(step.dataset.step);
        atualizarUI();
        return;
      }

      const targetStep = parseInt(step.dataset.step);
      if (targetStep === currentStep) return;

      if (targetStep > currentStep) {
        const isValid = await validarPassoAtual();
        if (!isValid) {
          alert("Preencha os campos obrigatórios antes de prosseguir.");
          return;
        }
      }

      currentStep = targetStep;
      atualizarUI();
    });
  });
}

function viewChecklist() {
  if (!checklistDataCache || !checklistDataCache.concluido) {
    alert("Nenhum checklist concluído para visualizar.");
    return;
  }
  openWizard(true);
}

function configurarUploads() {
  setTimeout(() => {
    configurarDropzone(
      "externo",
      fotosExterno,
      ".preview-externo",
      ".count-externo",
    );
    configurarDropzone(
      "interno",
      fotosInterno,
      ".preview-interno",
      ".count-interno",
    );
    configurarDropzone(
      "mecanica",
      fotosMecanica,
      ".preview-mecanica",
      ".count-mecanica",
    );
  }, 50);
}

function configurarDropzone(categoria, arrayFotos, previewSel, counterSel) {
  const dropzone = document.querySelector(
    `.photo-dropzone[data-categoria="${categoria}"]`,
  );
  const fileInput = document.querySelector(`.file-input-${categoria}`);
  if (!dropzone || !fileInput) return;

  dropzone.onclick = () => fileInput.click();

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "var(--primary)";
    dropzone.style.background = "#eff6ff";
  });
  dropzone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "var(--gray-300)";
    dropzone.style.background = "var(--gray-50)";
  });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "var(--gray-300)";
    dropzone.style.background = "var(--gray-50)";
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/"),
    );
    adicionarFotos(files, categoria, arrayFotos, previewSel, counterSel);
  });

  fileInput.onchange = (e) => {
    const files = Array.from(e.target.files);
    adicionarFotos(files, categoria, arrayFotos, previewSel, counterSel);
    fileInput.value = "";
  };
}

function adicionarFotos(files, categoria, arrayFotos, previewSel, counterSel) {
  files.forEach((file) => {
    const newFile = new File([file], `${categoria}_${file.name}`, {
      type: file.type,
    });
    arrayFotos.push(newFile);
  });
  atualizarPreviewCategoria(previewSel, counterSel, arrayFotos);
  atualizarPreviewGeral();
}

function atualizarPreviewCategoria(previewSel, counterSel, arrayFotos) {
  const grid = document.querySelector(previewSel);
  const counter = document.querySelector(counterSel);
  if (!grid) return;
  grid.innerHTML = "";

  arrayFotos.forEach((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const thumb = document.createElement("div");
      thumb.className = "photo-thumb";
      thumb.style.backgroundImage = `url(${e.target.result})`;
      grid.appendChild(thumb);
    };
    reader.readAsDataURL(file);
  });
  if (counter) counter.innerText = `${arrayFotos.length} foto(s)`;
}

function atualizarPreviewGeral() {
  const gridGeral = document.getElementById("photoPreviewGrid");
  const counterGeral = document.getElementById("photoCounter");
  if (!gridGeral) return;
  const todas = [...fotosExterno, ...fotosInterno, ...fotosMecanica];
  gridGeral.innerHTML = "";

  todas.forEach((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const thumb = document.createElement("div");
      thumb.className = "photo-thumb";
      thumb.style.backgroundImage = `url(${e.target.result})`;
      gridGeral.appendChild(thumb);
    };
    reader.readAsDataURL(file);
  });
  if (counterGeral) {
    counterGeral.innerText = `${todas.length} foto(s) no total`;
    counterGeral.style.color =
      todas.length >= 4 ? "var(--success)" : "var(--warning)";
  }
}

async function carregarFotosDoServidor() {
  try {
    const res = await fetch(
      `${DJANGO_BASE_URL}/api/oficina/os/${currentOsId}/documentos/`,
    );
    if (!res.ok) return;
    const docs = await res.json();
    const fotos = docs.filter((d) => d.origem === "checklist");

    fotosExterno = [];
    fotosInterno = [];
    fotosMecanica = [];
    const todasFotos = [];

    for (const doc of fotos) {
      const urlCompleta = `${DJANGO_BASE_URL}${doc.arquivo}`;
      const response = await fetch(urlCompleta);
      const blob = await response.blob();
      const nomeArquivo = doc.nome_arquivo || "foto.jpg";
      const file = new File([blob], nomeArquivo, { type: blob.type });
      todasFotos.push(file);

      // Usa a categoria salva no banco (se existir), senão tenta extrair do nome
      let categoria = doc.categoria || "externo";
      if (!doc.categoria) {
        if (nomeArquivo.startsWith("externo_")) categoria = "externo";
        else if (nomeArquivo.startsWith("interno_")) categoria = "interno";
        else if (nomeArquivo.startsWith("mecanica_")) categoria = "mecanica";
      }

      if (categoria === "externo") fotosExterno.push(file);
      else if (categoria === "interno") fotosInterno.push(file);
      else if (categoria === "mecanica") fotosMecanica.push(file);
    }

    // Atualiza grades
    atualizarPreviewCategoria(
      ".preview-externo",
      ".count-externo",
      fotosExterno,
    );
    atualizarPreviewCategoria(
      ".preview-interno",
      ".count-interno",
      fotosInterno,
    );
    atualizarPreviewCategoria(
      ".preview-mecanica",
      ".count-mecanica",
      fotosMecanica,
    );

    const gridGeral = document.getElementById("photoPreviewGrid");
    const counterGeral = document.getElementById("photoCounter");
    if (gridGeral) {
      gridGeral.innerHTML = "";
      todasFotos.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const thumb = document.createElement("div");
          thumb.className = "photo-thumb";
          thumb.style.backgroundImage = `url(${e.target.result})`;
          gridGeral.appendChild(thumb);
        };
        reader.readAsDataURL(file);
      });
      if (counterGeral) {
        counterGeral.innerText = `${todasFotos.length} foto(s) no total`;
        counterGeral.style.color =
          todasFotos.length >= 4 ? "var(--success)" : "var(--warning)";
      }
    }
  } catch (e) {
    console.error("Erro ao carregar fotos do servidor:", e);
  }
}

function carregarAssinaturasNosCanvas() {
  if (!checklistDataCache) return;
  const desenhar = (canvasId, dataURL) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !dataURL) return;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    img.src = dataURL;
  };
  setTimeout(() => {
    desenhar("sigClient", checklistDataCache.assinatura_cliente);
    desenhar("sigTech", checklistDataCache.assinatura_tecnico);
  }, 200);
}

function configurarAssinaturas() {
  setTimeout(() => {
    configurarCanvas("sigClient");
    configurarCanvas("sigTech");
    document.querySelectorAll(".btn-clear").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const canvasId = btn.getAttribute("data-canvas");
        if (canvasId) limparCanvas(canvasId);
      });
    });
  }, 100);
}

function reajustarCanvases() {
  const sigClient = document.getElementById("sigClient");
  const sigTech = document.getElementById("sigTech");
  if (sigClient && sigClient.width > 0) return;
  const ajustar = (canvas) => {
    if (!canvas) return;
    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
    }
  };
  ajustar(sigClient);
  ajustar(sigTech);
}

function configurarCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let desenhando = false;

  const resizeCanvas = () => {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  };
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  const desenhar = (e) => {
    if (!desenhando) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX, clientY;
    if (e.touches) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  canvas.addEventListener("mousedown", (e) => {
    desenhando = true;
    ctx.beginPath();
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    ctx.moveTo(x, y);
    e.preventDefault();
  });
  canvas.addEventListener("mouseup", () => {
    desenhando = false;
    ctx.beginPath();
  });
  canvas.addEventListener("mousemove", desenhar);
  canvas.addEventListener(
    "touchstart",
    (e) => {
      desenhando = true;
      ctx.beginPath();
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.touches[0].clientX - rect.left) * scaleX;
      const y = (e.touches[0].clientY - rect.top) * scaleY;
      ctx.moveTo(x, y);
      e.preventDefault();
    },
    { passive: false },
  );
  canvas.addEventListener("touchend", () => {
    desenhando = false;
    ctx.beginPath();
  });
  canvas.addEventListener("touchmove", desenhar, { passive: false });
}

function limparCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

async function validarPassoAtual() {
  if (stepValidationMap[currentStep]) {
    if (currentStep === 6) {
      // Aguarda um pequeno delay para garantir que os canvas estejam prontos
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return stepValidationMap[currentStep]();
  }
  return true;
}

function isCanvasBlank(canvas) {
  if (!canvas) return true;
  const ctx = canvas.getContext("2d");
  const pixelBuffer = new Uint32Array(
    ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer,
  );
  return !pixelBuffer.some((color) => color !== 0);
}

function atualizarUI() {
  document.querySelectorAll(".wizard-panel").forEach((panel) => {
    panel.style.display =
      parseInt(panel.dataset.step) === currentStep ? "block" : "none";
  });

  document.querySelectorAll(".step-item").forEach((step) => {
    const stepNum = parseInt(step.dataset.step);
    step.classList.toggle("active", stepNum === currentStep);

    if (!isReadOnlyMode) {
      if (stepNum < currentStep) {
        const isValid = stepValidationMap[stepNum]
          ? stepValidationMap[stepNum]()
          : true;
        step.classList.toggle("completed", isValid);
      } else {
        step.classList.remove("completed");
      }
      step.style.opacity =
        stepNum < currentStep ? 0.8 : stepNum > currentStep ? 0.5 : 1;
    } else {
      step.style.opacity = 1;
    }
    // CORREÇÃO: Se estiver no passo 6 (assinaturas) e NÃO estiver em modo somente leitura
    if (currentStep === 6 && !isReadOnlyMode) {
      setTimeout(() => reajustarCanvases(), 50);
    }
  });
  atualizarBotoesNavegacao();
}

async function finalizarChecklist() {
  if (!(await validarPassoAtual())) return;

  // CORREÇÃO: Garantir que os canvases estejam dimensionados
  reajustarCanvases();
  await new Promise((resolve) => setTimeout(resolve, 50));

  const sigClient = document.getElementById("sigClient");
  const sigTech = document.getElementById("sigTech");
  if (isCanvasBlank(sigClient) || isCanvasBlank(sigTech)) {
    alert("Ambas as assinaturas são obrigatórias.");
    return;
  }

  const dados = {
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
    observacoes_mecanica:
      document.querySelector('[name="mec_obs"]')?.value || "",
  };

  const btnFinalizar = document.getElementById("btnFinalizarChecklist");
  btnFinalizar.disabled = true;
  btnFinalizar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

  try {
    await ChecklistService.salvarChecklist(currentOsId, dados);
    const todasFotos = [...fotosExterno, ...fotosInterno, ...fotosMecanica];
    if (fotosExterno.length) {
      const formData = new FormData();
      fotosExterno.forEach((f) => formData.append("files", f));
      formData.append("origem", "checklist");
      formData.append("categoria", "externo");

      await fetch(
        `${DJANGO_BASE_URL}/api/oficina/os/${currentOsId}/documentos/upload/`,
        {
          method: "POST",
          credentials: "include",
          headers: { "X-CSRFToken": getCSRFToken() },
          body: formData,
        },
      );
    }
    if (fotosInterno.length) {
      const formData = new FormData();
      fotosInterno.forEach((f) => formData.append("files", f));
      formData.append("origem", "checklist");
      formData.append("categoria", "interno");
      await fetch(
        `${DJANGO_BASE_URL}/api/oficina/os/${currentOsId}/documentos/upload/`,
        {
          method: "POST",
          credentials: "include",
          headers: { "X-CSRFToken": getCSRFToken() },
          body: formData,
        },
      );
    }
    if (fotosMecanica.length) {
      const formData = new FormData();
      fotosMecanica.forEach((f) => formData.append("files", f));
      formData.append("origem", "checklist");
      formData.append("categoria", "mecanica");
      await fetch(
        `${DJANGO_BASE_URL}/api/oficina/os/${currentOsId}/documentos/upload/`,
        {
          method: "POST",
          credentials: "include",
          headers: { "X-CSRFToken": getCSRFToken() },
          body: formData,
        },
      );
    }
    alert("Checklist salvo com sucesso!");
    const modal = document.getElementById("modalChecklist");
    if (modal) modal.close();
    // Aguarda o fechamento do modal antes de recarregar o resumo
    setTimeout(async () => {
      await carregarResumoChecklist(currentOsId);
      // Força a recarga da aba atual para atualizar o bloqueio
      const event = new CustomEvent("os:checklist-atualizado", {
        bubbles: true,
      });
      document.dispatchEvent(event);
    }, 100);
  } catch (err) {
    console.error(err);
    alert("Erro ao salvar checklist.");
  } finally {
    btnFinalizar.disabled = false;
    btnFinalizar.innerHTML = "Finalizar Checklist";
  }
}
