// cliente-pagamentos-api.js
//
// Acesso ao módulo de pagamentos (AbacatePay) sob a sessão do cliente.
// Endpoints específicos do portal vivem sob `/api/pagamentos/cliente/*`
// e exigem a sessão de cliente (CPF/CNPJ + código da OS).

import { API_BASE_URL, getCsrfToken } from "../../../../shared/config/api-config.js";

const PAGAMENTOS_URL = `${API_BASE_URL}/api/pagamentos`;


async function pagamentosFetch(path, { method = "GET", body } = {}) {
  const cleaned = path.startsWith("/") ? path : `/${path}`;
  const opts = {
    method,
    credentials: "include",
    headers: { "X-CSRFToken": getCsrfToken() },
  };
  if (body !== undefined) {
    opts.body = body;
    opts.headers["Content-Type"] = "application/json";
  }

  const resp = await fetch(`${PAGAMENTOS_URL}${cleaned}`, opts);
  let payload = null;
  try { payload = await resp.json(); } catch { /* sem json */ }
  if (!resp.ok) {
    const msg = payload?.erro || payload?.detalhe || resp.statusText;
    const err = new Error(msg || `HTTP ${resp.status}`);
    err.status = resp.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}


export const ClientePagamentosApi = {
  /** Devolve a cobrança pendente da OS ou cria uma nova. */
  obterCheckoutDaOS(osId) {
    return pagamentosFetch(`/cliente/os/${osId}/checkout/`);
  },

  /** Polling do status do pagamento pelo UUID externo. */
  obterStatusPagamento(externalId) {
    return pagamentosFetch(`/${externalId}/status/`);
  },
};
