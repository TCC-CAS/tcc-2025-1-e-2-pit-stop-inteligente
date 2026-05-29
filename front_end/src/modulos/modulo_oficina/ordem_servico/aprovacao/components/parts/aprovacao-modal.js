// aprovacao-modal.js
//
// Modal "Gerenciar Aprovação": permite aprovar/reprovar item-a-item antes
// de confirmar; também exibe dados do cliente e botões de reenvio.

import { apiUrl } from "../../../../../../shared/config/api-config.js";
import { DiagnosticoService } from "../../../diagnostico_orcamento/services/diagnostico-service.js";
import { configurarExportacaoPDF } from "./aprovacao-pdf.js"; 
import {
  escapeHtml,
  extrairNomeEDescricao,
  state,
} from "./aprovacao-state.js";


/** Abre o modal preenchendo template, dados do cliente, lista e listeners. */
export function abrirModalAprovacao(onConfirmar) {
  const modal = document.getElementById("modalGerenciarAprovacao");
  if (!modal) {
    console.error("Modal de aprovação não encontrada.");
    return;
  }

  injetarTemplate(modal);
  preencherModal(onConfirmar);

  if (typeof modal.open === "function") modal.open();
  else modal.style.display = "block";
}


function injetarTemplate(modal) {
  const temp = document.getElementById("tmplGerenciarAprovacao");
  const bodySlot = modal.querySelector('[slot="body"]');
  if (!temp || !bodySlot) return;
  bodySlot.innerHTML = "";
  bodySlot.appendChild(temp.content.cloneNode(true));

  configurarExportacaoPDF();
}


async function preencherModal(onConfirmar) {
  try {
    const [itens, osData] = await Promise.all([
      DiagnosticoService.getItensOrcamento(state.currentOsId),
      fetch(apiUrl(`/os/${state.currentOsId}/`), {
        credentials: 'include'
      }).then((r) => r.json()),
    ]);

    preencherDadosCliente(osData);
    renderizarItensModal(itens);
    configurarConfirmacao(onConfirmar);
    configurarReenvios();
  } catch (error) {
    console.error(error);
    alert("Erro ao carregar dados da modal.");
  }
}


function preencherDadosCliente(osData) {
  setarTexto("modalStatusGeral", osData.status || "PENDENTE");
  setarTexto(
    "modalDataEnvio",
    osData.criado_em ? new Date(osData.criado_em).toLocaleDateString("pt-BR") : "-",
  );
  setarTexto(
    "modalCliente",
    osData.veiculo_detalhes?.cliente_detalhes?.nome || "-",
  );
  setarTexto(
    "modalTelefone",
    osData.veiculo_detalhes?.cliente_detalhes?.telefone || "-",
  );
}


function setarTexto(id, valor) {
  const el = document.getElementById(id);
  if (el) el.textContent = valor;
}


function renderizarItensModal(itens) {
  const lista = document.getElementById("listaItensModal");
  if (!lista) return;

  if (itens.length === 0) {
    lista.innerHTML =
      '<tr><td colspan="4" class="text-center">Nenhum item.</td></tr>';
    return;
  }

  lista.innerHTML = "";
  itens.forEach((item) => lista.appendChild(linhaItem(item, itens)));
}


function linhaItem(item, todosItens) {
  const { nome, descricao } = extrairNomeEDescricao(item);
  const valor = parseFloat(item.valor_unitario).toFixed(2);

  const pendente = state.pendingChanges[item.id];
  const approveClass = pendente === "aprovado" ? "active-approve" : "";
  const rejectClass = pendente === "reprovado" ? "active-reject" : "";

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${escapeHtml(nome)}</td>
    <td class="desc-col">${escapeHtml(descricao)}</td>
    <td>R$ ${valor}</td>
    <td class="actions-cell">
      <button class="btn-icon btn-approve ${approveClass}" data-id="${item.id}" data-status="aprovado" title="Aprovar item">
        <i class="fas fa-check" aria-hidden="true"></i>
      </button>
      <button class="btn-icon btn-reject ${rejectClass}" data-id="${item.id}" data-status="reprovado" title="Reprovar item">
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </td>
  `;

  tr.querySelectorAll(".btn-approve, .btn-reject").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.pendingChanges[parseInt(btn.dataset.id, 10)] = btn.dataset.status;
      renderizarItensModal(todosItens);
    });
  });
  return tr;
}


function configurarConfirmacao(onConfirmar) {
  const checkbox = document.getElementById("confirmarAprovacao");
  const btn = document.getElementById("btnAprovarComoCliente");
  if (!checkbox || !btn) return;

  checkbox.checked = false;
  btn.disabled = true;

  // Substitui o nó para limpar listeners antigos
  const novo = btn.cloneNode(true);
  btn.parentNode.replaceChild(novo, btn);
  const btnFinal = document.getElementById("btnAprovarComoCliente");

  checkbox.onchange = (e) => (btnFinal.disabled = !e.target.checked);
  btnFinal.onclick = () => onConfirmar?.();
}


function configurarReenvios() {
  document
    .getElementById("btnReenviarWhatsApp")
    ?.addEventListener("click", () => reenviar("whatsapp"));
  document
    .getElementById("btnReenviarSMS")
    ?.addEventListener("click", () => reenviar("sms"));
  document
    .getElementById("btnReenviarEmail")
    ?.addEventListener("click", () => reenviar("email"));
}


function reenviar(metodo) {
  alert(`Reenviar solicitação por ${metodo.toUpperCase()} - funcionalidade em desenvolvimento.`);
}


/** Fecha a modal de aprovação. */
export function fecharModalAprovacao() {
  const modal = document.getElementById("modalGerenciarAprovacao");
  if (modal && typeof modal.close === "function") modal.close();
}
