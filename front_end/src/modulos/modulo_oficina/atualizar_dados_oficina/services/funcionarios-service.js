/**
 * funcionarios-service.js
 * Encapsula as chamadas HTTP de gestão de funcionários da oficina.
 */
import { apiUrl, getCsrfToken } from "../../../../shared/config/api-config.js";

const ENDPOINT = "/funcionarios/";

const jsonHeaders = () => ({
    "Content-Type": "application/json",
    "X-CSRFToken": getCsrfToken(),
});

export async function listarFuncionarios() {
    const response = await fetch(apiUrl(ENDPOINT), { credentials: "include" });
    if (response.status === 403) {
        throw new Error("Sessão expirada ou usuário não autenticado.");
    }
    if (!response.ok) throw new Error("Erro ao carregar usuários");
    return response.json();
}

export async function criarFuncionario(payload) {
    const response = await fetch(apiUrl(ENDPOINT), {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(JSON.stringify(err));
    }
    return response.json();
}

export async function atualizarFuncionario(id, payload) {
    const response = await fetch(apiUrl(`${ENDPOINT}${id}/`), {
        method: "PUT",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(JSON.stringify(err));
    }
    return response.json();
}

export async function alterarStatusFuncionario(id, isActive) {
    const response = await fetch(apiUrl(`${ENDPOINT}${id}/`), {
        method: "PATCH",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify({ is_active: isActive }),
    });
    if (!response.ok) throw new Error("Erro ao alterar status do usuário");
    return response.json();
}

export async function excluirFuncionario(id) {
    const response = await fetch(apiUrl(`${ENDPOINT}${id}/`), {
        method: "DELETE",
        credentials: "include",
        headers: { "X-CSRFToken": getCsrfToken() },
    });
    if (!response.ok) throw new Error("Erro ao excluir usuário");
    return true;
}
