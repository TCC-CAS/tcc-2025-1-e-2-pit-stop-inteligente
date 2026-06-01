// historico-tab.js (portal do cliente)
//
// Timeline somente-leitura dos eventos da OS.

import { ClienteOSApi } from "../../services/cliente-os-api.js";


const ICON_BY_TYPE = {
  criacao: "fa-plus-circle",
  checklist: "fa-clipboard-list",
  diagnostico: "fa-stethoscope",
  aprovacao: "fa-check-double",
  execucao: "fa-wrench",
  conclusao: "fa-flag-checkered",
  status: "fa-exchange-alt",
  default: "fa-history",
};

const COLOR_BY_TYPE = {
  criacao: "#2563eb",
  checklist: "#0284c7",
  diagnostico: "#ca8a04",
  aprovacao: "#16a34a",
  execucao: "#475569",
  conclusao: "#15803d",
  status: "#a16207",
  default: "#64748b",
};


export async function renderHistoricoCliente(container, osId) {
  container.innerHTML = `<div class="loading-state">Carregando histórico…</div>`;

  let eventos;
  try {
    eventos = await ClienteOSApi.historico(osId);
  } catch (err) {
    container.innerHTML = `<div class="error-state" role="alert">${err.message}</div>`;
    return;
  }

  if (!eventos.length) {
    container.innerHTML = `
      <section class="cliente-tab-section">
        <header class="section-header">
          <div>
            <h2><i class="fas fa-history"></i> Histórico</h2>
            <p class="section-sub">Acompanhe cada etapa do atendimento.</p>
          </div>
        </header>
        <div class="empty-state">
          <i class="fas fa-history" aria-hidden="true"></i>
          <h3>Nenhum evento registrado</h3>
          <p>Os eventos da sua OS aparecerão aqui em ordem cronológica.</p>
        </div>
      </section>`;
    return;
  }

  const items = eventos
    .map((ev) => {
      const tipo = (ev.tipo || "default").toLowerCase();
      const icon = ICON_BY_TYPE[tipo] || ICON_BY_TYPE.default;
      const color = COLOR_BY_TYPE[tipo] || COLOR_BY_TYPE.default;
      return `
        <li class="tl-item">
          <span class="tl-marker" style="background-color:${color};">
            <i class="fas ${icon}" aria-hidden="true"></i>
          </span>
          <div class="tl-content">
            <div class="tl-meta">
              <strong>${escapeHtml(ev.descricao || "Evento")}</strong>
              <time>${escapeHtml(ev.data_hora || "")}</time>
            </div>
            ${ev.autor ? `<small class="tl-author">${escapeHtml(ev.autor)}</small>` : ""}
            ${ev.detalhes ? `<p class="tl-detail">${escapeHtml(ev.detalhes)}</p>` : ""}
          </div>
        </li>`;
    })
    .join("");

  container.innerHTML = `
    <section class="cliente-tab-section">
      <header class="section-header">
        <div>
          <h2><i class="fas fa-history"></i> Histórico</h2>
          <p class="section-sub">${eventos.length} evento(s) — do mais recente para o mais antigo.</p>
        </div>
      </header>
      <ol class="tl-list">${items}</ol>
    </section>
  `;
}


function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[m]);
}
