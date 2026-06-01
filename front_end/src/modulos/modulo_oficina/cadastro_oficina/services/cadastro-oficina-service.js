// cadastro-oficina-service.js
//
// Comunicação com o endpoint público /auth/registrar-oficina/ — cria
// usuário admin + oficina + vínculo em uma única chamada.

import { apiUrl, getCsrfToken } from "../../../../shared/config/api-config.js";


export class CadastroOficinaService {
    /**
     * Faz POST multipart com os dados do administrador, da oficina, aceite
     * de termos e logo opcional. Após sucesso, o servidor já autenticou o
     * usuário (cookie de sessão) — basta redirecionar.
     *
     * Em erro de validação, lança Error com a mensagem amigável vinda do back.
     */
    static async registrar(formData) {
        // Garante o cookie CSRF antes do POST cross-port
        await fetch(apiUrl("/auth/csrf/"), { credentials: "include" });

        const response = await fetch(apiUrl("/auth/registrar-oficina/"), {
            method: "POST",
            credentials: "include",
            headers: {
                "X-CSRFToken": getCsrfToken(),
            },
            body: formData,
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.erro || "Erro ao registrar oficina.");
        }
        return payload;
    }
}
