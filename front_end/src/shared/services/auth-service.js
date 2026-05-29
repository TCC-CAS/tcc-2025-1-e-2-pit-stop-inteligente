// auth-service.js
//
// Camada de comunicação com os endpoints de autenticação do back-end:
//   GET  /auth/csrf/                    → garante o cookie CSRF antes do POST
//   POST /auth/login/                   → autentica + lista oficinas
//   POST /auth/logout/                  → encerra sessão
//   GET  /auth/me/                      → perfil do usuário logado
//   POST /auth/oficinas/<id>/selecionar/→ define oficina ativa
//
// Mantém também um cache em memória (`perfilCache`) e um helper para
// determinar se uma rota da UI deve aparecer para o papel atual.

import { apiUrl, getCsrfToken } from "../config/api-config.js";


let perfilCache = null;


// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export async function obterCsrfToken() {
  await fetch(apiUrl("/auth/csrf/"), { credentials: "include" });
  return getCsrfToken();
}


export async function login(username, password) {
  // Garante cookie CSRF antes do POST de login
  await obterCsrfToken();

  // Honeypot anti-bot: o input `#urlOptional` é invisível por CSS — se vier
  // preenchido, foi um bot que parseou o HTML. Mandamos junto para o
  // backend decidir; humano nunca chega aqui com valor.
  const honeypot = document.getElementById("urlOptional")?.value || "";

  const response = await fetch(apiUrl("/auth/login/"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCsrfToken(),
    },
    body: JSON.stringify({ username, password, url_optional: honeypot }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.erro || "Falha no login.");
  }
  perfilCache = payload;
  return payload;
}


export async function logout() {
  await fetch(apiUrl("/auth/logout/"), {
    method: "POST",
    credentials: "include",
    headers: { "X-CSRFToken": getCsrfToken() },
  });
  perfilCache = null;
}


export async function carregarPerfil({ force = false } = {}) {
  if (perfilCache && !force) return perfilCache;

  const response = await fetch(apiUrl("/auth/me/"), {
    credentials: "include",
  });
  if (response.status === 401 || response.status === 403) {
    perfilCache = null;
    return null;
  }
  if (!response.ok) {
    throw new Error(`Erro ao buscar perfil (HTTP ${response.status}).`);
  }
  perfilCache = await response.json();
  return perfilCache;
}


export async function selecionarOficina(oficinaId) {
  await obterCsrfToken();
  const response = await fetch(
    apiUrl(`/auth/oficinas/${oficinaId}/selecionar/`),
    {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRFToken": getCsrfToken() },
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.erro || "Não foi possível selecionar a oficina.");
  }
  perfilCache = payload;
  return payload;
}


// ---------------------------------------------------------------------------
// Permissões (espelham permissions.py do back-end)
// ---------------------------------------------------------------------------

const PAPEIS_HIERARQUIA = {
  admin:        { admin: true,  gestao: true,  operacional: true,  tecnico: true,  leitura: true },
  gerente:      { admin: false, gestao: true,  operacional: true,  tecnico: true,  leitura: true },
  atendente:    { admin: false, gestao: false, operacional: true,  tecnico: false, leitura: true },
  mecanico:     { admin: false, gestao: false, operacional: false, tecnico: true,  leitura: true },
  visualizador: { admin: false, gestao: false, operacional: false, tecnico: false, leitura: true },
};


/** Retorna o papel do usuário na oficina ativa, ou null. */
export function papelAtual() {
  return perfilCache?.oficina_atual?.permissao || null;
}


/**
 * Verifica se o usuário corrente tem permissão `nivel`.
 * `nivel` ∈ {"admin", "gestao", "operacional", "tecnico", "leitura"}.
 */
export function temPermissao(nivel) {
  const papel = papelAtual();
  if (!papel) return false;
  return PAPEIS_HIERARQUIA[papel]?.[nivel] === true;
}


/** Reset manual do cache (útil em testes / ao trocar de oficina). */
export function limparCachePerfil() {
  perfilCache = null;
}
