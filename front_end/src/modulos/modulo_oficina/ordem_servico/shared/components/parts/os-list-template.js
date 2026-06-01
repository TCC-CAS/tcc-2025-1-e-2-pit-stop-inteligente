// os-list-template.js
//
// Template (HTML + estilos) do shadow DOM do componente <os-list>.
// Redesenho moderno (cards mais leves, ícones consistentes, transições
// suaves) + atalhos rápidos no header (filtro rápido pelos status).

export const OS_LIST_STYLES = `
  <style>
    @import url('${new URL("../../../../../../shared/vendor/fontawesome/css/all.min.css", import.meta.url).href}');

    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      font-family: "Inter", "Segoe UI", Tahoma, sans-serif;
      background-color: #fff;
      color: #0f172a;
      /* Hint para o navegador otimizar transforms — evita repaint pesado
         quando o drawer abre/fecha em mobile. */
      will-change: transform;
    }

    /* ------------- Header ------------- */
    .header {
      padding: 14px 16px 10px;
      border-bottom: 1px solid #e2e8f0;
      background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .title {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .title i { color: #2563eb; font-size: 13px; }

    .btn-primary {
      background: #2563eb;
      color: #fff;
      border: none;
      padding: 7px 12px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      font-size: 12.5px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.18s ease, transform 0.12s ease, box-shadow 0.18s ease;
      box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
    }
    .btn-primary:hover {
      background: #1d4ed8;
      transform: translateY(-1px);
      box-shadow: 0 4px 10px rgba(37, 99, 235, 0.32);
    }
    .btn-primary:active { transform: translateY(0); }

    .search-wrap {
      position: relative;
    }
    .search-wrap i {
      position: absolute;
      left: 10px; top: 50%;
      transform: translateY(-50%);
      color: #94a3b8;
      font-size: 12px;
      pointer-events: none;
    }
    .search-box {
      width: 100%;
      padding: 8px 10px 8px 32px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      box-sizing: border-box;
      font-size: 13px;
      background: #fff;
      color: #0f172a;
      transition: border-color 0.18s, box-shadow 0.18s;
    }
    .search-box:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
    }

    /* Chips de filtro rápido (atalhos por status) */
    .quick-filters {
      display: flex;
      gap: 5px;
      flex-wrap: wrap;
    }
    .quick-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 9px;
      font-size: 11.5px;
      font-weight: 600;
      border: 1px solid #e2e8f0;
      background: #fff;
      color: #475569;
      border-radius: 9999px;
      cursor: pointer;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    .quick-chip:hover { background: #f1f5f9; }
    .quick-chip.active {
      background: #2563eb;
      color: #fff;
      border-color: #2563eb;
    }
    .quick-chip i { font-size: 10px; }
    .quick-chip[data-quick-status="pendente"] i { color: #f59e0b; }
    .quick-chip[data-quick-status="execucao"] i { color: #0ea5e9; }
    .quick-chip[data-quick-status="concluido"] i { color: #22c55e; }
    .quick-chip.active i { color: #fff !important; }

    .actions-row {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .btn-icon {
      flex-shrink: 0;
      width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
      border: 1px solid #cbd5e1;
      background: #fff;
      border-radius: 8px;
      cursor: pointer;
      color: #475569;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    .btn-icon:hover { background: #f1f5f9; color: #0f172a; border-color: #94a3b8; }
    .btn-icon i { font-size: 12px; transition: transform 0.4s ease; }

    /* ------------- Lista ------------- */
    .list {
      flex: 1;
      overflow-y: auto;
      padding: 10px 12px 16px;
      background: #fff;
      /* Aceleração de scroll em mobile + reduz jank durante o filtro */
      -webkit-overflow-scrolling: touch;
      scroll-behavior: smooth;
      contain: layout paint;
    }
    .list::-webkit-scrollbar { width: 6px; }
    .list::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 6px;
    }

    .loading, .error-message, .empty-message {
      padding: 28px 16px;
      text-align: center;
      color: #64748b;
      font-size: 13px;
    }
    .error-message { color: #b91c1c; }
    .empty-message i {
      display: block;
      font-size: 28px;
      color: #cbd5e1;
      margin-bottom: 8px;
    }

    .os-card {
      position: relative;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 11px 36px 11px 12px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: transform 0.16s ease, box-shadow 0.16s ease,
                  border-color 0.16s ease, background 0.16s ease;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
      border-left: 4px solid #cbd5e1;
      contain: layout style paint;
    }
    .os-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 14px rgba(15, 23, 42, 0.10);
      border-color: #94a3b8;
    }
    .os-card.selected {
      background: linear-gradient(180deg, #eff6ff 0%, #ffffff 100%);
      border-left-color: #2563eb;
      box-shadow: 0 4px 10px rgba(37, 99, 235, 0.16);
    }
    .os-card[data-status="pendente"]  { border-left-color: #f59e0b; }
    .os-card[data-status="execucao"]  { border-left-color: #0ea5e9; }
    .os-card[data-status="concluido"] { border-left-color: #22c55e; }

    .os-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 5px;
      gap: 8px;
    }
    .os-id {
      font-weight: 700;
      color: #0f172a;
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 70%;
    }
    .os-id i { color: #94a3b8; margin-right: 4px; font-size: 11px; }

    .os-info strong {
      display: block;
      color: #0f172a;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .os-info span {
      color: #64748b;
      font-size: 11.5px;
      letter-spacing: 0.2px;
    }
    .os-client {
      margin-top: 5px;
      font-size: 11.5px;
      color: #475569;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .os-client i { color: #94a3b8; font-size: 10px; }

    .delete-os-btn {
      position: absolute;
      top: 6px;
      right: 6px;
      background: transparent;
      border: none;
      color: #cbd5e1;
      cursor: pointer;
      font-size: 12px;
      padding: 6px;
      border-radius: 6px;
      transition: color 0.15s, background 0.15s;
      z-index: 2;
    }
    .delete-os-btn:hover {
      color: #dc2626;
      background: #fee2e2;
    }

    @media (max-width: 400px) {
      .os-card { padding-right: 30px; }
      .os-id { max-width: 60%; }
    }
  </style>
`;


export const OS_LIST_TEMPLATE = `
  <div class="header">
    <div class="title-row">
      <span class="title"><i class="fas fa-clipboard-list"></i> Ordens de Serviço</span>
      <button id="btnNovaOS" class="btn-primary" type="button">
        <i class="fas fa-plus"></i> Nova
      </button>
    </div>

    <div class="search-wrap">
      <i class="fas fa-magnifying-glass"></i>
      <input type="text" id="searchOS" class="search-box" placeholder="Buscar placa ou cliente...">
    </div>

    <!-- Atalhos rápidos por status -->
    <div class="quick-filters" role="tablist" aria-label="Filtrar por status">
      <button type="button" class="quick-chip active" data-quick-status="todos">
        Todas
      </button>
      <button type="button" class="quick-chip" data-quick-status="pendente">
        <i class="fas fa-clock"></i> Pendentes
      </button>
      <button type="button" class="quick-chip" data-quick-status="execucao">
        <i class="fas fa-gears"></i> Em execução
      </button>
      <button type="button" class="quick-chip" data-quick-status="concluido">
        <i class="fas fa-circle-check"></i> Concluídas
      </button>
    </div>

    <div class="actions-row">
      <select id="filterStatus" class="filter-select" style="display: none;">
        <option value="todos">Todos</option>
        <option value="pendente">Pendente</option>
        <option value="execucao">Em Execução</option>
        <option value="concluido">Concluído</option>
      </select>
      <button id="btnRefresh" class="btn-icon" title="Atualizar lista" type="button">
        <i class="fas fa-rotate"></i>
      </button>
    </div>
  </div>
  <div class="list">
    <div class="loading">
      <i class="fas fa-spinner fa-spin"></i> Carregando...
    </div>
  </div>
`;
