// diagnostico-tab.js
//
// Ponto de entrada da aba "Diagnóstico / Orçamento". Mantém apenas:
//  - inicialização (initDiagnostico) + carga de dados auxiliares (catálogo);
//  - amarração entre tabela, modal e ações.
// Toda a lógica vive em ./parts/* (state, table, modal, actions).

import { DiagnosticoService } from "../services/diagnostico-service.js";

import { state } from "./parts/diagnostico-state.js";
import {
  aplicarFiltroERenderizar,
  initFiltros,
  recarregarTabela,
} from "./parts/diagnostico-table.js";
import { abrirModalItem } from "./parts/diagnostico-modal.js";
import {
  deletarItem,
  editarItem,
  enviarParaAprovacao,
  gerarPDF,
  salvarItem,
} from "./parts/diagnostico-actions.js";


// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export async function initDiagnostico(osId) {
  state.currentOsId = osId;
  if (!osId) {
    console.warn("Nenhuma OS selecionada para diagnóstico.");
    return;
  }

  document.getElementById("btnNovoItem")?.addEventListener("click", () => abrir());
  document
    .getElementById("btnEnviarAprovacao")
    ?.addEventListener("click", enviarParaAprovacao);
  document.getElementById("btnGerarPDF")?.addEventListener("click", gerarPDF);

  initFiltros(() => aplicarFiltroERenderizar(callbacksTabela()));

  await carregarDadosAutocomplete();
  await recarregarTabela(callbacksTabela());
}


// ---------------------------------------------------------------------------
// Orquestração interna
// ---------------------------------------------------------------------------

function callbacksTabela() {
  return {
    onEditar: (id) => editarItem(id, abrir),
    onDeletar: (id) => deletarItem(id, () => recarregarTabela(callbacksTabela())),
  };
}


function abrir(itemData = null) {
  abrirModalItem(itemData, () =>
    salvarItem({
      aoFinalizar: () => recarregarTabela(callbacksTabela()),
    }),
  );
}


async function carregarDadosAutocomplete() {
  try {
    const [servicos, categorias, config] = await Promise.all([
      DiagnosticoService.getServicos(),
      DiagnosticoService.getCategorias(),
      DiagnosticoService.getConfiguracao(),
    ]);
    state.servicosCadastrados = servicos;
    state.categoriasCadastradas = categorias;
    state.valorHoraAtivo = config.valor_hora || 0;
  } catch (error) {
    console.error("Erro ao carregar dados para autocomplete:", error);
  }
}
