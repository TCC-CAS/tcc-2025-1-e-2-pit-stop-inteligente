// cliente-api-config.js
//
// Ponte para a API do portal do cliente (/api/cliente/*).
// Replica o padrão do `shared/config/api-config.js` da oficina mas aponta
// para o prefixo `/api/cliente`, evitando misturar as duas sessões.

import { API_BASE_URL, getCsrfToken } from "../../../../shared/config/api-config.js";


export const CLIENTE_API_URL = `${API_BASE_URL}/api/cliente`;


export function clienteApiUrl(path) {
  const cleaned = path.startsWith("/") ? path : `/${path}`;
  return `${CLIENTE_API_URL}${cleaned}`;
}


/**
 * fetch padronizado para o portal do cliente. Sempre envia cookies de
 * sessão + CSRF token (lido do cookie). NÃO força Content-Type — o
 * chamador decide (JSON x FormData). Lança Error com mensagem amigável
 * extraída do payload `erro` do back-end.
 */
export async function clienteApiFetch(path, { method = "GET", body, headers = {}, json = true } = {}) {
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

  const response = await fetch(clienteApiUrl(path), opts);
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : null;

  if (!response.ok) {
    const mensagem = extrairMensagemErro(payload, response.status);
    const err = new Error(mensagem);
    err.status = response.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}


/**
 * Extrai mensagem amigável de um payload DRF.
 *
 * O DRF responde 400 com formatos heterogêneos:
 *   { "erro": "..." }                       → handler customizado
 *   { "detail": "..." }                     → APIException padrão
 *   { "campo": ["msg 1", "msg 2"], ... }    → ValidationError do serializer
 *   { "non_field_errors": ["..."] }         → ValidationError global
 *
 * Esta função normaliza tudo em uma string legível para o usuário.
 */
function extrairMensagemErro(payload, status) {
  if (!payload || typeof payload !== "object") {
    return `Erro HTTP ${status}`;
  }
  if (typeof payload.erro === "string" && payload.erro) return payload.erro;
  if (typeof payload.detail === "string" && payload.detail) return payload.detail;
  if (Array.isArray(payload.non_field_errors) && payload.non_field_errors.length) {
    return payload.non_field_errors.join(" ");
  }

  // Lista todos os erros campo-a-campo: "Campo: mensagem"
  const partes = [];
  for (const [campo, valor] of Object.entries(payload)) {
    if (campo === "erro" || campo === "detail") continue;
    const msgs = Array.isArray(valor) ? valor : [valor];
    const texto = msgs.filter(Boolean).map(String).join(" ");
    if (texto) partes.push(campo === "non_field_errors" ? texto : `${rotuloCampo(campo)}: ${texto}`);
  }
  return partes.length ? partes.join("\n") : `Erro HTTP ${status}`;
}


function rotuloCampo(campo) {
  const rotulos = {
    titulo: "Título",
    descricao: "Descrição",
    conteudo: "Mensagem",
    categoria: "Categoria",
    prioridade: "Prioridade",
    os_relacionada: "OS relacionada",
  };
  return rotulos[campo] || campo;
}


/** Pré-aquece o cookie CSRF antes do primeiro POST. */
export async function obterCsrfCliente() {
  await fetch(clienteApiUrl("/auth/csrf/"), { credentials: "include" });
}
