// checklist-summary.js
//
// Atualiza o card de resumo do checklist na tela principal da OS.
// Lê o estado (concluido / pendente) e refletindo nos textos, ícones
// e badges. Também recarrega o cache global em state.checklistDataCache.

import { apiUrl } from "../../../../../../shared/config/api-config.js";
import { ChecklistService } from "../../services/checklist-service.js";
import { state } from "./checklist-state.js";
import "../../../../../../shared/components/status-badge.js";


function atualizarBadgeChecklist(status) {
  const alvo = document.getElementById("summaryStatus");
  if (!alvo) return;
  alvo.className = "resumo-value";
  alvo.innerHTML = `<status-badge type="checklist" status="${status}"></status-badge>`;
}


async function contarFotosNoServidor(osId) {
  try {
    const response = await fetch(apiUrl(`/os/${osId}/documentos/`), {
      credentials: 'include'
    });
    if (!response.ok) return 0;
    const docs = await response.json();
    return docs.filter((doc) => doc.origem === "checklist").length;
  } catch {
    return 0;
  }
}


function $(id) {
  return document.getElementById(id);
}


function aplicarEstadoConcluido(dados, totalFotos) {
  $("statusTitle").innerHTML = "Checklist Concluído";
  $("statusDesc").innerText = "Checklist já foi preenchido e assinado. Etapas liberadas.";
  $("statusIcon").className = "fas fa-check-circle";
  $("checklistStatusCard").classList.add("completed");

  $("btnOpenChecklist").style.display = "none";
  $("btnViewChecklist").style.display = "inline-flex";

  atualizarBadgeChecklist("concluido");
  $("summarySignClient").innerHTML = '<i class="fas fa-check-circle"></i> Assinado';
  $("summarySignTech").innerHTML = '<i class="fas fa-check-circle"></i> Assinado';
  $("summaryDate").innerText = dados.criado_em
    ? new Date(dados.criado_em).toLocaleDateString()
    : "-";
  $("summaryResponsible").innerText = dados.consultor || "-";
  $("summaryPhotosCount").innerText = `${totalFotos} foto(s)`;

  state.tabsRef?.setLockedByChecklist?.(true);
}


function aplicarEstadoPendente(dados, totalFotos) {
  $("statusTitle").innerHTML = "Checklist Pendente";
  $("statusDesc").innerText = "A O.S. está bloqueada. Preenchimento obrigatório.";
  $("statusIcon").className = "fas fa-exclamation-circle";
  $("checklistStatusCard").classList.remove("completed");

  $("btnOpenChecklist").style.display = "inline-flex";
  $("btnViewChecklist").style.display = "none";

  atualizarBadgeChecklist("pendente");
  $("summarySignClient").innerHTML = '<i class="fas fa-times-circle"></i> Não assinado';
  $("summarySignTech").innerHTML = '<i class="fas fa-times-circle"></i> Não assinado';
  $("summaryDate").innerText = "-";
  $("summaryResponsible").innerText = dados?.consultor || "-";
  $("summaryPhotosCount").innerText = `${totalFotos} foto(s)`;

  state.tabsRef?.setLockedByChecklist?.(false);
}


/** Carrega o checklist do servidor, atualiza cache e card de resumo. */
export async function carregarResumoChecklist(osId) {
  try {
    const dados = await ChecklistService.buscarChecklist(osId);
    state.checklistDataCache = dados;
    const totalFotos = await contarFotosNoServidor(osId);

    if (dados && dados.concluido) {
      aplicarEstadoConcluido(dados, totalFotos);
    } else {
      aplicarEstadoPendente(dados, totalFotos);
    }
  } catch {
    aplicarEstadoPendente(null, 0);
  }
}
