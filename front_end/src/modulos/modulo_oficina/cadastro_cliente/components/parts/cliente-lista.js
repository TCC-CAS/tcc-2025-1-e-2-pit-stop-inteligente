// cliente-lista.js
//
// Renderização da lista lateral de clientes (com busca/filtro).
// Recebe callbacks para selecionar e excluir um cliente, mantendo
// a tela principal desacoplada das ações.

import { ClienteService } from "../../services/cliente-service.js";
import { state } from "./cliente-state.js";


/** Carrega todos os clientes do back-end e renderiza. */
export async function carregarListaClientes(callbacks) {
  renderizarLoading();
  state.clientes = await ClienteService.buscarTodos();
  renderizarLista(state.clientes, callbacks);
}


/** Aplica filtro de busca em memória sobre `state.clientes`. */
export function configurarBuscaCliente(callbacks) {
  const inputSearch = document.getElementById("searchClient");
  if (!inputSearch) return;

  inputSearch.addEventListener("input", () => {
    const termo = inputSearch.value.toLowerCase();
    const filtrados = state.clientes.filter(
      (c) =>
        c.nome.toLowerCase().includes(termo) ||
        (c.cpf_cnpj && c.cpf_cnpj.includes(termo)) ||
        (c.telefone && c.telefone.includes(termo)),
    );
    renderizarLista(filtrados, callbacks);
  });
}


function renderizarLoading() {
  const container = document.getElementById("listaClientes");
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <p>Atualizando lista...</p>
    </div>`;
}


function renderizarLista(lista, callbacks) {
  const container = document.getElementById("listaClientes");
  const total = document.getElementById("totalClientes");
  if (!container) return;

  container.innerHTML = "";
  if (total) total.textContent = lista.length;

  if (lista.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-inbox" aria-hidden="true"></i>
        <p>Nenhum cliente encontrado.</p>
      </div>`;
    return;
  }

  lista.forEach((cliente) => container.appendChild(montarCard(cliente, callbacks)));
}


function montarCard(cliente, { onSelecionar, onExcluir }) {
  const card = document.createElement("div");
  card.className = "client-card";
  card.innerHTML = `
    <div class="client-info">
      <h4>${cliente.nome}</h4>
      <p><i class="fas fa-id-card" aria-hidden="true"></i> ${cliente.cpf_cnpj || "-"}</p>
      <p><i class="fas fa-phone" aria-hidden="true"></i> ${cliente.telefone || "-"}</p>
    </div>
    <div class="client-actions">
      <button class="btn-icon-danger" title="Excluir" aria-label="Excluir cliente ${cliente.nome}">
        <i class="fas fa-trash" aria-hidden="true"></i>
      </button>
    </div>
  `;

  card.addEventListener("click", () => onSelecionar?.(cliente));
  card
    .querySelector(".btn-icon-danger")
    .addEventListener("click", (e) => onExcluir?.(cliente.id, e));

  return card;
}
