// dashboard-state.js
//
// Estado compartilhado do Dashboard Gerencial.
// Substitui o mock anterior por um payload real vindo de /api/oficina/dashboard/.

export const state = {
  // Filtros aplicados pelo usuário
  filtros: {
    periodo: 30,         // dias
    dataInicio: null,    // ISO yyyy-mm-dd quando periodo === "custom"
    dataFim: null,
  },

  // Último payload carregado do back-end (estrutura ver dashboard_service.py)
  dashboard: null,

  // Último resultado do botão "Gerar Análise" (insights interpretados)
  analise: null,

  // Cache de instâncias do Chart.js (para destruir antes de re-renderizar)
  charts: {},
};


/** Aplica um filtro pontual e retorna o estado atualizado. */
export function setFiltro(chave, valor) {
  state.filtros[chave] = valor;
}
