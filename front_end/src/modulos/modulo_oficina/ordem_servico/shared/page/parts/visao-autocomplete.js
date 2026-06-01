// visao-autocomplete.js
//
// Autocomplete dos campos do modal "Nova OS":
//  - Cliente (input com busca por nome ou cpf_cnpj)
//  - Veículo (input com busca por placa)

import { apiUrl } from "../../../../../../shared/config/api-config.js";
import { formatarCPFouCNPJ } from "./visao-utils.js";


// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

export function configurarAutocompleteCliente() {
  const inputCliente = document.getElementById("cliente");
  const inputCpfCnpj = document.getElementById("cpf_cnpj");
  const inputTelefone = document.getElementById("telefone");
  const inputEmail = document.getElementById("email");
  const sugestoesCliente = document.getElementById("cliente-suggestions");
  const sugestoesCpfCnpj = document.getElementById("cpf-cnpj-suggestions");

  if (!inputCliente && !inputCpfCnpj) return;

  let debounceTimeout;
  function preencher(cliente) {
    if (inputCliente) inputCliente.value = cliente.nome || "";
    if (inputCpfCnpj)
      inputCpfCnpj.value = cliente.cpf_cnpj
        ? formatarCPFouCNPJ(cliente.cpf_cnpj)
        : "";
    if (inputTelefone) inputTelefone.value = cliente.telefone || "";
    if (inputEmail) inputEmail.value = cliente.email || "";
  }

  async function buscar(termo, container) {
    if (!termo || termo.length < 3) {
      container.innerHTML = "";
      container.classList.add("d-none");
      return;
    }
    try {
      const response = await fetch(apiUrl(`/clientes/?search=${encodeURIComponent(termo)}`), {
    credentials: 'include'
});
      if (!response.ok) throw new Error("Erro ao buscar clientes");
      const data = await response.json();
      const lista = Array.isArray(data) ? data : data.results || [];
      renderizarSugestoesCliente(container, lista, preencher);
    } catch (error) {
      console.error("Erro no autocomplete de cliente:", error);
    }
  }

  function aoDigitar(e, container) {
    clearTimeout(debounceTimeout);
    const termo =
      e.target.id === "cpf_cnpj"
        ? e.target.value.replace(/\D/g, "")
        : e.target.value;
    debounceTimeout = setTimeout(() => buscar(termo, container), 500);
  }

  if (inputCliente && sugestoesCliente) {
    inputCliente.addEventListener("input", (e) => aoDigitar(e, sugestoesCliente));
  }
  if (inputCpfCnpj && sugestoesCpfCnpj) {
    inputCpfCnpj.addEventListener("input", (e) => aoDigitar(e, sugestoesCpfCnpj));
  }

  document.addEventListener("click", (e) => {
    if (
      inputCliente &&
      e.target !== inputCliente &&
      !sugestoesCliente?.contains(e.target)
    ) {
      sugestoesCliente?.classList.add("d-none");
    }
    if (
      inputCpfCnpj &&
      e.target !== inputCpfCnpj &&
      !sugestoesCpfCnpj?.contains(e.target)
    ) {
      sugestoesCpfCnpj?.classList.add("d-none");
    }
  });
}


function renderizarSugestoesCliente(container, lista, onSelect) {
  container.innerHTML = "";
  if (lista.length === 0) {
    container.classList.add("d-none");
    return;
  }

  lista.forEach((cliente) => {
    const div = document.createElement("div");
    div.className = "suggestion-item";
    const docFormatado = cliente.cpf_cnpj
      ? formatarCPFouCNPJ(cliente.cpf_cnpj)
      : "N/A";
    div.innerHTML = `
      <span class="suggestion-title">${cliente.nome}</span>
      <span class="suggestion-subtitle">Doc: ${docFormatado} | Tel: ${cliente.telefone || "N/A"}</span>
    `;
    div.addEventListener("click", () => {
      onSelect(cliente);
      container.innerHTML = "";
      container.classList.add("d-none");
    });
    container.appendChild(div);
  });
  container.classList.remove("d-none");
}


// ---------------------------------------------------------------------------
// Veículo
// ---------------------------------------------------------------------------

export function configurarAutocompleteVeiculo() {
  const inputPlaca = document.getElementById("placa");
  if (!inputPlaca) return;

  const sugestoes = document.createElement("div");
  sugestoes.id = "placa-suggestions";
  sugestoes.className = "autocomplete-suggestions d-none";
  inputPlaca.parentNode.appendChild(sugestoes);

  let debounceTimeout;
  inputPlaca.addEventListener("input", (e) => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => buscarVeiculos(e.target.value, sugestoes), 500);
  });

  document.addEventListener("click", (e) => {
    if (e.target !== inputPlaca && !sugestoes.contains(e.target)) {
      sugestoes.classList.add("d-none");
    }
  });
}


async function buscarVeiculos(termo, container) {
  if (!termo || termo.length < 2) {
    container.innerHTML = "";
    container.classList.add("d-none");
    return;
  }
  try {
    const response = await fetch(apiUrl(`/veiculos/?search=${encodeURIComponent(termo)}`), {
        credentials: 'include'
    });
    if (!response.ok) throw new Error("Erro ao buscar veículos");
    const data = await response.json();
    const lista = Array.isArray(data) ? data : data.results || [];
    renderizarSugestoesVeiculo(container, lista);
  } catch (error) {
    console.error("Erro no autocomplete de veículo:", error);
  }
}


function renderizarSugestoesVeiculo(container, lista) {
  container.innerHTML = "";
  if (lista.length === 0) {
    container.classList.add("d-none");
    return;
  }

  lista.forEach((v) => {
    const div = document.createElement("div");
    div.className = "suggestion-item";
    div.innerHTML = `
      <span class="suggestion-title">${v.placa} - ${v.modelo}</span>
      <span class="suggestion-subtitle">${v.marca || ""} ${v.ano || ""}</span>
    `;
    div.addEventListener("click", () => {
      preencherDadosVeiculo(v);
      container.innerHTML = "";
      container.classList.add("d-none");
    });
    container.appendChild(div);
  });
  container.classList.remove("d-none");
}


function preencherDadosVeiculo(veiculo) {
  document.getElementById("placa").value = veiculo.placa || "";
  document.getElementById("modelo").value = veiculo.modelo || "";
  document.getElementById("marca").value = veiculo.marca || "";
  document.getElementById("ano").value = veiculo.ano || "";
  document.getElementById("cor").value = veiculo.cor || "";
  document.getElementById("chassi").value = veiculo.chassi || "";
  document.getElementById("tipoUso").value = veiculo.tipo_uso || "";
}
