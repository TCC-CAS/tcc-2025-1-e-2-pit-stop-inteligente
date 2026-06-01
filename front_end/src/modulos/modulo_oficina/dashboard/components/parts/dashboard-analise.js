// dashboard-analise.js
//
// Card "Análise Inteligente" do Dashboard. O usuário clica em
// "Gerar Análise" e recebe um resumo executivo + cards de insights
// classificados por categoria/severidade.
//
// A geração é sob demanda (não roda no carregamento inicial do dashboard)
// porque consome mais cálculos no back-end e queremos ser explícitos
// sobre quando exibir.

import { gerarAnaliseInteligente } from "./dashboard-api.js";
import { state } from "./dashboard-state.js";


const SEVERIDADE_CONFIG = {
  positivo: { cls: "ok", icone: "fa-circle-check", titulo: "Ponto positivo" },
  info:     { cls: "info", icone: "fa-circle-info", titulo: "Informativo" },
  atencao:  { cls: "warn", icone: "fa-triangle-exclamation", titulo: "Atenção" },
  critico:  { cls: "danger", icone: "fa-circle-exclamation", titulo: "Crítico" },
};

const CATEGORIA_LABEL = {
  financeiro:  "Financeiro",
  operacional: "Operacional",
  equipe:      "Equipe",
  qualidade:   "Qualidade",
  geral:       "Geral",
};


/**
 * Procura/cria o container do card no DOM e devolve o elemento. Permite
 * o template HTML não ser alterado: se já existir o #analiseCard, usamos;
 * caso contrário, injetamos como primeira seção do conteúdo do dashboard.
 */
function obterOuCriarContainer() {
  let card = document.getElementById("analiseCard");
  if (card) return card;
  card = document.createElement("section");
  card.id = "analiseCard";
  card.className = "dashboard-section analise-card";
  card.innerHTML = `
    <header class="analise-header">
      <div>
        <h2><i class="fas fa-wand-magic-sparkles"></i> Análise inteligente</h2>
        <p class="analise-sub">Resumo automático dos principais indicadores e ações recomendadas.</p>
      </div>
      <button class="btn btn-primary" id="btnGerarAnalise" type="button">
        <i class="fas fa-bolt"></i> Gerar Análise
      </button>
    </header>
    <div class="analise-body" id="analiseBody">
      <p class="analise-empty">
        <i class="fas fa-lightbulb"></i>
        Clique em "Gerar Análise" para receber um diagnóstico automático
        baseado nos dados do período selecionado.
      </p>
    </div>
  `;
  const host =
    document.querySelector(".dashboard-content") ||
    document.querySelector("main") ||
    document.body;
  host.prepend(card);
  return card;
}


export function configurarBotaoAnalise() {
  const card = obterOuCriarContainer();
  const btn = card.querySelector("#btnGerarAnalise");
  btn?.addEventListener("click", async () => {
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Analisando...`;
    try {
      await gerarAnaliseInteligente();
      renderizarAnalise(card);
    } catch (err) {
      renderizarErro(card, err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  });
}


function renderizarAnalise(card) {
  const dados = state.analise;
  const corpo = card.querySelector("#analiseBody");
  if (!dados) {
    corpo.innerHTML = `<p class="analise-empty">Sem dados ainda.</p>`;
    return;
  }
  const geradoEm = formatarDataHora(dados.gerado_em);
  const insightsHtml = (dados.insights || []).map(itemMarkup).join("");
  corpo.innerHTML = `
    <div class="analise-resumo">
      <i class="fas fa-quote-left"></i>
      <span>${escape(dados.resumo_executivo || "")}</span>
    </div>
    <div class="analise-meta">
      <small><i class="fas fa-clock"></i> Gerado em ${escape(geradoEm)}</small>
      <small><i class="fas fa-list"></i> ${dados.total_insights || 0} insight(s)</small>
    </div>
    ${insightsHtml ? `<div class="analise-grid">${insightsHtml}</div>` : `
      <p class="analise-empty">
        <i class="fas fa-check-circle"></i>
        Nada de extraordinário no período. A operação parece estável.
      </p>
    `}
  `;
}


function itemMarkup(insight) {
  const sev = SEVERIDADE_CONFIG[insight.severidade] || SEVERIDADE_CONFIG.info;
  const categoria = CATEGORIA_LABEL[insight.categoria] || insight.categoria || "Geral";
  return `
    <article class="analise-item ${sev.cls}">
      <header>
        <i class="fas ${sev.icone}" aria-hidden="true"></i>
        <strong>${escape(insight.titulo)}</strong>
        ${insight.metrica ? `<span class="analise-metrica">${escape(insight.metrica)}</span>` : ""}
      </header>
      <p>${escape(insight.descricao)}</p>
      <footer>
        <span class="analise-categoria">${escape(categoria)}</span>
        ${insight.acao_sugerida
          ? `<small class="analise-acao"><i class="fas fa-arrow-right"></i> ${escape(insight.acao_sugerida)}</small>`
          : ""}
      </footer>
    </article>
  `;
}


function renderizarErro(card, mensagem) {
  const corpo = card.querySelector("#analiseBody");
  corpo.innerHTML = `
    <p class="analise-empty erro">
      <i class="fas fa-circle-exclamation"></i>
      Não foi possível gerar a análise: ${escape(mensagem)}
    </p>
  `;
}


function formatarDataHora(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}


function escape(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[m]);
}
