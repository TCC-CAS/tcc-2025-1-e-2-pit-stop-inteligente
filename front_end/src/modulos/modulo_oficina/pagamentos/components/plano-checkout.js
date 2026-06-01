/**
 * plano-checkout.js
 * Renderiza a aba "Renovação de Plano" da tela de Atualização Cadastral.
 *
 * Substitui o seletor estático antigo por um fluxo conectado à API:
 *   1. carrega catálogo de planos via /api/pagamentos/planos/
 *   2. carrega assinatura atual via /api/pagamentos/assinatura/status/
 *   3. renderiza um card por plano com botão de ação (Assinar/Renovar)
 *   4. ao clicar, dispara /api/pagamentos/assinatura/checkout/ e
 *      redireciona o navegador para a URL do AbacatePay.
 *
 * Não acopla a outras abas: pode ser chamado de forma independente.
 */
import {
    iniciarCheckoutAssinatura,
    listarPlanos,
    obterStatusAssinatura,
} from "../services/pagamentos-service.js";

const SELECTOR_ABA = "#plan";
const STATUS_NOME_BADGE = "statusPlanoNome";
const STATUS_VENCIMENTO = "statusPlanoVencimento";
const STORAGE_KEY_PENDENTE = "pitstop:pagamento_pendente";


/**
 * Ponto de entrada. Idempotente — pode ser chamado de novo após uma
 * mudança de plano sem duplicar listeners.
 */
export async function inicializarAbaRenovacaoPlano() {
    const aba = document.querySelector(SELECTOR_ABA);
    if (!aba) return;

    // Substitui o conteúdo estático por um container dinâmico controlado.
    aba.innerHTML = renderEsqueleto();
    mostrarAvisoPagamentoPendente(aba);

    try {
        const [planos, assinatura] = await Promise.all([
            listarPlanos(),
            obterStatusAssinatura(),
        ]);
        renderPlanos(aba, planos, assinatura);
        atualizarHeaderStatus(assinatura);
    } catch (err) {
        console.error("[plano-checkout] erro ao carregar:", err);
        renderErro(aba, err);
    }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderEsqueleto() {
    return `
        <div class="plano-aviso" id="planoAviso" hidden></div>
        <div class="plano-info-bar" id="planoInfoBar"></div>
        <div class="plan-grid" id="plansContainer">
            <p class="plano-loading">Carregando planos…</p>
        </div>
        <p class="plano-footnote">
            <i class="fas fa-lock" aria-hidden="true"></i>
            Pagamento processado de forma segura pela AbacatePay.
            Você poderá escolher entre PIX ou cartão de crédito na próxima tela.
        </p>
    `;
}


/**
 * Quando o cadastro de oficina não conseguiu redirecionar direto ao
 * checkout (rede / chave inválida), grava em sessionStorage um marcador
 * que esta tela consome para exibir um aviso claro.
 */
function mostrarAvisoPagamentoPendente(aba) {
    const el = aba.querySelector("#planoAviso");
    if (!el) return;
    let info = null;
    try {
        const bruto = sessionStorage.getItem(STORAGE_KEY_PENDENTE);
        if (bruto) info = JSON.parse(bruto);
    } catch { info = null; }
    if (!info) return;
    el.hidden = false;
    el.innerHTML = `
        <i class="fas fa-circle-info" aria-hidden="true"></i>
        <div>
            <strong>Cadastro concluído.</strong>
            Não foi possível iniciar o pagamento automaticamente
            ${info.plano ? `do plano <strong>${escapeHtml(info.plano)}</strong>` : ""}.
            ${info.motivo ? `<br><span class="plano-aviso-motivo">${escapeHtml(info.motivo)}</span>` : ""}
            Selecione o plano desejado abaixo e finalize o pagamento agora.
        </div>
        <button type="button" class="btn btn-link" id="btnDescartarAviso" aria-label="Dispensar aviso">
            <i class="fas fa-xmark"></i>
        </button>
    `;
    el.querySelector("#btnDescartarAviso")?.addEventListener("click", () => {
        el.hidden = true;
        try { sessionStorage.removeItem(STORAGE_KEY_PENDENTE); } catch {}
    });
}

function renderPlanos(aba, planos, assinatura) {
    const container = aba.querySelector("#plansContainer");
    if (!container) return;
    if (!planos.length) {
        container.innerHTML = `
            <p class="plano-erro">Nenhum plano disponível no momento.</p>
        `;
        return;
    }

    const planoAtualCodigo = assinatura?.plano?.codigo || "";
    container.innerHTML = planos
        .map((p) => renderCard(p, p.codigo === planoAtualCodigo, assinatura))
        .join("");

    container.querySelectorAll("[data-acao=checkout]").forEach((btn) => {
        btn.addEventListener("click", () => handleCheckout(btn));
    });
}

function renderCard(plano, ehAtual, assinatura) {
    const destaque = plano.destaque ? '<div class="badge-featured">Recomendado</div>' : "";
    const features = featuresDoPlano(plano);
    const cssExtra = [
        "plan-card",
        plano.destaque ? "featured" : "",
        ehAtual ? "atual" : "",
    ].filter(Boolean).join(" ");

    const labelBotao = textoBotao(ehAtual, assinatura);
    const classeBotao = ehAtual ? "btn-outline" : "btn-primary";

    return `
        <div class="${cssExtra}" data-plano="${plano.codigo}">
            ${destaque}
            <h3 class="plan-name">${plano.nome}</h3>
            <div class="plan-price">
                R$ ${plano.preco_reais.toFixed(2).replace(".", ",")}
                <span>/mês</span>
            </div>
            <ul class="plan-features">${features}</ul>
            <button type="button"
                    class="btn ${classeBotao} full-width"
                    data-acao="checkout"
                    data-plano="${plano.codigo}">
                ${labelBotao}
            </button>
        </div>
    `;
}

function featuresDoPlano(plano) {
    const itens = [];
    if (plano.limite_os_mensal > 0) {
        itens.push(`Até ${plano.limite_os_mensal} OS/mês`);
    } else {
        itens.push("OS ilimitadas");
    }
    if (plano.limite_usuarios > 0) {
        itens.push(`${plano.limite_usuarios} usuário${plano.limite_usuarios > 1 ? "s" : ""}`);
    }
    if (plano.descricao) itens.push(plano.descricao);
    return itens
        .map((t) => `<li><i class="fas fa-check" aria-hidden="true"></i> ${escapeHtml(t)}</li>`)
        .join("");
}

function textoBotao(ehAtual, assinatura) {
    if (ehAtual) {
        return assinatura?.vigente ? "Renovar este plano" : "Assinar plano atual";
    }
    return "Assinar este plano";
}

function atualizarHeaderStatus(assinatura) {
    const badge = document.getElementById(STATUS_NOME_BADGE);
    if (badge && assinatura?.plano?.nome) {
        badge.textContent = assinatura.plano.nome;
    }
    const venc = document.getElementById(STATUS_VENCIMENTO);
    if (venc) {
        venc.textContent = formatarVencimento(assinatura);
    }
    const bar = document.getElementById("planoInfoBar");
    if (bar) {
        const status = (assinatura?.status || "").toLowerCase();
        const labelStatus = assinatura?.vigente
            ? "Assinatura vigente"
            : status === "pendente"
                ? "Sem assinatura ativa"
                : "Assinatura " + (assinatura?.status || "");
        bar.innerHTML = `
            <strong>${labelStatus}</strong>
            <span>${assinatura?.plano?.nome || "—"} · vence em ${formatarVencimento(assinatura)}</span>
        `;
    }
}

function formatarVencimento(assinatura) {
    if (!assinatura?.expira_em) return "—";
    try {
        const d = new Date(assinatura.expira_em);
        return d.toLocaleDateString("pt-BR");
    } catch {
        return assinatura.expira_em;
    }
}

function renderErro(aba, err) {
    const container = aba.querySelector("#plansContainer");
    if (!container) return;
    container.innerHTML = `
        <p class="plano-erro">
            <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
            Não foi possível carregar os planos: ${escapeHtml(err.message || "erro desconhecido")}
        </p>
    `;
}

// ---------------------------------------------------------------------------
// Ação: criar checkout
// ---------------------------------------------------------------------------

async function handleCheckout(btn) {
    const plano = btn.getAttribute("data-plano");
    if (!plano) return;
    const labelOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Redirecionando…';
    try {
        const resultado = await iniciarCheckoutAssinatura(plano);
        if (!resultado?.url_checkout) {
            throw new Error("URL de checkout não recebida do back-end.");
        }
        window.location.href = resultado.url_checkout;
    } catch (err) {
        console.error("[plano-checkout] falha ao criar checkout:", err);
        alert(
            "Não foi possível iniciar o pagamento: " +
            (err.message || "tente novamente em alguns instantes.")
        );
        btn.disabled = false;
        btn.innerHTML = labelOriginal;
    }
}

// ---------------------------------------------------------------------------
// Util
// ---------------------------------------------------------------------------

function escapeHtml(texto) {
    return String(texto ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
