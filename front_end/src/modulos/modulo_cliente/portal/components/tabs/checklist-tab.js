// checklist-tab.js (portal do cliente)
//
// Renderiza o checklist em modo somente-leitura, com ação dedicada de
// "Assinar agora" caso o cliente ainda não tenha registrado a assinatura.
// O fluxo de assinatura abre o painel de Assinatura (outra aba).

import { ClienteOSApi } from "../../services/cliente-os-api.js";
import "../../../../../shared/components/status-badge.js";


const FUEL_LABEL = {
  reserva: "Reserva",
  "1/4": "1/4",
  "1/2": "1/2 (Meio Tanque)",
  "3/4": "3/4",
  cheio: "Cheio",
};
const OLEO_LABEL = { ok: "Nível Normal", low: "Baixo", crit: "Crítico/Vazio" };
const FLUIDO_LABEL = { ok: "Nível Normal", low: "Baixo" };


export async function renderChecklistCliente(container, osId, { onAssinarRequest }) {
  container.innerHTML = `<div class="loading-state">Carregando checklist…</div>`;

  let dados;
  try {
    dados = await ClienteOSApi.checklist(osId);
  } catch (err) {
    container.innerHTML = `<div class="error-state" role="alert">${err.message}</div>`;
    return;
  }

  if (!dados.disponivel) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-clipboard-list" aria-hidden="true"></i>
        <h3>Checklist ainda não disponível</h3>
        <p>A oficina ainda não preencheu o checklist de recebimento. Você será notificado quando ele estiver disponível para sua assinatura.</p>
      </div>`;
    return;
  }

  const clienteAssinou = dados.cliente_assinou;
  container.innerHTML = `
    <section class="cliente-tab-section" aria-labelledby="hChecklist">
      <header class="section-header">
        <div>
          <h2 id="hChecklist"><i class="fas fa-clipboard-check"></i> Checklist de Recebimento</h2>
          <p class="section-sub">Confira o estado do seu veículo no momento da entrega.</p>
        </div>
        <status-badge type="checklist"
                      status="${clienteAssinou ? "assinado" : (dados.concluido ? "concluido" : "pendente")}">
        </status-badge>
      </header>

      <div class="cards-grid">
        ${cardInfo("Informações do Recebimento", [
          ["Data", formatarData(dados.data_recebimento)],
          ["Consultor", dados.consultor || "—"],
          ["Combustível", FUEL_LABEL[dados.nivel_combustivel] || "—"],
          ["Observações", dados.observacoes_iniciais || "—", true],
        ])}
        ${cardInfo("Inspeção Externa", [
          ["Lataria / Pintura", dados.lataria_pintura || "Sem ocorrências", true],
          ["Vidros / Faróis", dados.vidros_farois || "Sem ocorrências", true],
        ])}
        ${cardInfo("Inspeção Interna", [
          ["Manual a bordo", dados.possui_manual ? "Sim" : "Não"],
          ["Estepe / Macaco", dados.possui_estepe_macaco ? "Sim" : "Não"],
          ["Observações", dados.observacoes_internas || "—", true],
        ])}
        ${cardInfo("Mecânica", [
          ["Nível de óleo", OLEO_LABEL[dados.nivel_oleo] || "—"],
          ["Fluido de arrefecimento", FLUIDO_LABEL[dados.fluido_arrefecimento] || "—"],
          ["Observações", dados.observacoes_mecanica || "—", true],
        ])}
      </div>

      <div class="signatures-row">
        ${blocoAssinatura("Assinatura do Técnico", dados.assinatura_tecnico, dados.tecnico_assinou)}
        ${blocoAssinatura("Sua assinatura", dados.assinatura_cliente, clienteAssinou)}
      </div>

      ${clienteAssinou
        ? `<div class="ack ack-ok" role="status"><i class="fas fa-check-circle"></i> Você já assinou o checklist.</div>`
        : `<div class="ack ack-pending">
             <p><i class="fas fa-pen-fancy"></i> Você ainda precisa assinar o checklist para dar prosseguimento.</p>
             <button class="btn btn-primary" type="button" id="btnIrAssinar">
               <i class="fas fa-signature"></i> Assinar agora
             </button>
           </div>`}
    </section>
  `;

  container
    .querySelector("#btnIrAssinar")
    ?.addEventListener("click", () => onAssinarRequest?.());
}


function cardInfo(titulo, linhas) {
  const items = linhas
    .map(([k, v, longo]) => `
      <div class="info-row ${longo ? "info-row-block" : ""}">
        <span class="info-key">${k}</span>
        <span class="info-val">${escapeHtml(v)}</span>
      </div>`)
    .join("");
  return `
    <article class="info-card">
      <h3>${escapeHtml(titulo)}</h3>
      ${items}
    </article>
  `;
}


function blocoAssinatura(titulo, dataUrl, assinado) {
  if (assinado && dataUrl) {
    return `
      <figure class="signature-block">
        <figcaption>${escapeHtml(titulo)}</figcaption>
        <img src="${dataUrl}" alt="Imagem da ${escapeHtml(titulo)}">
        <small><i class="fas fa-check-circle"></i> Assinado</small>
      </figure>`;
  }
  return `
    <figure class="signature-block signature-empty">
      <figcaption>${escapeHtml(titulo)}</figcaption>
      <div class="signature-placeholder">
        <i class="fas fa-pen-fancy"></i> Aguardando assinatura
      </div>
    </figure>`;
}


function formatarData(iso) {
  if (!iso) return "—";
  const partes = iso.split("-");
  if (partes.length !== 3) return iso;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}


function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[m]);
}
