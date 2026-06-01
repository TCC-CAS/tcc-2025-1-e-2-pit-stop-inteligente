// cliente-header.js
//
// Header simplificado do portal do cliente. Mostra a marca, o nome do
// cliente logado e um botão de "Sair" que dispara o logout via API.

import {
  carregarPerfilCliente,
  logoutCliente,
  redirecionarParaLoginCliente,
} from "../services/cliente-auth.js";


export class ClienteHeader extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  async connectedCallback() {
    this._renderEsqueleto();
    let perfil = null;
    try {
      perfil = await carregarPerfilCliente();
    } catch {
      perfil = null;
    }
    this._renderFinal(perfil);
    this._vincularEventos();
  }

  _renderEsqueleto() {
    this.shadowRoot.innerHTML = this._estilo() + `
      <header>
        <div class="brand"><span aria-hidden="true">🔧</span> Pit Stop · Cliente</div>
        <div class="user-block"><span class="user-name">Carregando…</span></div>
      </header>
    `;
  }

  _renderFinal(perfil) {
    const nome = perfil?.nome || "Cliente";
    const oficina = perfil?.oficina_nome || "";
    this.shadowRoot.innerHTML = this._estilo() + `
      <header>
        <div class="brand">
          <span aria-hidden="true">🔧</span>
          <span>Pit Stop · Cliente</span>
        </div>
        <div class="user-block">
          <div class="user-info">
            <strong>${this._esc(nome)}</strong>
            ${oficina ? `<small>${this._esc(oficina)}</small>` : ""}
          </div>
          <button id="btnLogout" class="logout-btn" type="button" aria-label="Sair do portal">
            <i class="fas fa-sign-out-alt" aria-hidden="true"></i>
            <span class="logout-text">Sair</span>
          </button>
        </div>
      </header>
    `;
  }

  _vincularEventos() {
    this.shadowRoot.getElementById("btnLogout")?.addEventListener("click", async () => {
      await logoutCliente();
      redirecionarParaLoginCliente();
    });
  }

  _esc(str) {
    if (!str) return "";
    return String(str).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[m]);
  }

  _estilo() {
    return `
      <link rel="stylesheet"
            href="${new URL("../../../../shared/vendor/fontawesome/css/all.min.css", import.meta.url).href}">
      <style>
        :host { display: block; position: sticky; top: 0; z-index: 100; }
        header {
          background: linear-gradient(90deg, #1d4ed8 0%, #2563eb 100%);
          color: #fff;
          padding: 0.85rem 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
          min-height: 64px;
          box-sizing: border-box;
          font-family: "Inter", "Segoe UI", Tahoma, sans-serif;
        }
        .brand {
          display: inline-flex;
          align-items: center;
          gap: 0.6rem;
          font-weight: 800;
          font-size: 1.1rem;
          letter-spacing: 0.2px;
        }
        .user-block {
          display: flex;
          align-items: center;
          gap: 0.9rem;
        }
        .user-info {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          line-height: 1.15;
          max-width: 200px;
          text-align: right;
        }
        .user-info strong {
          font-size: 0.95rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 200px;
        }
        .user-info small {
          font-size: 0.72rem;
          opacity: 0.85;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 200px;
        }
        .logout-btn {
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.35);
          color: #fff;
          padding: 0.5rem 0.85rem;
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          transition: background 0.15s, transform 0.1s;
          min-height: 40px;
          font-family: inherit;
        }
        .logout-btn:hover,
        .logout-btn:focus-visible {
          background: rgba(255, 255, 255, 0.24);
          outline: none;
        }
        .logout-btn:active { transform: translateY(1px); }

        @media (max-width: 540px) {
          header { padding: 0.7rem 1rem; }
          .brand { font-size: 1rem; }
          .user-info { max-width: 130px; }
          .user-info strong, .user-info small { max-width: 130px; }
          .logout-text { display: none; }
          .logout-btn { padding: 0.5rem 0.6rem; }
        }
      </style>
    `;
  }
}

if (!customElements.get("cliente-header")) {
  customElements.define("cliente-header", ClienteHeader);
}
