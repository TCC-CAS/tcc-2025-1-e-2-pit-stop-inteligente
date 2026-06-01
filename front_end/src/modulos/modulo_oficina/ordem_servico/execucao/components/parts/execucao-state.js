// execucao-state.js
//
// Estado compartilhado da aba "Execução" + utilitário escapeHtml.

export const state = {
  currentOsId: null,
  todasTarefas: [],
  filtroAtual: "todas",
  funcionarios: [],   // cache da lista de funcionários ativos da oficina
};


export function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/[&<>]/g, (m) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
    return map[m] || m;
  });
}


/** Normaliza variantes 'em_execucao' / 'execucao' em uma única chave. */
export function normalizarStatus(status) {
  return status === "em_execucao" ? "execucao" : status;
}
