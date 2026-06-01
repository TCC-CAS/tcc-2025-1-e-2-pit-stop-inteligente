/**
 * pagamentos-service.js
 * Acesso ao módulo de pagamentos do back-end (AbacatePay).
 *
 * Endpoints consumidos (montados em `core/urls.py` sob `/api/pagamentos/`):
 *   - GET  /api/pagamentos/planos/                    → catálogo
 *   - GET  /api/pagamentos/assinatura/status/         → assinatura atual
 *   - POST /api/pagamentos/assinatura/checkout/       → cria checkout (PIX/CARD/BOLETO)
 *   - GET  /api/pagamentos/<external_id>/status/      → polling após pagar
 *
 * Esses endpoints rodam fora do prefixo `/api/oficina/`, então o helper
 * `apiFetch` do `api-config.js` não serve (ele já injeta /api/oficina).
 * Aqui re-usamos só `API_BASE_URL` e `getCsrfToken`.
 */
import { API_BASE_URL, getCsrfToken } from "../../../../shared/config/api-config.js";

const PAGAMENTOS_URL = `${API_BASE_URL}/api/pagamentos`;

/**
 * Algumas chamadas (especialmente as feitas logo após o cadastro/login,
 * quando a sessão acaba de rotacionar) podem chegar antes do cookie
 * CSRF estar populado no browser. Esta função força o GET prévio que
 * garante o cookie csrftoken disponível.
 */
async function garantirCsrf() {
    try {
        await fetch(`${API_BASE_URL}/api/oficina/auth/csrf/`, {
            credentials: "include",
        });
    } catch {
        // Sem rede: deixa a chamada principal estourar com erro mais claro.
    }
}

async function pagamentosFetch(path, { method = "GET", body, headers = {} } = {}) {
    const cleaned = path.startsWith("/") ? path : `/${path}`;
    const opts = {
        method,
        credentials: "include",
        headers: {
            "X-CSRFToken": getCsrfToken(),
            ...headers,
        },
    };
    if (body !== undefined) opts.body = body;
    return fetch(`${PAGAMENTOS_URL}${cleaned}`, opts);
}

async function parseJsonOuErro(response) {
    let payload = null;
    try { payload = await response.json(); } catch { /* sem json */ }
    if (!response.ok) {
        const msg = payload?.erro || payload?.detalhe || response.statusText;
        const err = new Error(msg || `HTTP ${response.status}`);
        err.status = response.status;
        err.payload = payload;
        throw err;
    }
    return payload;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export async function listarPlanos() {
    const resp = await pagamentosFetch("/planos/");
    const data = await parseJsonOuErro(resp);
    return data.planos || [];
}

export async function obterStatusAssinatura() {
    const resp = await pagamentosFetch("/assinatura/status/");
    return parseJsonOuErro(resp);
}

/**
 * Inicia um checkout de assinatura e devolve `{ url_checkout, external_id, ... }`.
 * O caller deve redirecionar a janela para `url_checkout`.
 *
 * Faz GET /auth/csrf/ antes do POST para garantir que o cookie csrftoken
 * está disponível — importante quando a sessão acaba de ser criada (login
 * imediatamente após o cadastro).
 *
 * @param {string} planoCodigo  ex.: "basico", "premium"
 * @param {string[]} [metodos]  subset de ["PIX", "CARD", "BOLETO"]. Default = todos.
 */
export async function iniciarCheckoutAssinatura(planoCodigo, metodos) {
    await garantirCsrf();
    const payload = { plano: planoCodigo };
    if (Array.isArray(metodos) && metodos.length) payload.metodos = metodos;
    const resp = await pagamentosFetch("/assinatura/checkout/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    return parseJsonOuErro(resp);
}

export async function obterStatusPagamento(externalId) {
    const resp = await pagamentosFetch(`/${externalId}/status/`);
    return parseJsonOuErro(resp);
}
