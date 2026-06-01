// admin-api.js — service layer centralizado para o painel administrativo.
// Reaproveita o `apiUrl`/`getCsrfToken` do shared, mas aponta para o
// prefixo `/api/admin/`. Interceptor único trata erros HTTP, mostra toast
// e devolve mensagem amigável ao chamador.

import { API_BASE_URL, getCsrfToken } from "../../../shared/config/api-config.js";


export const ADMIN_API_URL = `${API_BASE_URL}/api/admin`;


export function adminUrl(path) {
  const cleaned = path.startsWith("/") ? path : `/${path}`;
  return `${ADMIN_API_URL}${cleaned}`;
}


/**
 * Wrapper único com CSRF, credenciais e tratamento de erro.
 * Retorna o JSON do corpo OU lança Error com mensagem amigável.
 */
export async function adminFetch(path, { method = "GET", body, headers = {}, json = true, raw = false } = {}) {
  const opts = {
    method,
    credentials: "include",
    headers: {
      "X-CSRFToken": getCsrfToken(),
      ...(body && json ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
  };
  if (body !== undefined) {
    opts.body = json ? JSON.stringify(body) : body;
  }

  const response = await fetch(adminUrl(path), opts);
  if (raw) return response;

  if (response.status === 204) return null;

  const ct = response.headers.get("content-type") || "";
  const payload = ct.includes("application/json")
    ? await response.json().catch(() => ({}))
    : null;

  if (!response.ok) {
    const msg =
      payload?.erro ||
      payload?.detail ||
      payload?.detail?.[0] ||
      `Erro HTTP ${response.status}`;
    const err = new Error(msg);
    err.status = response.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}


// ---------------------------------------------------------------------------
// Endpoints organizados por recurso (mantém arquivos de UI sem URLs cruas)
// ---------------------------------------------------------------------------

export const AdminAPI = {
  dashboard: () => adminFetch("/dashboard/"),

  oficinas: {
    listar: (params = {}) => adminFetch(`/oficinas/${qs(params)}`),
    detalhe: (id) => adminFetch(`/oficinas/${id}/`),
    atualizar: (id, body) => adminFetch(`/oficinas/${id}/`, { method: "PATCH", body }),
    inativar: (id, ativo) => adminFetch(`/oficinas/${id}/inativar/`, { method: "POST", body: { ativo } }),
    excluir: (id) => adminFetch(`/oficinas/${id}/`, { method: "DELETE" }),
    // Consumo (usuários, OS/mês, storage) e edição de limites por oficina
    consumo: (id) => adminFetch(`/oficinas/${id}/consumo/`),
    salvarLimites: (id, body) =>
      adminFetch(`/oficinas/${id}/limites/`, { method: "PUT", body }),
    resetLimites: (id) =>
      adminFetch(`/oficinas/${id}/limites/`, { method: "DELETE" }),
  },

  usuarios: {
    listar: (params = {}) => adminFetch(`/usuarios/${qs(params)}`),
    criar: (body) => adminFetch("/usuarios/", { method: "POST", body }),
    detalhe: (id) => adminFetch(`/usuarios/${id}/`),
    atualizar: (id, body) => adminFetch(`/usuarios/${id}/`, { method: "PATCH", body }),
    ativar: (id, ativo) => adminFetch(`/usuarios/${id}/ativar/`, { method: "POST", body: { ativo } }),
    resetarSenha: (id, password) => adminFetch(`/usuarios/${id}/senha/`, { method: "POST", body: { password } }),
    vincularOficina: (id, oficina_id, permissao) =>
      adminFetch(`/usuarios/${id}/vinculos/`, { method: "POST", body: { oficina_id, permissao } }),
    excluir: (id) => adminFetch(`/usuarios/${id}/`, { method: "DELETE" }),
  },

  configuracoes: {
    listar: () => adminFetch("/configuracoes/"),
    atualizar: (chave, valor) => adminFetch(`/configuracoes/${encodeURIComponent(chave)}/`, { method: "PATCH", body: { valor } }),
    criar: (chave, valor) => adminFetch("/configuracoes/", { method: "POST", body: { chave, valor } }),
  },

  auditoria: {
    listar: (params = {}) => adminFetch(`/auditoria/${qs(params)}`),
    exportarCsvUrl: (params = {}) => adminUrl(`/auditoria/${qs({ ...params, export: "csv" })}`),
  },

  os: {
    listar: (params = {}) => adminFetch(`/os/${qs(params)}`),
    alterarStatus: (id, novo_status, motivo) =>
      adminFetch(`/os/${id}/status/`, { method: "PUT", body: { novo_status, motivo } }),
  },

  backup: {
    exportarUrl: () => adminUrl("/backup/"),
    restaurar: (file) => {
      const fd = new FormData();
      fd.append("arquivo", file);
      return adminFetch("/backup/restaurar/", {
        method: "POST",
        body: fd,
        json: false,
      });
    },
  },

  suporte: {
    listar: (filtros = {}) => adminFetch(`/suporte/tickets/${qs(filtros)}`),
    detalhe: (id) => adminFetch(`/suporte/tickets/${id}/`),
    responder: (id, conteudo, opts = {}) =>
      adminFetch(`/suporte/tickets/${id}/mensagens/`, {
        method: "POST",
        body: { conteudo, eh_interna: !!opts.eh_interna },
      }),
    atualizar: (id, payload) =>
      adminFetch(`/suporte/tickets/${id}/`, { method: "PATCH", body: payload }),
    sumario: () => adminFetch("/suporte/sumario/"),
  },

  saude: {
    sumario: () => adminFetch("/saude/sumario/"),
    listar: (filtros = {}) => adminFetch(`/saude/erros/${qs(filtros)}`),
    detalhe: (id) => adminFetch(`/saude/erros/${id}/`),
    eventos: (id, filtros = {}) => adminFetch(`/saude/erros/${id}/eventos/${qs(filtros)}`),
    atualizar: (id, payload) =>
      adminFetch(`/saude/erros/${id}/`, { method: "PATCH", body: payload }),
    // Cria um Ticket de suporte pré-preenchido a partir do grupo de erro
    gerarTicket: (id) =>
      adminFetch(`/saude/erros/${id}/ticket/`, { method: "POST" }),
  },

  seguranca: {
    sumario: () => adminFetch("/seguranca/sumario/"),
    eventos: (filtros = {}) => adminFetch(`/seguranca/eventos/${qs(filtros)}`),
    bloquearIp: (body) =>
      adminFetch("/seguranca/bloquear-ip/", { method: "POST", body }),
    desbloquearIp: (ip) =>
      adminFetch("/seguranca/desbloquear-ip/", { method: "POST", body: { ip } }),
  },
};


function qs(params) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") sp.append(k, String(v));
  });
  const str = sp.toString();
  return str ? `?${str}` : "";
}
