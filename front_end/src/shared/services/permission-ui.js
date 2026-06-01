// permission-ui.js — utilitário para esconder/desabilitar elementos do
// front-end conforme o papel do usuário atual. O back continua sendo a
// fonte da verdade — esta camada é apenas UX.
//
// Uso:
//   import { aplicarPermissoes, podeOperacao } from "shared/services/permission-ui.js";
//   await aplicarPermissoes(); // chame uma vez por página (após auth-guard)
//   if (!podeOperacao("operacional")) btnNovaOS.hidden = true;
//
// Elementos podem declarar restrição via atributo:
//   <button data-requer="operacional">Nova OS</button>
//   <button data-requer="admin">Excluir</button>
//   <a data-requer-staff>Painel SaaS</a>

import { carregarPerfil, temPermissao } from "./auth-service.js";


let perfilCache = null;


export async function aplicarPermissoes() {
  perfilCache = await carregarPerfil().catch(() => null);
  document.querySelectorAll("[data-requer]").forEach((el) => {
    const nivel = el.dataset.requer;
    if (!podeOperacao(nivel)) ocultar(el);
  });
  document.querySelectorAll("[data-requer-staff]").forEach((el) => {
    if (!(perfilCache?.user?.is_superuser || perfilCache?.user?.is_staff)) {
      ocultar(el);
    }
  });
}


/**
 * Wrapper público — verifica o nível usando temPermissao do auth-service.
 * Níveis: "admin" | "gestao" | "operacional" | "tecnico" | "leitura".
 */
export function podeOperacao(nivel) {
  return temPermissao(nivel);
}


export function papelAtualUI() {
  return perfilCache?.oficina_atual?.permissao || null;
}


function ocultar(el) {
  if (el.tagName === "BUTTON" || el.tagName === "INPUT" || el.tagName === "SELECT") {
    el.disabled = true;
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("title", "Sem permissão");
  }
  el.hidden = true;
}
