// dashboard-api.js
//
// Carrega o payload do dashboard a partir do endpoint único:
//   GET /api/oficina/dashboard/?periodo=<dias>
//
// O service back-end já entrega tudo agregado (KPIs, gráficos, alertas,
// aprovações, equipe, totais), então o front-end só consome o JSON.

import { apiUrl } from "../../../../../shared/config/api-config.js";
import { state } from "./dashboard-state.js";


/**
 * Busca o dashboard do back-end usando o período configurado em state.filtros.
 * Atualiza state.dashboard e retorna o payload.
 */
export async function carregarDashboard() {
  const dias = resolverDias(state.filtros);
  const params = new URLSearchParams({ periodo: dias });

  const response = await fetch(apiUrl(`/dashboard/?${params}`), {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Erro ao carregar dashboard: HTTP ${response.status}`);
  }

  state.dashboard = await response.json();
  return state.dashboard;
}


/**
 * Decide quantos dias enviar ao back. Se for "custom", calcula a diferença
 * entre dataInicio e dataFim; caso contrário envia o número direto.
 */
function resolverDias(filtros) {
  if (filtros.periodo !== "custom") return parseInt(filtros.periodo, 10) || 30;
  if (!filtros.dataInicio || !filtros.dataFim) return 30;
  const inicio = new Date(filtros.dataInicio);
  const fim = new Date(filtros.dataFim);
  const diffMs = fim - inicio;
  const diffDias = Math.max(Math.ceil(diffMs / (1000 * 60 * 60 * 24)), 1);
  return diffDias;
}


/**
 * Chama o motor de insights (botão "Gerar Análise"). Atualiza state.analise.
 * Retorna o payload {resumo_executivo, insights[], total_insights, gerado_em}.
 */
export async function gerarAnaliseInteligente() {
  const dias = resolverDias(state.filtros);
  const params = new URLSearchParams({ periodo: dias });
  const response = await fetch(apiUrl(`/dashboard/analise/?${params}`), {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Erro ao gerar análise: HTTP ${response.status}`);
  }
  state.analise = await response.json();
  return state.analise;
}
