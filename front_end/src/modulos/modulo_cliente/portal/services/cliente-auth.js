// cliente-auth.js
//
// Camada de autenticação do portal do cliente. Centraliza acesso a
// /api/cliente/auth/* e mantém um cache leve do perfil em memória.

import { clienteApiFetch, obterCsrfCliente } from "./cliente-api-config.js";
import { urlInterna } from "../../../../shared/services/base-path.js";


let perfilCache = null;


/**
 * Autentica o cliente no portal.
 *
 * Aceita duas formas de argumentos para compatibilidade:
 *   - loginCliente({ cpfCnpj, codigo, numeroOs })           ← preferencial
 *   - loginCliente(cpfCnpj, numeroOs)                       ← legado
 */
export async function loginCliente(arg1, arg2) {
  let body;
  if (typeof arg1 === "object" && arg1 !== null) {
    body = {
      cpf_cnpj: arg1.cpfCnpj,
      codigo: arg1.codigo || undefined,
      numero_os: arg1.numeroOs || undefined,
    };
  } else {
    body = { cpf_cnpj: arg1, numero_os: arg2 };
  }

  await obterCsrfCliente();
  const payload = await clienteApiFetch("/auth/login/", {
    method: "POST",
    body,
  });
  perfilCache = payload.cliente;
  return payload;
}


export async function carregarPerfilCliente({ force = false } = {}) {
  if (perfilCache && !force) return perfilCache;
  try {
    const payload = await clienteApiFetch("/auth/me/");
    perfilCache = payload;
    return perfilCache;
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      perfilCache = null;
      return null;
    }
    throw err;
  }
}


export async function logoutCliente() {
  try {
    await clienteApiFetch("/auth/logout/", { method: "POST" });
  } catch {
    /* ignora falha de logout — sessão pode já estar expirada */
  }
  perfilCache = null;
}


export function perfilEmCache() {
  return perfilCache;
}


export function limparCache() {
  perfilCache = null;
}


/** Caminho relativo a `front_end/src/` para o login do cliente. */
export const ROTA_LOGIN_CLIENTE = "modulos/modulo_cliente/login/pages/login-cliente.html";
export const ROTA_PORTAL_CLIENTE = "modulos/modulo_cliente/portal/pages/portal-cliente.html";


export function redirecionarParaLoginCliente() {
  window.location.href = urlInterna(ROTA_LOGIN_CLIENTE);
}


export function redirecionarParaPortalCliente(osId) {
  const query = osId ? `?os_id=${osId}` : "";
  window.location.href = urlInterna(ROTA_PORTAL_CLIENTE + query);
}


/**
 * Guarda de página: chama no topo de cada entry script do portal.
 * Retorna o perfil OU null (já redirecionou) — chame `if (!perfil) return;`.
 */
export async function garantirAcessoCliente() {
  try {
    const perfil = await carregarPerfilCliente();
    if (!perfil) {
      redirecionarParaLoginCliente();
      return null;
    }
    return perfil;
  } catch (err) {
    console.error("Falha ao validar sessão do cliente:", err);
    redirecionarParaLoginCliente();
    return null;
  }
}
