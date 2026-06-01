// os-visao-geral.js
//
// Ponto de entrada da página "Visão Geral da OS". Mantém apenas a
// inicialização e a amarração entre os módulos. Todas as responsabilidades
// específicas vivem em ./parts/*:
//
//   visao-utils.js              — helpers (CPF/CNPJ, dígitos)
//   visao-autocomplete.js       — autocomplete de cliente e veículo no modal
//   visao-tabs-loader.js        — lazy-load das abas (HTML + JS + init)
//   visao-os-current.js         — estado da OS selecionada (header, lifecycle)
//   visao-nova-os.js            — modal de criação de OS

import { garantirAcesso } from "../../../../../shared/services/auth-guard.js";
import { configurarAutocompleteCliente, configurarAutocompleteVeiculo } from "./parts/visao-autocomplete.js";
import { carregarAba } from "./parts/visao-tabs-loader.js";
import {
  carregarOsPorParametroDaUrl,
  configurarSelecaoOS,
  mostrarMensagemNenhumaOS,
} from "./parts/visao-os-current.js";
import { configurarNovaOS } from "./parts/visao-nova-os.js";
import {
  configurarChipsStatus,
  configurarDrawerListaOS,
} from "./parts/visao-status-filter.js";
import { configurarBotaoCodigoAcesso } from "./parts/visao-codigo-acesso.js";
import { gerarRelatorioPDF, imprimirRelatorio } from "./parts/visao-relatorio-pdf.js";


document.addEventListener("DOMContentLoaded", async () => {
  if (!(await garantirAcesso({ paginaChave: "operacoes" }))) return;

  const tabsComponent = document.querySelector("oficina-tabs");
  const modalNovaOS = document.getElementById("modalNovaOS");
  const osList = document.querySelector("os-list");

  // Autocompletes do modal de Nova OS
  configurarAutocompleteCliente();
  configurarAutocompleteVeiculo();

  // Chips de status + drawer da lista de OS (responsivo)
  configurarChipsStatus({
    osList,
    chipsContainer: document.getElementById("statusChips"),
  });
  configurarDrawerListaOS();

  // Lifecycle da OS selecionada (lista + URL)
  configurarSelecaoOS({ osList, tabsComponent, modalNovaOS });
  carregarOsPorParametroDaUrl();

  // Mudança de aba a partir do componente <oficina-tabs>
  tabsComponent?.addEventListener("os:tab-change", (e) =>
    carregarAba(e.detail.targetId, {
      tabsComponent,
      osId: window.osSelecionadoId,
      onEmpty: () => mostrarMensagemNenhumaOS({ tabsComponent, modalNovaOS }),
    }),
  );

  // Estado inicial: aba checklist se já houver OS, empty state caso contrário
  if (window.osSelecionadoId) {
    carregarAba("checklist", {
      tabsComponent,
      osId: window.osSelecionadoId,
      onEmpty: () => mostrarMensagemNenhumaOS({ tabsComponent, modalNovaOS }),
    });
  } else {
    mostrarMensagemNenhumaOS({ tabsComponent, modalNovaOS });
  }

  // Criação de nova OS
  configurarNovaOS({ modalNovaOS, osList });

  // Relatório: imprimir + baixar PDF
  document
    .getElementById("btnImprimirOS")
    ?.addEventListener("click", () => imprimirRelatorio(window.osSelecionadoId));
  document
    .getElementById("btnBaixarPdfOS")
    ?.addEventListener("click", () => gerarRelatorioPDF(window.osSelecionadoId));

  // Código de acesso para o cliente
  configurarBotaoCodigoAcesso();
});
