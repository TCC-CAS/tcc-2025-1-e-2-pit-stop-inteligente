import { apiUrl, getCsrfToken } from "../../../../../shared/config/api-config.js";

const jsonHeaders = () => ({
    "Content-Type": "application/json",
    "X-CSRFToken": getCsrfToken(),
});

async function handleResponse(response, label) {
    if (response.ok) return response.json();
    const errorText = await response.text();
    throw new Error(`Erro ${label} (${response.status}): ${errorText}`);
}

export const DiagnosticoService = {
    async getItensOrcamento(osId) {
        const response = await fetch(apiUrl(`/os/${osId}/itens/`), {
            credentials: 'include'
        });
        return handleResponse(response, "ao buscar itens");
    },

    async getItem(osId, itemId) {
        const response = await fetch(apiUrl(`/os/${osId}/itens/${itemId}/`), {
            credentials: 'include'
        });
        return handleResponse(response, "ao buscar item");
    },

    async salvarItem(itemData, osId) {
        const payload = { ...itemData, os_id: osId };
        const response = await fetch(apiUrl(`/os/${osId}/itens/`), {
            method: "POST",
            credentials: "include",
            headers: jsonHeaders(),
            body: JSON.stringify(payload),
        });
        return handleResponse(response, "ao salvar item");
    },

    async atualizarItem(itemData, osId, itemId) {
        const payload = { ...itemData, os_id: osId };
        const response = await fetch(apiUrl(`/os/${osId}/itens/${itemId}/`), {
            method: "PUT",
            credentials: "include",
            headers: jsonHeaders(),
            body: JSON.stringify(payload),
        });
        return handleResponse(response, "ao atualizar item");
    },

    async deletarItem(osId, itemId) {
        const response = await fetch(apiUrl(`/os/${osId}/itens/${itemId}/`), {
            method: "DELETE",
            credentials: "include",
            headers: { "X-CSRFToken": getCsrfToken() },
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro ao deletar item: ${response.status} - ${errorText}`);
        }
        return true;
    },

    async atualizarStatusItens(osId, itensStatus) {
        const response = await fetch(apiUrl(`/os/${osId}/itens/status/`), {
            method: "PATCH",
            credentials: "include",
            headers: jsonHeaders(),
            body: JSON.stringify({ itens: itensStatus }),
        });
        return handleResponse(response, "ao atualizar status");
    },

    // ---- Auxiliares para autocomplete ----
    async getServicos() {
        const response = await fetch(apiUrl("/servicos/"), {
            credentials: 'include'
        });
        if (!response.ok) throw new Error("Erro ao buscar serviços");
        return response.json();
    },

    async getCategorias() {
        const response = await fetch(apiUrl("/categorias/"), {
            credentials: 'include'
        });
        if (!response.ok) throw new Error("Erro ao buscar categorias");
        return response.json();
    },

    async getConfiguracao() {
        const response = await fetch(apiUrl("/configuracao/"), {
            credentials: 'include'
        });
        if (!response.ok) throw new Error("Erro ao buscar configuração");
        return response.json();
    },
};
