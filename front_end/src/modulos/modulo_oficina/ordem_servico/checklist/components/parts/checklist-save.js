// checklist-save.js
//
// Persistência final do checklist:
//  1. valida o passo atual (assinaturas);
//  2. envia o JSON com dados + assinaturas;
//  3. faz upload em batches por categoria das fotos novas;
//  4. dispara evento "os:checklist-atualizado" para que outras abas atualizem o estado.

import { apiUrl, getCsrfToken } from "../../../../../../shared/config/api-config.js";
import { ChecklistService } from "../../services/checklist-service.js";
import { isCanvasBlank, state, validarPassoAtual } from "./checklist-state.js";
import { reajustarCanvases } from "./checklist-signatures.js";
import { carregarResumoChecklist } from "./checklist-summary.js";


function coletarPayload(sigTech) {
  const valor = (selector, isCheckbox = false) => {
    const el = document.querySelector(selector);
    if (!el) return isCheckbox ? false : "";
    return isCheckbox ? !!el.checked : (el.value ?? "");
  };

  // Preserva a assinatura do cliente que veio do PORTAL DO CLIENTE: a
  // oficina nunca grava esse campo. O back-end mantém o valor existente
  // se enviarmos null/undefined explicitamente.
  const assinaturaClienteExistente = state.checklistDataCache?.assinatura_cliente || null;

  return {
    concluido: true,
    assinatura_cliente: assinaturaClienteExistente,
    assinatura_tecnico: sigTech.toDataURL("image/png"),
    data_recebimento: valor('[name="data_recebimento"]'),
    consultor: valor('[name="consultor"]'),
    quilometragem: valor('[name="km"]'),
    nivel_combustivel: valor('[name="fuel"]'),
    observacoes_iniciais: valor('[name="obs_inicial"]'),
    lataria_pintura: valor('[name="ext_body"]'),
    vidros_farois: valor('[name="ext_glass"]'),
    possui_manual: valor("#chk_manual", true),
    possui_estepe_macaco: valor("#chk_step", true),
    observacoes_internas: valor('[name="int_obs"]'),
    nivel_oleo: valor('[name="mech_oil"]'),
    fluido_arrefecimento: valor('[name="mech_coolant"]'),
    observacoes_mecanica: valor('[name="mec_obs"]') || "",
  };
}


async function uploadFotosCategoria(osId, arquivos, categoria) {
  // Filtra apenas fotos NOVAS: as que já têm `documentoId` foram baixadas do
  // servidor em `carregarFotosDoServidor` e re-postá-las criaria duplicatas
  // no banco. A remoção de fotos antigas já é tratada via DELETE em tempo
  // real pelo botão "X" da miniatura (ver checklist-photos.js).
  const novas = arquivos.filter((f) => !f.documentoId);
  if (!novas.length) return;

  const formData = new FormData();
  novas.forEach((f) => formData.append("files", f));
  formData.append("origem", "checklist");
  formData.append("categoria", categoria);

  await fetch(apiUrl(`/os/${osId}/documentos/upload/`), {
    method: "POST",
    credentials: "include",
    headers: { "X-CSRFToken": getCsrfToken() },
    body: formData,
  });
}


/** Persiste todo o checklist (dados + fotos) e atualiza a UI. */
export async function finalizarChecklist() {
  if (!(await validarPassoAtual())) return;

  reajustarCanvases();
  await new Promise((resolve) => setTimeout(resolve, 50));

  const sigTech = document.getElementById("sigTech");
  if (!sigTech || isCanvasBlank(sigTech)) {
    alert(
      "Para finalizar o checklist, registre a assinatura do TÉCNICO. " +
      "A assinatura do cliente é coletada apenas no portal do cliente."
    );
    return;
  }

  const payload = coletarPayload(sigTech);
  const btnFinalizar = document.getElementById("btnFinalizarChecklist");
  if (btnFinalizar) {
    btnFinalizar.disabled = true;
    btnFinalizar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
  }

  try {
    await ChecklistService.salvarChecklist(state.currentOsId, payload);

    await Promise.all([
      uploadFotosCategoria(state.currentOsId, state.fotosExterno, "externo"),
      uploadFotosCategoria(state.currentOsId, state.fotosInterno, "interno"),
      uploadFotosCategoria(state.currentOsId, state.fotosMecanica, "mecanica"),
    ]);

    alert("Checklist salvo com sucesso!");
    document.getElementById("modalChecklist")?.close();

    setTimeout(async () => {
      await carregarResumoChecklist(state.currentOsId);
      document.dispatchEvent(
        new CustomEvent("os:checklist-atualizado", { bubbles: true }),
      );
    }, 100);
  } catch (err) {
    console.error(err);
    alert("Erro ao salvar checklist.");
  } finally {
    if (btnFinalizar) {
      btnFinalizar.disabled = false;
      btnFinalizar.innerHTML = "Finalizar Checklist";
    }
  }
}
