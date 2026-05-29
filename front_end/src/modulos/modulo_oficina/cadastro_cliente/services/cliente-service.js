import { apiUrl, getCsrfToken } from "../../../../shared/config/api-config.js";

const ENDPOINT = "/clientes/";
const VIA_CEP = "https://viacep.com.br/ws";

const jsonHeaders = () => ({
    "Content-Type": "application/json",
    "X-CSRFToken": getCsrfToken(),
});

async function jsonOrThrow(response, defaultMsg) {
    if (response.ok) return response.json();
    let payload;
    try {
        payload = await response.json();
    } catch {
        throw new Error(defaultMsg);
    }
    throw new Error(JSON.stringify(payload));
}

export const ClienteService = {
    async buscarTodos() {
        try {
            const response = await fetch(apiUrl(ENDPOINT), {
                credentials: 'include'
            });
            if (!response.ok) throw new Error("Erro ao buscar clientes");
            return await response.json();
        } catch (error) {
            console.error(error);
            return [];
        }
    },

    async buscarPorId(id) {
        const response = await fetch(apiUrl(`${ENDPOINT}${id}/`), {
            credentials: 'include'
        });
        if (!response.ok) throw new Error("Cliente não encontrado");
        return response.json();
    },

    async criar(cliente) {
        const response = await fetch(apiUrl(ENDPOINT), {
            method: "POST",
            credentials: "include",
            headers: jsonHeaders(),
            body: JSON.stringify(cliente),
        });
        return jsonOrThrow(response, "Erro ao criar cliente");
    },

    async atualizar(id, cliente) {
        const response = await fetch(apiUrl(`${ENDPOINT}${id}/`), {
            method: "PUT",
            credentials: "include",
            headers: jsonHeaders(),
            body: JSON.stringify(cliente),
        });
        return jsonOrThrow(response, "Erro ao atualizar cliente");
    },

    async excluir(id) {
        const response = await fetch(apiUrl(`${ENDPOINT}${id}/`), {
            method: "DELETE",
            credentials: "include",
            headers: { "X-CSRFToken": getCsrfToken() },
        });
        if (!response.ok) throw new Error("Erro ao excluir cliente");
        return true;
    },

    async buscarEnderecoPorCep(cep) {
        const cleanCep = cep.replace(/\D/g, "");
        if (cleanCep.length !== 8) return null;

        try {
            const response = await fetch(`${VIA_CEP}/${cleanCep}/json/`);
            const data = await response.json();
            return data.erro ? null : data;
        } catch (error) {
            console.error("Erro na consulta do CEP", error);
            return null;
        }
    },
};
