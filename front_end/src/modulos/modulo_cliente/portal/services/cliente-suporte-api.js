// cliente-suporte-api.js — adapter do <suporte-chat> para o portal do cliente.

import { clienteApiFetch } from "./cliente-api-config.js";


function qs(params) {
    const sp = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") sp.append(k, String(v));
    });
    return sp.toString() ? `?${sp.toString()}` : "";
}


export const ClienteSuporteApi = {
    listar: (filtros = {}) => clienteApiFetch(`/suporte/tickets/${qs(filtros)}`),
    detalhe: (id) => clienteApiFetch(`/suporte/tickets/${id}/`),
    criar: (payload) => clienteApiFetch("/suporte/tickets/", { method: "POST", body: payload }),
    responder: (id, conteudo) =>
        clienteApiFetch(`/suporte/tickets/${id}/mensagens/`,
            { method: "POST", body: { conteudo } }),
    atualizar: (id, payload) =>
        clienteApiFetch(`/suporte/tickets/${id}/`,
            { method: "PATCH", body: payload }),
};
