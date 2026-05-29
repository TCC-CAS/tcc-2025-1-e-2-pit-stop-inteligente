// execucao-render.js
//
// Renderização da lista de tarefas e dos contadores de resumo.
// Recebe callbacks para atualização de status e exclusão.

import { escapeHtml, normalizarStatus, state } from "./execucao-state.js";


export function atualizarContadores() {
  const tarefas = state.todasTarefas;
  const contagem = (s) => tarefas.filter((t) => normalizarStatus(t.status) === s).length;

  setTexto("totalCount", tarefas.length);
  setTexto("pendenteCount", contagem("pendente"));
  setTexto("execucaoCount", contagem("execucao"));
  setTexto("concluidoCount", contagem("concluido"));
}


export function renderizarListaTarefas({ onAlterarStatus, onRemover, onAtribuir }) {
  const lista = document.getElementById("listaTarefas");
  if (!lista) return;

  const tarefasFiltradas =
    state.filtroAtual === "todas"
      ? state.todasTarefas
      : state.todasTarefas.filter(
          (t) => normalizarStatus(t.status) === state.filtroAtual,
        );

  if (tarefasFiltradas.length === 0) {
    lista.innerHTML = '<li class="text-muted">Nenhuma tarefa encontrada.</li>';
    return;
  }

  lista.innerHTML = "";
  tarefasFiltradas.forEach((t) => lista.appendChild(montarItem(t)));

  vincularEventos(onAlterarStatus, onRemover, onAtribuir);
}


function montarItem(t) {
  const li = document.createElement("li");
  li.className = "task-item";
  const statusNormalizado = normalizarStatus(t.status);
  const responsaveis = t.responsaveis_detalhes || [];

  // Chips dos responsáveis (até 3 visíveis + "+N" quando há mais)
  const chipsHtml = responsaveis.length
    ? responsaveis.slice(0, 3).map((r) => `
        <span class="task-resp-chip" title="${escapeHtml(r.permissao)}">
          <i class="fas fa-user"></i> ${escapeHtml(primeiroNome(r.nome))}
        </span>`).join("")
      + (responsaveis.length > 3
          ? `<span class="task-resp-chip task-resp-mais">+${responsaveis.length - 3}</span>`
          : "")
    : `<span class="task-resp-vazio"><i class="fas fa-user-slash"></i> Sem responsável</span>`;

  // Tempo: estimado (vindo do catálogo) vs gasto (calculado pelo back)
  const tempoEstimado = parseFloat(t.tempo_estimado_h || 0);
  const tempoGastoMin = parseInt(t.tempo_gasto_minutos || 0, 10);
  const tempoHtml = (tempoEstimado > 0 || tempoGastoMin > 0)
    ? `<small class="task-tempo">
         <i class="fas fa-clock"></i>
         ${tempoEstimado > 0 ? `Est. ${formatarHoras(tempoEstimado)}` : ""}
         ${tempoGastoMin > 0 ? ` · Gasto ${formatarMinutos(tempoGastoMin)}` : ""}
       </small>`
    : "";

  li.innerHTML = `
    <div class="task-linha-principal">
      <select class="task-status status-${statusNormalizado}" data-id="${t.id}"
              aria-label="Status da tarefa ${escapeHtml(t.descricao)}">
        <option value="pendente"  ${statusNormalizado === "pendente"  ? "selected" : ""}>⏳ Pendente</option>
        <option value="execucao"  ${statusNormalizado === "execucao"  ? "selected" : ""}>⚙️ Em Execução</option>
        <option value="concluido" ${statusNormalizado === "concluido" ? "selected" : ""}>✅ Concluído</option>
      </select>
      <span class="task-desc-label">${escapeHtml(t.descricao)}</span>
      <button class="btn-icon" data-action="atribuir" data-id="${t.id}"
              title="Atribuir responsável" aria-label="Atribuir responsável">
        <i class="fas fa-user-plus" aria-hidden="true"></i>
      </button>
      <button class="btn-icon-danger" data-action="remover" data-id="${t.id}"
              title="Remover tarefa" aria-label="Remover tarefa ${escapeHtml(t.descricao)}">
        <i class="fas fa-trash-alt" aria-hidden="true"></i>
      </button>
    </div>
    <div class="task-linha-meta">
      <div class="task-resps">${chipsHtml}</div>
      ${tempoHtml}
    </div>
  `;
  return li;
}


function vincularEventos(onAlterarStatus, onRemover, onAtribuir) {
  document.querySelectorAll(".task-status").forEach((select) => {
    select.onchange = (e) => onAlterarStatus(e.target.dataset.id, e.target.value);
  });
  document.querySelectorAll('[data-action="remover"]').forEach((btn) => {
    btn.onclick = () => onRemover(btn.dataset.id);
  });
  document.querySelectorAll('[data-action="atribuir"]').forEach((btn) => {
    btn.onclick = () => onAtribuir && onAtribuir(Number(btn.dataset.id));
  });
}


function primeiroNome(nome) {
  if (!nome) return "";
  return String(nome).split(/\s+/)[0];
}


function formatarHoras(h) {
  if (!h) return "0h";
  if (h < 1) return `${Math.round(h * 60)}min`;
  return `${(Math.round(h * 10) / 10).toString().replace(".", ",")}h`;
}


function formatarMinutos(min) {
  if (min < 60) return `${min}min`;
  const horas = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${horas}h${resto}min` : `${horas}h`;
}


export function exibirCarregamentoTarefas() {
  const lista = document.getElementById("listaTarefas");
  if (lista) {
    lista.innerHTML =
      '<li class="loading-placeholder"><i class="fas fa-spinner fa-pulse" aria-hidden="true"></i> Carregando tarefas...</li>';
  }
}


export function exibirErroTarefas(mensagem) {
  const lista = document.getElementById("listaTarefas");
  if (lista) {
    lista.innerHTML = `<li class="text-muted" style="color:red;">Erro ao carregar: ${escapeHtml(mensagem)}</li>`;
  }
}


function setTexto(id, valor) {
  const el = document.getElementById(id);
  if (el) el.innerText = valor;
}
