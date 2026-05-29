// diagnostico-table.js
//
// Renderização da tabela de itens do orçamento. Responsável por:
//  - inicializar o seletor de filtros (Todos / Peças / Serviços);
//  - recarregar do servidor e aplicar o filtro atual;
//  - exibir as linhas formatadas com totais.
// As ações (editar/excluir) emitem callbacks para serem tratadas no entry.

import { DiagnosticoService } from "../../services/diagnostico-service.js";
import { escapeHtml, state } from "./diagnostico-state.js";


export function initFiltros(onChange) {
  const tabs = document.querySelectorAll(".filter-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      state.filtroAtual = tab.dataset.filter;
      onChange?.();
    });
  });
}


export async function recarregarTabela({ onEditar, onDeletar }) {
  const tbody = document.getElementById("listaItensBody");
  if (!tbody) return;

  tbody.innerHTML =
    '<tr><td colspan="7" style="text-align:center;">Carregando...</td></tr>';

  try {
    state.todosItens = await DiagnosticoService.getItensOrcamento(state.currentOsId);
    aplicarFiltroERenderizar({ onEditar, onDeletar });
  } catch (error) {
    console.error("Erro ao carregar itens:", error);
    tbody.innerHTML =
      '<tr><td colspan="7" style="color:red;">Erro ao carregar itens. Verifique o console.</td></tr>';
  }
}


export function aplicarFiltroERenderizar({ onEditar, onDeletar }) {
  const itens =
    state.filtroAtual === "todos"
      ? state.todosItens
      : state.todosItens.filter((item) => item.tipo === state.filtroAtual);
  renderizarTabela(itens, { onEditar, onDeletar });
}


function renderizarTabela(itens, { onEditar, onDeletar }) {
  const tbody = document.getElementById("listaItensBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (itens.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align:center;">Nenhum item encontrado.</td></tr>';
    document.getElementById("totalGeralOrcamento").innerText = "R$ 0,00";
    return;
  }

  let totalExibido = 0;
  itens.forEach((item) => {
    const valorUnit = parseFloat(item.valor_unitario) || 0;
    const quantidade = item.tipo === "peca" ? parseInt(item.quantidade) || 1 : 1;
    const totalItem = valorUnit * quantidade;
    totalExibido += totalItem;

    tbody.appendChild(montarLinha(item, valorUnit, quantidade, totalItem));
  });

  document.getElementById("totalGeralOrcamento").innerText =
    `R$ ${totalExibido.toFixed(2)}`;

  vincularBotoes(tbody, { onEditar, onDeletar });
}


function montarLinha(item, valorUnit, quantidade, totalItem) {
  const tipoBadge =
    item.tipo === "peca"
      ? '<span class="badge badge-info">Peça</span>'
      : '<span class="badge badge-warning">Serviço</span>';

  const { nome, descricao, qtdDetalhe } = extrairCampos(item, quantidade);
  const descricaoDisplay = truncar(descricao, 60);
  const tooltip = descricao ? ` title="${escapeHtml(descricao)}"` : "";

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${tipoBadge}</td>
    <td class="nome-item">${escapeHtml(nome)}</td>
    <td class="descricao-item"${tooltip}>${escapeHtml(descricaoDisplay)}</td>
    <td>${escapeHtml(qtdDetalhe)}</td>
    <td>R$ ${valorUnit.toFixed(2)}</td>
    <td><strong>R$ ${totalItem.toFixed(2)}</strong></td>
    <td class="actions-cell">
      <button class="btn-icon btn-edit" data-id="${item.id}" title="Editar item">
        <i class="fas fa-pencil-alt"></i><span class="btn-text">Editar</span>
      </button>
      <button class="btn-icon btn-delete" data-id="${item.id}" title="Remover item">
        <i class="fas fa-trash"></i><span class="btn-text">Excluir</span>
      </button>
    </td>
  `;
  return tr;
}


function extrairCampos(item, quantidade) {
  if (item.tipo === "peca") {
    const sep = " - ";
    const idx = item.nome_descricao.indexOf(sep);
    const nome = idx !== -1 ? item.nome_descricao.substring(0, idx) : item.nome_descricao;
    const descricao = idx !== -1 ? item.nome_descricao.substring(idx + sep.length) : "";
    return { nome, descricao, qtdDetalhe: `${quantidade}x` };
  }
  return {
    nome: item.nome_descricao,
    descricao: "",
    qtdDetalhe: item.categoria_veiculo || "-",
  };
}


function truncar(texto, max) {
  if (!texto || texto.length <= max) return texto;
  return texto.substring(0, max) + "...";
}


function vincularBotoes(scope, { onEditar, onDeletar }) {
  scope.querySelectorAll(".btn-edit").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onEditar?.(btn.dataset.id);
    });
  });
  scope.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onDeletar?.(btn.dataset.id);
    });
  });
}
