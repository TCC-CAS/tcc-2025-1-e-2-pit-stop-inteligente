// visao-nova-os.js
//
// Modal de criação de uma nova OS:
//  - máscara de CPF/CNPJ ao digitar
//  - validação mínima
//  - submit + tratamento de erros
//  - reset do formulário em sucesso e dispatch do evento "os:criada"

import { apiUrl, getCsrfToken } from "../../../../../../shared/config/api-config.js";
import { apenasDigitos, vincularMascaraCpfCnpj } from "./visao-utils.js";


const CAMPOS_LIMPAR = [
  "cliente",
  "cpf_cnpj",
  "telefone",
  "email",
  "placa",
  "km_atual",
  "modelo",
  "marca",
  "ano",
  "cor",
  "chassi",
  "tipoUso",
];


/** Vincula listeners do modal de Nova OS (criação + máscara). */
export function configurarNovaOS({ modalNovaOS, osList }) {
  vincularBotaoCriar(modalNovaOS);
  vincularAberturaModal(modalNovaOS, osList);
  // Aplica a máscara já no carregamento (o input existe no HTML estático)
  aplicarMascaraCpfCnpj();
}


function vincularAberturaModal(modalNovaOS, osList) {
  if (!osList) return;
  osList.addEventListener("os:create-new", () => {
    if (typeof modalNovaOS?.open === "function") {
      modalNovaOS.open();
      // Aguarda o modal renderizar para vincular a máscara
      setTimeout(aplicarMascaraCpfCnpj, 100);
    }
  });
}


function aplicarMascaraCpfCnpj() {
  vincularMascaraCpfCnpj(document.getElementById("cpf_cnpj"));
}


function vincularBotaoCriar(modalNovaOS) {
  const btnCriar = document.getElementById("btnCriarOS");
  if (!btnCriar) return;

  btnCriar.addEventListener("click", async () => {
    const novaOS = coletarDados();
    if (!validar(novaOS)) return;

    try {
      const response = await fetch(apiUrl("/os/criar/"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken(),
        },
        body: JSON.stringify(novaOS),
      });
      if (response.ok) {
        const data = await response.json();
        alert(`Sucesso! OS #${data.os_id ?? data.id} criada.`);
        modalNovaOS?.close();
        document.dispatchEvent(new CustomEvent("os:criada", { bubbles: true }));
        limparFormulario();
      } else {
        alert(await mensagemDeErro(response));
      }
    } catch (error) {
      console.error("Erro na conexão:", error);
      alert("Não foi possível conectar ao servidor.");
    }
  });
}


function coletarDados() {
  const get = (id) => document.getElementById(id)?.value.trim() || "";
  return {
    nome_cliente: get("cliente"),
    cpf_cnpj: apenasDigitos(get("cpf_cnpj")),
    telefone: get("telefone"),
    email: get("email"),
    placa: get("placa").toUpperCase(),
    km_atual: parseInt(get("km_atual"), 10) || 0,
    modelo: get("modelo") || "Não informado",
    marca: get("marca"),
    ano: get("ano"),
    cor: get("cor"),
    chassi: get("chassi"),
    tipo_uso: get("tipoUso"),
    status: "pendente",
  };
}


function validar(novaOS) {
  if (!novaOS.nome_cliente || !novaOS.cpf_cnpj || !novaOS.placa) {
    alert("Cliente, CPF/CNPJ e Placa são obrigatórios!");
    return false;
  }
  return true;
}


async function mensagemDeErro(response) {
  try {
    const data = await response.json();
    if (data.cpf_cnpj) return "CPF/CNPJ já cadastrado para esta oficina.";
    if (data.erro) return data.erro;
    if (data.detail) return data.detail;
    return JSON.stringify(data);
  } catch {
    const texto = await response.text();
    if (texto.includes("cpf_cnpj")) return "CPF/CNPJ já cadastrado para esta oficina.";
    return texto || "Erro desconhecido.";
  }
}


function limparFormulario() {
  CAMPOS_LIMPAR.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}
