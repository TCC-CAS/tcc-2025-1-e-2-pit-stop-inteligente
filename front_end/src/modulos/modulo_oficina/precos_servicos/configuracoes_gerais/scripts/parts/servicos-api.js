// servicos-api.js
//
// Camada de comunicação com o back-end para a tela "Preços e Serviços".
// Centraliza todos os fetches e isola o resto do código de detalhes HTTP.

import { API_URL, getCsrfToken } from "../../../../../../shared/config/api-config.js";


function jsonHeaders() {
  return {
    "Content-Type": "application/json",
    "X-CSRFToken": getCsrfToken(),
  };
}


export async function buscarDadosIniciais() {
  const [resConfig, resCategorias, resServicos] = await Promise.all([
    fetch(`${API_URL}/configuracao/`, { credentials: 'include' }),
    fetch(`${API_URL}/categorias/`,   { credentials: 'include' }),
    fetch(`${API_URL}/servicos/`,     { credentials: 'include' }), 
  ]);
  if (!resConfig.ok || !resCategorias.ok || !resServicos.ok) {
    throw new Error("Falha ao buscar dados.");
  }
  return {
    config: await resConfig.json(),
    categorias: await resCategorias.json(),
    servicos: await resServicos.json(),
  };
}


export async function atualizarValorHora(valor) {
  const response = await fetch(`${API_URL}/configuracao/`, {
    method: "PUT",
    credentials: "include",
    headers: jsonHeaders(),
    body: JSON.stringify({ valor_hora: valor }),
  });
  if (!response.ok) throw new Error("Erro ao salvar.");
}


export async function persistirCategoria(categoria) {
  const payload = {
    nome: categoria.nome,
    percentual: parseFloat(categoria.percentual),
    icone: categoria.icone,
    cor: categoria.cor,
  };

  const url = categoria.id
    ? `${API_URL}/categorias/${categoria.id}/`
    : `${API_URL}/categorias/`;
  const method = categoria.id ? "PATCH" : "POST";
  const body = JSON.stringify(categoria.id ? { percentual: payload.percentual } : payload);

  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: jsonHeaders(),
    body,
  });
  if (!response.ok) throw new Error("Falha ao salvar categoria");
  return response.json();
}


/** Cria uma categoria CUSTOM (tipo "outros"). */
export async function criarCategoriaCustom({ nome, percentual, icone, cor }) {
  const response = await fetch(`${API_URL}/categorias/`, {
    method: "POST",
    credentials: "include",
    headers: jsonHeaders(),
    body: JSON.stringify({
      nome,
      percentual: parseFloat(percentual) || 0,
      icone: icone || "fa-circle-plus",
      cor: cor || "#64748b",
    }),
  });
  if (!response.ok) {
    let msg = "Falha ao criar categoria customizada";
    try { msg = (await response.json()).erro || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return response.json();
}


/** Remove uma categoria CUSTOM. Categorias fixas (id < 1000) não podem ser removidas. */
export async function removerCategoriaCustom(id) {
  const response = await fetch(`${API_URL}/categorias/${id}/`, {
    method: "DELETE",
    credentials: "include",
    headers: { "X-CSRFToken": getCsrfToken() },
  });
  if (!response.ok) throw new Error("Falha ao excluir categoria");
}


export async function persistirServico(payload, id = null) {
  const url = id ? `${API_URL}/servicos/${id}/` : `${API_URL}/servicos/`;
  const method = id ? "PUT" : "POST";

  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const erro = await response.json();
    throw new Error(JSON.stringify(erro, null, 2));
  }
  return response.json();
}


export async function removerServico(id) {
  const response = await fetch(`${API_URL}/servicos/${id}/`, {
    method: "DELETE",
    credentials: "include",
    headers: { "X-CSRFToken": getCsrfToken() },
  });
  if (!response.ok) throw new Error("Falha ao excluir");
}
