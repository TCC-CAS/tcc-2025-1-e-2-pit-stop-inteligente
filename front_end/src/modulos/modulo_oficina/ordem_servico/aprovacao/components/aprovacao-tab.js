function getCSRFToken() {
  const name = "csrftoken";
  const cookies = document.cookie.split(";");
  for (let cookie of cookies) {
    const [key, value] = cookie.trim().split("=");
    if (key === name) return value;
  }
  return "";
}

import { DiagnosticoService } from "../../diagnostico_orcamento/services/diagnostico-service.js";

let currentOsId = null;
let pendingChanges = {}; // { itemId: "aprovado" ou "reprovado" }

const API_BASE_URL = "http://127.0.0.1:8000/api/oficina";

export function initAprovacao(osId) {
  currentOsId = osId;
  if (!currentOsId) return;

  carregarTabelaAprovacao();
  document
    .getElementById("btnGerenciarAprovacao")
    ?.addEventListener("click", abrirModalAprovacao);
}

// Função auxiliar para extrair nome e descrição do item
function extrairNomeEDescricao(item) {
  let nome = item.nome_descricao;
  let descricao = "";

  if (item.tipo === "peca") {
    const separador = " - ";
    const idx = item.nome_descricao.indexOf(separador);
    if (idx !== -1) {
      nome = item.nome_descricao.substring(0, idx);
      descricao = item.nome_descricao.substring(idx + separador.length);
    } else {
      descricao = "";
    }
  } else {
    // Serviço não tem descrição separada
    descricao = "N/A";
  }

  return { nome, descricao };
}

async function carregarTabelaAprovacao() {
  const tabelaBody = document.getElementById("listaAprovacaoBody");
  if (!tabelaBody) return;

  tabelaBody.innerHTML =
    '<tr><td colspan="4" class="text-center">Carregando...</td></tr>';

  try {
    const itens = await DiagnosticoService.getItensOrcamento(currentOsId);
    tabelaBody.innerHTML = "";

    if (itens.length === 0) {
      tabelaBody.innerHTML =
        '<tr><td colspan="4" class="text-center">Nenhum item para aprovação.</td></tr>';
      return;
    }

    itens.forEach((item) => {
      const statusClass =
        item.status_aprovacao === "aprovado"
          ? "badge-success"
          : item.status_aprovacao === "reprovado"
            ? "badge-danger"
            : "badge-warning";
      const statusText = item.status_aprovacao || "pendente";

      const { nome, descricao } = extrairNomeEDescricao(item);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(nome)}</td>
        <td class="desc-col">${escapeHtml(descricao)}</td>
        <td>R$ ${parseFloat(item.valor_unitario).toFixed(2)}</td>
        <td><span class="badge ${statusClass}">${statusText.toUpperCase()}</span></td>
      `;
      tabelaBody.appendChild(tr);
    });
  } catch (error) {
    console.error(error);
    tabelaBody.innerHTML =
      '<tr><td colspan="4" class="text-center" style="color:red;">Erro ao carregar itens.</td></tr>';
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>]/g, function (m) {
    if (m === "&") return "&amp;";
    if (m === "<") return "&lt;";
    if (m === ">") return "&gt;";
    return m;
  });
}

function abrirModalAprovacao() {
  const modal = document.getElementById("modalGerenciarAprovacao");
  if (!modal) {
    console.error("Modal de aprovação não encontrada.");
    return;
  }

  const temp = document.getElementById("tmplGerenciarAprovacao");
  const bodySlot = modal.querySelector('[slot="body"]');
  if (temp && bodySlot) {
    bodySlot.innerHTML = "";
    bodySlot.appendChild(temp.content.cloneNode(true));
  }

  preencherModalAprovacao();

  if (typeof modal.open === "function") {
    modal.open();
  } else {
    modal.style.display = "block";
  }
}

function renderizarItensModal(itens) {
  const lista = document.getElementById("listaItensModal");
  if (!lista) return;
  lista.innerHTML = "";

  if (itens.length === 0) {
    lista.innerHTML =
      '<tr><td colspan="4" class="text-center">Nenhum item.</td></tr>';
    return;
  }

  itens.forEach((item) => {
    const { nome, descricao } = extrairNomeEDescricao(item);
    const valorFormatado = parseFloat(item.valor_unitario).toFixed(2);

    // Verifica se há uma alteração pendente para este item
    const statusPendente = pendingChanges[item.id];
    const isAprovadoPendente = statusPendente === "aprovado";
    const isReprovadoPendente = statusPendente === "reprovado";

    // Adiciona classes visuais para destacar o estado pendente
    const approveClass = isAprovadoPendente ? "active-approve" : "";
    const rejectClass = isReprovadoPendente ? "active-reject" : "";

    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td>${escapeHtml(nome)}</td>
            <td class="desc-col">${escapeHtml(descricao)}</td>
            <td>R$ ${valorFormatado}</td>
            <td class="actions-cell">
                <button class="btn-icon btn-approve ${approveClass}" data-id="${item.id}" data-status="aprovado" title="Aprovar item">
                    <i class="fas fa-check"></i>
                </button>
                <button class="btn-icon btn-reject ${rejectClass}" data-id="${item.id}" data-status="reprovado" title="Reprovar item">
                    <i class="fas fa-times"></i>
                </button>
            </td>
        `;
    lista.appendChild(tr);
  });

  // Adiciona eventos que APENAS alteram o estado pendente (não enviam ao backend)
  document
    .querySelectorAll(
      "#listaItensModal .btn-approve, #listaItensModal .btn-reject",
    )
    .forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const itemId = parseInt(btn.dataset.id);
        const novoStatus = btn.dataset.status;

        // Armazena a alteração pendente
        if (novoStatus === "aprovado") {
          pendingChanges[itemId] = "aprovado";
        } else if (novoStatus === "reprovado") {
          pendingChanges[itemId] = "reprovado";
        }

        // Re-renderiza a lista para mostrar o estado atualizado
        renderizarItensModal(itens);
      });
    });
}

async function preencherModalAprovacao() {
  try {
    const [itens, osData] = await Promise.all([
      DiagnosticoService.getItensOrcamento(currentOsId),
      fetch(`${API_BASE_URL}/os/${currentOsId}/`).then((res) => res.json()),
    ]);

    document.getElementById("modalStatusGeral").textContent =
      osData.status || "PENDENTE";
    document.getElementById("modalDataEnvio").textContent = osData.criado_em
      ? new Date(osData.criado_em).toLocaleDateString("pt-BR")
      : "-";
    document.getElementById("modalCliente").textContent =
      osData.veiculo_detalhes?.cliente_detalhes?.nome || "-";
    document.getElementById("modalTelefone").textContent =
      osData.veiculo_detalhes?.cliente_detalhes?.telefone || "-";

    // Renderiza a lista usando a nova função (que só altera visualmente)
    renderizarItensModal(itens);

    const confirmCheckbox = document.getElementById("confirmarAprovacao");
    const btnAprovarCliente = document.getElementById("btnAprovarComoCliente");

    if (confirmCheckbox && btnAprovarCliente) {
      // Estado inicial
      confirmCheckbox.checked = false;
      btnAprovarCliente.disabled = true;

      // Remove qualquer listener anterior para evitar duplicação
      const novoBtn = btnAprovarCliente.cloneNode(true);
      btnAprovarCliente.parentNode.replaceChild(novoBtn, btnAprovarCliente);
      const btnFinal = document.getElementById("btnAprovarComoCliente");

      // Evento do checkbox – habilita/desabilita o botão
      confirmCheckbox.onchange = (e) => {
        btnFinal.disabled = !e.target.checked;
      };

      // Evento do botão – chama a função de aprovação
      btnFinal.onclick = async () => {
        await aprovarTodosItens();
      };
    }

    document
      .getElementById("btnReenviarWhatsApp")
      ?.addEventListener("click", () => reenviarSolicitacao("whatsapp"));
    document
      .getElementById("btnReenviarSMS")
      ?.addEventListener("click", () => reenviarSolicitacao("sms"));
    document
      .getElementById("btnReenviarEmail")
      ?.addEventListener("click", () => reenviarSolicitacao("email"));
  } catch (error) {
    console.error(error);
    alert("Erro ao carregar dados da modal.");
  }
}

async function aprovarTodosItens() {
  // Verifica se há alterações pendentes
  if (Object.keys(pendingChanges).length === 0) {
    alert("Nenhuma alteração pendente para aprovar.");
    return;
  }

  const updates = Object.entries(pendingChanges).map(([id, status]) => ({
    id: parseInt(id),
    status: status,
  }));

  try {
    const response = await fetch(
      `${API_BASE_URL}/os/${currentOsId}/aprovacao/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCSRFToken(),
        },
        body: JSON.stringify({ itens: updates, termo_aceito: true }),
      },
    );

    if (!response.ok) {
      const erro = await response.json();
      throw new Error(erro.erro || "Erro ao aprovar.");
    }

    alert("Orçamento aprovado com sucesso!");
    const modal = document.getElementById("modalGerenciarAprovacao");
    if (modal && typeof modal.close === "function") modal.close();
    await carregarTabelaAprovacao(); // recarrega a tabela principal
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

function reenviarSolicitacao(metodo) {
  alert(
    `Reenviar solicitação por ${metodo.toUpperCase()} - funcionalidade em desenvolvimento.`,
  );
}
