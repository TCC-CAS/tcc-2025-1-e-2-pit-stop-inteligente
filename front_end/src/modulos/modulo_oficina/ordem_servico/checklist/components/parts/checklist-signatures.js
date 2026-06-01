// checklist-signatures.js
//
// Captura, exibição e limpeza de assinaturas em <canvas>.
// Suporta entrada via mouse e via touch (mobile/tablet).
//
// REGRA DE NEGÓCIO (2026-05):
//   - A assinatura do CLIENTE NUNCA é capturada no portal da oficina.
//     Apenas exibida em modo leitura (quando o cliente assinou via /portal/).
//   - A assinatura do TÉCNICO continua editável aqui — ela valida que o
//     diagnóstico foi conferido e libera as demais funcionalidades.

import { state } from "./checklist-state.js";


/** Configura assinatura do técnico (cliente fica bloqueado/somente-leitura). */
export function configurarAssinaturas() {
  setTimeout(() => {
    bloquearCanvasCliente();
    configurarCanvas("sigTech");

    // Botão de limpar do canvas do cliente é desabilitado
    document.querySelectorAll(".btn-clear").forEach((btn) => {
      const canvasId = btn.getAttribute("data-canvas");
      if (canvasId === "sigClient") {
        btn.disabled = true;
        btn.title = "Apenas o cliente pode assinar via portal";
        btn.classList.add("locked");
        return;
      }
      btn.addEventListener("click", () => {
        if (canvasId) limparCanvas(canvasId);
      });
    });
  }, 100);
}


/**
 * Desabilita o canvas do cliente no portal da oficina (visual + interação).
 * Mostra um aviso sobre onde a assinatura pode ser coletada.
 */
function bloquearCanvasCliente() {
  const canvas = document.getElementById("sigClient");
  if (!canvas) return;

  // Ajusta tamanho para mostrar pintura existente (se houver) corretamente
  const container = canvas.parentElement;
  if (container) {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
  }
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  canvas.classList.add("locked");
  canvas.style.cursor = "not-allowed";
  canvas.style.pointerEvents = "none";

  // Marca visualmente o bloqueio
  if (container && !container.querySelector(".sig-locked-overlay")) {
    const aviso = document.createElement("div");
    aviso.className = "sig-locked-overlay";
    aviso.innerHTML = `
      <i class="fas fa-lock" aria-hidden="true"></i>
      <span>Apenas o cliente pode assinar — disponível no portal</span>
    `;
    container.appendChild(aviso);
  }
}


/** Reajusta dimensões dos canvases para combinar com o container. */
export function reajustarCanvases() {
  const sigClient = document.getElementById("sigClient");
  const sigTech = document.getElementById("sigTech");
  if (sigClient && sigClient.width > 0) return;

  ajustarCanvas(sigClient);
  ajustarCanvas(sigTech);
}


function ajustarCanvas(canvas) {
  if (!canvas) return;
  const container = canvas.parentElement;
  if (!container) return;

  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
}


function configurarCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let desenhando = false;

  function resize() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }
  resize();
  window.addEventListener("resize", resize);

  function pontoDoEvento(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (cx - rect.left) * scaleX, y: (cy - rect.top) * scaleY };
  }

  function iniciarTrace(e) {
    desenhando = true;
    ctx.beginPath();
    const { x, y } = pontoDoEvento(e);
    ctx.moveTo(x, y);
    e.preventDefault();
  }

  function continuarTrace(e) {
    if (!desenhando) return;
    e.preventDefault();
    const { x, y } = pontoDoEvento(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function pararTrace() {
    desenhando = false;
    ctx.beginPath();
  }

  // Mouse
  canvas.addEventListener("mousedown", iniciarTrace);
  canvas.addEventListener("mousemove", continuarTrace);
  canvas.addEventListener("mouseup", pararTrace);

  // Touch
  canvas.addEventListener("touchstart", iniciarTrace, { passive: false });
  canvas.addEventListener("touchmove", continuarTrace, { passive: false });
  canvas.addEventListener("touchend", pararTrace);
}


/** Limpa o conteúdo de um canvas específico. */
export function limparCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}


/** Pinta as assinaturas salvas (modo somente-leitura) em ambos os canvases. */
export function carregarAssinaturasNosCanvas() {
  if (!state.checklistDataCache) return;

  const desenhar = (canvasId, dataURL) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !dataURL) return;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    img.src = dataURL;
  };

  setTimeout(() => {
    desenhar("sigClient", state.checklistDataCache.assinatura_cliente);
    desenhar("sigTech", state.checklistDataCache.assinatura_tecnico);
  }, 200);
}
