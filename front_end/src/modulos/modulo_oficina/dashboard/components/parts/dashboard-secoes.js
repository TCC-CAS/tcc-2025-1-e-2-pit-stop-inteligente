// dashboard-secoes.js
//
// Renderiza as seções complementares do dashboard a partir de state.dashboard:
//  - Alertas
//  - Aprovações de orçamento
//  - Desempenho da equipe
//  - Totais gerais (clientes / veículos / catálogo)

import { state } from "./dashboard-state.js";


export function atualizarAlertas() {
  const alertas = state.dashboard?.alertas || [];
  const lista = document.getElementById("alertList");
  if (!lista) return;

  lista.innerHTML = alertas
    .map(
      (a) => `
      <div class="alert-item alert-${a.tipo}" role="status">
        <i class="fas ${iconePorTipo(a.tipo)}" aria-hidden="true"></i>
        <span>${a.mensagem}</span>
      </div>`,
    )
    .join("");
}


function iconePorTipo(tipo) {
  const map = {
    success: "fa-check-circle",
    info: "fa-info-circle",
    warning: "fa-exclamation-triangle",
    error: "fa-exclamation-circle",
  };
  return map[tipo] || "fa-info-circle";
}


export function atualizarAprovacoes() {
  const ap = state.dashboard?.aprovacoes;
  if (!ap) return;
  setarTexto("aprovPendentes", ap.pendentes);
  setarTexto("aprovAprovados", ap.aprovados);
  setarTexto("aprovReprovados", ap.reprovados);
  setarTexto("aprovTaxa", `${(ap.taxa_aprovacao ?? 0).toFixed(1)}%`);
}


export function atualizarDesempenhoEquipe() {
  const equipe = state.dashboard?.equipe || [];
  const tbody = document.getElementById("equipeBody");
  if (!tbody) return;

  if (equipe.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="text-center text-secondary">Sem dados de equipe no período.</td></tr>';
    return;
  }

  tbody.innerHTML = equipe
    .map(
      (m) => `
      <tr>
        <td>${m.nome}</td>
        <td>${m.os_total}</td>
        <td>${m.tempo_medio_dias.toFixed(1)}</td>
        <td>
          <div class="eficiencia-bar">
            <div class="eficiencia-fill" style="width: ${m.eficiencia}%"></div>
            <span>${m.eficiencia}%</span>
          </div>
        </td>
      </tr>`,
    )
    .join("");
}


export function atualizarTotaisGerais() {
  const t = state.dashboard?.totais;
  if (!t) return;
  setarTexto("totalClientesAtendidos", t.clientes_atendidos);
  setarTexto("totalVeiculosAtendidos", t.veiculos_atendidos);
  setarTexto("totalClientesOficina", t.total_clientes_oficina);
  setarTexto("totalServicosCatalogo", t.total_servicos_catalogo);
}


function setarTexto(id, valor) {
  const el = document.getElementById(id);
  if (el) el.innerText = valor ?? 0;
}
