// suporte-oficina-api.js — adapter para o <suporte-chat> consumir
// `/api/oficina/suporte/...` com sessão Django + CSRF.

import { apiFetch, apiUrl, getCsrfToken } from "../../../../shared/config/api-config.js";


function qs(params) {
    const sp = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") sp.append(k, String(v));
    });
    return sp.toString() ? `?${sp.toString()}` : "";
}


async function send(path, { method = "GET", body } = {}) {
    const opts = {
        method,
        credentials: "include",
        headers: {
            "X-CSRFToken": getCsrfToken(),
            ...(body ? { "Content-Type": "application/json" } : {}),
        },
    };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(apiUrl(`/suporte${path}`), opts);
    const payload = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(mensagemDeErro(payload, r.status));
    return payload;
}


// Traduz a resposta de erro do DRF em uma mensagem legível.
// Em particular, ValidationError volta como { campo: ["msg"] } e não
// tinha tratamento antes — o usuário via "HTTP 400" sem contexto.
function mensagemDeErro(payload, status) {
    if (!payload || typeof payload !== "object") return `HTTP ${status}`;
    if (typeof payload.erro === "string" && payload.erro) return payload.erro;
    if (typeof payload.detail === "string" && payload.detail) return payload.detail;
    const partes = [];
    for (const [campo, valor] of Object.entries(payload)) {
        if (campo === "erro" || campo === "detail") continue;
        const lista = Array.isArray(valor) ? valor : [valor];
        const texto = lista.filter(Boolean).map(String).join(" ");
        if (!texto) continue;
        partes.push(campo === "non_field_errors" ? texto : `${campo}: ${texto}`);
    }
    return partes.length ? partes.join("\n") : `HTTP ${status}`;
}


export const SuporteOficinaApi = {
    listar: (filtros = {}) => send(`/tickets/${qs(filtros)}`),
    detalhe: (id) => send(`/tickets/${id}/`),
    criar: (payload) => send("/tickets/", { method: "POST", body: payload }),
    responder: (id, conteudo) => send(`/tickets/${id}/mensagens/`,
        { method: "POST", body: { conteudo } }),
    atualizar: (id, payload) => send(`/tickets/${id}/`,
        { method: "PATCH", body: payload }),
    sumario: () => send("/sumario/"),
};
