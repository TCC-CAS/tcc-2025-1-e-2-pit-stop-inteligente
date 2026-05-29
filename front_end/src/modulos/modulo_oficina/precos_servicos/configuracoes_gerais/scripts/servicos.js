// servicos.js
//
// Ponto de entrada da tela "Preços e Serviços". Mantém apenas a
// orquestração entre os módulos:
//
//   servicos-state.js   — estado + categorias padrão
//   servicos-api.js     — chamadas HTTP
//   servicos-render.js  — DOM (categorias, tabela, preview)
//   servicos-modal.js   — modal de novo/editar serviço

import { garantirAcesso } from "../../../../../shared/services/auth-guard.js";
import {
  buscarDadosIniciais,
  atualizarValorHora,
  persistirCategoria,
  persistirServico,
  removerServico,
  criarCategoriaCustom,
  removerCategoriaCustom as apiRemoverCategoriaCustom,
} from "./parts/servicos-api.js";
import {
  abrirModalEdicao,
  abrirModalNovoServico,
  coletarPayloadServico,
  fecharModal,
} from "./parts/servicos-modal.js";
import {
  atualizarPreviewPreco,
  filtrarServicos,
  mostrarCarregando,
  renderizarTabelaServicos,
  renderizarTela,
} from "./parts/servicos-render.js";
import { CATEGORIAS_PADRAO, state } from "./parts/servicos-state.js";


// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
  // Catálogo/preços só pode ser editado pela gestão; leitura é livre.
  if (!(await garantirAcesso({ permissaoMinima: "leitura", paginaChave: "precos" }))) return;
  configurarEventos();
  carregarDadosIniciais();
});


function configurarEventos() {
  document.querySelectorAll(".tab").forEach((tab) =>
    tab.addEventListener("click", (e) => trocarAba(e.target)),
  );

  vincular("btnAtualizar", "click", carregarDadosIniciais);
  vincular("btnNovoServico", "click", abrirModalNovoServico);
  vincular("btnSalvarHora", "click", salvarValorHora);
  vincular("btnRestaurarPadroes", "click", restaurarPadroes);
  vincular("btnFecharModal", "click", fecharModal);
  vincular("btnCancelarModal", "click", fecharModal);
  vincular("btnSalvarServico", "click", salvarServico);
  vincular("tempoServico", "input", atualizarPreviewPreco);
  vincular("buscaServico", "input", (e) => filtrarServicos(e.target.value));

  document.getElementById("modalServico")?.addEventListener("click", (e) => {
    if (e.target.id === "modalServico") fecharModal();
  });

  // Globais usadas pelos botões inline da tabela
  window.editarServico = abrirModalEdicao;
  window.excluirServico = excluirServico;
  window.alterarCategoria = (index, valor) => alterarCategoria(index, valor);
  // Globais usadas pelo card "Outros" (categorias customizadas)
  window.abrirModalNovaCategoria = abrirModalNovaCategoria;
  window.removerCategoriaCustom = removerCategoriaCustom;
}


function vincular(id, evento, handler) {
  document.getElementById(id)?.addEventListener(evento, handler);
}


function trocarAba(btn) {
  document.querySelectorAll(".tab, .tab-pane").forEach((el) => el.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById(btn.dataset.tab)?.classList.add("active");
}


// ---------------------------------------------------------------------------
// Orquestração de dados
// ---------------------------------------------------------------------------

async function carregarDadosIniciais() {
  mostrarCarregando(true);
  try {
    const { config, categorias: categoriasBackend, servicos } = await buscarDadosIniciais();
    state.valorHora = config.valor_hora ? parseFloat(config.valor_hora) : 0;
    state.servicos = servicos;
    state.categorias = mesclarCategorias(categoriasBackend);
    renderizarTela();
  } catch (erro) {
    console.error("Erro ao carregar:", erro);
  } finally {
    mostrarCarregando(false);
  }
}


function mesclarCategorias(categoriasBackend) {
  // 1) Fixas: usa CATEGORIAS_PADRAO como base (visual) e completa com id +
  //    percentual vindos do backend (que é a fonte da verdade da regra).
  const fixas = CATEGORIAS_PADRAO.map((catPadrao) => {
    const match = categoriasBackend.find(
      (cb) => cb.nome.toLowerCase() === catPadrao.nome.toLowerCase(),
    );
    return match
      ? { ...catPadrao, id: match.id, percentual: match.percentual }
      : { ...catPadrao };
  });

  // 2) Customizadas (id >= 1000): vêm prontas do backend com nome/cor/ícone
  //    definidos pelo gestor. Mantemos exatamente como veio.
  const customs = categoriasBackend.filter((c) => Number(c.id) >= 1000);

  return [...fixas, ...customs];
}


async function salvarValorHora() {
  const input = document.getElementById("valorHoraMecanico");
  const novo = parseFloat(input?.value);
  if (isNaN(novo) || novo <= 0) {
    alert("Insira um valor válido.");
    return;
  }
  try {
    await atualizarValorHora(novo);
    state.valorHora = novo;
    feedbackBotaoCheck("btnSalvarHora");
    renderizarTabelaServicos();
  } catch {
    alert("Não foi possível salvar o valor da hora.");
  }
}


function feedbackBotaoCheck(btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  const original = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-check"></i>';
  setTimeout(() => (btn.innerHTML = original), 2000);
}


async function alterarCategoria(index, novoPercentual) {
  state.categorias[index].percentual = parseFloat(novoPercentual);
  try {
    const data = await persistirCategoria(state.categorias[index]);
    state.categorias[index].id = data.id;
    state.categorias[index].percentual = data.percentual;
  } catch (erro) {
    console.error("Erro:", erro);
  }
}


async function restaurarPadroes() {
  if (!confirm("Deseja restaurar os percentuais padrão para todas as categorias?")) return;

  state.categorias = state.categorias.map((cat) => {
    const padrao = CATEGORIAS_PADRAO.find((p) => p.nome === cat.nome);
    if (padrao) cat.percentual = padrao.percentual;
    return cat;
  });

  for (let i = 0; i < state.categorias.length; i++) {
    await alterarCategoria(i, state.categorias[i].percentual);
  }
  renderizarTela();
  alert("Padrões restaurados e salvos no banco de dados!");
}


async function salvarServico() {
  const dados = coletarPayloadServico();
  if (!dados) return;
  try {
    await persistirServico(dados.payload, dados.id || null);
    fecharModal();
    carregarDadosIniciais();
  } catch (erro) {
    alert("O servidor recusou os dados. Motivo:\n" + erro.message);
  }
}


async function excluirServico(id) {
  if (!confirm("Excluir este serviço definitivamente do Banco de Dados?")) return;
  try {
    await removerServico(id);
    state.servicos = state.servicos.filter((s) => s.id !== id);
    renderizarTabelaServicos();
  } catch {
    alert("Não foi possível excluir.");
  }
}


// ---------------------------------------------------------------------------
// Categorias customizadas (card "Outros")
// ---------------------------------------------------------------------------

const _ICONES_DISPONIVEIS = [
  { icone: "fa-tractor",      rotulo: "Agrícola" },
  { icone: "fa-motorcycle",   rotulo: "Moto" },
  { icone: "fa-truck-moving", rotulo: "Caminhão" },
  { icone: "fa-van-shuttle",  rotulo: "Van" },
  { icone: "fa-bus",          rotulo: "Ônibus" },
  { icone: "fa-snowplow",     rotulo: "Pesado" },
  { icone: "fa-tag",          rotulo: "Tag" },
];


/**
 * Modal mínimo para criar uma categoria customizada. Renderizamos um
 * pequeno overlay com input de nome + percentual + escolha de ícone.
 */
function abrirModalNovaCategoria() {
  const overlay = document.createElement("div");
  overlay.className = "cat-novo-overlay";
  overlay.innerHTML = `
    <div class="cat-novo-card" role="dialog" aria-modal="true">
      <header>
        <h3><i class="fas fa-plus-circle"></i> Nova categoria</h3>
        <button class="btn-icon" type="button" data-cat-fechar aria-label="Fechar">
          <i class="fas fa-xmark"></i>
        </button>
      </header>
      <form id="formNovaCategoria">
        <label>
          <span>Nome</span>
          <input type="text" id="catNomeNovo" required maxlength="80" placeholder="Ex.: Frota agrícola">
        </label>
        <label>
          <span>Acréscimo (%)</span>
          <input type="number" id="catPercNovo" min="0" max="300" value="0">
        </label>
        <label>
          <span>Ícone</span>
          <div class="cat-icones">
            ${_ICONES_DISPONIVEIS.map((opt, i) => `
              <label class="cat-icone-opt">
                <input type="radio" name="catIcone" value="${opt.icone}" ${i === 0 ? "checked" : ""}>
                <span><i class="fas ${opt.icone}"></i> ${opt.rotulo}</span>
              </label>
            `).join("")}
          </div>
        </label>
        <label>
          <span>Cor</span>
          <input type="color" id="catCorNova" value="#64748b">
        </label>
        <footer>
          <button type="button" class="btn btn-outline-secondary" data-cat-fechar>Cancelar</button>
          <button type="submit" class="btn btn-primary">
            <i class="fas fa-check"></i> Criar
          </button>
        </footer>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  const fechar = () => overlay.remove();
  overlay.querySelectorAll("[data-cat-fechar]").forEach((el) =>
    el.addEventListener("click", fechar),
  );
  overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });

  overlay.querySelector("#formNovaCategoria").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = overlay.querySelector("#catNomeNovo").value.trim();
    const percentual = overlay.querySelector("#catPercNovo").value;
    const icone = overlay.querySelector("input[name=catIcone]:checked")?.value || "fa-tag";
    const cor = overlay.querySelector("#catCorNova").value || "#64748b";

    if (nome.length < 2) {
      alert("Informe um nome com pelo menos 2 caracteres.");
      return;
    }
    try {
      await criarCategoriaCustom({ nome, percentual, icone, cor });
      fechar();
      await carregarDadosIniciais();
    } catch (err) {
      alert(err.message || "Falha ao criar categoria.");
    }
  });
}


async function removerCategoriaCustom(id) {
  if (!confirm("Remover esta categoria customizada?")) return;
  try {
    await apiRemoverCategoriaCustom(id);
    state.categorias = state.categorias.filter((c) => Number(c.id) !== Number(id));
    renderizarTela();
  } catch {
    alert("Não foi possível remover a categoria.");
  }
}
