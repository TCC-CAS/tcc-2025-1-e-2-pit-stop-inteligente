function getCSRFToken() {
    const name = 'csrftoken';
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const [key, value] = cookie.trim().split('=');
        if (key === name) return value;
    }
    return '';
}

// checklist-service.js
export class ChecklistService {
    static async buscarChecklist(osId) {
        const response = await fetch(`http://127.0.0.1:8000/api/oficina/os/${osId}/checklist/`);
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('Erro ao buscar checklist');
        return await response.json();
    }

    static async salvarChecklist(osId, dados) {
        const response = await fetch(`http://127.0.0.1:8000/api/oficina/os/${osId}/checklist/`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken()},
            body: JSON.stringify(dados)
        });
        if (!response.ok) throw new Error('Erro ao salvar checklist');
        return await response.json();
    }
}