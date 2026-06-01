/**
 * assinatura-gate.js
 *
 * Centraliza o estado da assinatura SaaS para o front-end consumir.
 * Lê /api/pagamentos/gate/ uma única vez por sessão (com cache local)
 * e expõe helpers para o auth-guard, header e sidebar usarem.
 *
 * Forma do payload do back-end:
 *   {
 *     vigente: bool,
 *     status: "ativa|pendente|vencida|cancelada|sem_oficina",
 *     plano_codigo, plano_nome,
 *     expira_em (ISO),
 *     dias_restantes (int|null),
 *     proximo_do_vencimento (bool),
 *     nivel: "ok|atencao|erro",
 *     mensagem (string),
 *     pode_acessar: ["atualizacao", "suporte", "pagamentos"]
 *   }
 */

import { API_BASE_URL, getCsrfToken } from "../config/api-config.js";

const GATE_URL = `${API_BASE_URL}/api/pagamentos/gate/`;

let _cache = null;
let _inflight = null;


/**
 * Busca o gate do back-end. Cacheia em memória; chame `recarregarGate()`
 * para invalidar (ex.: depois de um pagamento confirmado).
 *
 * Em qualquer falha de rede, devolvemos um gate "tolerante" (vigente=true)
 * — assim a UI nunca trava por causa do gate; o back continua sendo a
 * fonte de verdade via paywall middleware.
 */
export async function obterGate({ forcar = false } = {}) {
  if (!forcar && _cache) return _cache;
  if (_inflight) return _inflight;

  _inflight = (async () => {
    try {
      const resp = await fetch(GATE_URL, {
        credentials: "include",
        headers: { "X-CSRFToken": getCsrfToken() },
      });
      if (!resp.ok) {
        // 402/403 podem indicar problema de autenticação — devolvemos
        // o body se for JSON, senão um gate genérico.
        const payload = await resp.json().catch(() => ({}));
        _cache = normalizar(payload);
        return _cache;
      }
      _cache = normalizar(await resp.json());
      return _cache;
    } catch (err) {
      console.warn("[gate] erro ao consultar /api/pagamentos/gate/:", err);
      _cache = gateTolerante();
      return _cache;
    } finally {
      _inflight = null;
    }
  })();

  return _inflight;
}


export function recarregarGate() {
  _cache = null;
  _inflight = null;
  return obterGate({ forcar: true });
}


export function limparCacheGate() {
  _cache = null;
  _inflight = null;
}


// ---------------------------------------------------------------------------
// Decisões de fluxo (consumidas pelo auth-guard e UI)
// ---------------------------------------------------------------------------

/**
 * Retorna true se a página atual está fora do kit liberado quando
 * a assinatura não está vigente. Usado para decidir redirecionamento.
 *
 * @param {object} gate
 * @param {string} chavePagina  ex.: "atualizacao", "dashboard", "operacoes"
 */
export function deveBloquearPagina(gate, chavePagina) {
  if (!gate || gate.vigente) return false;
  const liberadas = Array.isArray(gate.pode_acessar) ? gate.pode_acessar : [];
  return !liberadas.includes(chavePagina);
}


/**
 * True se o item do menu deve ser exibido para o gate atual.
 */
export function podeExibirItemMenu(gate, chaveItem) {
  if (!gate || gate.vigente) return true;
  const liberadas = Array.isArray(gate.pode_acessar) ? gate.pode_acessar : [];
  return liberadas.includes(chaveItem);
}


// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function normalizar(payload) {
  if (!payload || typeof payload !== "object") return gateTolerante();
  // Se o back devolveu o erro do paywall (`{erro, code, gate}`), extrai gate.
  if (payload.gate && typeof payload.gate === "object") return payload.gate;
  // Garante que `pode_acessar` exista como array.
  if (!Array.isArray(payload.pode_acessar)) {
    payload.pode_acessar = ["atualizacao", "suporte", "pagamentos"];
  }
  return payload;
}


function gateTolerante() {
  return {
    vigente: true,
    status: "indisponivel",
    plano_codigo: "",
    plano_nome: "",
    expira_em: null,
    dias_restantes: null,
    proximo_do_vencimento: false,
    nivel: "ok",
    mensagem: "",
    pode_acessar: ["atualizacao", "suporte", "pagamentos"],
  };
}
