// cliente-os-list.js
//
// <cliente-os-list>: lista lateral / drawer com as OS do cliente logado.
// Em telas grandes, fica fixa à esquerda. Em telas pequenas, vira
// drawer offcanvas acionado por botão "Minhas OS".

import { ClienteOSApi } from "../services/cliente-os-api.js";
import "../../../../shared/components/status-badge.js";


export class ClienteOSList extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.ordens = [];
    this.selectedId = null;
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = this._template();
    this._vincularEventos();
    this.carregar();
  }

  async carregar() {
    const lista = this.shadowRoot.querySelector(".list");
    lista.innerHTML = `<div class="loading">Carregando suas OS…</div>`;
    try {
      this.ordens = await ClienteOSApi.listarOrdens();
      this._render();
    } catch (err) {
      console.error("Falha ao carregar OS do cliente:", err);
      lista.innerHTML = `
        <div class="error" role="alert">
          <i class="fas fa-exclamation-triangle"></i><br>
          ${err.message || "Erro ao carregar suas Ordens de Serviço."}
        </div>`;
    }
  }

  _render() {
    const lista = this.shadowRoot.querySelector(".list");
    lista.innerHTML = "";
    if (!this.ordens.length) {
      lista.innerHTML = `
        <div class="empty">
          <i class="fas fa-inbox"></i><br>
          Você ainda não possui ordens de serviço.
        </div>`;
      return;
    }
    this.ordens.forEach((os) => lista.appendChild(this._card(os)));
  }

  _card(os) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "os-card" + (os.id === this.selectedId ? " selected" : "");
    card.dataset.id = os.id;
    card.setAttribute("aria-label", `Abrir OS número ${os.id}`);
    card.innerHTML = `
      <div class="row1">
        <span class="os-id">OS #${os.id}</span>
        <status-badge type="os" status="${os.status}" size="sm"></status-badge>
      </div>
      <div class="row2">
        <strong>${this._esc(os.veiculo_marca || "")} ${this._esc(os.veiculo_modelo || "Veículo")}</strong>
        <span>${this._esc(os.veiculo_placa || "—")}</span>
      </div>
      <div class="row3">
        <i class="fas fa-store" aria-hidden="true"></i> ${this._esc(os.oficina_nome || "")}
      </div>
      <div class="row4">
        <i class="fas fa-clock" aria-hidden="true"></i> ${this._esc(os.criado_em)}
      </div>
    `;
    card.addEventListener("click", () => this._selecionar(os));
    return card;
  }

  _selecionar(os) {
    this.selectedId = os.id;
    this.shadowRoot.querySelectorAll(".os-card").forEach((el) => {
      el.classList.toggle("selected", Number(el.dataset.id) === os.id);
    });
    this.dispatchEvent(
      new CustomEvent("cliente:os-select", {
        detail: os,
        bubbles: true,
        composed: true,
      }),
    );
  }

  setSelected(osId) {
    this.selectedId = osId;
    this.shadowRoot.querySelectorAll(".os-card").forEach((el) => {
      el.classList.toggle("selected", Number(el.dataset.id) === osId);
    });
  }

  _vincularEventos() {
    this.shadowRoot.getElementById("btnRefresh")?.addEventListener("click", () => this.carregar());
  }

  _esc(str) {
    if (!str) return "";
    return String(str).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[m]);
  }

  _template() {
    return `
      <link rel="stylesheet"
            href="${new URL("../../../../shared/vendor/fontawesome/css/all.min.css", import.meta.url).href}">
      <style>
        :host {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100%;
          background: #ffffff;
          font-family: "Inter", "Segoe UI", Tahoma, sans-serif;
        }
        .header {
          padding: 1rem 1.1rem;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.5rem;
        }
        .title { font-weight: 700; color: #0f172a; }
        .btn-refresh {
          width: 36px; height: 36px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          background: #fff;
          cursor: pointer;
          color: #475569;
          transition: background 0.15s;
        }
        .btn-refresh:hover, .btn-refresh:focus-visible {
          background: #eff6ff; color: #2563eb; outline: none;
        }
        .list {
          flex: 1;
          overflow-y: auto;
          padding: 0.8rem;
        }
        .os-card {
          width: 100%;
          text-align: left;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-left: 4px solid transparent;
          border-radius: 10px;
          padding: 0.85rem;
          margin-bottom: 0.65rem;
          cursor: pointer;
          font-family: inherit;
          transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .os-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 10px rgba(15, 23, 42, 0.08);
        }
        .os-card:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.4);
        }
        .os-card.selected {
          background: #eff6ff;
          border-left-color: #2563eb;
        }
        .row1 { display: flex; justify-content: space-between; align-items: center; }
        .os-id { font-weight: 700; color: #1e293b; font-size: 0.9rem; }
        .row2 strong { display: block; color: #0f172a; font-size: 0.95rem; }
        .row2 span  { color: #64748b; font-size: 0.85rem; }
        .row3, .row4 { color: #475569; font-size: 0.78rem; }
        .loading, .empty, .error {
          padding: 1.5rem 1rem;
          text-align: center;
          color: #64748b;
          font-size: 0.9rem;
        }
        .error { color: #b91c1c; }
        .empty i, .error i { font-size: 1.8rem; margin-bottom: 0.5rem; display: block; color: #94a3b8; }
      </style>
      <div class="header">
        <span class="title">Minhas Ordens de Serviço</span>
        <button id="btnRefresh" class="btn-refresh" type="button"
                title="Atualizar lista" aria-label="Atualizar lista de OS">
          <i class="fas fa-sync-alt"></i>
        </button>
      </div>
      <div class="list">
        <div class="loading">Carregando…</div>
      </div>
    `;
  }
}

if (!customElements.get("cliente-os-list")) {
  customElements.define("cliente-os-list", ClienteOSList);
}
