// visao-os-current.js
//
// Lifecycle da "OS atualmente selecionada":
//  - empty state (nenhuma OS carregada);
//  - seleção via clique na lista lateral (<os-list>);
//  - seleção automática via parâmetro ?os_id= na URL.
//
// Atualiza o cabeçalho (id, veículo, placa, badge de status) e dispara o
// carregamento da aba ativa via tabs-loader.

import { apiUrl } from "../../../../../../shared/config/api-config.js";
import { carregarAba } from "./visao-tabs-loader.js";


/** Renderiza o empty state quando nenhuma OS está selecionada. */
export function mostrarMensagemNenhumaOS({ tabsComponent, modalNovaOS }) {
  const contentArea = document.getElementById("content-area");
  if (!contentArea) return;

  contentArea.innerHTML = `
    <div class="empty-state-card">
      <i class="fas fa-car-side empty-icon"></i>
      <h2>Nenhuma ordem de serviço selecionada</h2>
      <p>Selecione uma OS na lista lateral ou crie uma nova para começar.</p>
      <button class="btn btn-primary" id="empty-state-nova-os">
        <i class="fas fa-plus"></i> Nova Ordem de Serviço
      </button>
    </div>
  `;
  document
    .getElementById("empty-state-nova-os")
    ?.addEventListener("click", () => modalNovaOS?.open());

  document.getElementById("header-os-id").textContent = "---";
  document.getElementById("header-veiculo").textContent = "Nenhum veículo";
  document.getElementById("header-placa").textContent = "---";

  atualizarStatusBadge(null);

  if (tabsComponent) {
    tabsComponent.querySelectorAll(".tab").forEach((tab) => tab.classList.add("locked"));
  }
}


/** Vincula o listener de seleção de OS no <os-list>. */
export function configurarSelecaoOS({ osList, tabsComponent, modalNovaOS }) {
  if (!osList) return;

  osList.addEventListener("os:select", async (e) => {
    const os = e.detail;
    if (!os || !os.id) {
      window.osSelecionadoId = null;
      mostrarMensagemNenhumaOS({ tabsComponent, modalNovaOS });
      return;
    }

    try {
      const detalhes = await buscarDetalhesOS(os.id);
      atualizarHeader(detalhes);
      window.osSelecionadoId = detalhes.id;
      await sincronizarChecklistComTabs(os.id, tabsComponent);

      const tabAtiva = document.querySelector("oficina-tabs .tab.active");
      carregarAba(tabAtiva ? tabAtiva.dataset.target : "checklist", {
        tabsComponent,
        osId: detalhes.id,
        onEmpty: () => mostrarMensagemNenhumaOS({ tabsComponent, modalNovaOS }),
      });
    } catch (error) {
      console.error("Erro ao carregar detalhes da OS:", error);
      alert("Não foi possível carregar os detalhes da OS.");
    }
  });
}


async function buscarDetalhesOS(osId) {
  const response = await fetch(apiUrl(`/os/${osId}/`), {
    credentials: 'include'
  });
  if (!response.ok) throw new Error("Erro ao carregar detalhes da OS");
  return response.json();
}


function atualizarHeader(os) {
  document.getElementById("header-os-id").textContent = os.id;
  document.getElementById("header-veiculo").textContent =
    os.veiculo_detalhes?.modelo || "--";
  document.getElementById("header-placa").textContent =
    os.veiculo_detalhes?.placa || "--";
  atualizarStatusBadge(os.status);
}


/** Substitui o conteúdo da .os-status-bar pelo <status-badge> padronizado. */
function atualizarStatusBadge(status) {
  const bar = document.querySelector(".os-status-bar");
  if (!bar) return;
  bar.innerHTML = "";
  const badge = document.createElement("status-badge");
  badge.setAttribute("type", "os");
  if (status) {
    badge.setAttribute("status", status);
  } else {
    badge.setAttribute("status", "pendente");
    badge.setAttribute("label", "Nenhuma OS");
  }
  bar.appendChild(badge);
}


async function sincronizarChecklistComTabs(osId, tabsComponent) {
  if (!tabsComponent) return;
  try {
    const response = await fetch(apiUrl(`/os/${osId}/checklist/`), {
      credentials: 'include'
    });
    if (response.ok) {
      const data = await response.json();
      tabsComponent.setLockedByChecklist(!!(data && data.concluido));
    } else {
      tabsComponent.setLockedByChecklist(false);
    }
  } catch (error) {
    console.error("Erro ao verificar checklist:", error);
    tabsComponent.setLockedByChecklist(false);
  }
}


/**
 * Carrega automaticamente a OS indicada por ?os_id=<n> na URL.
 * Tenta primeiro via lista local; se não estiver lá, busca direto na API.
 */
export function carregarOsPorParametroDaUrl() {
  const osIdParam = new URLSearchParams(window.location.search).get("os_id");
  if (!osIdParam) return;

  const tentar = () => {
    const osList = document.querySelector("os-list");
    if (!osList?.orders?.length) {
      setTimeout(tentar, 300);
      return;
    }

    const encontrada = osList.orders.find((os) => os.id == osIdParam);
    if (encontrada) {
      dispararSelecao(osList, encontrada);
    } else {
      buscarERedispararSelecao(osList, osIdParam);
    }

    if (window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  setTimeout(tentar, 200);
}


function dispararSelecao(osList, detail) {
  osList.dispatchEvent(
    new CustomEvent("os:select", { detail, bubbles: true, composed: true }),
  );
}


function buscarERedispararSelecao(osList, osIdParam) {
  fetch(apiUrl(`/os/${osIdParam}/`), {
    credentials: 'include'
  })
    .then((r) => r.json())
    .then((os) => {
      dispararSelecao(osList, {
        id: os.id,
        veiculo_placa: os.veiculo_detalhes?.placa,
        veiculo_modelo: os.veiculo_detalhes?.modelo,
        cliente_nome: os.cliente?.nome,
        status: os.status,
        km_atual: os.km_atual,
        criado_em: os.criado_em,
      });
    })
    .catch((err) => console.error("Erro ao buscar OS por ID:", err));
}
