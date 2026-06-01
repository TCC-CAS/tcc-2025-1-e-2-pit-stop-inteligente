// dashboard-kpis.js
//
// Renderização dos KPIs (cards numéricos + tendência) e do card lateral
// de OS por status. Lê tudo de state.dashboard.

import { state } from "./dashboard-state.js";


export function atualizarKPIs() {
  const kpis = state.dashboard?.kpis;
  if (!kpis) return;

  setarValor("kpiAbertas", kpis.os_abertas);
  setarValor("kpiAndamento", kpis.os_em_andamento);
  setarValor("kpiConcluidas", kpis.os_concluidas);
  setarValor("kpiFaturamento", formatarMoeda(kpis.faturamento));
  setarValor("kpiTicketMedio", formatarMoeda(kpis.ticket_medio));
  setarValor("kpiTempoMedio", kpis.tempo_medio_dias);

  setarTendencia("trendAbertas", kpis.tendencias.os_abertas);
  setarTendencia("trendAndamento", kpis.tendencias.os_em_andamento);
  setarTendencia("trendConcluidas", kpis.tendencias.os_concluidas);
  setarTendencia("trendFaturamento", kpis.tendencias.faturamento);
  setarTendencia("trendTicket", kpis.tendencias.ticket_medio);
  setarTendencia("trendTempo", kpis.tendencias.tempo_medio_dias);
}


function setarValor(id, valor) {
  const el = document.getElementById(id);
  if (el) el.innerText = valor ?? 0;
}


function setarTendencia(id, texto) {
  const el = document.getElementById(id);
  if (!el || !texto) return;
  const subindo = texto.startsWith("+") && !/^\+0(\.0)?%$/.test(texto);
  el.innerHTML = `<i class="fas ${subindo ? "fa-arrow-up" : "fa-arrow-down"}" aria-hidden="true"></i> ${texto}`;
  el.classList.toggle("trend-up", subindo);
  el.classList.toggle("trend-down", !subindo);
}


function formatarMoeda(valor) {
  return `R$ ${Number(valor || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}


/** Card lateral "OS por status" + clique abre modal com lista detalhada. */
export function atualizarCardStatus(onClickStatus) {
  const pie = state.dashboard?.graficos?.status_pie;
  const total = state.dashboard?.kpis;
  if (!pie || !total) return;

  setarValor(
    "totalOSCard",
    `${total.os_abertas + total.os_em_andamento + total.os_concluidas} total`,
  );

  const container = document.getElementById("osStatusStats");
  if (!container) return;

  container.innerHTML = `
    ${itemStatus("pendente",  "fa-clock",          "Pendentes",     pie.pendente)}
    ${itemStatus("execucao",  "fa-spinner fa-pulse","Em Execução",  pie.execucao + pie.aprovado)}
    ${itemStatus("concluido", "fa-check-circle",   "Concluídas",    pie.concluido)}
  `;

  container.querySelectorAll(".status-stat-item").forEach((el) => {
    el.addEventListener("click", () => onClickStatus?.(el.dataset.status));
  });
}


function itemStatus(status, icon, label, valor) {
  return `
    <button type="button" class="status-stat-item" data-status="${status}" aria-label="${label}">
      <i class="fas ${icon}" aria-hidden="true"></i>
      <span class="stat-label">${label}</span>
      <span class="stat-number">${valor ?? 0}</span>
    </button>
  `;
}
