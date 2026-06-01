// aprovacoes-tab.js (portal do cliente)
//
// Aprovação/rejeição de itens orçados. Cada linha mostra ações
// (Aprovar / Rejeitar) — exceto quando já foi decidido. No fim há um
// resumo do valor total dos itens aprovados.

import { ClienteOSApi } from "../../services/cliente-os-api.js";
import { ClientePagamentosApi } from "../../services/cliente-pagamentos-api.js";
import "../../../../../shared/components/status-badge.js";


export async function renderAprovacoesCliente(container, osId) {
  container.innerHTML = `<div class="loading-state">Carregando itens do orçamento…</div>`;

  let itens;
  try {
    itens = await ClienteOSApi.itens(osId);
  } catch (err) {
    container.innerHTML = `<div class="error-state" role="alert">${err.message}</div>`;
    return;
  }

  if (!itens.length) {
    container.innerHTML = `
      <section class="cliente-tab-section">
        <header class="section-header">
          <div>
            <h2><i class="fas fa-check-circle"></i> Aprovações</h2>
            <p class="section-sub">Itens enviados pela oficina aparecerão aqui.</p>
          </div>
        </header>
        <div class="empty-state">
          <i class="fas fa-clipboard-list" aria-hidden="true"></i>
          <h3>Sem itens para aprovar</h3>
          <p>Quando a oficina enviar peças ou serviços para sua aprovação, eles aparecerão aqui.</p>
        </div>
      </section>`;
    return;
  }

  const pendentes = itens.filter((i) => i.status_aprovacao === "pendente");
  const total = itens.reduce((acc, i) => acc + (i.status_aprovacao === "aprovado" ? Number(i.valor_total || 0) : 0), 0);

  container.innerHTML = `
    <section class="cliente-tab-section" aria-labelledby="hAprovacoes">
      <header class="section-header">
        <div>
          <h2 id="hAprovacoes"><i class="fas fa-check-circle"></i> Itens para Aprovação</h2>
          <p class="section-sub">
            ${pendentes.length} item(ns) pendente(s) — total aprovado:
            <strong>${formatarMoeda(total)}</strong>
          </p>
        </div>
        ${pendentes.length
          ? `<button class="btn btn-primary" id="btnAprovarTudo" type="button">
               <i class="fas fa-check-double"></i> Aprovar todos pendentes
             </button>`
          : ""}
      </header>

      <ul class="aprovacao-list">
        ${itens.map((i) => itemRow(i)).join("")}
      </ul>

      ${pendentes.length
        ? `<form id="formAprovacao" class="confirm-block">
             <label class="check-line">
               <input type="checkbox" id="chkTermo">
               <span>Confirmo que li e estou de acordo com os valores e serviços selecionados.</span>
             </label>
             <button type="submit" class="btn btn-success btn-block" disabled id="btnConfirmar">
               <i class="fas fa-paper-plane"></i> Confirmar decisões selecionadas
             </button>
           </form>`
        : `<div class="ack ack-ok" role="status">
             <i class="fas fa-check-circle"></i>
             Todos os itens já foram decididos. Obrigado!
           </div>`}

      ${total > 0
        ? `<div class="pagamento-bloco" role="region" aria-label="Pagamento">
             <div class="pagamento-info">
               <strong>Valor total aprovado:</strong>
               <span>${formatarMoeda(total)}</span>
             </div>
             <p class="pagamento-hint">
               Pague online via PIX, cartão de crédito ou boleto — processado com segurança pela AbacatePay.
             </p>
             <button type="button" class="btn btn-primary btn-block" id="btnPagarOS">
               <i class="fas fa-credit-card"></i> Pagar agora
             </button>
           </div>`
        : ""}
    </section>
  `;

  vincularAcoes(container, osId, itens);
  vincularPagamento(container, osId);
}


function vincularPagamento(container, osId) {
  const btn = container.querySelector("#btnPagarOS");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Redirecionando…`;
    try {
      const checkout = await ClientePagamentosApi.obterCheckoutDaOS(osId);
      if (!checkout?.url_checkout) {
        throw new Error("URL de pagamento não recebida do servidor.");
      }
      window.location.href = checkout.url_checkout;
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = original;
      alert(`Não foi possível iniciar o pagamento: ${err.message}`);
    }
  });
}


function itemRow(item) {
  const disabled = item.status_aprovacao !== "pendente";
  return `
    <li class="aprovacao-item" data-id="${item.id}">
      <div class="item-info">
        <strong>${escapeHtml(item.nome_descricao)}</strong>
        <span class="item-meta">
          ${item.tipo === "peca" ? "Peça" : "Serviço"} ·
          ${item.quantidade} × ${formatarMoeda(item.valor_unitario)} =
          <strong>${formatarMoeda(item.valor_total)}</strong>
        </span>
      </div>
      <div class="item-actions">
        <status-badge type="item" status="${item.status_aprovacao}" size="sm"></status-badge>
        ${!disabled
          ? `<div class="decisao-buttons" role="group" aria-label="Decisão do item">
               <button type="button" class="btn-decisao approve" data-action="aprovado" aria-label="Aprovar item">
                 <i class="fas fa-check"></i> Aprovar
               </button>
               <button type="button" class="btn-decisao reject" data-action="reprovado" aria-label="Rejeitar item">
                 <i class="fas fa-times"></i> Rejeitar
               </button>
             </div>`
          : ""}
      </div>
    </li>`;
}


function vincularAcoes(container, osId, itens) {
  const decisoes = new Map();

  container.querySelectorAll(".aprovacao-item").forEach((li) => {
    li.querySelectorAll(".btn-decisao").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(li.dataset.id);
        const action = btn.dataset.action;
        decisoes.set(id, action);
        li.querySelectorAll(".btn-decisao").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        atualizarBotaoConfirmar(container, decisoes);
      });
    });
  });

  container.querySelector("#chkTermo")?.addEventListener("change", () =>
    atualizarBotaoConfirmar(container, decisoes),
  );

  container.querySelector("#btnAprovarTudo")?.addEventListener("click", () => {
    itens.filter((i) => i.status_aprovacao === "pendente").forEach((i) => {
      decisoes.set(i.id, "aprovado");
    });
    container.querySelectorAll(".aprovacao-item").forEach((li) => {
      if (decisoes.has(Number(li.dataset.id))) {
        li.querySelectorAll(".btn-decisao").forEach((b) => b.classList.remove("selected"));
        li.querySelector(".btn-decisao.approve")?.classList.add("selected");
      }
    });
    atualizarBotaoConfirmar(container, decisoes);
  });

  container.querySelector("#formAprovacao")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (decisoes.size === 0) return;
    if (!container.querySelector("#chkTermo")?.checked) return;
    const btn = container.querySelector("#btnConfirmar");
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Enviando…`;
    try {
      const payload = Array.from(decisoes.entries()).map(([id, status]) => ({ id, status }));
      await ClienteOSApi.aprovarOrcamento(osId, payload, true);
      await renderAprovacoesCliente(container, osId);
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-paper-plane"></i> Confirmar decisões selecionadas`;
      alert(`Falha ao enviar: ${err.message}`);
    }
  });
}


function atualizarBotaoConfirmar(container, decisoes) {
  const termo = container.querySelector("#chkTermo")?.checked;
  const btn = container.querySelector("#btnConfirmar");
  if (!btn) return;
  btn.disabled = !(termo && decisoes.size > 0);
}


function formatarMoeda(valor) {
  const n = Number(valor || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}


function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[m]);
}
