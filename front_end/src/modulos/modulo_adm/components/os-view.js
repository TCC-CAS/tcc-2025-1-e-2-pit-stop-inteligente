// os-view.js — Aba "Ordens de Serviço" do painel administrativo.

import { AdminAPI } from "../services/admin-api.js";
import { debounce, escapeHtml, toast } from "./admin-ui.js";
import "../../../shared/components/status-badge.js";


const estado = {
  page: 1,
  page_size: 25,
  total: 0,
  pages: 0,
  filtros: {},
};


export async function renderOSAdmin(container) {
  container.innerHTML = `
    <section class="admin-section">
      <header class="admin-section-head">
        <h2><i class="fas fa-clipboard-list"></i> Ordens de Serviço (global)</h2>
        <p>Visão administrativa de todas as O.S. cadastradas.</p>
      </header>

      <div class="admin-toolbar">
        <div class="admin-search">
          <i class="fas fa-search" aria-hidden="true"></i>
          <input type="search" id="osBusca" placeholder="Placa, cliente ou oficina…" aria-label="Buscar OS">
        </div>
        <select id="osStatus" class="admin-select">
          <option value="">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="execucao">Em Execução</option>
          <option value="concluido">Concluído</option>
        </select>
      </div>

      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>OS</th>
              <th>Oficina</th>
              <th>Cliente</th>
              <th>Veículo</th>
              <th>Status</th>
              <th>Criada em</th>
              <th class="th-acoes">Ações</th>
            </tr>
          </thead>
          <tbody id="osTbody"><tr><td colspan="7" class="admin-loading">Carregando…</td></tr></tbody>
        </table>
      </div>
      <div class="pagination" id="osPagination"></div>
    </section>

    <div class="admin-modal" id="osStatusModal" hidden role="dialog" aria-modal="true" aria-labelledby="osStatusTitle">
      <div class="admin-modal-card">
        <header>
          <h3 id="osStatusTitle">Alterar status da OS</h3>
          <button class="btn-icon" type="button" data-action="close" aria-label="Fechar"><i class="fas fa-xmark"></i></button>
        </header>
        <form id="osStatusForm" novalidate>
          <input type="hidden" id="osStatusId">
          <div class="form-group">
            <label for="osStatusNovo">Novo status</label>
            <select id="osStatusNovo" class="form-control" required>
              <option value="pendente">Pendente</option>
              <option value="execucao">Em Execução</option>
              <option value="concluido">Concluído</option>
            </select>
          </div>
          <div class="form-group">
            <label for="osStatusMotivo">Motivo administrativo</label>
            <textarea id="osStatusMotivo" class="form-control" rows="3" required minlength="3"
                      placeholder="Descreva por que a alteração é necessária. Será registrado em auditoria."></textarea>
          </div>
          <footer class="form-actions">
            <button type="button" class="btn btn-outline-secondary" data-action="close">Cancelar</button>
            <button type="submit" class="btn btn-primary">Aplicar</button>
          </footer>
        </form>
      </div>
    </div>
  `;

  vincularToolbar(container);
  vincularModal(container);
  await carregar(container);
}


function vincularToolbar(container) {
  container.querySelector("#osBusca").addEventListener("input", debounce((e) => {
    estado.filtros.busca = e.target.value.trim();
    estado.page = 1;
    carregar(container);
  }, 350));
  container.querySelector("#osStatus").addEventListener("change", (e) => {
    estado.filtros.status = e.target.value;
    estado.page = 1;
    carregar(container);
  });
}


function vincularModal(container) {
  const modal = container.querySelector("#osStatusModal");
  modal.querySelectorAll('[data-action="close"]').forEach((btn) =>
    btn.addEventListener("click", () => fecharModal(modal)),
  );
  modal.addEventListener("click", (e) => { if (e.target === modal) fecharModal(modal); });

  container.querySelector("#osStatusForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = Number(container.querySelector("#osStatusId").value);
    const novo = container.querySelector("#osStatusNovo").value;
    const motivo = container.querySelector("#osStatusMotivo").value.trim();
    if (!motivo) { toast("Informe o motivo.", "warning"); return; }
    try {
      await AdminAPI.os.alterarStatus(id, novo, motivo);
      toast("Status atualizado.", "success");
      fecharModal(modal);
      carregar(container);
    } catch (err) { toast(err.message, "error"); }
  });
}


async function carregar(container) {
  const tbody = container.querySelector("#osTbody");
  tbody.innerHTML = `<tr><td colspan="7" class="admin-loading">Carregando…</td></tr>`;
  try {
    const dados = await AdminAPI.os.listar({
      ...estado.filtros, page: estado.page, page_size: estado.page_size,
    });
    estado.total = dados.total;
    estado.pages = dados.pages;
    renderLinhas(tbody, dados.results, container);
    renderPaginacao(container.querySelector("#osPagination"), () => carregar(container));
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="admin-error">${escapeHtml(err.message)}</td></tr>`;
  }
}


function renderLinhas(tbody, results, container) {
  if (!results.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="admin-empty">Nenhuma OS encontrada.</td></tr>`;
    return;
  }
  tbody.innerHTML = "";
  results.forEach((os) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>#${os.id}</strong></td>
      <td>${escapeHtml(os.oficina_nome || "—")}</td>
      <td>${escapeHtml(os.cliente_nome || "—")}</td>
      <td>${escapeHtml(os.veiculo_modelo || "—")} · <small>${escapeHtml(os.veiculo_placa || "—")}</small></td>
      <td><status-badge type="os" status="${escapeHtml(os.status)}" size="sm"></status-badge></td>
      <td>${escapeHtml(os.criado_em || "—")}</td>
      <td class="td-acoes">
        <button class="btn-icon" data-action="status" data-id="${os.id}" data-status="${escapeHtml(os.status)}" title="Alterar status">
          <i class="fas fa-edit"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-action="status"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const modal = container.querySelector("#osStatusModal");
      container.querySelector("#osStatusId").value = btn.dataset.id;
      container.querySelector("#osStatusNovo").value = btn.dataset.status;
      container.querySelector("#osStatusMotivo").value = "";
      modal.hidden = false;
      requestAnimationFrame(() => modal.classList.add("open"));
    });
  });
}


function fecharModal(modal) {
  modal.classList.remove("open");
  setTimeout(() => (modal.hidden = true), 180);
}


function renderPaginacao(container, onChange) {
  const { page, pages, total } = estado;
  if (!pages || pages <= 1) {
    container.innerHTML = total ? `<small>${total} OS</small>` : "";
    return;
  }
  container.innerHTML = `
    <button class="btn btn-sm btn-outline-secondary" ${page <= 1 ? "disabled" : ""} data-action="prev">
      <i class="fas fa-chevron-left"></i> Anterior
    </button>
    <span class="page-info">Página ${page} de ${pages} · ${total} OS</span>
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
