// execucao-api.js
//
// Serviço HTTP da aba "Execução": tarefas (CRUD), checklist (status),
// finalização da OS. Lança Error com mensagem amigável em caso de falha.

import { apiUrl, getCsrfToken } from "../../../../../../shared/config/api-config.js";


function jsonHeaders() {
  return {
    "Content-Type": "application/json",
    "X-CSRFToken": getCsrfToken(),
  };
}


async function extrairMensagemErro(response) {
  let msg = `Erro ${response.status}: ${response.statusText}`;
  try {
    const data = await response.json();
    msg = data.detail || data.message || JSON.stringify(data);
  } catch {
    try {
      const texto = await response.text();
      if (texto) msg = texto;
    } catch {
      /* mantém mensagem padrão */
    }
  }
  return msg;
}


export const ExecucaoApi = {
  async getTarefas(osId) {
    const response = await fetch(apiUrl(`/os/${osId}/tarefas/`), {
      credentials: "include",
      headers: { "X-CSRFToken": getCsrfToken() },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Erro ao buscar: ${await extrairMensagemErro(response)}`);
    return response.json();
  },

  async salvarTarefa(osId, dados) {
    const response = await fetch(apiUrl(`/os/${osId}/tarefas/`), {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders(),
      body: JSON.stringify(dados),
    });
    if (!response.ok) throw new Error(await extrairMensagemErro(response));
    return response.json();
  },

  async atualizarTarefa(osId, tarefaId, dados) {
    const response = await fetch(apiUrl(`/os/${osId}/tarefas/${tarefaId}/`), {
      method: "PUT",
      credentials: "include",
      headers: jsonHeaders(),
      body: JSON.stringify(dados),
    });
    if (!response.ok) throw new Error(await extrairMensagemErro(response));
    return response.json();
  },

  async deletarTarefa(osId, tarefaId) {
    const response = await fetch(apiUrl(`/os/${osId}/tarefas/${tarefaId}/`), {
      method: "DELETE",
      credentials: "include",
      headers: { "X-CSRFToken": getCsrfToken() },
    });
    if (!response.ok) throw new Error(await extrairMensagemErro(response));
    return true;
  },

  async finalizarOS(osId) {
    const response = await fetch(apiUrl(`/os/${osId}/finalizar/`), {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRFToken": getCsrfToken() },
    });
    if (!response.ok) throw new Error(await extrairMensagemErro(response));
    return response.json();
  },

  /**
   * Lista funcionários ativos da oficina atual.
   * Usado para popular o seletor de responsáveis das tarefas.
   */
  async getFuncionarios() {
    const response = await fetch(apiUrl("/funcionarios/"), {
      credentials: "include",
      headers: { "X-CSRFToken": getCsrfToken() },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(await extrairMensagemErro(response));
    const data = await response.json();
    return Array.isArray(data) ? data : (data.results || []);
  },

  /**
   * Atribui (ou substitui) os responsáveis de uma tarefa.
   * Envia a lista completa de IDs de Funcionario.
   */
  async atribuirResponsaveis(osId, tarefaId, responsaveisIds) {
    const response = await fetch(apiUrl(`/os/${osId}/tarefas/${tarefaId}/`), {
      method: "PUT",
      credentials: "include",
      headers: jsonHeaders(),
      body: JSON.stringify({ responsaveis_ids: responsaveisIds }),
    });
    if (!response.ok) throw new Error(await extrairMensagemErro(response));
    return response.json();
  },

  /** Status do checklist; retorna { concluido, raw? }. */
  async checarChecklist(osId) {
    try {
      const response = await fetch(apiUrl(`/checklist/${osId}/`), {
        credentials: "include",
        headers: { "X-CSRFToken": getCsrfToken() },
      });
      if (!response.ok) return { concluido: false, erro: `HTTP ${response.status}` };

      let data = await response.json();
      if (data.results) data = data.results;
      const dados = Array.isArray(data) ? data[0] : data;
      if (!dados) return { concluido: false };

      const concluido =
        dados.concluido === true ||
        dados.concluido === "true" ||
        String(dados.status).toLowerCase() === "concluido" ||
        String(dados.status).toLowerCase() === "concluído";

      return { concluido, raw: dados };
    } catch (error) {
      return { concluido: false, erro: error.message };
    }
  },
};
