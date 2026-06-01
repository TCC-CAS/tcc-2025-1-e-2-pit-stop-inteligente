// notificacoes-view.js — Central de notificações da equipe administrativa.
//
// Mostra eventos em tempo real (poll a cada 30s) como:
//   - cliente acessou OS via portal
//   - admin redefiniu senha de outro usuário
//   - oficina inativada
//   - backup exportado/restaurado
//
// Permite marcar uma como lida ou todas de uma vez; o badge do menu
// lateral reflete o contador de "não lidas".

import { adminFetch } from "../services/admin-api.js";
import { escapeHtml, toast, debounce } from "./admin-ui.js";


const ICONES = {
  acesso_cliente:    "fa-user-clock",
  reset_senha:       "fa-key",
  os_aprovada:       "fa-circle-check",
  os_rejeitada:      "fa-circle-xmark",
  backup:            "fa-database",
  oficina_inativada: "fa-power-off",
  info:              "fa-circle-info",
  recuperar_oficina: "fa-store-slash",
  recuperar_cliente: "fa-user-lock",
};

const NIVEL_CLASSE = {
  info: "info",
  warning: "warn",
  critico: "danger",
};


let estado = {
  page: 1,
  page_size: 25,
  filtroNivel: "",
  filtroTipo: "",
  apenasNaoLidas: false,
};


export async function renderNotificacoes(container) {
  container.innerHTML = `
    <section class="admin-section">
      <header class="admin-section-head">
        <div>
          <h2><i class="fas fa-bell"></i> Central de notificações</h2>
          <p>Acompanhe eventos sensíveis da plataforma em tempo real.</p>
        </div>
        <button class="btn btn-outline-secondary" id="btnMarcarTodasLidas" type="button">
          <i class="fas fa-check-double"></i> Marcar todas como lidas
        </button>
      </header>

      <div class="admin-toolbar">
        <label class="check-line" style="margin: 0;">
          <input type="checkbox" id="filtroNaoLidas"> Apenas não lidas
        </label>
        <select id="filtroNivel" class="admin-select" aria-label="Filtrar por nível">
          <option value="">Todos os níveis</option>
          <option value="info">Informativo</option>
          <option value="warning">Atenção</option>
          <option value="critico">Crítico</option>
        </select>
        <select id="filtroTipo" class="admin-select" aria-label="Filtrar por tipo">
          <option value="">Todos os tipos</option>
          <option value="recuperar_oficina">Recuperação de acesso · oficina</option>
          <option value="recuperar_cliente">Recuperação de acesso · cliente</option>
          <option value="reset_senha">Redefinição de senha</option>
          <option value="acesso_cliente">Acesso de cliente à OS</option>
          <option value="os_aprovada">OS aprovada</option>
          <option value="os_rejeitada">OS rejeitada</option>
          <option value="backup">Backup</option>
          <option value="oficina_inativada">Oficina inativada</option>
          <option value="info">Informativo</option>
        </select>
      </div>

      <div id="notifList" class="notif-list">
        <div class="admin-loading">Carregando notificações…</div>
      </div>
      <div class="pagination" id="notifPagination"></div>
    </section>
  `;

  container.querySelector("#filtroNaoLidas")
    .addEventListener("change", (e) => {
      estado.apenasNaoLidas = e.target.checked;
      estado.page = 1;
      carregar(container);
    });
  container.querySelector("#filtroNivel")
    .addEventListener("change", (e) => {
      estado.filtroNivel = e.target.value;
      estado.page = 1;
      carregar(container);
    });
  container.querySelector("#filtroTipo")
    .addEventListener("change", (e) => {
      estado.filtroTipo = e.target.value;
      estado.page = 1;
      carregar(container);
    });
  container.querySelector("#btnMarcarTodasLidas")
    .addEventListener("click", async () => {
      try {
        await adminFetch("/notificacoes/lidas/", { method: "POST" });
        toast("Notificações marcadas como lidas.", "success");
        carregar(container);
        atualizarBadgeMenu(0);
      } catch (err) {
        toast(err.message, "error");
      }
    });

  carregar(container);
}


async function carregar(container) {
  const lista = container.querySelector("#notifList");
  lista.innerHTML = `<div class="admin-loading">Carregando…</div>`;
  try {
    const params = new URLSearchParams({
      page: estado.page,
      page_size: estado.page_size,
    });
    if (estado.filtroNivel) params.set("nivel", estado.filtroNivel);
    if (estado.filtroTipo) params.set("tipo", estado.filtroTipo);
    if (estado.apenasNaoLidas) params.set("nao_lidas", "1");

    const data = await adminFetch(`/notificacoes/?${params}`);
    renderItens(lista, data.results);
    renderPaginacao(container.querySelector("#notifPagination"), data, () => carregar(container));
    atualizarBadgeMenu(data.nao_lidas);
  } catch (err) {
    lista.innerHTML = `<div class="admin-error">${escapeHtml(err.message)}</div>`;
  }
}


function renderItens(container, itens) {
  if (!itens.length) {
    container.innerHTML = `
      <div class="admin-empty">
        <i class="fas fa-bell-slash"></i>
        Sem notificações para os filtros selecionados.
      </div>`;
    return;
  }
  container.innerHTML = itens.map((n) => {
    const icon = ICONES[n.tipo] || ICONES.info;
    const cls = NIVEL_CLASSE[n.nivel] || "info";
    return `
      <article class="notif-card ${n.lida ? "lida" : ""} ${cls}" data-id="${n.id}">
        <div class="notif-icon"><i class="fas ${icon}"></i></div>
        <div class="notif-body">
          <header>
            <strong>${escapeHtml(n.titulo)}</strong>
            <span class="status-pill ${cls}">${n.nivel}</span>
          </header>
          ${n.mensagem ? `<p>${escapeHtml(n.mensagem)}</p>` : ""}
          <footer>
            <small><i class="fas fa-clock"></i> ${escapeHtml(n.criado_em)}</small>
            ${n.lida
              ? `<small class="lida-info">Lida em ${escapeHtml(n.lida_em || "—")}</small>`
              : `<button class="btn-link" data-action="marcar-lida" data-id="${n.id}">
                   <i class="fas fa-check"></i> Marcar como lida
                 </button>`}
            ${n.link ? `<a class="btn-link" href="${n.link}" target="_blank" rel="noopener">
                          <i class="fas fa-arrow-up-right-from-square"></i> Abrir
                       </a>` : ""}
          </footer>
        </div>
      </article>
    `;
  }).join("");

  container.querySelectorAll('[data-action="marcar-lida"]').forEach((btn) =>
    btn.addEventListener("click", async () => {
      try {
        await adminFetch(`/notificacoes/${btn.dataset.id}/lida/`, { method: "POST" });
        carregar(container.closest(".admin-section").parentElement || document);
      } catch (err) {
        toast(err.message, "error");
      }
    }),
  );
}


function renderPaginacao(container, data, onChange) {
  if (!container) return;
  const { total, pages, page } = data;
  if (!pages || pages <= 1) {
    container.innerHTML = total ? `<small>${total} notificação(ões)</small>` : "";
    return;
  }
  container.innerHTML = `
    <button class="btn btn-sm btn-outline-secondary" ${page <= 1 ? "disabled" : ""} data-action="prev">
      <i class="fas fa-chevron-left"></i> Anterior
    </button>
    <span class="page-info">Página ${page} de ${pages} · ${total} notificação(ões)</span>
    <button class="btn btn-sm btn-outline-secondary" ${page >= pages ? "disabled" : ""} data-action="next">
      Próxima <i class="fas fa-chevron-right"></i>
    </button>
  `;
  container.querySelector('[data-action="prev"]')?.addEventListener("click", () => {
    if (estado.page > 1) { estado.page -= 1; onChange(); }
  });
  container.querySelector('[data-action="next"]')?.addEventListener("click", () => {
    if (estado.page < pages) { estado.page += 1; onChange(); }
  });
}


// -----------------------------------------------------------------------------
// Badge global (no menu lateral) + polling leve
// -----------------------------------------------------------------------------

export async function atualizarBadgeNotificacoesGlobal() {
  try {
    const r = await adminFetch("/notificacoes/sumario/");
    atualizarBadgeMenu(r.nao_lidas);
  } catch {
    /* silencioso — não bloqueia o restante do painel */
  }
}


function atualizarBadgeMenu(naoLidas) {
  const badge = document.getElementById("navBadgeNotif");
  if (!badge) return;
  if (naoLidas > 0) {
    badge.hidden = false;
    badge.textContent = naoLidas > 99 ? "99+" : String(naoLidas);
  } else {
    badge.hidden = true;
  }
}
