// servicos-render.js
//
// Renderização da tela: cards de categorias, tabela de serviços,
// preview de preço e estados auxiliares (loading / busca).

import { hexToRgba, state } from "./servicos-state.js";


/** Re-renderiza tudo a partir do estado atual. */
export function renderizarTela() {
  const inputValorHora = document.getElementById("valorHoraMecanico");
  if (inputValorHora) inputValorHora.value = state.valorHora.toFixed(2);
  renderizarCategorias();
  renderizarTabelaServicos();
}


function renderizarCategorias() {
  const container = document.getElementById("containerCategorias");
  if (!container) return;

  // Separa fixas (id < 1000) das customizadas (id >= 1000)
  const fixas = state.categorias.filter((c) => Number(c.id) < 1000);
  const customs = state.categorias.filter((c) => Number(c.id) >= 1000);

  container.innerHTML = "";
  fixas.forEach((cat) => {
    const idx = state.categorias.indexOf(cat);
    container.appendChild(montarCardCategoria(cat, idx));
  });

  // Card "Outros" — agrupa categorias customizadas. Mostra contagem,
  // edição rápida de percentual e botão para adicionar nova.
  container.appendChild(montarCardOutros(customs));
}


function montarCardCategoria(cat, index) {
  const card = document.createElement("div");
  card.className = "category-card";
  card.style.borderTop = `4px solid ${cat.cor}`;
  card.innerHTML = `
    <div class="category-header">
      <div class="cat-icon-box" style="background-color: ${hexToRgba(cat.cor, 0.1)}; color: ${cat.cor}">
        <i class="fas ${cat.icone}" aria-hidden="true"></i>
      </div>
      <span class="cat-title">${cat.nome}</span>
    </div>
    <div class="cat-input-container">
      <label class="text-sm text-secondary mb-1 d-block" for="cat-input-${index}">Acréscimo (%)</label>
      <div class="cat-input-wrapper">
        <input id="cat-input-${index}" type="number" value="${cat.percentual || 0}" min="0" max="300"
               onchange="alterarCategoria(${index}, this.value)">
        <span class="text-secondary font-bold">%</span>
      </div>
    </div>
  `;
  return card;
}


function montarCardOutros(customs) {
  const corOutros = "#64748b";
  const card = document.createElement("div");
  card.className = "category-card category-card-outros";
  card.style.borderTop = `4px solid ${corOutros}`;

  const totalRotulo = customs.length === 1
    ? "1 categoria"
    : `${customs.length} categorias`;

  card.innerHTML = `
    <div class="category-header">
      <div class="cat-icon-box" style="background-color: ${hexToRgba(corOutros, 0.1)}; color: ${corOutros}">
        <i class="fas fa-circle-plus" aria-hidden="true"></i>
      </div>
      <span class="cat-title">Outros</span>
      <span class="cat-contagem" title="Categorias customizadas cadastradas">${totalRotulo}</span>
    </div>

    <div class="cat-outros-corpo">
      ${customs.length === 0
        ? `<p class="cat-outros-vazio">
             Nenhuma categoria personalizada — cadastre tipos que não
             se encaixam nas categorias padrão.
           </p>`
        : customs.map((c) => `
            <div class="cat-outros-item" data-id="${c.id}">
              <i class="fas ${escapeHtmlSafe(c.icone || "fa-tag")}"
                 style="color: ${c.cor}" aria-hidden="true"></i>
              <span class="cat-outros-nome">${escapeHtmlSafe(c.nome)}</span>
              <div class="cat-input-wrapper cat-input-wrapper-sm">
                <input type="number" min="0" max="300" value="${c.percentual || 0}"
                       data-custom-percentual data-id="${c.id}"
                       title="Acréscimo para ${escapeHtmlSafe(c.nome)}">
                <span class="text-secondary font-bold">%</span>
              </div>
              <button class="cat-outros-remover" data-remove-id="${c.id}"
                      title="Excluir categoria ${escapeHtmlSafe(c.nome)}"
                      aria-label="Excluir ${escapeHtmlSafe(c.nome)}">
                <i class="fas fa-xmark" aria-hidden="true"></i>
              </button>
            </div>
          `).join("")
      }
    </div>

    <button class="btn-add-categoria" id="btnAddCategoriaCustom" type="button">
      <i class="fas fa-plus"></i> Adicionar categoria
    </button>
  `;

  // Binding do percentual: chama alterarCategoria(idx, valor) usando o
  // index real em state.categorias (precisa converter id custom → idx).
  card.querySelectorAll("[data-custom-percentual]").forEach((input) => {
    input.addEventListener("change", (e) => {
      const id = Number(e.target.dataset.id);
      const idx = state.categorias.findIndex((c) => Number(c.id) === id);
      if (idx >= 0 && typeof window.alterarCategoria === "function") {
        window.alterarCategoria(idx, e.target.value);
      }
    });
  });

  // Remover categoria custom (só custom; fixas não tem o botão)
  card.querySelectorAll("[data-remove-id]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.removeId);
      if (typeof window.removerCategoriaCustom === "function") {
        window.removerCategoriaCustom(id);
      }
    });
  });

  // Botão "Adicionar categoria"
  card.querySelector("#btnAddCategoriaCustom")?.addEventListener("click", () => {
    if (typeof window.abrirModalNovaCategoria === "function") {
      window.abrirModalNovaCategoria();
    }
  });

  return card;
}


function escapeHtmlSafe(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[m]);
}


export function renderizarTabelaServicos() {
  const tbody = document.getElementById("listaServicosBody");
  if (!tbody) return;

  tbody.innerHTML = "";
  if (!state.servicos || state.servicos.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="text-center py-4 text-secondary">Nenhum serviço cadastrado no banco.</td></tr>';
    return;
  }

  state.servicos.forEach((servico) => tbody.appendChild(montarLinhaServico(servico)));
}


function montarLinhaServico(servico) {
  const tempo = parseFloat(servico.tempo) || 0;
  const valorBase = tempo * state.valorHora;

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>
      <strong style="color: var(--text-light)">${servico.nome}</strong>
      <div class="text-xs text-secondary">${servico.descricao || ""}</div>
    </td>
    <td class="text-center">${tempo} h</td>
    <td class="text-right font-bold text-primary">R$ ${valorBase.toFixed(2)}</td>
    <td class="text-center">
      <button class="btn-icon btn-edit" onclick="editarServico(${servico.id})" aria-label="Editar serviço ${servico.nome}">
        <i class="fas fa-edit" aria-hidden="true"></i>
      </button>
      <button class="btn-icon btn-delete" onclick="excluirServico(${servico.id})" aria-label="Excluir serviço ${servico.nome}">
        <i class="fas fa-trash-alt" aria-hidden="true"></i>
      </button>
    </td>
  `;
  return tr;
}


export function atualizarPreviewPreco() {
  const tempo = parseFloat(document.getElementById("tempoServico")?.value) || 0;
  document.getElementById("previewTempo").innerText = tempo;
  document.getElementById("previewValorHora").innerText = state.valorHora.toFixed(2);
  document.getElementById("previewTotal").innerText = (tempo * state.valorHora).toFixed(2);
}


export function mostrarCarregando(show) {
  const tbody = document.getElementById("listaServicosBody");
  if (!tbody) return;
  if (show) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="text-center py-4 text-secondary"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Sincronizando com o Banco de Dados...</td></tr>';
  }
  // Quando show=false, mantemos o conteúdo atual (renderizarTabelaServicos já preencheu).
}


export function filtrarServicos(termo) {
  const lower = termo.toLowerCase();
  document.querySelectorAll("#listaServicosBody tr").forEach((row) => {
    row.style.display = row.innerText.toLowerCase().includes(lower) ? "" : "none";
  });
}
