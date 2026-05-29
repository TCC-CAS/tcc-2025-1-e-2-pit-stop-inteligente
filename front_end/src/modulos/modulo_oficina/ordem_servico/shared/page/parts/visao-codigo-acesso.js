// visao-codigo-acesso.js
//
// Botão "Código do cliente" no cabeçalho da OS. Abre um modal que:
//   - mostra o código vigente (se houver) e seu status (válido/expirado/revogado);
//   - permite gerar um novo (revoga o anterior automaticamente no back);
//   - permite copiar/compartilhar (WhatsApp);
//   - permite revogar o código atual.
//
// Onde aparece para o cliente: na tela "Acompanhe sua O.S." (login do
// cliente), no campo "Código de acesso" + CPF/CNPJ.

import { apiFetch, getCsrfToken, apiUrl } from "../../../../../../shared/config/api-config.js";
import { urlInterna } from "../../../../../../shared/services/base-path.js";


export function configurarBotaoCodigoAcesso() {
  const btn = document.getElementById("btnCodigoAcessoOS");
  btn?.addEventListener("click", () => {
    const osId = window.osSelecionadoId;
    if (!osId) {
      alert("Selecione uma OS antes de gerar o código de acesso.");
      return;
    }
    abrirModalCodigo(osId);
  });
}


async function abrirModalCodigo(osId) {
  let info;
  try {
    const r = await apiFetch(`/os/${osId}/codigo-acesso/`);
    info = await r.json();
  } catch (err) {
    alert("Não foi possível consultar o código atual.");
    return;
  }

  const modal = document.getElementById("mainModal");
  if (!modal) return;
  while (modal.firstChild) modal.removeChild(modal.firstChild);

  const titulo = document.createElement("span");
  titulo.setAttribute("slot", "title");
  titulo.textContent = `Código de Acesso · OS #${osId}`;

  const body = document.createElement("div");
  body.setAttribute("slot", "body");
  body.innerHTML = renderEstado(info);

  const footer = document.createElement("div");
  footer.setAttribute("slot", "footer");
  footer.innerHTML = `
    <button class="btn btn-secondary close-modal" type="button">Fechar</button>
  `;

  modal.appendChild(titulo);
  modal.appendChild(body);
  modal.appendChild(footer);
  modal.open?.() || modal.setAttribute("open", "");

  vincularAcoes(modal, body, osId, info);
  modal.querySelector(".close-modal")?.addEventListener("click", () => modal.close?.());
}


function renderEstado(info) {
  if (!info?.existe) {
    return `
      <div class="codigo-acesso-state empty">
        <i class="fas fa-key" aria-hidden="true"></i>
        <h3>Nenhum código gerado ainda</h3>
        <p>Gere um código para que o cliente possa acompanhar a OS no portal.</p>
        <div class="codigo-acesso-form">
          <label>Validade
            <select id="codValidade">
              <option value="3">3 dias</option>
              <option value="7" selected>7 dias</option>
              <option value="15">15 dias</option>
              <option value="30">30 dias</option>
            </select>
          </label>
          <label>Tentativas
            <select id="codTentativas">
              <option value="3">3</option>
              <option value="5" selected>5</option>
              <option value="10">10</option>
            </select>
          </label>
          <button class="btn btn-primary" type="button" id="btnGerarCodigo">
            <i class="fas fa-bolt"></i> Gerar código de acesso
          </button>
        </div>
      </div>
    `;
  }

  const codigoFmt = formatarCodigo(info.codigo);
  const statusClass = info.valido ? "ok" : info.revogado ? "off" : "warn";
  const statusLabel = info.revogado ? "Revogado"
                    : info.expirado ? "Expirado"
                    : info.bloqueado ? "Bloqueado (tentativas)"
                    : "Válido";

  return `
    <div class="codigo-acesso-state">
      <div class="codigo-display ${statusClass}">
        <code aria-live="polite">${codigoFmt}</code>
        <button class="btn-icon" type="button" id="btnCopiarCodigo" title="Copiar código" aria-label="Copiar código">
          <i class="fas fa-copy"></i>
        </button>
      </div>
      <ul class="codigo-meta">
        <li><strong>Status:</strong> <span class="status-pill ${statusClass}">${statusLabel}</span></li>
        <li><strong>Expira em:</strong> ${escapeHtml(info.expira_em)}</li>
        <li><strong>Tentativas:</strong> ${info.tentativas}/${info.max_tentativas}</li>
        <li><strong>Gerado em:</strong> ${escapeHtml(info.criado_em)}</li>
        ${info.ultimo_uso_em ? `<li><strong>Último acesso do cliente:</strong> ${escapeHtml(info.ultimo_uso_em)}</li>` : ""}
      </ul>

      <div class="codigo-share">
        <label for="msgCompartilhar">Mensagem para o cliente</label>
        <textarea id="msgCompartilhar" rows="4">${mensagemPadrao(info.codigo, info.expira_em)}</textarea>
        <div class="codigo-share-actions">
          <button class="btn btn-outline-secondary" type="button" id="btnCopiarMsg">
            <i class="fas fa-clipboard"></i> Copiar mensagem
          </button>
          <a class="btn btn-success" id="btnWhats" target="_blank" rel="noopener">
            <i class="fab fa-whatsapp"></i> Enviar por WhatsApp
          </a>
        </div>
      </div>

      <div class="codigo-rotate">
        <button class="btn btn-primary" type="button" id="btnRegerarCodigo">
          <i class="fas fa-rotate"></i> Gerar novo código
        </button>
        <button class="btn btn-danger" type="button" id="btnRevogarCodigo">
          <i class="fas fa-ban"></i> Revogar acesso
        </button>
      </div>

      <p class="codigo-hint">
        <i class="fas fa-shield-halved"></i>
        O cliente precisa informar o código <strong>+ CPF/CNPJ</strong> exatamente como
        cadastrado para acessar a OS.
      </p>
    </div>
  `;
}


function vincularAcoes(modal, body, osId, info) {
  // Gerar (estado vazio)
  body.querySelector("#btnGerarCodigo")?.addEventListener("click", async () => {
    const validade = Number(body.querySelector("#codValidade").value);
    const maxTent = Number(body.querySelector("#codTentativas").value);
    await chamarGerar(osId, { validade_dias: validade, max_tentativas: maxTent }, modal);
  });

  // Regerar (estado com código)
  body.querySelector("#btnRegerarCodigo")?.addEventListener("click", async () => {
    if (!confirm("Isto invalida o código atual. Deseja continuar?")) return;
    await chamarGerar(osId, { validade_dias: 7, max_tentativas: 5 }, modal);
  });

  // Revogar
  body.querySelector("#btnRevogarCodigo")?.addEventListener("click", async () => {
    if (!confirm("Revogar o acesso atual? O cliente precisará de um novo código.")) return;
    try {
      const r = await fetch(apiUrl(`/os/${osId}/codigo-acesso/`), {
        method: "DELETE",
        credentials: "include",
        headers: { "X-CSRFToken": getCsrfToken() },
      });
      if (!r.ok) throw new Error("Falha ao revogar");
      abrirModalCodigo(osId);
    } catch (err) {
      alert("Não foi possível revogar o código. Tente novamente.");
    }
  });

  // Copiar código
  body.querySelector("#btnCopiarCodigo")?.addEventListener("click", async () => {
    if (!info?.codigo) return;
    await copiar(formatarCodigo(info.codigo));
    flashLabel(body.querySelector("#btnCopiarCodigo"), '<i class="fas fa-check"></i>');
  });

  // Copiar mensagem
  body.querySelector("#btnCopiarMsg")?.addEventListener("click", async () => {
    const msg = body.querySelector("#msgCompartilhar").value;
    await copiar(msg);
    flashLabel(
      body.querySelector("#btnCopiarMsg"),
      '<i class="fas fa-check"></i> Copiado!',
    );
  });

  // WhatsApp link (atualiza href com a mensagem atual)
  const linkWhats = body.querySelector("#btnWhats");
  if (linkWhats) {
    const atualizar = () => {
      const msg = encodeURIComponent(body.querySelector("#msgCompartilhar").value);
      linkWhats.href = `https://wa.me/?text=${msg}`;
    };
    atualizar();
    body.querySelector("#msgCompartilhar")?.addEventListener("input", atualizar);
  }
}


async function chamarGerar(osId, body, modal) {
  try {
    const r = await fetch(apiUrl(`/os/${osId}/codigo-acesso/`), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCsrfToken(),
      },
      body: JSON.stringify(body || {}),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.erro || "Falha ao gerar código.");
    }
    modal.close?.();
    abrirModalCodigo(osId);
  } catch (err) {
    alert(err.message);
  }
}


function formatarCodigo(c) {
  const limpo = (c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return limpo.length > 4 ? `${limpo.slice(0, 4)}-${limpo.slice(4)}` : limpo;
}


function mensagemPadrao(codigo, expiraEm) {
  return (
    `Olá! Sua Ordem de Serviço já pode ser acompanhada no portal Pit Stop.\n\n` +
    `🔐 Código de acesso: ${formatarCodigo(codigo)}\n` +
    `📅 Válido até: ${expiraEm}\n\n` +
    `Acesse: ${urlInterna("modulos/modulo_cliente/login/pages/login-cliente.html")}\n` +
    `Informe o código acima junto com seu CPF/CNPJ.`
  );
}


async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    /* sem clipboard — silencioso */
  }
}


function flashLabel(btn, html, ms = 1300) {
  if (!btn) return;
  const original = btn.innerHTML;
  btn.innerHTML = html;
  setTimeout(() => (btn.innerHTML = original), ms);
}


function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[m]);
}
