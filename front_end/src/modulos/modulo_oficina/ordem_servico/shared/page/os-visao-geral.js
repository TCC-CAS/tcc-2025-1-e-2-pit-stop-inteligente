function getCSRFToken() {
  const name = "csrftoken";
  const cookies = document.cookie.split(";");
  for (let cookie of cookies) {
    const [key, value] = cookie.trim().split("=");
    if (key === name) return value;
  }
  return "";
}

// os-visao-geral.js
document.addEventListener("DOMContentLoaded", () => {
  const contentArea = document.getElementById("content-area");
  const tabsComponent = document.querySelector("oficina-tabs");
  const modalNovaOS = document.getElementById("modalNovaOS");
  const osList = document.querySelector("os-list");

  // =========================================================
  // AUTOCOMPLETE CLIENTES
  // =========================================================
  const inputCliente = document.getElementById("cliente");
  const inputCpfCnpj = document.getElementById("cpf_cnpj");
  const inputTelefone = document.getElementById("telefone");
  const inputEmail = document.getElementById("email");
  const clienteSuggestions = document.getElementById("cliente-suggestions");
  const cpfCnpjSuggestions = document.getElementById("cpf-cnpj-suggestions");
  let debounceTimeout;

  function formatarCPFouCNPJ(valor) {
    if (!valor) return "";
    const numeros = valor.replace(/\D/g, "");
    if (numeros.length === 11) {
      return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    } else if (numeros.length === 14) {
      return numeros.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    }
    return valor;
  }

  async function buscarClientes(termo, suggestionsContainer) {
    if (!termo || termo.length < 3) {
      suggestionsContainer.innerHTML = "";
      suggestionsContainer.classList.add("d-none");
      return;
    }
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/oficina/clientes/?search=${termo}`);
      if (!response.ok) throw new Error("Erro ao buscar clientes");
      const clientes = await response.json();
      suggestionsContainer.innerHTML = "";
      const listaClientes = Array.isArray(clientes) ? clientes : clientes.results || [];
      if (listaClientes.length === 0) {
        suggestionsContainer.classList.add("d-none");
        return;
      }
      listaClientes.forEach((cliente) => {
        const div = document.createElement("div");
        div.className = "suggestion-item";
        const docFormatado = cliente.cpf_cnpj ? formatarCPFouCNPJ(cliente.cpf_cnpj) : "N/A";
        div.innerHTML = `
          <span class="suggestion-title">${cliente.nome}</span>
          <span class="suggestion-subtitle">Doc: ${docFormatado} | Tel: ${cliente.telefone || "N/A"}</span>
        `;
        div.addEventListener("click", () => {
          preencherDadosCliente(cliente);
          suggestionsContainer.innerHTML = "";
          suggestionsContainer.classList.add("d-none");
        });
        suggestionsContainer.appendChild(div);
      });
      suggestionsContainer.classList.remove("d-none");
    } catch (error) {
      console.error("Erro no autocomplete:", error);
    }
  }

  function preencherDadosCliente(cliente) {
    if (inputCliente) inputCliente.value = cliente.nome || "";
    if (inputCpfCnpj) inputCpfCnpj.value = cliente.cpf_cnpj ? formatarCPFouCNPJ(cliente.cpf_cnpj) : "";
    if (inputTelefone) inputTelefone.value = cliente.telefone || "";
    if (inputEmail) inputEmail.value = cliente.email || "";
  }

  function handleAutocompleteInput(e, suggestionsContainer) {
    clearTimeout(debounceTimeout);
    const termo = e.target.id === "cpf_cnpj" ? e.target.value.replace(/\D/g, "") : e.target.value;
    debounceTimeout = setTimeout(() => {
      buscarClientes(termo, suggestionsContainer);
    }, 500);
  }

  if (inputCliente && clienteSuggestions) {
    inputCliente.addEventListener("input", (e) => handleAutocompleteInput(e, clienteSuggestions));
  }
  if (inputCpfCnpj && cpfCnpjSuggestions) {
    inputCpfCnpj.addEventListener("input", (e) => handleAutocompleteInput(e, cpfCnpjSuggestions));
  }

  document.addEventListener("click", (e) => {
    if (inputCliente && e.target !== inputCliente && !clienteSuggestions.contains(e.target)) {
      clienteSuggestions.classList.add("d-none");
    }
    if (inputCpfCnpj && e.target !== inputCpfCnpj && !cpfCnpjSuggestions.contains(e.target)) {
      cpfCnpjSuggestions.classList.add("d-none");
    }
  });

  // =========================================================
  // AUTOCOMPLETE VEÍCULO
  // =========================================================
  const inputPlaca = document.getElementById("placa");
  const placaSuggestions = document.createElement("div");
  placaSuggestions.id = "placa-suggestions";
  placaSuggestions.className = "autocomplete-suggestions d-none";
  inputPlaca.parentNode.appendChild(placaSuggestions);
  let debouncePlacaTimeout;

  async function buscarVeiculos(termo) {
    if (!termo || termo.length < 2) {
      placaSuggestions.innerHTML = "";
      placaSuggestions.classList.add("d-none");
      return;
    }
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/oficina/veiculos/?search=${termo}`);
      if (!response.ok) throw new Error("Erro ao buscar veículos");
      const veiculos = await response.json();
      const lista = Array.isArray(veiculos) ? veiculos : veiculos.results || [];
      placaSuggestions.innerHTML = "";
      if (lista.length === 0) {
        placaSuggestions.classList.add("d-none");
        return;
      }
      lista.forEach((veic) => {
        const div = document.createElement("div");
        div.className = "suggestion-item";
        div.innerHTML = `
          <span class="suggestion-title">${veic.placa} - ${veic.modelo}</span>
          <span class="suggestion-subtitle">${veic.marca || ""} ${veic.ano || ""}</span>
        `;
        div.addEventListener("click", () => {
          preencherDadosVeiculo(veic);
          placaSuggestions.innerHTML = "";
          placaSuggestions.classList.add("d-none");
        });
        placaSuggestions.appendChild(div);
      });
      placaSuggestions.classList.remove("d-none");
    } catch (error) {
      console.error("Erro no autocomplete de veículo:", error);
    }
  }

  function preencherDadosVeiculo(veiculo) {
    inputPlaca.value = veiculo.placa || "";
    document.getElementById("modelo").value = veiculo.modelo || "";
    document.getElementById("marca").value = veiculo.marca || "";
    document.getElementById("ano").value = veiculo.ano || "";
    document.getElementById("cor").value = veiculo.cor || "";
    document.getElementById("chassi").value = veiculo.chassi || "";
    document.getElementById("tipoUso").value = veiculo.tipo_uso || "";
  }

  inputPlaca.addEventListener("input", (e) => {
    clearTimeout(debouncePlacaTimeout);
    debouncePlacaTimeout = setTimeout(() => buscarVeiculos(e.target.value), 500);
  });
  document.addEventListener("click", (e) => {
    if (e.target !== inputPlaca && !placaSuggestions.contains(e.target)) {
      placaSuggestions.classList.add("d-none");
    }
  });

  // =========================================================
  // LÓGICA DE ABAS E ESTADOS
  // =========================================================
  function mostrarMensagemNenhumaOS() {
    const contentArea = document.getElementById("content-area");
    if (!contentArea) return;
    contentArea.innerHTML = `
      <div class="empty-state-card">
        <i class="fas fa-car-side empty-icon"></i>
        <h2>Nenhuma ordem de serviço selecionada</h2>
        <p>Selecione uma OS na lista lateral ou crie uma nova para começar.</p>
        <button class="btn btn-primary" id="empty-state-nova-os">
          <i class="fas fa-plus"></i> Nova Ordem de Serviço
        </button>
      </div>
    `;
    const btnNova = document.getElementById("empty-state-nova-os");
    if (btnNova) btnNova.addEventListener("click", () => modalNovaOS.open());
    document.getElementById("header-os-id").textContent = "---";
    document.getElementById("header-veiculo").textContent = "Nenhum veículo";
    document.getElementById("header-placa").textContent = "---";
    const statusBadge = document.querySelector(".os-status-bar .badge");
    if (statusBadge) {
      statusBadge.textContent = "Nenhuma OS";
      statusBadge.className = "badge badge-secondary";
    }
    if (tabsComponent) {
      tabsComponent.querySelectorAll(".tab").forEach(tab => tab.classList.add("locked"));
    }
  }

  const tabModules = {
    checklist: () => import("../../checklist/components/checklist-tab.js"),
    detalhes: () => import("../../detalhes/components/detalhes-tab.js"),
    diagnostico: () => import("../../diagnostico_orcamento/components/diagnostico-tab.js"),
    aprovacao: () => import("../../aprovacao/components/aprovacao-tab.js"),
    execucao: () => import("../../execucao/components/execucao-tab.js"),
    documentos: () => import("../../documentos/components/documentos-tab.js"),
    historico: () => import("../../historico/components/historico-tab.js"),
  };

  async function loadTabContent(tabName) {
    if (!window.osSelecionadoId) {
      mostrarMensagemNenhumaOS();
      return;
    }
    const paths = {
      checklist: "../../checklist/components/checklist-tab.html",
      detalhes: "../../detalhes/components/detalhes-tab.html",
      diagnostico: "../../diagnostico_orcamento/components/diagnostico-tab.html",
      aprovacao: "../../aprovacao/components/aprovacao-tab.html",
      execucao: "../../execucao/components/execucao-tab.html",
      documentos: "../../documentos/components/documentos-tab.html",
      historico: "../../historico/components/historico-tab.html",
    };
    try {
      const response = await fetch(paths[tabName]);
      if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
      let html = await response.text();
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = html;
      if (window.osSelecionadoId) {
        const hidden = document.createElement("input");
        hidden.type = "hidden";
        hidden.id = "os-id";
        hidden.value = window.osSelecionadoId;
        tempDiv.insertBefore(hidden, tempDiv.firstChild);
      }
      contentArea.innerHTML = "";
      contentArea.appendChild(tempDiv);
      if (tabModules[tabName]) {
        const module = await tabModules[tabName]();
        if (module.initDetalhes && tabName === "detalhes") module.initDetalhes(window.osSelecionadoId);
        else if (module.initChecklist && tabName === "checklist") module.initChecklist(tabsComponent, window.osSelecionadoId);
        else if (module.initDiagnostico && tabName === "diagnostico") module.initDiagnostico(window.osSelecionadoId);
        else if (module.initAprovacao && tabName === "aprovacao") module.initAprovacao(window.osSelecionadoId);
        else if (module.initExecucao && tabName === "execucao") module.initExecucao(window.osSelecionadoId);
        else if (module.initDocumentos && tabName === "documentos") module.initDocumentos(window.osSelecionadoId);
        else if (module.initHistorico && tabName === "historico") module.initHistorico(window.osSelecionadoId);
      }
    } catch (error) {
      console.error("Erro ao carregar aba:", error);
      contentArea.innerHTML = `<p style="color:red;">Erro ao carregar conteúdo da aba.</p>`;
    }
  }

  if (tabsComponent) {
    tabsComponent.addEventListener("os:tab-change", (e) => loadTabContent(e.detail.targetId));
  }

  if (window.osSelecionadoId) {
    loadTabContent("checklist");
  } else {
    mostrarMensagemNenhumaOS();
  }

  // Evento para criar nova OS
  if (osList) {
    osList.addEventListener("os:create-new", () => {
      if (modalNovaOS && typeof modalNovaOS.open === "function") {
        modalNovaOS.open();
        setTimeout(() => {
          const cpfCnpjInput = document.getElementById("cpf_cnpj");
          if (cpfCnpjInput) {
            cpfCnpjInput.removeEventListener("input", window.mascaraCPFCNPJHandler);
            const handler = function (e) {
              let numeros = e.target.value.replace(/\D/g, "");
              if (numeros.length > 14) numeros = numeros.slice(0, 14);
              e.target.value = formatarCPFouCNPJ(numeros);
            };
            window.mascaraCPFCNPJHandler = handler;
            cpfCnpjInput.addEventListener("input", handler);
          }
        }, 100);
      }
    });
  }

  // Selecionar OS e atualizar cabeçalho
  if (osList) {
    osList.addEventListener("os:select", async (e) => {
      const os = e.detail;
      if (!os || !os.id) {
        window.osSelecionadoId = null;
        mostrarMensagemNenhumaOS();
        return;
      }
      const osId = os.id;
      try {
        const response = await fetch(`http://127.0.0.1:8000/api/oficina/os/${osId}/`);
        if (!response.ok) throw new Error("Erro ao carregar detalhes da OS");
        const osDetalhes = await response.json();
        document.getElementById("header-os-id").textContent = osDetalhes.id;
        document.getElementById("header-veiculo").textContent = osDetalhes.veiculo_detalhes?.modelo || "--";
        document.getElementById("header-placa").textContent = osDetalhes.veiculo_detalhes?.placa || "--";
        const statusBadge = document.querySelector(".os-status-bar .badge");
        let statusTexto = osDetalhes.status;
        let badgeClass = "badge";
        if (statusTexto === "pendente") {
          statusTexto = "Em Análise";
          badgeClass += " badge-warning";
        } else if (statusTexto === "execucao") {
          statusTexto = "Em Execução";
          badgeClass += " badge-info";
        } else if (statusTexto === "concluido") {
          statusTexto = "Concluído";
          badgeClass += " badge-success";
        } else {
          statusTexto = statusTexto || "Desconhecido";
          badgeClass += " badge-secondary";
        }
        statusBadge.textContent = statusTexto;
        statusBadge.className = badgeClass;
        window.osSelecionadoId = osDetalhes.id;
        if (tabsComponent) {
          try {
            const checklistResponse = await fetch(`http://127.0.0.1:8000/api/oficina/checklist/${osId}/`);
            if (checklistResponse.ok) {
              const checklistData = await checklistResponse.json();
              const concluido = checklistData && checklistData.concluido === true;
              tabsComponent.setLockedByChecklist(concluido);
            } else {
              tabsComponent.setLockedByChecklist(false);
            }
          } catch (error) {
            console.error("Erro ao verificar checklist:", error);
            tabsComponent.setLockedByChecklist(false);
          }
        }
        const tabAtiva = document.querySelector("oficina-tabs .tab.active");
        loadTabContent(tabAtiva ? tabAtiva.dataset.target : "checklist");
      } catch (error) {
        console.error("Erro ao carregar detalhes da OS:", error);
        alert("Não foi possível carregar os detalhes da OS.");
      }
    });
  }

  // Botão Imprimir
  const btnImprimir = document.getElementById("btnImprimirOS");
  if (btnImprimir) {
    btnImprimir.addEventListener("click", () => window.print());
  }

  // =========================================================
  // CRIAR NOVA OS
  // =========================================================
  const btnCriar = document.getElementById("btnCriarOS");
  if (btnCriar) {
    btnCriar.addEventListener("click", async () => {
      const cpfCnpjField = document.getElementById("cpf_cnpj");
      const cpfCnpjNumeros = cpfCnpjField.value.replace(/\D/g, "");
      const novaOS = {
        nome_cliente: document.getElementById("cliente").value.trim(),
        cpf_cnpj: cpfCnpjNumeros,
        telefone: document.getElementById("telefone").value.trim(),
        email: document.getElementById("email").value.trim(),
        placa: document.getElementById("placa").value.trim().toUpperCase(),
        km_atual: parseInt(document.getElementById("km_atual").value) || 0,
        modelo: document.getElementById("modelo").value.trim() || "Não informado",
        marca: document.getElementById("marca").value.trim(),
        ano: document.getElementById("ano").value.trim(),
        cor: document.getElementById("cor").value.trim(),
        chassi: document.getElementById("chassi").value.trim(),
        tipo_uso: document.getElementById("tipoUso").value,
        status: "pendente",
      };
      if (!novaOS.nome_cliente || !novaOS.cpf_cnpj || !novaOS.placa) {
        alert("Cliente, CPF/CNPJ e Placa são obrigatórios!");
        return;
      }
      try {
        const response = await fetch("http://127.0.0.1:8000/api/oficina/os/criar/", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-CSRFToken": getCSRFToken() },
          body: JSON.stringify(novaOS),
        });
        if (response.ok) {
          const data = await response.json();
          alert(`Sucesso! OS #${data.os_id} criada.`);
          modalNovaOS.close();
          document.dispatchEvent(new CustomEvent("os:criada", { bubbles: true }));
          // Limpa formulário
          document.getElementById("cliente").value = "";
          document.getElementById("cpf_cnpj").value = "";
          document.getElementById("telefone").value = "";
          document.getElementById("email").value = "";
          document.getElementById("placa").value = "";
          document.getElementById("km_atual").value = "";
          document.getElementById("modelo").value = "";
          document.getElementById("marca").value = "";
          document.getElementById("ano").value = "";
          document.getElementById("cor").value = "";
          document.getElementById("chassi").value = "";
          document.getElementById("tipoUso").value = "";
        } else {
          let mensagemErro = "Erro ao salvar. Verifique o console.";
          try {
            const erroData = await response.json();
            if (erroData.cpf_cnpj) mensagemErro = "CPF/CNPJ já cadastrado para esta oficina.";
            else if (erroData.erro) mensagemErro = erroData.erro;
            else if (erroData.detail) mensagemErro = erroData.detail;
            else mensagemErro = JSON.stringify(erroData);
          } catch (e) {
            const textoErro = await response.text();
            if (textoErro.includes("cpf_cnpj")) mensagemErro = "CPF/CNPJ já cadastrado para esta oficina.";
            else mensagemErro = textoErro || "Erro desconhecido.";
          }
          alert(mensagemErro);
        }
      } catch (error) {
        console.error("Erro na conexão:", error);
        alert("Não foi possível conectar ao servidor.");
      }
    });
  }
});