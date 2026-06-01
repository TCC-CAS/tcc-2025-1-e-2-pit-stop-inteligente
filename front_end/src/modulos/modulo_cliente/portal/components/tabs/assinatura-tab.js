// assinatura-tab.js (portal do cliente)
//
// Canvas de assinatura digital + envio para /checklist/assinar/.
// Suporta mouse e touch. Após envio, atualiza o estado e mostra confirmação.

import { ClienteOSApi } from "../../services/cliente-os-api.js";


export async function renderAssinaturaCliente(container, osId, { onAssinaturaSalva }) {
  container.innerHTML = `<div class="loading-state">Carregando…</div>`;

  let checklist;
  try {
    checklist = await ClienteOSApi.checklist(osId);
  } catch (err) {
    container.innerHTML = `<div class="error-state" role="alert">${err.message}</div>`;
    return;
  }

  if (!checklist.disponivel) {
    container.innerHTML = `
      <section class="cliente-tab-section">
        <header class="section-header">
          <h2><i class="fas fa-signature"></i> Assinatura Digital</h2>
        </header>
        <div class="empty-state">
          <i class="fas fa-hourglass-half" aria-hidden="true"></i>
          <h3>Aguardando checklist da oficina</h3>
          <p>O checklist precisa ser preenchido antes que você possa assinar.</p>
        </div>
      </section>`;
    return;
  }

  if (checklist.cliente_assinou) {
    container.innerHTML = `
      <section class="cliente-tab-section">
        <header class="section-header">
          <h2><i class="fas fa-signature"></i> Assinatura Digital</h2>
        </header>
        <div class="ack ack-ok" role="status">
          <i class="fas fa-check-circle"></i>
          Sua assinatura foi registrada com sucesso.
        </div>
        <figure class="signature-block" style="max-width:420px;margin:1.5rem auto 0;">
          <figcaption>Sua assinatura</figcaption>
          <img src="${checklist.assinatura_cliente}" alt="Imagem da assinatura registrada">
        </figure>
      </section>`;
    return;
  }

  container.innerHTML = `
    <section class="cliente-tab-section" aria-labelledby="hAssinar">
      <header class="section-header">
        <div>
          <h2 id="hAssinar"><i class="fas fa-signature"></i> Assinatura Digital</h2>
          <p class="section-sub">Use o dedo (no celular) ou o mouse para assinar abaixo.</p>
        </div>
      </header>
      <div class="signature-pad-wrap">
        <canvas id="sigCanvas" class="signature-pad" aria-label="Área para desenhar sua assinatura"></canvas>
      </div>
      <div class="signature-actions">
        <button class="btn btn-outline-secondary" type="button" id="btnLimpar">
          <i class="fas fa-eraser"></i> Limpar
        </button>
        <label class="check-line" style="margin: 0;">
          <input type="checkbox" id="chkAceite">
          <span>Confirmo que conferi as informações do checklist e que esta é a minha assinatura.</span>
        </label>
        <button class="btn btn-primary" type="button" id="btnSalvar" disabled>
          <i class="fas fa-save"></i> Salvar assinatura
        </button>
      </div>
      <p class="sr-only" id="sigStatus" aria-live="polite"></p>
    </section>
  `;

  configurarCanvas(container, osId, { onAssinaturaSalva });
}


function configurarCanvas(container, osId, { onAssinaturaSalva }) {
  const canvas = container.querySelector("#sigCanvas");
  const ctx = canvas.getContext("2d");
  const btnLimpar = container.querySelector("#btnLimpar");
  const btnSalvar = container.querySelector("#btnSalvar");
  const chkAceite = container.querySelector("#chkAceite");
  const status = container.querySelector("#sigStatus");

  let desenhando = false;
  let temAssinatura = false;
  let ultimoX = 0;
  let ultimoY = 0;

  ajustarCanvas();
  window.addEventListener("resize", ajustarCanvas);

  function ajustarCanvas() {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1e293b";
  }

  function pos(evt) {
    const rect = canvas.getBoundingClientRect();
    const p = evt.touches ? evt.touches[0] : evt;
    return { x: p.clientX - rect.left, y: p.clientY - rect.top };
  }

  function iniciar(evt) {
    evt.preventDefault();
    desenhando = true;
    const { x, y } = pos(evt);
    ultimoX = x;
    ultimoY = y;
  }

  function mover(evt) {
    if (!desenhando) return;
    evt.preventDefault();
    const { x, y } = pos(evt);
    ctx.beginPath();
    ctx.moveTo(ultimoX, ultimoY);
    ctx.lineTo(x, y);
    ctx.stroke();
    ultimoX = x;
    ultimoY = y;
    temAssinatura = true;
    atualizarBotao();
  }

  function parar() {
    desenhando = false;
  }

  canvas.addEventListener("mousedown", iniciar);
  canvas.addEventListener("mousemove", mover);
  canvas.addEventListener("mouseup", parar);
  canvas.addEventListener("mouseleave", parar);
  canvas.addEventListener("touchstart", iniciar, { passive: false });
  canvas.addEventListener("touchmove", mover, { passive: false });
  canvas.addEventListener("touchend", parar);

  btnLimpar.addEventListener("click", () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    temAssinatura = false;
    atualizarBotao();
    status.textContent = "Área limpa.";
  });

  chkAceite.addEventListener("change", atualizarBotao);

  function atualizarBotao() {
    btnSalvar.disabled = !(temAssinatura && chkAceite.checked);
  }

  btnSalvar.addEventListener("click", async () => {
    if (!temAssinatura || !chkAceite.checked) return;
    btnSalvar.disabled = true;
    btnSalvar.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Salvando…`;
    try {
      const dataUrl = canvas.toDataURL("image/png");
      await ClienteOSApi.assinarChecklist(osId, dataUrl);
      onAssinaturaSalva?.();
    } catch (err) {
      btnSalvar.disabled = false;
      btnSalvar.innerHTML = `<i class="fas fa-save"></i> Salvar assinatura`;
      alert(`Não foi possível salvar: ${err.message}`);
    }
  });
}
