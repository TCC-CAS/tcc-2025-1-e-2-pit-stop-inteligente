// execucao-tab.js
//
// Ponto de entrada da aba "Execução". Mantém apenas a orquestração:
//
//   execucao-state.js   — state (currentOsId, tarefas, filtro) + utilitários
//   execucao-api.js     — service HTTP (tarefas + checklist + finalização)
//   execucao-render.js  — render da lista + contadores

import { ExecucaoApi } from "./parts/execucao-api.js";
import {
  atualizarContadores,
  exibirCarregamentoTarefas,
  exibirErroTarefas,
  renderizarListaTarefas,
} from "./parts/execucao-render.js";
import { state } from "./parts/execucao-state.js";


export function initExecucao(osId) {
  state.currentOsId = osId;
  if (!osId) return;

  atualizarVisualBotaoIncluir();
  carregarTarefas();
  configurarBotoesPrincipais();
  configurarFiltros();
}


// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

function configurarBotoesPrincipais() {
  const btnIncluir = document.getElementById("btnIncluirTarefa");
  if (btnIncluir) btnIncluir.onclick = adicionarTarefa;

  const btnFinalizar = document.getElementById("btnFinalizarOS");
  if (btnFinalizar) btnFinalizar.onclick = finalizarOS;
}


function configurarFiltros() {
  const select = document.getElementById("filtroStatus");
  if (select) {
    select.addEventListener("change", (e) => {
      state.filtroAtual = e.target.value;
      renderizar();
    });
  }

  // Filtro via clique nos cards de resumo
  document.querySelectorAll(".resumo-item").forEach((item) => {
    item.addEventListener("click", () => {
      const filtro = item.dataset.filtro;
      if (!filtro) return;
      if (select) select.value = filtro;
      state.filtroAtual = filtro;
      renderizar();
    });
  });
}


// ---------------------------------------------------------------------------
// Fluxos principais
// ---------------------------------------------------------------------------

async function carregarTarefas() {
  exibirCarregamentoTarefas();
  try {
    // Carrega tarefas + funcionários em paralelo na primeira vez. Os
    // funcionários ficam em cache da aba (raramente mudam na sessão).
    const [tarefas] = await Promise.all([
      ExecucaoApi.getTarefas(state.currentOsId),
      state.funcionarios.length ? Promise.resolve() : carregarFuncionarios(),
    ]);
    state.todasTarefas = Array.isArray(tarefas) ? tarefas : [];
    atualizarContadores();
    renderizar();
  } catch (error) {
    exibirErroTarefas(error.message);
  }
}


async function carregarFuncionarios() {
  try {
    state.funcionarios = await ExecucaoApi.getFuncionarios();
  } catch {
    state.funcionarios = [];
  }
}


function renderizar() {
  renderizarListaTarefas({
    onAlterarStatus: alterarStatusTarefa,
    onRemover: removerTarefa,
    onAtribuir: abrirSeletorResponsaveis,
  });
}


/**
 * Modal simples (lista checkable) para atribuir um ou mais funcionários
 * à tarefa. Mantém o backend como única fonte da verdade — o front só
 * envia o conjunto novo via PUT.
 */
function abrirSeletorResponsaveis(tarefaId) {
  const tarefa = state.todasTarefas.find((t) => Number(t.id) === Number(tarefaId));
  if (!tarefa) return;

  const idsAtribuidos = new Set(
    (tarefa.responsaveis_detalhes || []).map((r) => Number(r.id)),
  );

  const modal = obterOuCriarModalAtribuir();
  modal.querySelector(".atribuir-titulo").textContent =
    `Atribuir responsáveis · ${tarefa.descricao}`;
  const corpo = modal.querySelector(".atribuir-corpo");

  if (!state.funcionarios.length) {
    corpo.innerHTML = `
      <p class="text-muted">Nenhum funcionário ativo encontrado. Cadastre em
      <em>Administração → Funcionários</em>.</p>
    `;
  } else {
    corpo.innerHTML = state.funcionarios.map((f) => {
      const id = Number(f.id);
      const nome = escapeHtmlLocal(f.nome || f.email || `#${id}`);
      const papel = escapeHtmlLocal(f.permissao || "");
      const checked = idsAtribuidos.has(id) ? "checked" : "";
      return `
        <label class="atribuir-linha">
          <input type="checkbox" value="${id}" ${checked}>
          <span class="atribuir-nome">${nome}</span>
          <small class="atribuir-papel">${papel}</small>
        </label>
      `;
    }).join("");
  }

  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add("open"));

  modal.querySelector(".atribuir-salvar").onclick = async () => {
    const ids = Array.from(corpo.querySelectorAll("input[type=checkbox]:checked"))
      .map((c) => Number(c.value));
    try {
      const atualizada = await ExecucaoApi.atribuirResponsaveis(
        state.currentOsId, tarefa.id, ids,
      );
      // Atualiza só a tarefa modificada — evita re-render geral
      const idx = state.todasTarefas.findIndex(
        (t) => Number(t.id) === Number(tarefa.id),
      );
      if (idx >= 0) state.todasTarefas[idx] = atualizada;
      renderizar();
      fecharModalAtribuir(modal);
    } catch (err) {
      alert(`Falha ao salvar responsáveis: ${err.message}`);
    }
  };
}


function obterOuCriarModalAtribuir() {
  let modal = document.getElementById("modalAtribuir");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "modalAtribuir";
  modal.className = "atribuir-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="atribuir-overlay" data-fechar></div>
    <div class="atribuir-card" role="dialog" aria-modal="true">
      <header>
        <h3 class="atribuir-titulo">Atribuir responsáveis</h3>
        <button class="btn-icon" type="button" data-fechar aria-label="Fechar">
          <i class="fas fa-xmark"></i>
        </button>
      </header>
      <div class="atribuir-corpo"></div>
      <footer>
        <button type="button" class="btn btn-outline-secondary" data-fechar>Cancelar</button>
        <button type="button" class="btn btn-primary atribuir-salvar">
          <i class="fas fa-check"></i> Salvar
        </button>
      </footer>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-fechar]").forEach((el) => {
    el.addEventListener("click", () => fecharModalAtribuir(modal));
  });
  return modal;
}


function fecharModalAtribuir(modal) {
  modal.classList.remove("open");
  setTimeout(() => { modal.hidden = true; }, 180);
}


function escapeHtmlLocal(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[m]);
}


async function alterarStatusTarefa(tarefaId, novoStatus) {
  try {
    await ExecucaoApi.atualizarTarefa(state.currentOsId, tarefaId, { status: novoStatus });
    await carregarTarefas();
  } catch (error) {
    alert(`Erro ao atualizar status: ${error.message}`);
    await carregarTarefas();
  }
}


async function removerTarefa(tarefaId) {
  if (!confirm("Deseja remover esta tarefa permanentemente?")) return;
  try {
    await ExecucaoApi.deletarTarefa(state.currentOsId, tarefaId);
    await carregarTarefas();
  } catch (error) {
    alert(error.message);
  }
}


async function adicionarTarefa() {
  const check = await ExecucaoApi.checarChecklist(state.currentOsId);
  if (!check.concluido) {
    const continuar = confirm(
      "⚠️ O checklist ainda não foi concluído.\nDeseja forçar a inclusão da tarefa mesmo assim?",
    );
    if (!continuar) return;
  }

  const descricao = prompt("Descrição da nova tarefa:");
  if (!descricao || !descricao.trim()) return;

  try {
    await ExecucaoApi.salvarTarefa(state.currentOsId, {
      descricao: descricao.trim(),
      status: "pendente",
    });
    await carregarTarefas();
  } catch (error) {
    alert(`Erro ao salvar a tarefa:\n${error.message}`);
  }
}


async function finalizarOS() {
  if (!confirm("Deseja marcar esta O.S como finalizada?\nEsta ação não poderá ser desfeita.")) {
    return;
  }
  try {
    await ExecucaoApi.finalizarOS(state.currentOsId);
    alert("OS finalizada com sucesso!");
    const bar = document.querySelector(".os-status-bar");
    if (bar) {
      bar.innerHTML = "";
      const badge = document.createElement("status-badge");
      badge.setAttribute("type", "os");
      badge.setAttribute("status", "concluido");
      bar.appendChild(badge);
    }
    window.dispatchEvent(new CustomEvent("os:criada"));
  } catch (error) {
    alert(`Erro ao finalizar OS:\n${error.message}`);
  }
}


async function atualizarVisualBotaoIncluir() {
  const btn = document.getElementById("btnIncluirTarefa");
  if (!btn) return;
  const status = await ExecucaoApi.checarChecklist(state.currentOsId);
  btn.style.opacity = status.concluido ? "1" : "0.7";
}
