// cliente-veiculos.js
//
// Aba "Veículos" do cliente: lista os veículos do cliente selecionado e,
// para cada um, busca o histórico de OS exibindo um card com status.

import { apiUrl } from "../../../../../shared/config/api-config.js";
import "../../../../../shared/components/status-badge.js";
import { abrirNovaOS, abrirOS } from "../../../../../shared/services/os-deep-link.js";


const STATUS_MAP = {
  pendente: { label: "Pendente", icon: "fa-clock", color: "#f59e0b", bg: "#fef3c7" },
  execucao: { label: "Em execução", icon: "fa-wrench", color: "#3b82f6", bg: "#dbeafe" },
  concluido: { label: "Concluído", icon: "fa-check-circle", color: "#10b981", bg: "#d1fae5" },
};


/** Busca veículos do cliente e renderiza no #veiculos-content. */
  export async function carregarVeiculosDoCliente(clienteId) {
  const container = document.getElementById("veiculos-content");  // ← ESSA LINHA ESTAVA FALTANDO
  if (!container) return;

  container.innerHTML = `<div class="empty-vehicles"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i><p>Carregando veículos...</p></div>`;

  try {
    const response = await fetch(apiUrl(`/clientes/${clienteId}/veiculos/`), {
      credentials: 'include'   // ← também adicione para evitar 403
    });
    if (!response.ok) throw new Error("Erro ao buscar veículos");
    const veiculos = await response.json();
    renderizarVeiculos(veiculos, container);
  } catch (error) {
    console.error(error);
    if (container) {   // boa prática verificar se container ainda é válido
      container.innerHTML = `<div class="empty-vehicles"><i class="fas fa-exclamation-triangle" aria-hidden="true"></i><p>Erro ao carregar veículos.</p></div>`;
    }
  }
}


function renderizarVeiculos(veiculos, container) {
  // Atualiza somente o contador da aba (do cliente selecionado).
  // O hero `#statTotalVeiculos` mostra o total da OFICINA inteira e é
  // gerenciado por `cliente-lista.js#atualizarStatsHero()`.
  const tabCount = document.getElementById("tabCountVeiculos");
  if (tabCount) tabCount.textContent = veiculos.length;

  if (veiculos.length === 0) {
    container.innerHTML = `
      <div class="empty-state-soft">
        <i class="fas fa-car-side" aria-hidden="true"></i>
        <p>Nenhum veículo cadastrado para este cliente.</p>
      </div>`;
    return;
  }

  const html = ['<div class="vehicles-grid">'];
  veiculos.forEach((v) => html.push(renderizarCardVeiculo(v)));
  html.push("</div>");
  container.innerHTML = html.join("");

  veiculos.forEach((v) => {
    const list = document.querySelector(`#history-${v.id} .history-list`);
    if (list) carregarHistoricoVeiculo(v.id, list);
  });

  // Vincula ações em cada card (Nova OS / abrir OS via id)
  container.querySelectorAll('[data-action="nova-os"]').forEach((btn) => {
    btn.addEventListener("click", () =>
      abrirNovaOS({ veiculoId: btn.dataset.id })
    );
  });
}


function renderizarCardVeiculo(v) {
  const tipoUso = (v.tipo_uso || "particular").toLowerCase();
  const tipoLabel = tipoUso === "comercial" ? "Comercial / Frota" : "Particular";
  return `
    <div class="vehicle-tab-card" data-veiculo-id="${v.id}">
      <div class="vehicle-card-header">
        <h3 class="vehicle-card-title">
          <i class="fas fa-car" aria-hidden="true"></i>
          ${v.placa || "—"}
          <span class="vehicle-model">${v.modelo || "Modelo não informado"}</span>
        </h3>
        <div class="vehicle-card-actions">
          <span class="badge" style="background:var(--bg-muted, #f1f5f9);color:var(--text-secondary, #475569);">${v.ano || "----"}</span>
          <button class="btn-icon-mini" type="button"
                  title="Abrir nova OS para este veículo"
                  data-action="nova-os" data-id="${v.id}">
            <i class="fas fa-plus-circle" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      <div class="vehicle-info-grid">
        ${montarMiniCard("fa-tag", "Marca", v.marca)}
        ${montarMiniCard("fa-palette", "Cor", v.cor)}
        ${montarMiniCard("fa-fingerprint", "Chassi", v.chassi)}
        ${montarMiniCard("fa-suitcase", "Tipo de uso", tipoLabel)}
      </div>
      <div class="vehicle-history" id="history-${v.id}">
        <h5 style="margin: 0 1.25rem 0.5rem; color: var(--text-secondary, #475569);">
          <i class="fas fa-history" aria-hidden="true"></i> Histórico de Serviços
        </h5>
        <div class="history-list" style="padding: 0 1.25rem 1.25rem;">
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Carregando...
        </div>
      </div>
    </div>
  `;
}


function montarMiniCard(icone, label, valor) {
  return `
    <div class="modern-card">
      <div class="card-icon"><i class="fas ${icone}" aria-hidden="true"></i></div>
      <div class="card-content">
        <span class="card-label">${label}</span>
        <span class="card-value">${valor || "--"}</span>
      </div>
    </div>
  `;
}


async function carregarHistoricoVeiculo(veiculoId, container) {
  try {
    const response = await fetch(apiUrl(`/veiculos/${veiculoId}/historico/`), {
      credentials: 'include'
    });
    if (!response.ok) throw new Error("Erro ao buscar histórico");
    const ordens = await response.json();
    renderizarHistorico(ordens, container);
  } catch (error) {
    container.innerHTML = `<small style="color:red;">Erro ao carregar histórico.</small>`;
  }
}


function renderizarHistorico(ordens, container) {
  if (!ordens.length) {
    container.innerHTML =
      '<p style="color: var(--secondary); font-size:0.8rem;">Nenhuma OS registrada.</p>';
    return;
  }

  const html = ['<div class="history-cards-grid">'];
  ordens.forEach((os) => html.push(montarCardHistorico(os)));
  html.push("</div>");
  container.innerHTML = html.join("");
}


function montarCardHistorico(os) {
  const status = STATUS_MAP[os.status] || STATUS_MAP.pendente;
  const dataFormatada = new Date(os.criado_em).toLocaleDateString("pt-BR");

  const badgeChecklist = os.checklist
    ? (os.checklist.concluido
        ? `<status-badge type="checklist" status="concluido" size="sm"></status-badge>`
        : `<status-badge type="checklist" status="pendente" size="sm"></status-badge>`)
    : "";

  return `
    <div class="history-card modern-card">
      <div class="card-icon" style="background:${status.bg};color:${status.color};">
        <i class="fas ${status.icon}" aria-hidden="true"></i>
      </div>
      <div class="card-content" style="flex:1;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap;">
          <span class="card-value" style="font-size:1rem;margin:0;">
            <span class="os-id-link" onclick="window.openOS(${os.id})">O.S. #${os.id}</span>
          </span>
          <status-badge type="os" status="${os.status}" size="sm"></status-badge>
        </div>
        <div style="display:flex;gap:1rem;margin-top:0.3rem;flex-wrap:wrap;align-items:center;">
          <span class="card-label"><i class="far fa-calendar-alt" aria-hidden="true"></i> ${dataFormatada}</span>
          <span class="card-label"><i class="fas fa-tachometer-alt" aria-hidden="true"></i> ${os.km_atual || "--"} km</span>
          ${badgeChecklist}
        </div>
      </div>
    </div>
  `;
}
