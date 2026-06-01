// diagnostico-modal.js
//
// Modal de adicionar/editar item do orçamento. Cuida de:
//  - clonar o template para o slot do modal;
//  - alternar entre as abas Peça / Serviço;
//  - aplicar máscaras (monetário, inteiro);
//  - autocomplete de serviços + cálculo de preço a partir de tempo × valor-hora × percentual da categoria.
// O salvamento em si vive em diagnostico-actions.js.

import { escapeHtml, state } from "./diagnostico-state.js";


/** Abre o modal preenchido para criação ou edição. */
export function abrirModalItem(itemData, onSalvar) {
  const modal = document.getElementById("modalNovoItem");
  if (!modal) {
    console.error("Modal de novo item não encontrada.");
    return;
  }

  const temp = document.getElementById("tmplModalItem");
  const bodySlot = modal.querySelector('[slot="body"]');
  if (!temp || !bodySlot) {
    console.error("Template ou slot do modal não encontrados.");
    return;
  }
  bodySlot.innerHTML = "";
  bodySlot.appendChild(temp.content.cloneNode(true));

  aplicarMascaras();
  configurarAbas();

  if (itemData) {
    state.editandoItemId = itemData.id;
    preencherCamposEdicao(itemData);
    modal.querySelector('[slot="title"]').innerText = "Editar Item";
  } else {
    state.editandoItemId = null;
    modal.querySelector('[slot="title"]').innerText = "Adicionar Item ao Orçamento";
    resetarCamposNovo();
  }

  configurarAutocompleteServico();

  // Evita listeners duplicados ao reabrir o modal
  const btnSalvar = document.getElementById("btnSalvarItemModal");
  btnSalvar.replaceWith(btnSalvar.cloneNode(true));
  document
    .getElementById("btnSalvarItemModal")
    .addEventListener("click", onSalvar);

  modal.open();
}


// ---------------------------------------------------------------------------
// Abas (Peça / Serviço)
// ---------------------------------------------------------------------------

function configurarAbas() {
  const tabs = document.querySelectorAll(".modal-tab");
  tabs.forEach((tab) => {
    tab.removeEventListener("click", tab._handler);
    const handler = (e) => {
      const tipo = e.currentTarget.dataset.type;
      tabs.forEach((t) => t.classList.remove("active"));
      e.currentTarget.classList.add("active");
      alternarCampos(tipo);
    };
    tab._handler = handler;
    tab.addEventListener("click", handler);
  });
}


function alternarCampos(tipo) {
  const camposPeca = document.getElementById("camposPeca");
  const camposServico = document.getElementById("camposServico");
  document.getElementById("itemTipo").value = tipo;

  if (tipo === "peca") {
    camposPeca.classList.remove("hidden");
    camposServico.classList.add("hidden");
  } else {
    camposPeca.classList.add("hidden");
    camposServico.classList.remove("hidden");
  }
}


function ativarAba(tipo) {
  const tab = document.querySelector(`.modal-tab[data-type="${tipo}"]`);
  if (tab) tab.click();
  else alternarCampos(tipo);
}


// ---------------------------------------------------------------------------
// Preenchimento dos campos
// ---------------------------------------------------------------------------

function preencherCamposEdicao(item) {
  ativarAba(item.tipo);

  if (item.tipo === "peca") {
    const partes = item.nome_descricao.includes(" - ")
      ? item.nome_descricao.split(" - ")
      : [item.nome_descricao];
    const nome = partes[0];
    const descricao = partes.slice(1).join(" - ");

    document.getElementById("pecaNome").value = nome;
    document.getElementById("pecaDescricao").value = descricao;
    document.getElementById("pecaQtd").value = item.quantidade;
    const valor = parseFloat(item.valor_unitario) || 0;
    document.getElementById("pecaValor").value = valor.toFixed(2).replace(".", ",");
  } else {
    document.getElementById("servicoDescricao").value = item.nome_descricao;
    document.getElementById("servicoDificuldade").value =
      item.dificuldade || "Carros Populares";
    const valor = parseFloat(item.valor_unitario) || 0;
    document.getElementById("servicoPreco").value = valor.toFixed(2).replace(".", ",");

    const servico = state.servicosCadastrados.find(
      (s) => s.nome === item.nome_descricao,
    );
    state.servicoSelecionadoTempo = servico ? parseFloat(servico.tempo) || 0 : 0;
  }
}


function resetarCamposNovo() {
  document.getElementById("pecaNome").value = "";
  document.getElementById("pecaDescricao").value = "";
  document.getElementById("pecaQtd").value = "1";
  document.getElementById("pecaValor").value = "";
  document.getElementById("servicoDescricao").value = "";
  document.getElementById("servicoDificuldade").value = "Carros Populares";
  document.getElementById("servicoPreco").value = "";
  ativarAba("peca");
}


// ---------------------------------------------------------------------------
// Máscaras
// ---------------------------------------------------------------------------

function aplicarMascaras() {
  document.querySelectorAll(".monetario").forEach((input) => {
    input.removeEventListener("input", input._maskMonetarioHandler);
    const handler = (e) => {
      let value = e.target.value.replace(/\D/g, "");
      if (value === "") value = "0";
      e.target.value = (parseInt(value) / 100).toFixed(2).replace(".", ",");
    };
    input._maskMonetarioHandler = handler;
    input.addEventListener("input", handler);
  });

  document.querySelectorAll(".numero-inteiro").forEach((input) => {
    input.removeEventListener("input", input._maskInteiroHandler);
    const handler = (e) => {
      e.target.value = e.target.value.replace(/\D/g, "");
    };
    input._maskInteiroHandler = handler;
    input.addEventListener("input", handler);
  });
}


// ---------------------------------------------------------------------------
// Autocomplete + cálculo de preço
// ---------------------------------------------------------------------------

function configurarAutocompleteServico() {
  const inputDesc = document.getElementById("servicoDescricao");
  const selectCat = document.getElementById("servicoDificuldade");
  if (!inputDesc || !selectCat) return;

  popularCategorias(selectCat);
  const ulSugestoes = garantirContainerSugestoes(inputDesc);

  inputDesc.addEventListener("input", (e) => {
    const termo = e.target.value.toLowerCase();
    state.servicoSelecionadoTempo = 0;
    renderizarSugestoes(ulSugestoes, inputDesc, termo);
  });

  document.addEventListener("click", (e) => {
    if (e.target !== inputDesc && !ulSugestoes.contains(e.target)) {
      ulSugestoes.style.display = "none";
    }
  });

  selectCat.addEventListener("change", calcularPrecoServico);
}


function popularCategorias(selectEl) {
  if (state.categoriasCadastradas.length === 0) return;
  selectEl.innerHTML = state.categoriasCadastradas
    .map((c) => `<option value="${c.nome}">${c.nome}</option>`)
    .join("");
}


function garantirContainerSugestoes(inputEl) {
  let ul = document.getElementById("sugestoesServico");
  if (ul) return ul;

  ul = document.createElement("ul");
  ul.id = "sugestoesServico";
  ul.style.cssText = `
    position: absolute; background: #fff; border: 1px solid #ccc;
    border-radius: 4px; width: 100%; max-height: 150px; overflow-y: auto;
    list-style: none; padding: 0; margin: 0; z-index: 1000;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1); display: none;
  `;
  inputEl.parentNode.style.position = "relative";
  inputEl.parentNode.appendChild(ul);
  inputEl.setAttribute("autocomplete", "off");
  return ul;
}


function renderizarSugestoes(ulEl, inputEl, termo) {
  ulEl.innerHTML = "";
  if (termo.length < 2) {
    ulEl.style.display = "none";
    return;
  }

  const filtrados = state.servicosCadastrados.filter((s) =>
    s.nome.toLowerCase().includes(termo),
  );
  if (filtrados.length === 0) {
    ulEl.style.display = "none";
    return;
  }

  ulEl.style.display = "block";
  filtrados.forEach((s) => {
    const li = document.createElement("li");
    li.style.cssText =
      "padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #eee;";
    li.innerHTML = `<strong>${escapeHtml(s.nome)}</strong> <small style="color:#666;float:right;">${s.tempo}h</small>`;

    li.addEventListener("mouseenter", () => (li.style.backgroundColor = "#f3f4f6"));
    li.addEventListener("mouseleave", () => (li.style.backgroundColor = "transparent"));
    li.addEventListener("click", () => {
      inputEl.value = s.nome;
      state.servicoSelecionadoTempo = parseFloat(s.tempo) || 0;
      ulEl.style.display = "none";
      calcularPrecoServico();
    });
    ulEl.appendChild(li);
  });
}


function calcularPrecoServico() {
  if (state.servicoSelecionadoTempo <= 0 || state.valorHoraAtivo <= 0) return;

  const catNome = document.getElementById("servicoDificuldade").value;
  const categoria = state.categoriasCadastradas.find((c) => c.nome === catNome);
  const percentual = categoria ? parseFloat(categoria.percentual) : 0;

  const precoBase = state.servicoSelecionadoTempo * state.valorHoraAtivo;
  const precoFinal = precoBase + precoBase * (percentual / 100);

  document.getElementById("servicoPreco").value =
    precoFinal.toFixed(2).replace(".", ",");
}
