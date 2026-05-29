// oficina-sidebar.js
//
// Web Component <oficina-sidebar page="dashboard">.
// 1. Busca /auth/me/ e renderiza somente os itens permitidos para o papel
//    do usuário corrente. Os itens são agrupados por seção para facilitar
//    a leitura, e cada item exibe rótulo + uma descrição curta.
// 2. Em telas <=900px transforma-se em drawer (offcanvas) acionado pelo
//    botão hambúrguer animado fixo no canto superior.

import { ROTAS, redirecionarPara, redirecionarParaLogin } from "../services/auth-guard.js";
import { carregarPerfil } from "../services/auth-service.js";
import { obterGate, podeExibirItemMenu } from "../services/assinatura-gate.js";


/**
 * Cada grupo agrega itens relacionados. Itens com `requer.papeis === "todos"`
 * aparecem para qualquer funcionário ativo; `requer.papeis: [...]` restringe
 * por papel da oficina; `requer.staffOuSuper` libera só para staff/superuser
 * do Django (painel SaaS).
 */
const GRUPOS = [
  {
    titulo: "Operação",
    itens: [
      {
        chave: "dashboard",
        rotulo: "Dashboard",
        descricao: "Indicadores e visão geral",
        icone: "fa-chart-line",
        rota: "modulos/modulo_oficina/dashboard/pages/dashboard.html",
        requer: { papeis: "todos" },
      },
      {
        chave: "operacoes",
        rotulo: "Ordens de Serviço",
        descricao: "Checklist, orçamento e execução",
        icone: "fa-tools",
        rota: "modulos/modulo_oficina/ordem_servico/shared/page/os-visao-geral.html",
        requer: { papeis: "todos" },
      },
      {
        chave: "clientes",
        rotulo: "Clientes & Veículos",
        descricao: "Cadastro e histórico",
        icone: "fa-users",
        rota: "modulos/modulo_oficina/cadastro_cliente/pages/cadastro-cliente.html",
        requer: { papeis: "todos" },
      },
    ],
  },
  {
    titulo: "Configurações",
    itens: [
      {
        chave: "precos",
        rotulo: "Preços e Serviços",
        descricao: "Catálogo e valor/hora",
        icone: "fa-coins",
        rota: "modulos/modulo_oficina/precos_servicos/configuracoes_gerais/pages/servicos.html",
        requer: { papeis: ["admin", "gerente"] },
      },
      {
        chave: "atualizacao",
        rotulo: "Dados da Oficina",
        descricao: "Perfil, equipe e segurança",
        icone: "fa-shield-halved",
        rota: "modulos/modulo_oficina/atualizar_dados_oficina/pages/atualizacao_dados_oficina.html",
        requer: { papeis: ["admin"] },
      },
    ],
  },
  {
    titulo: "Apoio",
    itens: [
      {
        chave: "suporte",
        rotulo: "Suporte",
        descricao: "Chamados e respostas da equipe",
        icone: "fa-headset",
        rota: "modulos/modulo_oficina/suporte/pages/suporte.html",
        requer: { papeis: "todos" },
      },
    ],
  },
  {
    titulo: "Plataforma",
    itens: [
      {
        chave: "adm-global",
        rotulo: "Painel SaaS",
        descricao: "Administração global",
        icone: "fa-crown",
        rota: "modulos/modulo_adm/pages/admin.html",
        requer: { staffOuSuper: true },
      },
    ],
  },
];

const MOBILE_BREAKPOINT = "(max-width: 900px)";


export class OficinaSidebar extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._mobile = window.matchMedia(MOBILE_BREAKPOINT);
    this._onMediaChange = this._onMediaChange.bind(this);
    this._onKeydown = this._onKeydown.bind(this);
  }

  async connectedCallback() {
    this.shadowRoot.innerHTML = this._estilo() + this._brand() + `<div class="loading">…</div>`;

    let perfil;
    try {
      perfil = await carregarPerfil();
    } catch {
      perfil = null;
    }

    if (!perfil) {
      redirecionarParaLogin();
      return;
    }

    let gate = null;
    try { gate = await obterGate(); } catch { gate = null; }

    this._render(perfil, gate);
    this._mobile.addEventListener("change", this._onMediaChange);
    document.addEventListener("keydown", this._onKeydown);
    this._sincronizarModo();
  }

  disconnectedCallback() {
    this._mobile.removeEventListener("change", this._onMediaChange);
    document.removeEventListener("keydown", this._onKeydown);
    this._removerHamburguer();
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  _render(perfil, gate = null) {
    const activePage = this.getAttribute("page");
    const isStaff = Boolean(perfil.user?.is_superuser || perfil.user?.is_staff);
    // Quando o gate bloqueia, só itens cuja `chave` está em pode_acessar
    // são exibidos. Staff/super passa por cima do gate.
    const aplicarGate = gate && !gate.vigente && !isStaff;
    const grupos = GRUPOS
      .map((g) => ({
        ...g,
        itens: g.itens.filter((i) => {
          if (!this._podeVer(i, perfil)) return false;
          if (aplicarGate && !podeExibirItemMenu(gate, i.chave)) return false;
          return true;
        }),
      }))
      .filter((g) => g.itens.length > 0);

    this.shadowRoot.innerHTML =
      this._estilo() +
      `<div class="overlay" part="overlay" aria-hidden="true"></div>` +
      `<aside class="sidebar" part="sidebar" role="navigation" aria-label="Menu principal">
         <button class="close-btn" type="button" aria-label="Fechar menu">
           <i class="fas fa-xmark" aria-hidden="true"></i>
         </button>
         ${this._brand()}
         ${this._nav(grupos, activePage)}
         ${this._rodape(perfil)}
       </aside>`;

    this._vincularEventos();
  }

  _podeVer(item, perfil) {
    if (item.requer?.staffOuSuper) {
      return Boolean(perfil.user?.is_superuser || perfil.user?.is_staff);
    }
    if (item.requer?.papeis === "todos") return true;
    return (item.requer?.papeis || []).includes(perfil.oficina_atual?.permissao);
  }

  _vincularEventos() {
    this.shadowRoot.querySelectorAll("nav a[data-rota]").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        redirecionarPara(link.dataset.rota);
      });
    });
    this.shadowRoot.querySelector(".overlay")?.addEventListener("click", () => this.close());
    this.shadowRoot.querySelector(".close-btn")?.addEventListener("click", () => this.close());
  }

  _brand() {
    return `
      <a class="brand" href="#" data-rota="modulos/modulo_oficina/dashboard/pages/dashboard.html"
         aria-label="Ir para o dashboard">
        <span class="brand-mark" aria-hidden="true">🔧</span>
        <span class="brand-name">Pit Stop</span>
      </a>
    `;
  }

  _nav(grupos, activePage) {
    const blocos = grupos.map((g) => `
      <div class="nav-group">
        <h2 class="nav-group-title">${g.titulo}</h2>
        <ul>
          ${g.itens.map((item) => `
            <li>
              <a href="#" data-rota="${item.rota}"
                 class="${item.chave === activePage ? "active" : ""}"
                 aria-current="${item.chave === activePage ? "page" : "false"}">
                <span class="icon" aria-hidden="true"><i class="fas ${item.icone}"></i></span>
                <span class="texts">
                  <span class="label">${item.rotulo}</span>
                  <small class="desc">${item.descricao}</small>
                </span>
              </a>
            </li>
          `).join("")}
        </ul>
      </div>
    `).join("");

    return `
      <nav>${blocos}</nav>
      <link rel="stylesheet"
            href="${new URL("../vendor/fontawesome/css/all.min.css", import.meta.url).href}">
    `;
  }

  _rodape(perfil) {
    const oficina = perfil?.oficina_atual?.nome || "—";
    return `
      <footer class="nav-foot">
        <div class="nav-foot-block">
          <i class="fas fa-store" aria-hidden="true"></i>
          <div>
            <small>Oficina ativa</small>
            <strong>${this._esc(oficina)}</strong>
          </div>
        </div>
        <small class="nav-foot-version">v1.0 · Pit Stop</small>
      </footer>
    `;
  }

  _esc(str) {
    if (!str) return "";
    return String(str).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[m]);
  }

  // -------------------------------------------------------------------------
  // Modo mobile (drawer)
  // -------------------------------------------------------------------------

  _onMediaChange() {
    this._sincronizarModo();
    if (!this._mobile.matches) this.close();
  }

  _sincronizarModo() {
    if (this._mobile.matches) {
      this._criarHamburguer();
      this.classList.add("is-mobile");
    } else {
      this._removerHamburguer();
      this.classList.remove("is-mobile", "is-open");
    }
  }

  _criarHamburguer() {
    if (document.getElementById("oficinaSidebarHamb")) return;
    const btn = document.createElement("button");
    btn.id = "oficinaSidebarHamb";
    btn.type = "button";
    btn.setAttribute("aria-label", "Abrir menu de navegação");
    btn.setAttribute("aria-controls", "oficina-sidebar");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = `
      <span class="hamb-icon" aria-hidden="true"><span></span><span></span><span></span></span>
      <span class="hamb-label">Menu</span>
    `;
    btn.className = "oficina-hamb-btn";
    btn.addEventListener("click", () => this.toggle());

    if (!document.getElementById("oficinaHambStyles")) {
      const style = document.createElement("style");
      style.id = "oficinaHambStyles";
      style.textContent = `
        .oficina-hamb-btn {
          position: fixed;
          top: 76px;
          left: 12px;
          height: 42px;
          padding: 0 0.9rem 0 0.65rem;
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          border-radius: 999px;
          border: 1px solid var(--border-medium, #cbd5e1);
          background: var(--bg-card, #ffffff);
          color: var(--text-primary, #0f172a);
          font-family: "Inter", "Segoe UI", Tahoma, sans-serif;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 6px 14px rgba(15, 23, 42, 0.12);
          z-index: 1200;
          transition: background 0.15s, border-color 0.15s, box-shadow 0.15s, color 0.15s;
        }
        .oficina-hamb-btn:hover,
        .oficina-hamb-btn:focus-visible {
          background: var(--color-primary, #2563eb);
          color: #ffffff;
          border-color: var(--color-primary, #2563eb);
          outline: none;
          box-shadow: 0 8px 18px rgba(37, 99, 235, 0.35);
        }
        .oficina-hamb-btn:hover .hamb-icon span,
        .oficina-hamb-btn:focus-visible .hamb-icon span { background: #ffffff; }
        .oficina-hamb-btn .hamb-icon {
          width: 22px; height: 18px; position: relative; display: inline-block;
        }
        .oficina-hamb-btn .hamb-icon span {
          position: absolute; left: 0; right: 0; height: 2px;
          background: currentColor; border-radius: 2px;
          transition: transform 0.25s ease, opacity 0.2s ease;
        }
        .oficina-hamb-btn .hamb-icon span:nth-child(1) { top: 1px; }
        .oficina-hamb-btn .hamb-icon span:nth-child(2) { top: 8px; }
        .oficina-hamb-btn .hamb-icon span:nth-child(3) { top: 15px; }
        .oficina-hamb-btn[aria-expanded="true"] .hamb-icon span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
        .oficina-hamb-btn[aria-expanded="true"] .hamb-icon span:nth-child(2) { opacity: 0; }
        .oficina-hamb-btn[aria-expanded="true"] .hamb-icon span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }
        .dark-mode .oficina-hamb-btn { background: #1e293b; color: #f1f5f9; border-color: #334155; }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(btn);
    this._hambBtn = btn;
  }

  _removerHamburguer() {
    if (this._hambBtn) { this._hambBtn.remove(); this._hambBtn = null; }
    else { document.getElementById("oficinaSidebarHamb")?.remove(); }
  }

  _onKeydown(e) {
    if (e.key === "Escape" && this.classList.contains("is-open")) this.close();
  }

  open() {
    this.classList.add("is-open");
    this._hambBtn?.setAttribute("aria-expanded", "true");
    this.shadowRoot.querySelector(".close-btn")?.focus();
  }

  close() {
    this.classList.remove("is-open");
    this._hambBtn?.setAttribute("aria-expanded", "false");
  }

  toggle() { this.classList.contains("is-open") ? this.close() : this.open(); }

  // -------------------------------------------------------------------------
  // Estilo (shadow DOM isolado)
  // -------------------------------------------------------------------------

  _estilo() {
    return `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          width: 260px;
          height: 100%;
          font-family: "Inter", "Segoe UI", Tahoma, sans-serif;
        }
        .sidebar {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100%;
          background-color: var(--bg-card, #ffffff);
          color: var(--text-primary, #0f172a);
          border-right: 1px solid var(--border-light, #e2e8f0);
        }
        .overlay { display: none; }
        .close-btn { display: none; }

        .brand {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 1.25rem 1.25rem 1rem;
          font-size: 1.2rem;
          font-weight: 800;
          color: var(--color-primary, #2563eb);
          text-decoration: none;
          border-bottom: 1px solid var(--border-light, #e2e8f0);
        }
        .brand-mark { font-size: 1.35rem; }
        .brand-name { letter-spacing: 0.4px; }

        nav {
          padding: 1rem 0.5rem;
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1.1rem;
        }
        .nav-group { display: flex; flex-direction: column; gap: 0.2rem; }
        .nav-group-title {
          margin: 0 0 0.2rem;
          padding: 0 0.85rem;
          font-size: 0.68rem;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          color: var(--text-muted, #94a3b8);
          font-weight: 700;
        }
        nav ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.15rem; }
        nav a {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          padding: 0.6rem 0.85rem;
          text-decoration: none;
          color: var(--text-secondary, #475569);
          border-radius: 0.6rem;
          font-weight: 500;
          transition: background 0.15s, color 0.15s;
          cursor: pointer;
          min-height: 52px;
        }
        nav a:hover, nav a:focus-visible {
          background-color: var(--bg-muted, #f1f5f9);
          color: var(--color-primary, #2563eb);
          outline: none;
        }
        nav a.active {
          background: linear-gradient(90deg, var(--color-primary-light, #eff6ff) 0%, transparent 100%);
          color: var(--color-primary, #2563eb);
          font-weight: 600;
          box-shadow: inset 3px 0 0 var(--color-primary, #2563eb);
        }
        nav a .icon {
          width: 32px; height: 32px;
          flex-shrink: 0;
          background: var(--bg-muted, #f1f5f9);
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--text-secondary, #475569);
          transition: all 0.15s;
        }
        nav a.active .icon,
        nav a:hover .icon,
        nav a:focus-visible .icon {
          background: var(--color-primary, #2563eb);
          color: #ffffff;
        }
        nav a .icon i { font-size: 0.95rem; }
        .texts { display: flex; flex-direction: column; line-height: 1.2; min-width: 0; }
        .texts .label { font-size: 0.92rem; }
        .texts .desc {
          font-size: 0.72rem;
          color: var(--text-muted, #94a3b8);
          font-weight: 500;
          margin-top: 0.1rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        nav a.active .desc { color: var(--text-secondary, #64748b); }

        .nav-foot {
          border-top: 1px solid var(--border-light, #e2e8f0);
          padding: 0.85rem 1rem;
          background: var(--bg-muted, #f8fafc);
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        .nav-foot-block {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }
        .nav-foot-block i {
          width: 32px; height: 32px;
          border-radius: 50%;
          background: var(--color-primary, #2563eb);
          color: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .nav-foot-block small {
          display: block;
          font-size: 0.7rem;
          color: var(--text-muted, #94a3b8);
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        .nav-foot-block strong {
          display: block;
          font-size: 0.85rem;
          color: var(--text-primary, #0f172a);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 180px;
        }
        .nav-foot-version {
          color: var(--text-muted, #94a3b8);
          font-size: 0.7rem;
          text-align: right;
        }

        .loading { padding: 2rem; text-align: center; color: var(--text-muted, #94a3b8); }

        /* --- Drawer mobile --- */
        :host(.is-mobile) {
          position: fixed;
          inset: 0 auto 0 0;
          z-index: 1100;
          width: 0;
        }
        :host(.is-mobile) .sidebar {
          position: fixed;
          top: 0; left: 0;
          height: 100vh;
          width: min(85vw, 320px);
          transform: translateX(-100%);
          transition: transform 0.28s ease;
          box-shadow: 4px 0 16px rgba(15, 23, 42, 0.18);
        }
        :host(.is-mobile) .overlay {
          display: block;
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.55);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease;
        }
        :host(.is-mobile) .close-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          position: absolute;
          top: 12px;
          right: 12px;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: none;
          background: var(--bg-muted, #f1f5f9);
          color: var(--text-secondary, #475569);
          cursor: pointer;
          font-size: 0.95rem;
          z-index: 5;
        }
        :host(.is-mobile) .close-btn:hover,
        :host(.is-mobile) .close-btn:focus-visible {
          background: var(--color-primary-light, #eff6ff);
          color: var(--color-primary, #2563eb);
          outline: none;
        }
        :host(.is-mobile.is-open) .sidebar { transform: translateX(0); }
        :host(.is-mobile.is-open) .overlay { opacity: 1; pointer-events: auto; }
      </style>
    `;
  }
}

if (!customElements.get("oficina-sidebar")) {
  customElements.define("oficina-sidebar", OficinaSidebar);
}
