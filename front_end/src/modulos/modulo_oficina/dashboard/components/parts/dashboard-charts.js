// dashboard-charts.js
//
// Renderiza todos os gráficos do dashboard usando Chart.js. Cada função
// destrói a instância anterior antes de criar uma nova, evitando vazamentos.
//
// Tema: as cores são lidas de `chart-theme.js` (que respeita o modo
// escuro). Quando o usuário troca o tema, o `oficina-header` despacha
// `pitstop:tema-mudou` e este módulo recolore todos os charts visíveis.

import { state } from "./dashboard-state.js";
import {
  aplicarTemaPadraoChart,
  coresChart,
  observarMudancaTema,
} from "../../../../../shared/services/chart-theme.js";


let _observadorRegistrado = false;


export function atualizarGraficos() {
  const graficos = state.dashboard?.graficos;
  if (!graficos) return;

  // Aplica defaults do Chart.js conforme tema atual (idempotente).
  aplicarTemaPadraoChart();
  registrarObservadorTema();

  desenharStatusPie(graficos.status_pie);
  desenharEvolucao(graficos.evolucao_diaria);
  desenharFaturamentoMensal(graficos.faturamento_mensal);
  desenharTopServicosRealizados(graficos.top_servicos_realizados);
  desenharTopServicosRentaveis(graficos.top_servicos_rentaveis);
  desenharOSPorDiaSemana(graficos.os_por_dia_semana);
}


/**
 * Garante que mudanças de tema recriem os gráficos com as cores corretas.
 * Registra uma única vez por sessão — chamadas subsequentes são no-op.
 */
function registrarObservadorTema() {
  if (_observadorRegistrado) return;
  _observadorRegistrado = true;
  observarMudancaTema(() => atualizarGraficos());
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function recriar(chartKey, canvasId, config) {
  if (state.charts[chartKey]) state.charts[chartKey].destroy();
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  state.charts[chartKey] = new Chart(canvas, config);
}


/**
 * Aplica eixos com cores do tema. Use em todos os gráficos cartesianos
 * para evitar repetição de `ticks.color` / `grid.color`.
 */
function eixosTema(extra = {}) {
  const c = coresChart();
  return {
    x: {
      ticks: { color: c.textMuted, precision: 0 },
      grid: { color: c.grid, drawBorder: false },
      ...(extra.x || {}),
    },
    y: {
      beginAtZero: true,
      ticks: { color: c.textMuted, precision: 0 },
      grid: { color: c.grid, drawBorder: false },
      ...(extra.y || {}),
    },
  };
}


// ---------------------------------------------------------------------------
// Gráficos individuais
// ---------------------------------------------------------------------------

function desenharStatusPie(pie) {
  const c = coresChart();
  recriar("statusPie", "statusPieChart", {
    type: "doughnut",
    data: {
      labels: ["Pendente", "Aprovado", "Em Execução", "Concluído"],
      datasets: [{
        data: [pie.pendente, pie.aprovado, pie.execucao, pie.concluido],
        backgroundColor: [c.warning, c.accent, c.info, c.success],
        // No dark mode, o "buraco" entre os segmentos precisa ser igual
        // ao fundo do card pra desaparecer visualmente.
        borderWidth: 2,
        borderColor: c.card,
      }],
    },
    options: {
      cutout: "65%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { padding: 12, color: c.text },
        },
      },
    },
  });
}


function desenharEvolucao(evolucao) {
  const c = coresChart();
  recriar("evolucao", "evolucaoOSChart", {
    type: "line",
    data: {
      labels: evolucao.map((p) => p.data),
      datasets: [{
        label: "O.S. abertas",
        data: evolucao.map((p) => p.total),
        borderColor: c.accent,
        backgroundColor: hexParaRgba(c.accent, 0.15),
        tension: 0.25,
        fill: true,
        pointBackgroundColor: c.accent,
        pointBorderColor: c.card,
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: eixosTema(),
    },
  });
}


function desenharFaturamentoMensal(faturamento) {
  const c = coresChart();
  recriar("faturamento", "faturamentoBarChart", {
    type: "bar",
    data: {
      labels: faturamento.map((p) => p.mes),
      datasets: [{
        label: "Faturamento (R$)",
        data: faturamento.map((p) => p.valor),
        backgroundColor: c.success,
        borderRadius: 6,
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: eixosTema({ y: { ticks: { color: coresChart().textMuted } } }),
    },
  });
}


function desenharTopServicosRealizados(servicos) {
  const c = coresChart();
  recriar("servicosRealizados", "servicosRealizadosChart", {
    type: "bar",
    data: {
      labels: servicos.map((s) => s.nome),
      datasets: [{
        label: "Quantidade",
        data: servicos.map((s) => s.quantidade),
        backgroundColor: c.paleta,
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: eixosTema(),
    },
  });
}


function desenharTopServicosRentaveis(servicos) {
  const c = coresChart();
  recriar("servicosRentaveis", "servicosRentaveisChart", {
    type: "bar",
    data: {
      labels: servicos.map((s) => s.nome),
      datasets: [{
        label: "Faturamento (R$)",
        data: servicos.map((s) => s.faturamento),
        backgroundColor: c.paleta[3] || c.accent,
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: eixosTema(),
    },
  });
}


function desenharOSPorDiaSemana(serie) {
  const c = coresChart();
  recriar("osPorDiaSemana", "osPorDiaSemanaChart", {
    type: "bar",
    data: {
      labels: serie.map((p) => p.dia),
      datasets: [{
        label: "O.S. abertas",
        data: serie.map((p) => p.total),
        backgroundColor: c.info,
        borderRadius: 6,
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: eixosTema(),
    },
  });
}


/**
 * Converte cor hex `#rrggbb` em `rgba(r, g, b, alpha)`. Usado para criar
 * a "área" sob a linha de evolução com transparência consistente.
 */
function hexParaRgba(hex, alpha) {
  if (!hex || typeof hex !== "string" || !hex.startsWith("#")) {
    return `rgba(37, 99, 235, ${alpha})`;
  }
  const h = hex.replace("#", "");
  const r = parseInt(h.length === 3 ? h[0] + h[0] : h.slice(0, 2), 16);
  const g = parseInt(h.length === 3 ? h[1] + h[1] : h.slice(2, 4), 16);
  const b = parseInt(h.length === 3 ? h[2] + h[2] : h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
