// diagnostico-state.js
//
// Estado compartilhado pelos módulos da aba "Diagnóstico / Orçamento".
// Importadores devem mutar via referências (ex.: state.currentOsId = 42).
// Inclui também utilitário puro escapeHtml usado em vários lugares.

export const state = {
  currentOsId: null,
  editandoItemId: null,
  todosItens: [],
  filtroAtual: "todos",

  // Dados auxiliares carregados do back-end (catálogo + config)
  servicosCadastrados: [],
  categoriasCadastradas: [],
  valorHoraAtivo: 0,
  servicoSelecionadoTempo: 0,
};


/** Escape mínimo de HTML para evitar quebra/render indevido em strings. */
export function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>]/g, (m) => {
    if (m === "&") return "&amp;";
    if (m === "<") return "&lt;";
    if (m === ">") return "&gt;";
    return m;
  });
}
