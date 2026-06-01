// cadastro-cliente.js
//
// Ponto de entrada da tela "Cadastro de Clientes". Mantém apenas a
// orquestração entre os módulos de ./parts/*:
//
//   cliente-state.js        — state compartilhado (lista + selecionado)
//   cliente-toast.js        — notificações
//   cliente-mascaras.js     — máscaras (CPF/CNPJ, telefone, CEP)
//   cliente-lista.js        — lista lateral + busca
//   cliente-formulario.js   — formulário (criar/editar/excluir, CEP)
//   cliente-veiculos.js     — aba Veículos com histórico de OS

import { state } from "./parts/cliente-state.js";
import { aplicarMascarasFormCliente } from "./parts/cliente-mascaras.js";
import {
  carregarListaClientes,
  configurarBuscaCliente,
} from "./parts/cliente-lista.js";
import {
  carregarNoFormulario,
  configurarFormularioCliente,
  deletarCliente,
} from "./parts/cliente-formulario.js";
import { carregarVeiculosDoCliente } from "./parts/cliente-veiculos.js";
import { carregarHistoricoDoCliente } from "./parts/cliente-historico.js";
import { configurarBotaoNovoVeiculo } from "./parts/cliente-veiculo-form.js";
import { atualizarChipCompletude } from "./parts/cliente-completude.js";
import { carregarManutencaoDoCliente } from "./parts/cliente-manutencao.js";
import "../../../../shared/services/os-deep-link.js";
import { garantirAcesso } from "../../../../shared/services/auth-guard.js";


document.addEventListener("DOMContentLoaded", async () => {
  // Paywall: exige assinatura vigente. Guard redireciona automaticamente
  // para a aba "Renovação de Plano" quando bloqueado.
  if (!(await garantirAcesso({ paginaChave: "clientes" }))) return;

  const callbacks = {
    onSelecionar: selecionarCliente,
    onExcluir: (id, e) => deletarCliente(id, e, recarregar),
  };

  configurarFormularioCliente({
    aposSalvar: recarregar,
    aposExcluir: recarregar,
  });
  configurarBuscaCliente(callbacks);
  configurarBotaoNovoVeiculo();
  setupTabs();
  aplicarMascarasFormCliente();

  recarregar();

  function recarregar() {
    return carregarListaClientes(callbacks);
  }
});


function selecionarCliente(cliente) {
  state.selectedClientId = cliente.id;
  carregarNoFormulario(cliente);
  atualizarChipCompletude(cliente);

  // Habilita botões dependentes da seleção
  document.getElementById("btnNovoVeiculo")?.removeAttribute("disabled");

  // Sempre recarrega contadores (mesmo se outra aba estiver ativa)
  carregarVeiculosDoCliente(cliente.id);
  carregarHistoricoDoCliente(cliente.id);
}


function setupTabs() {
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;

      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      tabContents.forEach((c) => c.classList.remove("active"));
      document.getElementById(`tab-${target}`)?.classList.add("active");

      if (state.selectedClientId) {
        if (target === "veiculos") carregarVeiculosDoCliente(state.selectedClientId);
        if (target === "historico") carregarHistoricoDoCliente(state.selectedClientId);
        if (target === "manutencao") carregarManutencaoDoCliente(state.selectedClientId);
      }
    });
  });
}
