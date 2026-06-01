// aprovacao-tab.js
//
// Ponto de entrada da aba "Aprovação". Mantém apenas a orquestração:
//
//   aprovacao-state.js   — currentOsId, pendingChanges + utilitários
//   aprovacao-tabela.js  — tabela principal (modo leitura)
//   aprovacao-modal.js   — modal "Gerenciar Aprovação" (item-a-item)
//   aprovacao-pdf.js     — exportar modal para PDF

import { apiUrl, getCsrfToken } from "../../../../../shared/config/api-config.js";

import { abrirModalAprovacao, fecharModalAprovacao } from "./parts/aprovacao-modal.js";
import { configurarExportacaoPDF } from "./parts/aprovacao-pdf.js";
import { carregarTabelaAprovacao } from "./parts/aprovacao-tabela.js";
import {
  limparPendingChanges,
  pendingChangesParaPayload,
  state,
} from "./parts/aprovacao-state.js";


export function initAprovacao(osId) {
  state.currentOsId = osId;
  if (!osId) return;

  carregarTabelaAprovacao();
  configurarExportacaoPDF();

  document
    .getElementById("btnGerenciarAprovacao")
    ?.addEventListener("click", () => abrirModalAprovacao(aprovarTodosItens));
}


async function aprovarTodosItens() {
  const updates = pendingChangesParaPayload();
  if (updates.length === 0) {
    alert("Nenhuma alteração pendente para aprovar.");
    return;
  }

  try {
    const response = await fetch(apiUrl(`/os/${state.currentOsId}/aprovacao/`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCsrfToken(),
      },
      credentials: "include",
      body: JSON.stringify({ itens: updates, termo_aceito: true }),
    });

    if (!response.ok) {
      const erro = await response.json().catch(() => ({}));
      throw new Error(erro.erro || "Erro ao aprovar.");
    }

    alert("Orçamento aprovado com sucesso!");
    limparPendingChanges();
    fecharModalAprovacao();
    await carregarTabelaAprovacao();
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}
