// os-list.js
//
// Web Component <os-list>: lista lateral de Ordens de Serviço.
// Toda a apresentação (template/estilo) e operações HTTP foram extraídas
// para ./parts/* — esta classe contém apenas o ciclo de vida + glue.

import { buscarOrdens } from "./parts/os-list-api.js";
import { criarCardOS } from "./parts/os-list-card.js";
import { OS_LIST_STYLES, OS_LIST_TEMPLATE } from "./parts/os-list-template.js";


export class OSList extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.orders = [];
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = OS_LIST_STYLES + OS_LIST_TEMPLATE;
    this.setupListeners();
    this.carregarOrdens();
  }

  // -------------------------------------------------------------------------
  // Data
  // -------------------------------------------------------------------------

  async carregarOrdens() {
    const listContainer = this.shadowRoot.querySelector(".list");
    listContainer.innerHTML = '<div class="loading">Carregando...</div>';

    try {
      this.orders = await buscarOrdens();
      this._emitirContagem();
      this.renderList(this._aplicarFiltros(this.orders));
    } catch (error) {
      console.error("Falha ao carregar lista de OS:", error);
      listContainer.innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-triangle"></i> Erro ao carregar OS.<br>
          <small>${error.message}</small>
        </div>`;
    }
  }

  // -------------------------------------------------------------------------
  // API pública para filtros externos (chips na página, sidebar, etc.)
  // -------------------------------------------------------------------------

  setStatusFilter(status) {
    if (!status) return;
    const select = this.shadowRoot.getElementById("filterStatus");
    if (select) select.value = status;
    this.filterOrders();
  }

  _aplicarFiltros(lista) {
    const term = (this.shadowRoot.getElementById("searchOS")?.value || "").toLowerCase();
    const status = this.shadowRoot.getElementById("filterStatus")?.value || "todos";
    return lista.filter((os) => {
      const placa = (os.veiculo_placa || "").toLowerCase();
      const cliente = (os.cliente_nome || "").toLowerCase();
      const matchesTerm = !term || placa.includes(term) || cliente.includes(term);
      const matchesStatus = status === "todos" || os.status === status;
      return matchesTerm && matchesStatus;
    });
  }

  _emitirContagem() {
    const contagem = {
      todos: this.orders.length,
      pendente: this.orders.filter((o) => o.status === "pendente").length,
      execucao: this.orders.filter((o) => o.status === "execucao").length,
      concluido: this.orders.filter((o) => o.status === "concluido").length,
    };
    this.dispatchEvent(
      new CustomEvent("os:list-counts", {
        detail: contagem,
        bubbles: true,
        composed: true,
      }),
    );
  }

  filterOrders() {
    this.renderList(this._aplicarFiltros(this.orders));
    this.dispatchEvent(
      new CustomEvent("os:filter-changed", {
        detail: { status: this.shadowRoot.getElementById("filterStatus")?.value || "todos" },
        bubbles: true,
        composed: true,
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  renderList(lista) {
    const listContainer = this.shadowRoot.querySelector(".list");
    listContainer.innerHTML = "";

    if (lista.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-message">
          <i class="fas fa-inbox"></i>
          Nenhuma OS encontrada.
        </div>`;
      return;
    }

    // Performance: monta todos os cards em um DocumentFragment para fazer
    // uma única inserção no DOM (1 reflow vs N). Para listas grandes
    // (≥ INITIAL_BATCH), mostramos apenas o primeiro lote e exibimos um
    // botão "Carregar mais" — evita travar a UI ao abrir.
    const INITIAL_BATCH = 50;
    const totais = lista.length;
    const exibidos = lista.slice(0, INITIAL_BATCH);

    const frag = document.createDocumentFragment();
    exibidos.forEach((os) => {
      const card = criarCardOS(os, {
        onSelect: (osSelecionada, el) => this.handleSelect(osSelecionada, el),
        onChange: () => this.carregarOrdens(),
      });
      frag.appendChild(card);
    });
    listContainer.appendChild(frag);

    if (totais > INITIAL_BATCH) {
      const restantes = totais - INITIAL_BATCH;
      const btn = document.createElement("button");
      btn.className = "btn-icon";
      btn.style.cssText =
        "margin: 8px auto; padding: 8px 14px; width: auto; height: auto; font-size: 12px; color: #2563eb; border-color: #93c5fd;";
      btn.innerHTML = `<i class="fas fa-chevron-down"></i> Carregar mais ${restantes}`;
      btn.addEventListener("click", () => {
        const frag2 = document.createDocumentFragment();
        lista.slice(INITIAL_BATCH).forEach((os) => {
          frag2.appendChild(criarCardOS(os, {
            onSelect: (osSelecionada, el) => this.handleSelect(osSelecionada, el),
            onChange: () => this.carregarOrdens(),
          }));
        });
        btn.replaceWith(frag2);
      });
      listContainer.appendChild(btn);
    }
  }

  // -------------------------------------------------------------------------
  // Eventos
  // -------------------------------------------------------------------------

  setupListeners() {
    const $ = (id) => this.shadowRoot.getElementById(id);

    // Debounce na busca para não re-renderizar a cada tecla.
    let buscaTimer;
    $("searchOS")?.addEventListener("input", () => {
      clearTimeout(buscaTimer);
      buscaTimer = setTimeout(() => this.filterOrders(), 200);
    });
    $("filterStatus")?.addEventListener("change", () => this.filterOrders());

    // Chips de filtro rápido — sincronizam com o <select> oculto.
    this.shadowRoot.querySelectorAll(".quick-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const status = chip.dataset.quickStatus;
        this.shadowRoot.querySelectorAll(".quick-chip").forEach((c) =>
          c.classList.toggle("active", c === chip),
        );
        const select = $("filterStatus");
        if (select) select.value = status;
        this.filterOrders();
      });
    });

    $("btnRefresh")?.addEventListener("click", () => {
      const icon = $("btnRefresh").querySelector("i");
      if (icon) {
        icon.style.transform = "rotate(360deg)";
        setTimeout(() => (icon.style.transform = "none"), 500);
      }
      this.carregarOrdens();
    });

    $("btnNovaOS")?.addEventListener("click", () =>
      this.dispatchEvent(
        new CustomEvent("os:create-new", { bubbles: true, composed: true }),
      ),
    );

    window.addEventListener("os:criada", () => this.carregarOrdens());
  }

  handleSelect(os, cardEl) {
    this.shadowRoot
      .querySelectorAll(".os-card")
      .forEach((c) => c.classList.remove("selected"));
    cardEl.classList.add("selected");
    this.dispatchEvent(
      new CustomEvent("os:select", {
        detail: os,
        bubbles: true,
        composed: true,
      }),
    );
  }
}


customElements.define("os-list", OSList);
