// auditoria-view.js — Aba "Auditoria" do painel administrativo.

import { AdminAPI } from "../services/admin-api.js";
import { debounce, escapeHtml, toast } from "./admin-ui.js";


const estado = {
  page: 1,
  page_size: 25,
  total: 0,
  pages: 0,
  filtros: {},
};


export async function renderAuditoria(container) {
  container.innerHTML = `
    <section class="admin-section">
      <header class="admin-section-head">
        <h2><i class="fas fa-clipboard-check"></i> Auditoria & Logs</h2>
        <p>Registros automáticos de ações sensíveis. Filtre, exporte e investigue.</p>
      </header>

      <div class="admin-toolbar">
        <div class="admin-search">
          <i class="fas fa-search" aria-hidden="true"></i>
          <input type="search" id="auBusca" placeholder="Buscar ação (ex. usuario.criar)" aria-label="Buscar ação">
        </div>
        <select id="auNivel" class="admin-select">
          <option value="">Todos os níveis</option>
          <option value="info">Informativo</option>
          <option value="warning">Atenção</option>
          <option value="critico">Crítico</option>
        </select>
        <input id="auUsuario" class="form-control" placeholder="Usuário" style="max-width:160px;">
        <input id="auDesde" type="date" class="form-control" style="max-width:160px;" aria-label="Desde">
        <input id="auAte" type="date" class="form-control" style="max-width:160px;" aria-label="Até">
        <button class="btn btn-outline-secondary" id="btnExportCsv" type="button">
          <i class="fas fa-file-csv"></i> Exportar CSV
        </button>
      </div>

      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Nível</th>
              <th>Usuário</th>
              <th>Ação</th>
              <th>Recurso</th>
              <th>Descrição</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody id="auTbody"><tr><td colspan="7" class="admin-loading">Carregando…</td></tr></tbody>
        </table>
      </div>
      <div class="pagination" id="auPagination" aria-label="Paginação"></div>
    </section>
  `;

  vincularToolbar(container);
  await carregar(container);
}


function vincularToolbar(container) {
  const aplicar = () => carregar(container);

  container.querySelector("#auBusca").addEventListener("input", debounce((e) => {
    estado.filtros.acao = e.target.value.trim();
    estado.page = 1;
    aplicar();
  }, 350));
  container.querySelector("#auNivel").addEventListener("change", (e) => {
    estado.filtros.nivel = e.target.value;
    estado.page = 1;
    aplicar();
  });
  container.querySelector("#auUsuario").addEventListener("change", (e) => {
    estado.filtros.usuario = e.target.value.trim();
    estado.page = 1;
    aplicar();
  });
  container.querySelector("#auDesde").addEventListener("change", (e) => {
    estado.filtros.desde = e.target.value;
    estado.page = 1;
    aplicar();
  });
  container.querySelector("#auAte").addEventListener("change", (e) => {
    estado.filtros.ate = e.target.value;
    estado.page = 1;
    aplicar();
  });
  container.querySelector("#btnExportCsv").addEventListener("click", () => {
    const url = AdminAPI.auditoria.exportarCsvUrl(estado.filtros);
    window.open(url, "_blank");
    toast("Exportação iniciada.", "info");
  });
}


async function carregar(container) {
  const tbody = container.querySelector("#auTbody");
  tbody.innerHTML = `<tr><td colspan="7" class="admin-loading">Carregando…</td></tr>`;
  try {
    const dados = await AdminAPI.auditoria.listar({
      ...estado.filtros,
      page: estado.page,
      page_size: estado.page_size,
    });
    estado.total = dados.total;
    estado.pages = dados.pages;
    renderLinhas(tbody, dados.results);
    renderPaginacao(container.querySelector("#auPagination"), () => carregar(container));
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="admin-error">${escapeHtml(err.message)}</td></tr>`;
  }
}


function renderLinhas(tbody, results) {
  if (!results.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="admin-empty">Sem registros para os filtros aplicados.</td></tr>`;
    return;
  }
  tbody.innerHTML = "";
  results.forEach((ev) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(ev.criado_em)}</td>
      <td><span class="ev-badge ev-${escapeHtml(ev.nivel)}">${escapeHtml(ev.nivel)}</span></td>
      <td>${escapeHtml(ev.usuario_nome)}</td>
      <td><code>${escapeHtml(ev.acao)}</code></td>
      <td>${escapeHtml(ev.recurso || "—")}${ev.recurso_id ? " #" + escapeHtml(ev.recurso_id) : ""}</td>
      <td>${escapeHtml(ev.descricao)}</td>
      <td><small>${escapeHtml(ev.ip || "—")}</small></td>
    `;
    tbody.appendChild(tr);
  });
}


function renderPaginacao(container, onChange) {
  const { page, pages, total } = estado;
  if (!pages || pages <= 1) {
    container.innerHTML = total
      ? `<small>${total} registro(s)</small>`
      : "";
    return;
  }
  container.innerHTML = `
    <button class="btn btn-sm btn-outline-secondary" ${page <= 1 ? "disabled" : ""} data-action="prev">
      <i class="fas fa-chevron-left"></i> Anterior
    </button>
    <span class="page-info">Página ${page} de ${pages} · ${total} registro(s)</span>
    <button class="btn btn-sm btn-outline-secondary" ${page >= pages ? "disabled" : ""} data-action="next">
      Próxima <i class="fas fa-chevron-right"></i>
    </button>
  `;
  container.querySelector('[data-action="prev"]')?.addEventListener("click", () => {
    if (estado.page > 1) { estado.page -= 1; onChange(); }
  });
  container.querySelector('[data-action="next"]')?.addEventListener("click", () => {
    if (estado.page < estado.pages) { estado.page += 1; onChange(); }
  });
}
