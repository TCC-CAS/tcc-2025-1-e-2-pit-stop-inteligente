// dashboard.js
//
// Ponto de entrada do Dashboard Gerencial. Orquestra carga de dados +
// renderização. Toda a lógica vive em ./parts/* (state, api, kpis, charts,
// secoes). Sem mock — os dados vêm de /api/oficina/dashboard/?periodo=<dias>.

import { garantirAcesso } from "../../../../shared/services/auth-guard.js";
import { urlInterna } from "../../../../shared/services/base-path.js";
import { carregarDashboard } from "./parts/dashboard-api.js";
import { atualizarGraficos } from "./parts/dashboard-charts.js";
import { atualizarCardStatus, atualizarKPIs } from "./parts/dashboard-kpis.js";
import { exportarPDF } from "./parts/dashboard-export.js";
import {
  atualizarAlertas,
  atualizarAprovacoes,
  atualizarDesempenhoEquipe,
  atualizarTotaisGerais,
} from "./parts/dashboard-secoes.js";
import { configurarBotaoAnalise } from "./parts/dashboard-analise.js";
import { setFiltro, state } from "./parts/dashboard-state.js";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
  // Paywall: dashboard exige assinatura vigente. Se não, guard redireciona
  // automaticamente para a aba "Renovação de Plano".
  if (!(await garantirAcesso({ paginaChave: "dashboard" }))) return;
  initDashboard();
});

async function initDashboard() {
  configurarFiltros();
  configurarBotoes();
  configurarAbas();
  // Botão "Gerar Análise" (cria o card se ainda não estiver no HTML)
  configurarBotaoAnalise();
  await recarregar();
}

async function recarregar() {
  setLoading(true);
  try {
    await carregarDashboard();
    renderizarTudo();
  } catch (error) {
    console.error("Falha ao carregar dashboard:", error);
    notificarErro(error.message);
  } finally {
    setLoading(false);
  }
}

function renderizarTudo() {
  atualizarKPIs();
  atualizarGraficos();
  atualizarCardStatus(abrirModalPorStatus);
  atualizarAlertas();
  atualizarAprovacoes();
  atualizarDesempenhoEquipe();
  atualizarTotaisGerais();
}

// ---------------------------------------------------------------------------
// Filtros e botões
// ---------------------------------------------------------------------------

function configurarFiltros() {
  const periodo = document.getElementById("periodoSelect");
  if (periodo) {
    periodo.addEventListener("change", (e) => {
      const valor = e.target.value;
      setFiltro("periodo", valor === "custom" ? "custom" : parseInt(valor, 10));

      const customRange = document.getElementById("customDateRange");
      if (customRange) customRange.style.display = valor === "custom" ? "flex" : "none";

      if (valor !== "custom") recarregar();
    });
  }

  document.getElementById("btnAplicarPeriodo")?.addEventListener("click", () => {
    setFiltro("dataInicio", document.getElementById("dataInicio")?.value);
    setFiltro("dataFim", document.getElementById("dataFim")?.value);
    recarregar();
  });
}

function configurarBotoes() {
  document
    .getElementById("btnRefreshDashboard")
    ?.addEventListener("click", recarregar);

  document.getElementById("btnExportarPDF")?.addEventListener("click", exportarPDF);
}

// ---------------------------------------------------------------------------
// Gerenciamento de abas
// ---------------------------------------------------------------------------

function configurarAbas() {
  const tabs = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".tab-panel");

  function activateTab(targetId) {
    tabs.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === targetId);
    });
    panels.forEach((panel) => {
      panel.classList.toggle("active", panel.id === `tab-${targetId}`);
    });

    // Redimensiona gráficos que podem ter ficado ocultos
    Object.values(state.charts).forEach((chart) => {
      if (chart && typeof chart.resize === "function") {
        chart.resize();
      }
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => activateTab(tab.dataset.tab));
  });
}

// ---------------------------------------------------------------------------
// Estados de UI
// ---------------------------------------------------------------------------

function setLoading(carregando) {
  document.body.classList.toggle("dashboard-loading", carregando);
}

function notificarErro(mensagem) {
  const alerta = document.getElementById("alertList");
  if (!alerta) return;
  alerta.innerHTML = `
    <div class="alert-item alert-error" role="alert">
      <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
      <span>${mensagem}</span>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Modal "OS por status"
// ---------------------------------------------------------------------------

function abrirModalPorStatus(status) {
  const url = urlInterna(`modulos/modulo_oficina/ordem_servico/shared/page/os-visao-geral.html?status=${encodeURIComponent(status)}`);
  window.location.href = url;
}