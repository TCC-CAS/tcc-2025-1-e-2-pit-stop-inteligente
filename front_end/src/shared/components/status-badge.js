// status-badge.js
//
// <status-badge type="os" status="execucao"></status-badge>
//
// Componente único de badge — centraliza cores, rótulos e ícones de TODO
// status mostrado na aplicação (OS, item de orçamento, tarefa, checklist).
// Evita o problema de cada aba "reinventar" o estilo do badge.
//
// Atributos:
//   - type   : "os" | "item" | "tarefa" | "checklist" | "generico"
//   - status : a chave do status (ex.: "pendente", "execucao", "aprovado"…)
//   - label  : opcional, sobrescreve o rótulo derivado do mapa
//   - size   : "sm" | "md" (default md)
//
// Reage a mudança de atributos em runtime via attributeChangedCallback.

const STATUS_MAP = {
  os: {
    pendente:  { label: "Pendente",     icon: "fa-hourglass-half", variant: "warning" },
    aguardando_aprovacao: { label: "Aguardando Aprovação", icon: "fa-user-clock", variant: "info" },
    aprovado:  { label: "Aprovado",     icon: "fa-thumbs-up",      variant: "success" },
    execucao:  { label: "Em Execução",  icon: "fa-wrench",         variant: "info" },
    concluido: { label: "Concluído",    icon: "fa-flag-checkered", variant: "success" },
    cancelado: { label: "Cancelado",    icon: "fa-ban",            variant: "danger"  },
  },
  item: {
    pendente:  { label: "Pendente",  icon: "fa-clock",      variant: "warning" },
    aprovado:  { label: "Aprovado",  icon: "fa-check",      variant: "success" },
    reprovado: { label: "Rejeitado", icon: "fa-times",      variant: "danger"  },
  },
  tarefa: {
    pendente:  { label: "Pendente",    icon: "fa-clock",   variant: "warning" },
    execucao:  { label: "Em Execução", icon: "fa-wrench",  variant: "info"    },
    concluido: { label: "Concluído",   icon: "fa-check",   variant: "success" },
  },
  checklist: {
    pendente:  { label: "Pendente",        icon: "fa-exclamation-circle", variant: "warning" },
    concluido: { label: "Concluído",       icon: "fa-clipboard-check",    variant: "success" },
    assinado:  { label: "Assinado",        icon: "fa-signature",          variant: "success" },
  },
  generico: {
    info:    { label: "Info",    icon: "fa-info-circle",       variant: "info"    },
    success: { label: "OK",      icon: "fa-check-circle",      variant: "success" },
    warning: { label: "Atenção", icon: "fa-exclamation-circle",variant: "warning" },
    danger:  { label: "Erro",    icon: "fa-times-circle",      variant: "danger"  },
  },
};


function resolveEntry(type, status) {
  const mapa = STATUS_MAP[type] || STATUS_MAP.generico;
  const chave = (status || "").toString().toLowerCase().trim();
  return (
    mapa[chave] ||
    STATUS_MAP.generico.info || { label: chave || "—", icon: "fa-circle", variant: "info" }
  );
}


export class StatusBadge extends HTMLElement {
  static get observedAttributes() {
    return ["type", "status", "label", "size"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this._render();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) this._render();
  }

  _render() {
    const type = (this.getAttribute("type") || "generico").toLowerCase();
    const status = (this.getAttribute("status") || "").toLowerCase();
    const labelOverride = this.getAttribute("label");
    const size = this.getAttribute("size") || "md";

    const entry = resolveEntry(type, status);
    const label = labelOverride || entry.label;

    this.shadowRoot.innerHTML = `
      <link rel="stylesheet"
            href="${new URL("../vendor/fontawesome/css/all.min.css", import.meta.url).href}">
      <style>
        :host { display: inline-flex; }
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 9999px;
          font-size: 0.78rem;
          font-weight: 600;
          line-height: 1;
          letter-spacing: 0.2px;
          white-space: nowrap;
          font-family: "Inter", "Segoe UI", Tahoma, sans-serif;
        }
        .badge.sm { padding: 2px 7px; font-size: 0.7rem; }
        .badge i  { font-size: 0.8em; }

        .badge.success { background: #dcfce7; color: #166534; }
        .badge.warning { background: #fef9c3; color: #854d0e; }
        .badge.danger  { background: #fee2e2; color: #991b1b; }
        .badge.info    { background: #e0f2fe; color: #075985; }
      </style>
      <span class="badge ${entry.variant} ${size}" role="status" aria-label="${label}">
        <i class="fas ${entry.icon}" aria-hidden="true"></i>
        <span>${label}</span>
      </span>
    `;
  }
}


if (!customElements.get("status-badge")) {
  customElements.define("status-badge", StatusBadge);
}

export { STATUS_MAP, resolveEntry };
