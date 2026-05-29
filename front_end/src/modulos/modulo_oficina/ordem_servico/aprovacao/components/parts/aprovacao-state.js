// aprovacao-state.js
//
// Estado compartilhado da aba "Aprovação".
// pendingChanges agrupa as alterações que ainda não foram enviadas
// (mapa itemId → "aprovado" | "reprovado").

export const state = {
  currentOsId: null,
  pendingChanges: {},
};


/** Converte pendingChanges em payload aceito pelo back-end. */
export function pendingChangesParaPayload() {
  return Object.entries(state.pendingChanges).map(([id, status]) => ({
    id: parseInt(id, 10),
    status,
  }));
}


/** Limpa o estado de alterações pendentes. */
export function limparPendingChanges() {
  state.pendingChanges = {};
}


/** Escape mínimo de HTML para evitar render indevido em strings. */
export function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>]/g, (m) => {
    if (m === "&") return "&amp;";
    if (m === "<") return "&lt;";
    if (m === ">") return "&gt;";
    return m;
  });
}


/** Separa nome e descrição de um item (peças usam "Nome - Descrição"). */
export function extrairNomeEDescricao(item) {
  if (item.tipo === "peca") {
    const sep = " - ";
    const idx = item.nome_descricao.indexOf(sep);
    if (idx === -1) return { nome: item.nome_descricao, descricao: "" };
    return {
      nome: item.nome_descricao.substring(0, idx),
      descricao: item.nome_descricao.substring(idx + sep.length),
    };
  }
  return { nome: item.nome_descricao, descricao: "N/A" };
}
