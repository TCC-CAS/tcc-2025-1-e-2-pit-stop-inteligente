// oficina-header.js
//
// Cabeçalho global da aplicação. Inclui:
//   1. Marca (link para o dashboard).
//   2. Botão de tema (claro/escuro), respeitando localStorage.
//   3. Dropdown discreto com avatar + nome do usuário, papel atual,
//      oficina ativa e ação de "Sair". Substitui o bloco de usuário
//      antes redundante na sidebar.

import {
  carregarPerfil,
  logout,
} from "../services/auth-service.js";
import {
  ROTAS,
  redirecionarPara,
  redirecionarParaLogin,
} from "../services/auth-guard.js";
import { obterGate } from "../services/assinatura-gate.js";
import { notificarMudancaTema } from "../services/chart-theme.js";


const PAPEIS_LABEL = {
  admin: "Administrador",
  gerente: "Gerente",
  atendente: "Atendente",
  mecanico: "Mecânico",
  visualizador: "Visualizador",
};


export class OficinaHeader extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._onDocClick = this._onDocClick.bind(this);
    this._onKeydown = this._onKeydown.bind(this);
  }

  async connectedCallback() {
    this._renderEsqueleto();
    this.loadTheme();
    let perfil = null;
    let gate = null;
    try {
      perfil = await carregarPerfil();
    } catch {
      perfil = null;
    }
    if (perfil) {
      try { gate = await obterGate(); } catch { gate = null; }
    }
    this._renderCompleto(perfil, gate);
    this._vincularEventos(perfil);
  }

  disconnectedCallback() {
    document.removeEventListener("click", this._onDocClick);
    document.removeEventListener("keydown", this._onKeydown);
  }

  // -------------------------------------------------------------------------
  // Tema
  // -------------------------------------------------------------------------

  loadTheme() {
    const savedTheme = localStorage.getItem("theme") || "light";
    document.documentElement.classList.toggle("dark-mode", savedTheme === "dark");
    document.body.classList.toggle("dark-mode", savedTheme === "dark");
  }

  toggleTheme() {
    const isDark = !document.documentElement.classList.contains("dark-mode");
    document.documentElement.classList.toggle("dark-mode", isDark);
    document.body.classList.toggle("dark-mode", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
    this._sincronizarIconeTema(isDark);
    // Notifica componentes não-CSS (Chart.js, canvases, etc.) que precisam
    // recolorir elementos pintados manualmente quando o tema muda.
    notificarMudancaTema();
  }

  _sincronizarIconeTema(isDark) {
    const btn = this.shadowRoot.getElementById("themeToggle");
    if (!btn) return;
    btn.innerHTML = isDark
      ? '<i class="fas fa-sun" aria-hidden="true"></i>'
      : '<i class="fas fa-moon" aria-hidden="true"></i>';
    btn.setAttribute("aria-label", isDark ? "Ativar tema claro" : "Ativar tema escuro");
    btn.setAttribute("aria-pressed", String(isDark));
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  _renderEsqueleto() {
    this.shadowRoot.innerHTML = this._estilo() + this._template({ nome: "…", inicial: "?" });
  }

  _renderCompleto(perfil, gate = null) {
    const nome = perfil?.user?.nome_completo || perfil?.user?.username || "Conta";
    const papel = PAPEIS_LABEL[perfil?.oficina_atual?.permissao] || "—";
    const oficina = perfil?.oficina_atual?.nome || "Sem oficina";
    const inicial = (nome || "?").trim().charAt(0).toUpperCase() || "?";
    const trocarOficina = (perfil?.oficinas?.length || 0) > 1;
    const podeAdminGlobal = Boolean(perfil?.user?.is_superuser || perfil?.user?.is_staff);
    this.shadowRoot.innerHTML =
      this._estilo() +
      this._bannerAssinatura(gate) +
      this._template({ nome, papel, oficina, inicial, trocarOficina, podeAdminGlobal });
    const isDark = document.documentElement.classList.contains("dark-mode");
    this._sincronizarIconeTema(isDark);
  }

  /**
   * Renderiza um banner acima da barra principal quando a assinatura
   * está vencida (vermelho) ou próxima do vencimento ≤ 7 dias (amarelo).
   * Em estado normal devolve string vazia.
   */
  _bannerAssinatura(gate) {
    if (!gate || gate.nivel === "ok" || gate.status === "indisponivel") return "";
    const isErro = gate.nivel === "erro";
    const icone = isErro ? "fa-circle-exclamation" : "fa-clock";
    const safe = (s) => String(s || "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[m]);
    return `
      <div class="assinatura-banner ${isErro ? "erro" : "atencao"}"
           role="alert" aria-live="polite">
        <i class="fas ${icone}" aria-hidden="true"></i>
        <div class="msg">${safe(gate.mensagem)}</div>
        <button class="banner-cta" type="button" id="bannerCtaPagar">
          <i class="fas fa-credit-card" aria-hidden="true"></i>
          ${isErro ? "Regularizar agora" : "Renovar plano"}
        </button>
      </div>
    `;
  }

  _template({ nome, papel = "", oficina = "", inicial, trocarOficina = false, podeAdminGlobal = false }) {
    const safe = (s) => String(s || "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[m]);
    return `
      <link rel="stylesheet"
            href="${new URL("../vendor/fontawesome/css/all.min.css", import.meta.url).href}">
      <header class="bar">
        <a class="brand" href="#" id="brandLink" aria-label="Ir para o dashboard">
          <span class="brand-icon" aria-hidden="true">🔧</span>
          <span class="brand-text">Pit Stop Inteligente</span>
        </a>

        <div class="actions">
          <button class="icon-btn" id="themeToggle"
                  type="button"
                  aria-label="Alternar tema"
                  aria-pressed="false">
            <i class="fas fa-moon" aria-hidden="true"></i>
          </button>

          <div class="user-menu">
            <button class="user-btn" id="userBtn"
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded="false"
                    aria-controls="userMenu"
                    title="${safe(nome)}">
              <span class="avatar" aria-hidden="true">${safe(inicial)}</span>
              <span class="user-name">${safe(nome)}</span>
              <i class="fas fa-chevron-down chev" aria-hidden="true"></i>
            </button>

            <div class="user-pop" id="userMenu" role="menu" aria-labelledby="userBtn">
              <div class="user-pop-head">
                <span class="avatar avatar-lg" aria-hidden="true">${safe(inicial)}</span>
                <div>
                  <strong>${safe(nome)}</strong>
                  <small>${safe(papel)}</small>
                </div>
              </div>
              <div class="user-pop-row">
                <i class="fas fa-store" aria-hidden="true"></i>
                <span>${safe(oficina)}</span>
              </div>
              ${podeAdminGlobal
                ? `<button class="pop-item" id="btnPainelAdmin" type="button" role="menuitem">
                     <i class="fas fa-crown"></i> Painel administrativo SaaS
                   </button>`
                : ""}
              ${trocarOficina
                ? `<button class="pop-item" id="btnTrocarOficina" type="button" role="menuitem">
                     <i class="fas fa-exchange-alt"></i> Trocar de oficina
                   </button>`
                : ""}
              <button class="pop-item danger" id="btnLogout" type="button" role="menuitem">
                <i class="fas fa-sign-out-alt"></i> Sair da conta
              </button>
            </div>
          </div>
        </div>
      </header>
    `;
  }

  // -------------------------------------------------------------------------
  // Eventos
  // -------------------------------------------------------------------------

  _vincularEventos(perfil) {
    this.shadowRoot.getElementById("themeToggle")
      ?.addEventListener("click", () => this.toggleTheme());

    this.shadowRoot.getElementById("brandLink")
      ?.addEventListener("click", (e) => {
        e.preventDefault();
        redirecionarPara(ROTAS.dashboard);
      });

    const userBtn = this.shadowRoot.getElementById("userBtn");
    userBtn?.addEventListener("click", () => this._toggleMenu());

    this.shadowRoot.getElementById("btnLogout")
      ?.addEventListener("click", async () => {
        await logout();
        redirecionarParaLogin();
      });

    this.shadowRoot.getElementById("btnTrocarOficina")
      ?.addEventListener("click", () => redirecionarPara(ROTAS.selecionarOficina));

    this.shadowRoot.getElementById("btnPainelAdmin")
      ?.addEventListener("click", () =>
        redirecionarPara("modulos/modulo_adm/pages/admin.html"),
      );

    this.shadowRoot.getElementById("bannerCtaPagar")
      ?.addEventListener("click", () => redirecionarPara(ROTAS.renovarPlano));

    document.addEventListener("click", this._onDocClick);
    document.addEventListener("keydown", this._onKeydown);
  }

  _toggleMenu() {
    const pop = this.shadowRoot.getElementById("userMenu");
    const btn = this.shadowRoot.getElementById("userBtn");
    if (!pop || !btn) return;
    const open = pop.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(open));
  }

  _fecharMenu() {
    const pop = this.shadowRoot.getElementById("userMenu");
    const btn = this.shadowRoot.getElementById("userBtn");
    pop?.classList.remove("open");
    btn?.setAttribute("aria-expanded", "false");
  }

  _onDocClick(event) {
    if (!this.contains(event.target) && !event.composedPath().includes(this)) {
      this._fecharMenu();
    }
  }

  _onKeydown(event) {
    if (event.key === "Escape") this._fecharMenu();
  }

  // -------------------------------------------------------------------------
  // CSS (Shadow DOM)
  // -------------------------------------------------------------------------

  _estilo() {
    return `
      <style>
        :host { display: block; position: sticky; top: 0; z-index: 1000; }
        .bar {
          background: linear-gradient(90deg, #1d4ed8 0%, #2563eb 100%);
          color: #fff;
          padding: 0.6rem 1.25rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          box-shadow: 0 2px 10px rgba(15, 23, 42, 0.12);
          min-height: 64px;
          box-sizing: border-box;
          font-family: "Inter", "Segoe UI", Tahoma, sans-serif;
        }
        .brand {
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          color: #fff;
          text-decoration: none;
          font-weight: 800;
          font-size: 1.05rem;
          letter-spacing: 0.1px;
        }
        .brand:hover, .brand:focus-visible { outline: none; opacity: 0.95; }
        .brand-icon { font-size: 1.2rem; }

        .actions { display: flex; align-items: center; gap: 0.45rem; }

        .icon-btn {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.25);
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          cursor: pointer;
          font-size: 1rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s, transform 0.1s;
        }
        .icon-btn:hover, .icon-btn:focus-visible {
          background: rgba(255, 255, 255, 0.22);
          outline: none;
        }
        .icon-btn:active { transform: translateY(1px); }

        /* Botão de usuário */
        .user-menu { position: relative; }
        .user-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          padding: 0.35rem 0.75rem 0.35rem 0.4rem;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.22);
          color: #fff;
          cursor: pointer;
          font-family: inherit;
          font-size: 0.85rem;
          font-weight: 600;
          min-height: 40px;
          transition: background 0.15s;
        }
        .user-btn:hover, .user-btn:focus-visible {
          background: rgba(255, 255, 255, 0.22);
          outline: none;
        }
        .avatar {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: #fff;
          color: #2563eb;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 0.95rem;
        }
        .avatar-lg { width: 40px; height: 40px; font-size: 1.05rem; }
        .user-name {
          max-width: 160px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .chev { font-size: 0.75rem; opacity: 0.85; }

        /* Popover */
        .user-pop {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          min-width: 260px;
          background: var(--bg-card, #fff);
          color: var(--text-primary, #0f172a);
          border-radius: 12px;
          box-shadow: 0 16px 30px rgba(15, 23, 42, 0.18);
          padding: 0.65rem;
          border: 1px solid var(--border-light, #e2e8f0);
          opacity: 0;
          transform: translateY(-4px);
          pointer-events: none;
          transition: opacity 0.15s ease, transform 0.15s ease;
          z-index: 1100;
        }
        .user-pop.open {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }
        .user-pop-head {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          padding: 0.45rem 0.5rem 0.65rem;
          border-bottom: 1px solid var(--border-light, #e2e8f0);
          margin-bottom: 0.45rem;
        }
        .user-pop-head strong { display: block; font-size: 0.92rem; }
        .user-pop-head small {
          display: block;
          font-size: 0.72rem;
          color: var(--text-secondary, #475569);
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        .user-pop-head .avatar-lg {
          background: var(--color-primary-light, #eff6ff);
          color: var(--color-primary, #2563eb);
        }
        .user-pop-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.6rem;
          font-size: 0.85rem;
          color: var(--text-secondary, #475569);
          border-radius: 8px;
        }
        .user-pop-row i { color: var(--color-primary, #2563eb); }
        .pop-item {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          width: 100%;
          padding: 0.6rem 0.65rem;
          background: transparent;
          border: none;
          border-radius: 8px;
          font-family: inherit;
          font-size: 0.9rem;
          color: var(--text-primary, #0f172a);
          cursor: pointer;
          text-align: left;
          min-height: 40px;
        }
        .pop-item:hover, .pop-item:focus-visible {
          background: var(--bg-muted, #f1f5f9);
          outline: none;
        }
        .pop-item.danger { color: var(--color-danger, #dc2626); }
        .pop-item.danger:hover, .pop-item.danger:focus-visible {
          background: #fef2f2;
        }
        .pop-item i { width: 18px; text-align: center; }

        /* Banner de assinatura (vencida ou próxima do vencimento) */
        .assinatura-banner {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          padding: 0.6rem 1.25rem;
          font-size: 0.9rem;
          font-weight: 500;
          color: #1f2937;
        }
        .assinatura-banner.atencao { background: #fef9c3; color: #713f12; }
        .assinatura-banner.erro    { background: #fee2e2; color: #7f1d1d; }
        .assinatura-banner i:first-child { font-size: 1.05rem; }
        .assinatura-banner .msg { flex: 1; line-height: 1.4; }
        .assinatura-banner .banner-cta {
          background: #ffffff;
          color: inherit;
          border: 1px solid currentColor;
          border-radius: 999px;
          padding: 0.4rem 0.9rem;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.82rem;
        }
        .assinatura-banner .banner-cta:hover,
        .assinatura-banner .banner-cta:focus-visible {
          background: rgba(0, 0, 0, 0.05);
          outline: none;
        }

        /* Compactação para celular */
        @media (max-width: 600px) {
          .bar { padding: 0.5rem 0.85rem; }
          .brand-text { display: none; }
          .user-name { display: none; }
          .user-btn { padding: 0.2rem 0.35rem; gap: 0; min-height: 40px; min-width: 40px; }
          .chev { display: none; }
          .user-pop { right: 0; min-width: min(280px, calc(100vw - 1rem)); }

          .assinatura-banner { flex-direction: column; align-items: flex-start; padding: 0.55rem 0.85rem; }
          .assinatura-banner .banner-cta { align-self: stretch; justify-content: center; }
        }
      </style>
    `;
  }
}

if (!customElements.get("oficina-header")) {
  customElements.define("oficina-header", OficinaHeader);
}
