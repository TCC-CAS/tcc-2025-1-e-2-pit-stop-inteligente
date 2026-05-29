// suporte-view.js — aba "Suporte" do Painel ADM.
//
// Reaproveita o componente compartilhado `<suporte-chat>` em modo "admin",
// que já entrega filtros (status / prioridade / busca), thread de
// mensagens, anotações internas e edição de status/prioridade.
// Antes do chat, mostramos um pequeno painel de KPIs (abertos / urgentes
// / mensagens não lidas) para dar visão executiva à equipe.

import { AdminAPI } from "../services/admin-api.js";
import { renderSuporte } from "../../../shared/components/suporte-chat.js";
import { escapeHtml } from "./admin-ui.js";


/** Atualiza o badge "Suporte" do menu lateral. Polling leve do entrypoint. */
export async function atualizarBadgeSuporteGlobal() {
  try {
    const r = await AdminAPI.suporte.sumario();
    const badge = document.getElementById("navBadgeSuporte");
    if (!badge) return;
    const total = (r.abertos || 0) + (r.em_atendimento || 0);
    if (total > 0) {
      badge.hidden = false;
      badge.textContent = total > 99 ? "99+" : String(total);
    } else {
      badge.hidden = true;
    }
  } catch {
    /* silencioso */
  }
}


export async function renderSuporteAdmin(container) {
  container.innerHTML = `
    <section class="admin-section">
      <header class="admin-section-head">
        <h2><i class="fas fa-headset"></i> Solicitações de Suporte</h2>
        <p>Visualize, atribua e responda chamados de oficinas e clientes.</p>
      </header>

      <div class="kpi-grid" id="suporteKpis">
        <div class="kpi-card"><div class="kpi-icon"><i class="fas fa-spinner fa-spin"></i></div>
          <div class="kpi-body"><span class="kpi-titulo">Carregando…</span></div></div>
      </div>

      <div id="suporteAdminContainer"></div>
    </section>
  `;

  carregarKpis(container);
  const host = container.querySelector("#suporteAdminContainer");
  await renderSuporte(host, AdminAPI.suporte, {
    titulo: "Tickets globais",
    modo: "admin",
    podeCriar: false,
  });
}


async function carregarKpis(container) {
  const grid = container.querySelector("#suporteKpis");
  try {
    const k = await AdminAPI.suporte.sumario();
    grid.innerHTML = [
      kpi("fa-inbox", "Abertos", k.abertos, "Aguardando triagem"),
      kpi("fa-headset", "Em atendimento", k.em_atendimento, ""),
      kpi("fa-fire", "Urgentes", k.urgentes, "Prioridade urgente em aberto"),
      kpi("fa-exclamation-triangle", "Alta prioridade", k.altas, ""),
      kpi("fa-comments", "Mensagens não lidas", k.mensagens_nao_lidas, "Aguardam resposta da equipe"),
      kpi("fa-check-circle", "Resolvidos", k.resolvidos, ""),
    ].join("");
  } catch (err) {
    grid.innerHTML = `<div class="admin-error">${escapeHtml(err.message)}</div>`;
  }
}


function kpi(icone, titulo, valor, hint = "") {
  return `
    <div class="kpi-card">
      <div class="kpi-icon"><i class="fas ${icone}" aria-hidden="true"></i></div>
      <div class="kpi-body">
        <span class="kpi-titulo">${escapeHtml(titulo)}</span>
        <strong class="kpi-valor">${escapeHtml(String(valor ?? 0))}</strong>
        ${hint ? `<small class="kpi-hint">${escapeHtml(hint)}</small>` : ""}
      </div>
    </div>
  `;
}
