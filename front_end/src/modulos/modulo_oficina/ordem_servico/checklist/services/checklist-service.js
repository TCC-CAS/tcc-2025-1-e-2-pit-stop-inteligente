import { apiUrl, getCsrfToken } from "../../../../../shared/config/api-config.js";

export class ChecklistService {
    static async buscarChecklist(osId) {
        const response = await fetch(apiUrl(`/os/${osId}/checklist/`), {
            credentials: 'include'
         });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error("Erro ao buscar checklist");
        return response.json();
    }

    static async salvarChecklist(osId, dados) {
        const response = await fetch(apiUrl(`/os/${osId}/checklist/`), {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": getCsrfToken(),
            },
            body: JSON.stringify(dados),
        });
        if (!response.ok) throw new Error("Erro ao salvar checklist");
        return response.json();
    }
}
