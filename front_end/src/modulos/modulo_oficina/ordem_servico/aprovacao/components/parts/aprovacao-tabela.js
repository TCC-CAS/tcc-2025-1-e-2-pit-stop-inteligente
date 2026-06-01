// aprovacao-tabela.js
//
// Tabela principal da aba "Aprovação" — lista os itens do orçamento
// com seus status (aprovado / reprovado / pendente) em modo somente leitura.

import { DiagnosticoService } from "../../../diagnostico_orcamento/services/diagnostico-service.js";
import { escapeHtml, extrairNomeEDescricao, state } from "./aprovacao-state.js";
import "../../../../../../shared/components/status-badge.js";


export async function carregarTabelaAprovacao() {
  const tbody = document.getElementById("listaAprovacaoBody");
  if (!tbody) return;

  tbody.innerHTML =
    '<tr><td colspan="4" class="text-center">Carregando...</td></tr>';

  try {
    const itens = await DiagnosticoService.getItensOrcamento(state.currentOsId);
    renderizar(tbody, itens);
  } catch (error) {
    console.error(error);
    tbody.innerHTML =
      '<tr><td colspan="4" class="text-center" style="color:red;">Erro ao carregar itens.</td></tr>';
  }
}


function renderizar(tbody, itens) {
  tbody.innerHTML = "";

  if (itens.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="text-center">Nenhum item para aprovação.</td></tr>';
    return;
  }

  itens.forEach((item) => tbody.appendChild(linhaTabela(item)));
}


function linhaTabela(item) {
  const { nome, descricao } = extrairNomeEDescricao(item);
  const status = item.status_aprovacao || "pendente";

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${escapeHtml(nome)}</td>
    <td class="desc-col">${escapeHtml(descricao)}</td>
    <td>R$ ${parseFloat(item.valor_unitario).toFixed(2)}</td>
    <td><status-badge type="item" status="${status}" size="sm"></status-badge></td>
  `;
  return tr;
}
