/**
 * perfil-service.js
 * Encapsula todas as chamadas HTTP do perfil da oficina (GET/PUT/PUT logo).
 * Não toca no DOM.
 */
import { apiUrl, getCsrfToken } from "../../../../shared/config/api-config.js";

const PERFIL_ENDPOINT = "/perfil/";

export async function fetchPerfil() {
    const response = await fetch(apiUrl(PERFIL_ENDPOINT), {
        credentials: "include",
    });
    if (!response.ok) throw new Error("Erro ao carregar dados da oficina");
    return response.json();
}

export async function salvarPerfil(payload) {
    const response = await fetch(apiUrl(PERFIL_ENDPOINT), {
        method: "PUT",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCsrfToken(),
        },
        body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Erro ao salvar perfil");
    return response.json();
}

export async function enviarLogo(file) {
    const formData = new FormData();
    formData.append("logo", file);

    const response = await fetch(apiUrl(PERFIL_ENDPOINT), {
        method: "PUT",
        credentials: "include",
        headers: { "X-CSRFToken": getCsrfToken() },
        body: formData,
    });
    if (!response.ok) throw new Error("Erro ao enviar logo");
    return response.json();
}
