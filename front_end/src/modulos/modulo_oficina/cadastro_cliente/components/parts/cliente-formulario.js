// cliente-formulario.js
//
// Cuida do formulário de cliente (cadastrar / editar / excluir / buscar CEP).

import { ClienteService } from "../../services/cliente-service.js";
import { showToast } from "./cliente-toast.js";


/** Vincula listeners de salvar / cancelar / buscar CEP. */
export function configurarFormularioCliente({ aposSalvar, aposExcluir }) {
  document.getElementById("btnSalvar")?.addEventListener("click", () =>
    salvarCliente(aposSalvar),
  );
  document
    .getElementById("btnCancelar")
    ?.addEventListener("click", limparFormulario);
  document.getElementById("btnBuscarCep")?.addEventListener("click", buscarCep);
  document.getElementById("cep")?.addEventListener("blur", buscarCep);

  // Re-exporta a função para o exterior poder chamar ao excluir um cliente
  window._cadastroClienteExcluir = (id, evento) =>
    deletarCliente(id, evento, aposExcluir);
}


/** Excluir cliente — chamado pela lista. */
export async function deletarCliente(id, e, aposExcluir) {
  e?.stopPropagation();
  if (!confirm("Tem certeza que deseja excluir este cliente?")) return;

  try {
    await ClienteService.excluir(id);
    showToast("Cliente removido.", "success");
    limparFormulario();
    aposExcluir?.();
  } catch (error) {
    console.error(error);
    showToast("Erro ao excluir.", "error");
  }
}


/** Carrega os dados do cliente nos campos do formulário. */
export function carregarNoFormulario(cliente) {
  const setar = (id, valor) => {
    const el = document.getElementById(id);
    if (el) el.value = valor || "";
  };
  const marcar = (id, valor) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!valor;
  };

  setar("clienteId", cliente.id);
  setar("nome", cliente.nome);
  setar("documento", cliente.cpf_cnpj);
  setar("telefone", cliente.telefone);
  setar("email", cliente.email);
  setar("cep", cliente.cep);
  setar("logradouro", cliente.logradouro);
  setar("numero", cliente.numero);
  setar("complemento", cliente.complemento);
  setar("bairro", cliente.bairro);
  setar("cidade", cliente.cidade);
  setar("estado", cliente.estado);
  marcar("pref_whatsapp", cliente.contato_whatsapp);
  marcar("pref_email", cliente.contato_email);
  marcar("pref_sms", cliente.contato_sms);
}


export function limparFormulario() {
  document.getElementById("formCliente")?.reset();
  const idInput = document.getElementById("clienteId");
  if (idInput) idInput.value = "";
}


// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

async function salvarCliente(aposSalvar) {
  const form = document.getElementById("formCliente");
  if (!form) return;

  if (!form.checkValidity()) {
    showToast("Preencha todos os campos obrigatórios (*)", "error");
    form.reportValidity();
    return;
  }

  const dados = Object.fromEntries(new FormData(form).entries());
  const payload = {
    nome: dados.nome,
    cpf_cnpj: dados.documento,
    telefone: dados.telefone,
    email: dados.email,
    cep: dados.cep,
    logradouro: dados.logradouro,
    numero: dados.numero,
    complemento: dados.complemento,
    bairro: dados.bairro,
    cidade: dados.cidade,
    estado: dados.estado,
    contato_whatsapp: document.getElementById("pref_whatsapp")?.checked || false,
    contato_email: document.getElementById("pref_email")?.checked || false,
    contato_sms: document.getElementById("pref_sms")?.checked || false,
  };

  const id = document.getElementById("clienteId")?.value;

  try {
    if (id) {
      await ClienteService.atualizar(id, payload);
      showToast("Cliente atualizado com sucesso!", "success");
    } else {
      await ClienteService.criar(payload);
      showToast("Cliente cadastrado com sucesso!", "success");
    }
    limparFormulario();
    aposSalvar?.();
  } catch (error) {
    console.error(error);
    showToast("Erro ao salvar dados.", "error");
  }
}


async function buscarCep() {
  const input = document.getElementById("cep");
  if (!input) return;

  const cep = input.value;
  if (cep.length < 8) return;

  const btn = document.getElementById("btnBuscarCep");
  if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  const endereco = await ClienteService.buscarEnderecoPorCep(cep);

  if (btn) btn.innerHTML = '<i class="fas fa-search"></i>';

  if (!endereco) {
    showToast("CEP não encontrado.", "warning");
    return;
  }

  document.getElementById("logradouro").value = endereco.logradouro || "";
  document.getElementById("bairro").value = endereco.bairro || "";
  document.getElementById("cidade").value = endereco.localidade || "";
  document.getElementById("estado").value = endereco.uf || "";
  document.getElementById("numero")?.focus();
}
