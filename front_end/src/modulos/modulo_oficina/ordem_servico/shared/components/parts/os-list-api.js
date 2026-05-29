// os-list-api.js
//
// Operações HTTP do componente <os-list>.

import { apiUrl, getCsrfToken } from "../../../../../../shared/config/api-config.js";


export async function buscarOrdens() {
  const response = await fetch(apiUrl("/os/"), {
    credentials: 'include'   // ← inclui cookies de sessão
  });
  if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
  return response.json();
}

/** Exclui uma OS no servidor; retorna true em sucesso, lança Error em falha. */
export async function excluirOrdem(osId) {
  const response = await fetch(apiUrl(`/os/${osId}/excluir/`), {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCsrfToken(),
    },
    credentials: "include",
  });
  if (response.ok) return true;

  const erro = await response.json().catch(() => ({ erro: response.statusText }));
  throw new Error(erro.erro || "Erro desconhecido");
}
