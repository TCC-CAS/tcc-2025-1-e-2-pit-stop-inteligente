import { ClienteService } from "../services/cliente-service.js";

document.addEventListener("DOMContentLoaded", () => {
  // Referências aos Elementos
  const form = document.getElementById("formCliente");
  const listaContainer = document.getElementById("listaClientes");
  const totalClientesBadge = document.getElementById("totalClientes");
  const inputSearch = document.getElementById("searchClient");
  const btnSalvar = document.getElementById("btnSalvar");
  const btnCancelar = document.getElementById("btnCancelar");
  const btnBuscarCep = document.getElementById("btnBuscarCep");

  // Estado Local
  let clientes = []; // Cache local para busca rápida no front (opcional)

  // === INICIALIZAÇÃO ===
  init();

  async function init() {
    await carregarListaClientes();
    aplicarMascaras();
  }

  // === LÓGICA DE DADOS (CRUD) ===

  async function carregarListaClientes() {
    renderLoading();
    clientes = await ClienteService.buscarTodos();
    renderLista(clientes);
  }

  async function salvarCliente() {
    if (!form.checkValidity()) {
      showToast("Preencha todos os campos obrigatórios (*)", "error");
      form.reportValidity();
      return;
    }

    const formData = new FormData(form);
    const dados = Object.fromEntries(formData.entries());

    // CORREÇÃO: Mapear campos do front para o back
    const payload = {
      nome: dados.nome,
      cpf_cnpj: dados.documento, // documento -> cpf_cnpj
      telefone: dados.telefone,
      email: dados.email,
      cep: dados.cep,
      logradouro: dados.logradouro,
      numero: dados.numero,
      complemento: dados.complemento,
      bairro: dados.bairro,
      cidade: dados.cidade,
      estado: dados.estado,
      contato_whatsapp: document.getElementById("pref_whatsapp").checked,
      contato_email: document.getElementById("pref_email").checked,
      contato_sms: document.getElementById("pref_sms").checked,
    };

    const id = document.getElementById("clienteId").value;

    try {
      if (id) {
        await ClienteService.atualizar(id, payload);
        showToast("Cliente atualizado com sucesso!", "success");
      } else {
        await ClienteService.criar(payload);
        showToast("Cliente cadastrado com sucesso!", "success");
      }
      limparFormulario();
      await carregarListaClientes();
    } catch (error) {
      showToast("Erro ao salvar dados.", "error");
    }
  }

  async function deletarCliente(id, e) {
    e.stopPropagation(); // Evita clicar no card e editar ao mesmo tempo
    if (confirm("Tem certeza que deseja excluir este cliente?")) {
      try {
        await ClienteService.excluir(id);
        showToast("Cliente removido.", "success");
        await carregarListaClientes();
        limparFormulario(); // Se o excluido estava em edição
      } catch (error) {
        showToast("Erro ao excluir.", "error");
      }
    }
  }

  // === RENDERIZAÇÃO ===

  function renderLoading() {
    listaContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Atualizando lista...</p>
            </div>
        `;
  }

  function renderLista(lista) {
    listaContainer.innerHTML = "";
    totalClientesBadge.textContent = lista.length;

    if (lista.length === 0) {
      listaContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>Nenhum cliente encontrado.</p>
                </div>`;
      return;
    }

    lista.forEach((cliente) => {
      const card = document.createElement("div");
      card.className = "client-card";
      card.innerHTML = `
                <div class="client-info">
                    <h4>${cliente.nome}</h4>
                    <p><i class="fas fa-id-card"></i> ${cliente.cpf_cnpj || '-'}</p>
                    <p><i class="fas fa-phone"></i> ${cliente.telefone || "-"}</p>
                </div>
                <div class="client-actions">
                    <button class="btn-icon-danger" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

      // Evento Editar (clique no card)
      card.addEventListener("click", () => carregarNoFormulario(cliente));

      // Evento Excluir (botão lixeira)
      const btnDel = card.querySelector(".btn-icon-danger");
      btnDel.addEventListener("click", (e) => deletarCliente(cliente.id, e));

      listaContainer.appendChild(card);
    });
  }

  function carregarNoFormulario(cliente) {
    document.getElementById("clienteId").value = cliente.id || "";
    document.getElementById("nome").value = cliente.nome || "";
    document.getElementById("documento").value = cliente.cpf_cnpj || ""; // cpf_cnpj -> documento
    document.getElementById("telefone").value = cliente.telefone || "";
    document.getElementById("email").value = cliente.email || "";

    document.getElementById("cep").value = cliente.cep || "";
    document.getElementById("logradouro").value = cliente.logradouro || "";
    document.getElementById("numero").value = cliente.numero || "";
    document.getElementById("complemento").value = cliente.complemento || "";
    document.getElementById("bairro").value = cliente.bairro || "";
    document.getElementById("cidade").value = cliente.cidade || "";
    document.getElementById("estado").value = cliente.estado || "";

    // CORREÇÃO: Preferências
    document.getElementById("pref_whatsapp").checked =
      !!cliente.contato_whatsapp;
    document.getElementById("pref_email").checked = !!cliente.contato_email;
    document.getElementById("pref_sms").checked = !!cliente.contato_sms;
  }

  function limparFormulario() {
    form.reset();
    document.getElementById("clienteId").value = "";
  }

  // === FUNÇÕES UTILITÁRIAS (Busca CEP, Máscaras, Busca Lista) ===

  async function buscarCep() {
    const cep = document.getElementById("cep").value;
    if (cep.length < 8) return;

    btnBuscarCep.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    const endereco = await ClienteService.buscarEnderecoPorCep(cep);
    btnBuscarCep.innerHTML = '<i class="fas fa-search"></i>';

    if (endereco) {
      document.getElementById("logradouro").value = endereco.logradouro;
      document.getElementById("bairro").value = endereco.bairro;
      document.getElementById("cidade").value = endereco.localidade;
      document.getElementById("estado").value = endereco.uf;
      document.getElementById("numero").focus();
    } else {
      showToast("CEP não encontrado.", "warning");
    }
  }

  function filtrarClientes() {
    const termo = inputSearch.value.toLowerCase();
    const filtrados = clientes.filter(
      (c) =>
        c.nome.toLowerCase().includes(termo) ||
        (c.cpf_cnpj && c.cpf_cnpj.includes(termo)) ||
        (c.telefone && c.telefone.includes(termo)),
    );
    renderLista(filtrados);
  }

  // Máscaras de Input
  function aplicarMascaras() {
    // CPF / CNPJ
    const docInput = document.getElementById("documento");
    docInput.addEventListener("input", (e) => {
      let v = e.target.value.replace(/\D/g, "");
      if (v.length > 14) v = v.slice(0, 14);

      if (v.length > 11) {
        // CNPJ
        v = v.replace(/^(\d{2})(\d)/, "$1.$2");
        v = v.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
        v = v.replace(/\.(\d{3})(\d)/, ".$1/$2");
        v = v.replace(/(\d{4})(\d)/, "$1-$2");
      } else {
        // CPF
        v = v.replace(/(\d{3})(\d)/, "$1.$2");
        v = v.replace(/(\d{3})(\d)/, "$1.$2");
        v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
      }
      e.target.value = v;
    });

    // Telefone
    const telInput = document.getElementById("telefone");
    telInput.addEventListener("input", (e) => {
      let v = e.target.value.replace(/\D/g, "");
      v = v.replace(/^(\d{2})(\d)/g, "($1) $2");
      v = v.replace(/(\d)(\d{4})$/, "$1-$2");
      e.target.value = v;
    });

    // CEP
    const cepInput = document.getElementById("cep");
    cepInput.addEventListener("input", (e) => {
      let v = e.target.value.replace(/\D/g, "");
      v = v.replace(/^(\d{5})(\d)/, "$1-$2");
      e.target.value = v;
    });
  }

  // Toast Notification
  function showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    const icons = {
      success: "check-circle",
      error: "exclamation-circle",
      warning: "exclamation-triangle",
      info: "info-circle",
    };

    toast.innerHTML = `
            <i class="fas fa-${icons[type]}"></i>
            <span>${message}</span>
        `;

    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  // Event Listeners
  btnSalvar.addEventListener("click", salvarCliente);
  btnCancelar.addEventListener("click", limparFormulario);
  btnBuscarCep.addEventListener("click", buscarCep);
  document.getElementById("cep").addEventListener("blur", buscarCep); // Busca ao sair do campo
  inputSearch.addEventListener("input", filtrarClientes);
});
