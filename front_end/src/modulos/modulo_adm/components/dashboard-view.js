// dashboard-view.js — Aba Dashboard (visão consolidada).

import { AdminAPI } from "../services/admin-api.js";
import { escapeHtml, toast } from "./admin-ui.js";


export async function renderDashboard(container) {
  container.innerHTML = `<div class="admin-loading">Carregando dashboard…</div>`;
  let dados;
  try {
    dados = await AdminAPI.dashboard();
  } catch (err) {
    container.innerHTML = `<div class="admin-error">${escapeHtml(err.message)}</div>`;
    return;
  }

  const k = dados.kpis;
  const eventos = (dados.eventos_recentes || []).map((ev) => `
    <li>
      <span class="ev-badge ev-${escapeHtml(ev.nivel)}">${escapeHtml(ev.nivel)}</span>
      <strong>${escapeHtml(ev.acao)}</strong> · ${escapeHtml(ev.descricao)}
      <time>${escapeHtml(ev.criado_em)}</time>
    </li>
  `).join("");

  const topOficinas = (dados.top_oficinas || []).map((o) => `
    <li>
      <span class="rank-name">${escapeHtml(o.nome)}</span>
      <span class="rank-count">${o.qtd} OS</span>
    </li>
  `).join("");

  container.innerHTML = `
    <section class="admin-section">
      <header class="admin-section-head">
        <h2><i class="fas fa-chart-pie"></i> Visão consolidada</h2>
        <p>Indicadores globais da plataforma SaaS.</p>
      </header>

      <div class="kpi-grid">
        ${kpi("fa-store", "Oficinas", k.total_oficinas, `+${k.novas_oficinas_7d} nos últimos 7 dias`)}
        ${kpi("fa-users", "Clientes", k.total_clientes, `+${k.novos_clientes_30d} em 30 dias`)}
        ${kpi("fa-user-shield", "Usuários", k.total_usuarios)}
        ${kpi("fa-clipboard-list", "Ordens de Serviço", k.total_os, `+${k.novas_os_7d} nos últimos 7 dias`)}
        ${kpi("fa-hourglass-half", "OS Pendentes", k.os_pendentes)}
        ${kpi("fa-wrench", "OS Em Execução", k.os_execucao)}
        ${kpi("fa-flag-checkered", "OS Concluídas", k.os_concluidas)}
        ${kpi("fa-percent", "Taxa de Conclusão", `${k.taxa_conclusao}%`)}
      </div>

      <div class="admin-grid-2">
        <article class="admin-card">
          <header><h3><i class="fas fa-chart-bar"></i> Distribuição de OS por status</h3></header>
          <div class="bar-chart" id="osBarChart" aria-label="Distribuição de OS por status"></div>
        </article>
        <article class="admin-card">
          <header><h3><i class="fas fa-trophy"></i> Top oficinas (por nº de OS)</h3></header>
          ${topOficinas
            ? `<ol class="rank-list">${topOficinas}</ol>`
            : `<p class="admin-empty">Sem dados disponíveis.</p>`}
        </article>
      </div>

      <article class="admin-card">
        <header><h3><i class="fas fa-history"></i> Eventos recentes (auditoria)</h3></header>
        ${eventos
          ? `<ul class="admin-events">${eventos}</ul>`
          : `<p class="admin-empty">Nenhum evento registrado ainda.</p>`}
      </article>
    </section>
  `;

  desenharBarChart(container.querySelector("#osBarChart"), dados.os_status_distribuicao);
}


function kpi(icone, titulo, valor, hint = "") {
  return `
    <div class="kpi-card">
      <div class="kpi-icon"><i class="fas ${icone}" aria-hidden="true"></i></div>
      <div class="kpi-body">
        <span class="kpi-titulo">${escapeHtml(titulo)}</span>
        <strong class="kpi-valor">${escapeHtml(String(valor))}</strong>
        ${hint ? `<small class="kpi-hint">${escapeHtml(hint)}</small>` : ""}
      </div>
    </div>
  `;
}


function desenharBarChart(host, distribuicao) {
  if (!host || !distribuicao) return;
  const cores = { pendente: "#ca8a04", execucao: "#0284c7", concluido: "#16a34a" };
  const total = Object.values(distribuicao).reduce((a, b) => a + b, 0) || 1;
  host.innerHTML = Object.entries(distribuicao).map(([k, v]) => {
    const pct = Math.round((v / total) * 100);
    return `
      <div class="bar-row">
        <span class="bar-label">${labelPorStatus(k)}</span>
        <div class="bar-track" role="progressbar" aria-valuenow="${v}" aria-valuemax="${total}">
          <div class="bar-fill" style="width:${pct}%;background:${cores[k] || '#64748b'};"></div>
        </div>
        <span class="bar-value">${v} · ${pct}%</span>
      </div>`;
  }).join("");
}


function labelPorStatus(s) {
  return {
    pendente: "Pendente",
    execucao: "Em Execução",
    concluido: "Concluído",
  }[s] || s;
}
