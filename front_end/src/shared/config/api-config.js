/**
 * api-config.js
 * Configuração central das URLs da API. Use este módulo em todos os
 * services do front-end para que a alteração de host (ex.: deploy em
 * nuvem) seja feita em um único lugar.
 *
 * Em desenvolvimento, o front é servido pelo Live Server (porta 5500)
 * e o Django roda na porta 8000. A regra abaixo escolhe a base usando
 * o MESMO hostname que está na barra do navegador — fundamental para
 * que o cookie de sessão (SameSite=Lax) seja enviado em fetch:
 *   - front em http://localhost:5500  → API em http://localhost:8000
 *   - front em http://127.0.0.1:5500  → API em http://127.0.0.1:8000
 *
 * Se mistura `localhost` e `127.0.0.1` entre front e API, o browser
 * considera origens cross-site e o login "passa" mas o /me/ vira 403.
 *
 * Em produção, defina API_BASE_URL via meta tag no <head> da página:
 *   <meta name="api-base-url" content="https://api.pitstop.com.br">
 */

const META_TAG_NAME = "api-base-url";
const PORTA_BACKEND_LOCAL = 8000;
const PORTA_FRONT_LOCAL = 5500;   // porta do Live Server em desenvolvimento

function readFromMetaTag() {
    if (typeof document === "undefined") return null;
    const meta = document.querySelector(`meta[name="${META_TAG_NAME}"]`);
    return meta?.content?.trim() || null;
}

/**
 * Escolhe a base da API conforme o ambiente:
 *  - Live Server de desenvolvimento (:5500) → Django na :8000, mesmo host
 *    (evita misturar localhost/127.0.0.1, o que vira 403 no /me/).
 *  - Produção / same-origin → o nginx serve o front e faz proxy de /api,
 *    então a API vive na MESMA origem da página (sem porta extra, sem CORS).
 *  - `file://` cai num default local seguro.
 * A meta tag `api-base-url`, quando presente, tem prioridade sobre tudo
 * (útil se um dia a API for hospedada em um domínio separado).
 */
function defaultApiBase() {
    if (typeof window === "undefined" || !window.location) {
        return `http://127.0.0.1:${PORTA_BACKEND_LOCAL}`;
    }
    const { protocol, hostname, port, origin } = window.location;
    if (!hostname || protocol === "file:") {
        return `http://127.0.0.1:${PORTA_BACKEND_LOCAL}`;
    }
    if (port === String(PORTA_FRONT_LOCAL)) {
        return `${protocol}//${hostname}:${PORTA_BACKEND_LOCAL}`;
    }
    return origin;
}

export const API_BASE_URL = readFromMetaTag() || defaultApiBase();

export const API_URL = `${API_BASE_URL}/api/oficina`;

/**
 * Constrói uma URL absoluta para um endpoint da API.
 * @param {string} path - Caminho começando ou não com "/".
 */
export function apiUrl(path) {
    const cleaned = path.startsWith("/") ? path : `/${path}`;
    return `${API_URL}${cleaned}`;
}

/**
 * Lê o token CSRF do cookie. Compatível com a configuração padrão do
 * Django (CSRF_COOKIE_NAME = 'csrftoken').
 */
export function getCsrfToken() {
    if (typeof document === "undefined") return "";
    const match = document.cookie.match(/(^|;\s*)csrftoken=([^;]+)/);
    return match ? decodeURIComponent(match[2]) : "";
}

/**
 * Wrapper conveniente para fetch que já injeta credenciais e CSRF.
 * Não força Content-Type — o chamador decide (JSON x FormData).
 */
export async function apiFetch(path, { method = "GET", body, headers = {} } = {}) {
    const opts = {
        method,
        credentials: "include",
        headers: {
            "X-CSRFToken": getCsrfToken(),
            ...headers,
        },
    };

    if (body !== undefined) {
        opts.body = body;
    }

    return fetch(apiUrl(path), opts);
}
