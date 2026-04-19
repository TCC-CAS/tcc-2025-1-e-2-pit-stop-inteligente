import { DiagnosticoService } from "../../diagnostico_orcamento/services/diagnostico-service.js";

let currentOsId = null;

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

  tabelaBody.innerHTML = '<tr><td colspan="4" class="text-center">Carregando...</td></tr>';

  try {
    const itens = await DiagnosticoService.getItensOrcamento(currentOsId);
    tabelaBody.innerHTML = "";

    if (itens.length === 0) {
      tabelaBody.innerHTML = '<tr><td colspan="4" class="text-center">Nenhum item para aprovação.</td></tr>';
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
    tabelaBody.innerHTML = '<tr><td colspan="4" class="text-center" style="color:red;">Erro ao carregar itens.</td></tr>';
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

async function preencherModalAprovacao() {
  try {
    const [itens, osData] = await Promise.all([
      DiagnosticoService.getItensOrcamento(currentOsId),
      fetch(`${API_BASE_URL}/os/${currentOsId}/`).then((res) => res.json()),
    ]);

    document.getElementById("modalStatusGeral").textContent = osData.status || "PENDENTE";
    document.getElementById("modalDataEnvio").textContent = osData.criado_em
      ? new Date(osData.criado_em).toLocaleDateString("pt-BR")
      : "-";
    document.getElementById("modalCliente").textContent = osData.cliente?.nome || osData.veiculo?.cliente?.nome || "-";
    document.getElementById("modalTelefone").textContent = osData.cliente?.telefone || osData.veiculo?.cliente?.telefone || "-";

    const lista = document.getElementById("listaItensModal");
    if (!lista) return;

    if (itens.length === 0) {
      lista.innerHTML = '<tr><td colspan="4" class="text-center">Nenhum item.</td></tr>';
      return;
    }

    lista.innerHTML = "";
    itens.forEach((item) => {
      const { nome, descricao } = extrairNomeEDescricao(item);
      const valorFormatado = parseFloat(item.valor_unitario).toFixed(2);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(nome)}</td>
        <td class="desc-col">${escapeHtml(descricao)}</td>
        <td>R$ ${valorFormatado}</td>
        <td class="actions-cell">
          <button class="btn-icon btn-approve" data-id="${item.id}" data-status="aprovado" title="Aprovar item">
            <i class="fas fa-check"></i>
          </button>
          <button class="btn-icon btn-reject" data-id="${item.id}" data-status="reprovado" title="Reprovar item">
            <i class="fas fa-times"></i>
          </button>
        </td>
      `;
      lista.appendChild(tr);
    });

    // Reatachar eventos dos botões de aprovação/reprovação
    document.querySelectorAll(".btn-approve, .btn-reject").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const itemId = e.currentTarget.dataset.id;
        const novoStatus = e.currentTarget.dataset.status;
        await atualizarStatusItem(itemId, novoStatus);
      });
    });

    const confirmCheckbox = document.getElementById("confirmarAprovacao");
    const btnAprovarCliente = document.getElementById("btnAprovarComoCliente");

    if (confirmCheckbox && btnAprovarCliente) {
      confirmCheckbox.checked = false;
      btnAprovarCliente.disabled = true;

      confirmCheckbox.addEventListener("change", (e) => {
        btnAprovarCliente.disabled = !e.target.checked;
      });

      const newBtnAprovar = btnAprovarCliente.cloneNode(true);
      btnAprovarCliente.parentNode.replaceChild(newBtnAprovar, btnAprovarCliente);
      newBtnAprovar.addEventListener("click", aprovarTodosItens);
    }

    document.getElementById("btnReenviarWhatsApp")?.addEventListener("click", () => reenviarSolicitacao("whatsapp"));
    document.getElementById("btnReenviarSMS")?.addEventListener("click", () => reenviarSolicitacao("sms"));
    document.getElementById("btnReenviarEmail")?.addEventListener("click", () => reenviarSolicitacao("email"));
  } catch (error) {
    console.error(error);
    alert("Erro ao carregar dados da modal.");
  }
}

async function atualizarStatusItem(itemId, novoStatus) {
  try {
    const response = await fetch(`${API_BASE_URL}/os/${currentOsId}/aprovacao/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itens: [{ id: itemId, status: novoStatus }] }),
    });

    if (!response.ok) throw new Error(`Erro na requisição: ${response.status}`);

    const data = await response.json();
    console.log(data.mensagem);

    preencherModalAprovacao();
    carregarTabelaAprovacao();
  } catch (error) {
    console.error("Erro ao atualizar status do item:", error);
    alert("Erro ao atualizar status do item no servidor.");
  }
}

async function aprovarTodosItens() {
  try {
    const itens = await DiagnosticoService.getItensOrcamento(currentOsId);
    const itensPendentes = itens.filter((item) => item.status_aprovacao !== "aprovado");

    if (itensPendentes.length === 0) {
      alert("Todos os itens já estão aprovados.");
      return;
    }

    const updates = itensPendentes.map((item) => ({ id: item.id, status: "aprovado" }));

    const response = await fetch(`${API_BASE_URL}/os/${currentOsId}/aprovacao/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itens: updates, termo_aceito: true }),
    });

    if (!response.ok) throw new Error("Erro ao processar a aprovação total.");

    alert("Orçamento aprovado com sucesso!");

    const modal = document.getElementById("modalGerenciarAprovacao");
    if (modal && typeof modal.close === "function") modal.close();
    else if (modal) modal.style.display = "none";

    carregarTabelaAprovacao();
  } catch (error) {
    console.error(error);
    alert("Erro ao aprovar orçamento.");
  }
}

function reenviarSolicitacao(metodo) {
  alert(`Reenviar solicitação por ${metodo.toUpperCase()} - funcionalidade em desenvolvimento.`);
}