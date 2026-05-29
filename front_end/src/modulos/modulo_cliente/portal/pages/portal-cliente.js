// portal-cliente.js — orquestrador da página portal-cliente.html.
//
// Lida com:
//   1. Guard de sessão do cliente (redireciona p/ login).
//   2. Lista de OS na lateral (drawer em mobile/tablet).
//   3. Cabeçalho da OS selecionada (resumo + status).
//   4. Lazy-load do conteúdo de cada aba ao trocar.
//   5. Eventos de assinatura/aprovação que afetam o cabeçalho.

import { garantirAcessoCliente } from "../services/cliente-auth.js";
import { ClienteOSApi } from "../services/cliente-os-api.js";
import { renderChecklistCliente } from "../components/tabs/checklist-tab.js";
import { renderDocumentosCliente } from "../components/tabs/documentos-tab.js";
import { renderHistoricoCliente } from "../components/tabs/historico-tab.js";
import { renderAprovacoesCliente } from "../components/tabs/aprovacoes-tab.js";
import { renderAssinaturaCliente } from "../components/tabs/assinatura-tab.js";
import { renderSuporteCliente } from "../components/tabs/suporte-tab.js";


const state = {
  osAtualId: null,
  osAtualDados: null,
  tabAtiva: "checklist",
};


document.addEventListener("DOMContentLoaded", async () => {
  if (!(await garantirAcessoCliente())) return;

  configurarDrawer();
  configurarSidebar();
  configurarTabs();
  configurarLogoutFallback();

  // OS inicial via ?os_id= ou primeira da lista
  const url = new URLSearchParams(window.location.search);
  const osIdParam = url.get("os_id");
  if (osIdParam) {
    await selecionarOS(Number(osIdParam));
  } else {
    aguardarPrimeiraOS();
  }
});


// -----------------------------------------------------------------------------
// Drawer mobile
// -----------------------------------------------------------------------------

function configurarDrawer() {
  const sidebar = document.querySelector(".portal-sidebar");
  const overlay = document.querySelector(".portal-overlay");
  const btnAbrir = document.getElementById("btnAbrirOSList");
  const btnFechar = document.getElementById("btnFecharSidebar");

  const fechar = () => {
    sidebar?.classList.remove("open");
    overlay?.classList.remove("open");
    btnAbrir?.setAttribute("aria-expanded", "false");
  };

  btnAbrir?.addEventListener("click", () => {
    sidebar?.classList.add("open");
    overlay?.classList.add("open");
    btnAbrir.setAttribute("aria-expanded", "true");
  });

  btnFechar?.addEventListener("click", fechar);
  overlay?.addEventListener("click", fechar);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sidebar?.classList.contains("open")) fechar();
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth >= 1024) fechar();
  });

  window.__portalClienteFecharDrawer = fechar;
}


// -----------------------------------------------------------------------------
// Sidebar (lista de OS)
// -----------------------------------------------------------------------------

function configurarSidebar() {
  const osList = document.querySelector("cliente-os-list");
  osList?.addEventListener("cliente:os-select", (e) => {
    const os = e.detail;
    if (!os) return;
    selecionarOS(os.id);
    window.__portalClienteFecharDrawer?.();
  });
}


function aguardarPrimeiraOS() {
  const osList = document.querySelector("cliente-os-list");
  if (!osList) return;
  // O componente dispara a carga em connectedCallback — esperamos um tick.
  const tentar = (tentativas = 0) => {
    if (osList.ordens?.length) {
      selecionarOS(osList.ordens[0].id);
    } else if (tentativas < 10) {
      setTimeout(() => tentar(tentativas + 1), 250);
    } else {
      renderSemOS();
    }
  };
  tentar();
}


async function selecionarOS(osId) {
  try {
    const detalhes = await ClienteOSApi.detalheOrdem(osId);
    state.osAtualId = osId;
    state.osAtualDados = detalhes;
    document.querySelector("cliente-os-list")?.setSelected(osId);
    renderResumoOS(detalhes);
    carregarAba(state.tabAtiva);
  } catch (err) {
    console.error("Falha ao carregar OS:", err);
    renderResumoOS(null);
    document.getElementById("contentArea").innerHTML = `
      <div class="error-state" role="alert">
        Não foi possível carregar a OS solicitada (${err.message}).
      </div>`;
  }
}


function renderSemOS() {
  state.osAtualId = null;
  state.osAtualDados = null;
  renderResumoOS(null);
  document.getElementById("contentArea").innerHTML = `
    <div class="empty-state">
      <i class="fas fa-car-side" aria-hidden="true"></i>
      <h3>Nenhuma OS encontrada</h3>
      <p>Você ainda não possui ordens de serviço vinculadas a este cadastro.</p>
    </div>`;
}


function renderResumoOS(os) {
  const sumario = document.getElementById("osSummary");
  if (!sumario) return;
  if (!os) {
    sumario.innerHTML = `
      <div>
        <h1>Sem OS selecionada</h1>
        <p class="os-summary-sub">Selecione uma OS na lista lateral para ver os detalhes.</p>
      </div>`;
    return;
  }
  sumario.innerHTML = `
    <div>
      <h1>OS #${os.id} · ${escapeHtml(os.veiculo_marca || "")} ${escapeHtml(os.veiculo_modelo || "")}</h1>
      <p class="os-summary-sub">
        Placa <strong>${escapeHtml(os.veiculo_placa || "—")}</strong> ·
        Oficina ${escapeHtml(os.oficina_nome || "—")}
      </p>
      <div class="os-summary-meta">
        <span><i class="fas fa-calendar-alt" aria-hidden="true"></i> Aberta em ${escapeHtml(os.criado_em)}</span>
        ${os.km_atual ? `<span><i class="fas fa-road" aria-hidden="true"></i> ${escapeHtml(os.km_atual)} km</span>` : ""}
        ${os.oficina_telefone ? `<span><i class="fas fa-phone" aria-hidden="true"></i> ${escapeHtml(os.oficina_telefone)}</span>` : ""}
      </div>
    </div>
    <status-badge type="os" status="${os.status}"></status-badge>
  `;
}


// -----------------------------------------------------------------------------
// Tabs
// -----------------------------------------------------------------------------

function configurarTabs() {
  const tabs = document.querySelector("oficina-tabs");
  tabs?.addEventListener("os:tab-change", (e) => {
    const target = e.detail?.targetId;
    if (!target) return;
    state.tabAtiva = target;
    carregarAba(target);
  });
}


function carregarAba(target) {
  const content = document.getElementById("contentArea");
  if (!content) return;

  // A aba "Suporte" não depende de OS selecionada — chamados são gerais.
  if (target === "suporte") {
    renderSuporteCliente(content);
    return;
  }

  if (!state.osAtualId) {
    content.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-hand-pointer" aria-hidden="true"></i>
        <h3>Selecione uma OS</h3>
        <p>Use a lista à esquerda para escolher uma OS.</p>
      </div>`;
    return;
  }
  switch (target) {
    case "checklist":
      renderChecklistCliente(content, state.osAtualId, {
        onAssinarRequest: () => trocarTab("assinatura"),
      });
      break;
    case "documentos":
      renderDocumentosCliente(content, state.osAtualId);
      break;
    case "historico":
      renderHistoricoCliente(content, state.osAtualId);
      break;
    case "aprovacoes":
      renderAprovacoesCliente(content, state.osAtualId);
      break;
    case "assinatura":
      renderAssinaturaCliente(content, state.osAtualId, {
        onAssinaturaSalva: () => trocarTab("checklist"),
      });
      break;
    default:
      content.innerHTML = `<div class="empty-state"><p>Conteúdo indisponível.</p></div>`;
  }
}


function trocarTab(targetId) {
  const tabs = document.querySelector("oficina-tabs");
  if (!tabs) return;
  tabs.activateTab?.(targetId);
}


// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function configurarLogoutFallback() {
  // <cliente-header> já tem seu botão, mas mantemos compat. com testes.
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[m]);
}
