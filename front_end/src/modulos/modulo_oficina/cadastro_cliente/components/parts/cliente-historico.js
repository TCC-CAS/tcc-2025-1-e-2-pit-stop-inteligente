// cliente-historico.js
//
// Lista todas as OS do cliente em uma timeline. Reaproveita o endpoint
// existente /api/oficina/clientes/{id}/veiculos/ + /api/oficina/veiculos/{id}/historico/
// para juntar as OS por veículo. Suporta filtro por status.

import { apiUrl } from "../../../../../shared/config/api-config.js";
import "../../../../../shared/components/status-badge.js";


let cacheOrdens = [];
let filtroStatus = "";


export async function carregarHistoricoDoCliente(clienteId) {
    const container = document.getElementById("historico-content");
    const tabCount = document.getElementById("tabCountHistorico");
    if (!container || !clienteId) return;

    container.innerHTML = `
      <div class="empty-state-soft" role="status">
          <i class="fas fa-spinner fa-spin"></i>
          <p>Carregando histórico…</p>
      </div>`;

    try {
        const veiculos = await fetchJson(`/clientes/${clienteId}/veiculos/`);
        if (!veiculos.length) {
            cacheOrdens = [];
            if (tabCount) tabCount.textContent = "0";
            container.innerHTML = `
              <div class="empty-state-soft">
                <i class="fas fa-clock-rotate-left" aria-hidden="true"></i>
                <p>Este cliente ainda não tem veículos cadastrados.</p>
              </div>`;
            return;
        }

        const listas = await Promise.all(
            veiculos.map((v) =>
                fetchJson(`/veiculos/${v.id}/historico/`).then((ordens) =>
                    ordens.map((o) => ({ ...o, veiculo: v }))
                ).catch(() => []),
            ),
        );

        cacheOrdens = listas
            .flat()
            .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));

        if (tabCount) tabCount.textContent = String(cacheOrdens.length);
        // O hero `#statTotalOS` mostra o total da OFICINA inteira e é
        // gerenciado por `cliente-lista.js#atualizarStatsHero()`. Não
        // tocamos aqui para não confundir o usuário ao trocar de cliente.

        renderizar(container);
        configurarFiltro(container);
    } catch (err) {
        container.innerHTML = `
          <div class="empty-state-soft" role="alert">
            <i class="fas fa-triangle-exclamation"></i>
            <p>Erro ao carregar histórico (${err.message}).</p>
          </div>`;
    }
}


function renderizar(container) {
    const lista = filtroStatus
        ? cacheOrdens.filter((o) => o.status === filtroStatus)
        : cacheOrdens;

    if (!lista.length) {
        container.innerHTML = `
          <div class="empty-state-soft">
            <i class="fas fa-clipboard-list"></i>
            <p>Nenhuma OS para os filtros selecionados.</p>
          </div>`;
        return;
    }

    const itens = lista.map((os) => itemTimeline(os)).join("");
    container.innerHTML = `<ol class="cliente-timeline">${itens}</ol>`;

    container.querySelectorAll("[data-os-id]").forEach((el) => {
        el.addEventListener("click", () => {
            const id = el.dataset.osId;
            window.openOS?.(id) || (window.location.href = `../../ordem_servico/shared/page/os-visao-geral.html?os_id=${id}`);
        });
    });
}


function configurarFiltro(container) {
    const select = document.getElementById("filtroStatusHist");
    if (!select) return;
    // remove listeners antigos clonando
    const novo = select.cloneNode(true);
    select.parentNode.replaceChild(novo, select);
    novo.value = filtroStatus;
    novo.addEventListener("change", (e) => {
        filtroStatus = e.target.value;
        renderizar(container);
    });
}


function itemTimeline(os) {
    const v = os.veiculo || {};
    const data = os.criado_em
        ? new Date(os.criado_em).toLocaleDateString("pt-BR")
        : "—";
    return `
      <li data-os-id="${os.id}" role="button" tabindex="0"
          aria-label="Abrir Ordem de Serviço ${os.id}"
          style="cursor:pointer;">
        <div class="tl-icon"><i class="fas fa-file-invoice"></i></div>
        <div class="tl-body">
          <strong>O.S. #${os.id}</strong>
          <small>${escapeHtml(v.marca || "")} ${escapeHtml(v.modelo || "")} · ${escapeHtml(v.placa || "")} · ${data}${os.km_atual ? " · " + os.km_atual + " km" : ""}</small>
        </div>
        <div>
          <status-badge type="os" status="${os.status || "pendente"}" size="sm"></status-badge>
        </div>
      </li>
    `;
}


async function fetchJson(path) {
    const r = await fetch(apiUrl(path), { credentials: "include" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
}


function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, (m) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[m]);
}
