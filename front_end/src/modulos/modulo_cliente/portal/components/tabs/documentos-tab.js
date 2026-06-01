// documentos-tab.js (portal do cliente)
//
// Lista de documentos da OS — somente leitura. Permite abrir em nova aba.

import { ClienteOSApi } from "../../services/cliente-os-api.js";


const ICONE_POR_TIPO = {
  pdf: "fa-file-pdf",
  doc: "fa-file-word",
  docx: "fa-file-word",
  xls: "fa-file-excel",
  xlsx: "fa-file-excel",
  jpg: "fa-file-image",
  jpeg: "fa-file-image",
  png: "fa-file-image",
  gif: "fa-file-image",
  webp: "fa-file-image",
  txt: "fa-file-alt",
};


export async function renderDocumentosCliente(container, osId) {
  container.innerHTML = `<div class="loading-state">Carregando documentos…</div>`;

  let docs;
  try {
    docs = await ClienteOSApi.documentos(osId);
  } catch (err) {
    container.innerHTML = `<div class="error-state" role="alert">${err.message}</div>`;
    return;
  }

  if (!docs.length) {
    container.innerHTML = `
      <section class="cliente-tab-section">
        <header class="section-header">
          <div>
            <h2><i class="fas fa-folder-open"></i> Documentos</h2>
            <p class="section-sub">Fotos, laudos e arquivos da sua OS aparecerão aqui.</p>
          </div>
        </header>
        <div class="empty-state">
          <i class="fas fa-folder-open" aria-hidden="true"></i>
          <h3>Nenhum documento anexado</h3>
          <p>Quando a oficina anexar fotos ou laudos, eles aparecerão aqui automaticamente.</p>
        </div>
      </section>`;
    return;
  }

  const cards = docs
    .map((doc) => {
      const tipo = (doc.tipo || "").toLowerCase();
      const icone = ICONE_POR_TIPO[tipo] || "fa-file";
      const ehImagem = ["jpg", "jpeg", "png", "gif", "webp"].includes(tipo);
      return `
        <article class="doc-card">
          ${ehImagem
            ? `<a href="${doc.url}" target="_blank" rel="noopener" class="doc-preview">
                 <img src="${doc.url}" alt="Preview de ${escapeHtml(doc.nome)}" loading="lazy">
               </a>`
            : `<a href="${doc.url}" target="_blank" rel="noopener" class="doc-preview doc-preview-icon" aria-label="Abrir ${escapeHtml(doc.nome)}">
                 <i class="fas ${icone}" aria-hidden="true"></i>
               </a>`
          }
          <div class="doc-meta">
            <strong class="doc-name" title="${escapeHtml(doc.nome)}">${escapeHtml(doc.nome)}</strong>
            <span class="doc-date">${escapeHtml(doc.data_inclusao || "")}</span>
          </div>
          <a class="btn btn-outline btn-sm" href="${doc.url}" target="_blank" rel="noopener">
            <i class="fas fa-eye"></i> Abrir
          </a>
        </article>`;
    })
    .join("");

  container.innerHTML = `
    <section class="cliente-tab-section">
      <header class="section-header">
        <div>
          <h2><i class="fas fa-folder-open"></i> Documentos</h2>
          <p class="section-sub">Total de <strong>${docs.length}</strong> arquivo(s) disponível(eis).</p>
        </div>
      </header>
      <div class="docs-grid">${cards}</div>
    </section>
  `;
}


function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[m]);
}
