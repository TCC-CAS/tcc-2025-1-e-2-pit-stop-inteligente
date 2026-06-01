// auth-guard.js
//
// Helper para proteger páginas internas. Importe e chame `garantirAcesso()`
// no topo de cada entry script (dashboard, cadastro de cliente, etc.).
//
// Comportamento:
//  1. Busca /auth/me/. Se não autenticado → manda para login.
//  2. Se autenticado mas SEM oficina selecionada → manda para selecionar oficina.
//  3. Se exigir uma permissão mínima e o papel não bater → manda para dashboard.

import { carregarPerfil, temPermissao } from "./auth-service.js";
import { deveBloquearPagina, obterGate } from "./assinatura-gate.js";
import { urlInterna } from "./base-path.js";


export const ROTAS = {
  login: "app/login/pages/login-page.html",
  selecionarOficina: "app/login/pages/selecionar-oficina.html",
  dashboard: "modulos/modulo_oficina/dashboard/pages/dashboard.html",
  // Página onde o admin paga/renova plano (aba "Renovação de Plano").
  renovarPlano: "modulos/modulo_oficina/atualizar_dados_oficina/pages/atualizacao_dados_oficina.html#plan",
};


/**
 * Protege a página atual.
 * @param {object} opts
 * @param {string} [opts.permissaoMinima] — se fornecido, valida via temPermissao().
 * @param {boolean} [opts.exigeOficina=true] — se true, redireciona para selecionar quando faltar.
 * @param {string|null} [opts.paginaChave] — identificador da página (ver oficina-sidebar GRUPOS).
 *   Quando informado, o guard consulta o gate da assinatura e, se a página
 *   não está liberada para uma assinatura vencida/pendente, redireciona
 *   para a aba "Renovação de Plano".
 * @returns {Promise<object|null>} Perfil completo ou null se redirecionou.
 */
export async function garantirAcesso({
  permissaoMinima,
  exigeOficina = true,
  paginaChave = null,
} = {}) {
  let perfil;
  try {
    perfil = await carregarPerfil();
  } catch (error) {
    console.error("Falha ao validar sessão:", error);
    redirecionarParaLogin();
    return null;
  }

  if (!perfil) {
    redirecionarParaLogin();
    return null;
  }

  if (exigeOficina && !perfil.oficina_atual_id) {
    redirecionarPara(ROTAS.selecionarOficina);
    return null;
  }

  if (permissaoMinima && !temPermissao(permissaoMinima)) {
    alert("Você não tem permissão para acessar esta tela.");
    redirecionarPara(ROTAS.dashboard);
    return null;
  }

  // Paywall do front: bloqueia páginas que não estão no kit liberado quando
  // a assinatura não está vigente. Staff/superuser passa por cima (back não
  // bloqueia para eles também).
  if (paginaChave && !perfil.user?.is_superuser && !perfil.user?.is_staff) {
    try {
      const gate = await obterGate();
      if (deveBloquearPagina(gate, paginaChave)) {
        // Evita loop: se já estamos na página de renovação, não redireciona.
        if (paginaChave !== "atualizacao") {
          alert(
            gate.mensagem ||
            "Sua assinatura não está vigente. Conclua o pagamento para continuar.",
          );
          redirecionarPara(ROTAS.renovarPlano);
          return null;
        }
      }
    } catch (err) {
      console.warn("[guard] gate indisponível, liberando:", err);
    }
  }

  return perfil;
}


export function redirecionarParaLogin() {
  redirecionarPara(ROTAS.login);
}


export function redirecionarPara(rotaEmSrc) {
  window.location.href = urlInterna(rotaEmSrc);
}
