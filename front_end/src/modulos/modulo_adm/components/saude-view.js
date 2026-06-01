// saude-view.js — Aba "Saúde da aplicação" (Production Health).
//
// Centro de comando para o suporte: traduz exceções não tratadas e 5xx
// em ações de atendimento.
//
// Layout:
//   1. KPIs no topo (eventos 24h, variação semanal, abertos, críticos)
//   2. Toolbar com filtros (janela, severidade, status, ambiente, busca)
//   3. Feed de grupos de erro (cada linha = fingerprint único)
//   4. Drawer/modal lateral com detalhes do grupo + amostra de eventos
//      + ações (silenciar, marcar resolvido, abrir ticket, escalar)

import { AdminAPI, adminFetch } from "../services/admin-api.js";
import { escapeHtml, toast, confirmarAcao, debounce } from "./admin-ui.js";


const SEVERIDADE_LABEL = {
  info: "Informativo",
  warning: "Atenção",
  error: "Erro",
  critical: "Crítico",
};
const SEVERIDADE_CLS = {
  info: "info",
  warning: "warn",
  error: "danger",
  critical: "danger",
};
const STATUS_LABEL = {
  aberto: "Aberto",
  monitorando: "Monitorando",
  silenciado: "Silenciado",
  resolvido: "Resolvido",
};
const STATUS_CLS = {
  aberto: "warn",
  monitorando: "info",
  silenciado: "off",
  resolvido: "ok",
};


// Estado de página persiste entre cliques (filtros + paginação).
let estado = {
  page: 1,
  page_size: 25,
  janela: "24h",
  severidade: "",
  status: "",
  ambiente: "",
  busca: "",
  ocultar_silenciados: true,
  ordenar_por: "ultima_ocorrencia",
};

let pollHandle = null;


export async function renderSaudeAplicacao(container) {
  container.innerHTML = `
    <section class="admin-section saude-section">
      <header class="admin-section-head">
        <div>
          <h2><i class="fas fa-heart-pulse"></i> Saúde da aplicação</h2>
          <p>
            Feed em tempo real de erros não tratados e respostas 5xx —
            traduzido em ações de atendimento, com agrupamento automático
            por assinatura técnica.
          </p>
        </div>
        <button class="btn btn-outline-secondary btn-sm" id="btnReload" type="button" title="Recarregar agora">
          <i class="fas fa-rotate-right"></i> Atualizar
        </button>
      </header>

      <div class="kpi-grid" id="saudeKpis">
        <div class="kpi-card"><div class="kpi-icon"><i class="fas fa-spinner fa-spin"></i></div>
          <div class="kpi-body"><span class="kpi-titulo">Carregando…</span></div></div>
      </div>

      <div class="saude-toolbar">
        <div class="saude-toolbar-grupo">
          <label>
            Janela
            <select id="filtroJanela" class="admin-select">
              <option value="15m">Últimos 15 min</option>
              <option value="1h">Última hora</option>
              <option value="6h">Últimas 6 h</option>
              <option value="24h" selected>Últimas 24 h</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
            </select>
          </label>
          <label>
            Severidade
            <select id="filtroSeveridade" class="admin-select">
              <option value="">Todas</option>
              <option value="critical">Crítico</option>
              <option value="error">Erro</option>
              <option value="warning">Atenção</option>
              <option value="info">Informativo</option>
            </select>
          </label>
          <label>
            Status
            <select id="filtroStatus" class="admin-select">
              <option value="">Todos (sem silenciados)</option>
              <option value="aberto">Aberto</option>
              <option value="monitorando">Monitorando</option>
              <option value="resolvido">Resolvido</option>
              <option value="silenciado">Silenciado</option>
            </select>
          </label>
          <label>
            Ambiente
            <select id="filtroAmbiente" class="admin-select">
              <option value="">Todos</option>
              <option value="producao">Produção</option>
              <option value="homologacao">Homologação</option>
              <option value="desenvolvimento">Desenvolvimento</option>
            </select>
          </label>
        </div>
        <div class="saude-toolbar-grupo">
          <input type="search" id="filtroBusca" class="form-control form-control-sm"
                 placeholder="Buscar por endpoint, exceção, mensagem…" aria-label="Buscar erros">
          <label class="check-line" style="margin:0;">
            <input type="checkbox" id="filtroSo5xx"> Apenas 5xx
          </label>
        </div>
      </div>

      <div id="saudeFeed" class="saude-feed">
        <div class="admin-loading">Carregando feed de erros…</div>
      </div>
      <div class="pagination" id="saudePagination"></div>
    </section>

    <aside class="saude-drawer" id="saudeDrawer" hidden aria-hidden="true" aria-label="Detalhe do erro">
      <div class="saude-drawer-overlay" data-fechar></div>
      <div class="saude-drawer-card" role="dialog" aria-modal="true">
        <div id="saudeDrawerCorpo">Carregando…</div>
      </div>
    </aside>
  `;

  bindFiltros(container);
  bindReload(container);
  carregarSumario(container);
  carregar(container);

  // Polling leve: o feed se renova a cada 30s sem perder filtros nem rolagem.
  pararPolling();
  pollHandle = setInterval(() => {
    carregarSumario(container);
    carregar(container, { silencioso: true });
  }, 30_000);
}


export function pararPolling() {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}


// -----------------------------------------------------------------------------
// Binding de filtros + reload
// -----------------------------------------------------------------------------

function bindFiltros(container) {
  const reload = () => { estado.page = 1; carregar(container); };

  container.querySelector("#filtroJanela").addEventListener("change", (e) => {
    estado.janela = e.target.value; reload();
  });
  container.querySelector("#filtroSeveridade").addEventListener("change", (e) => {
    estado.severidade = e.target.value; reload();
  });
  container.querySelector("#filtroStatus").addEventListener("change", (e) => {
    estado.status = e.target.value;
    estado.ocultar_silenciados = !e.target.value; // se filtrou explicitamente, mostra todos
    reload();
  });
  container.querySelector("#filtroAmbiente").addEventListener("change", (e) => {
    estado.ambiente = e.target.value; reload();
  });
  container.querySelector("#filtroSo5xx").addEventListener("change", (e) => {
    estado.so_5xx = e.target.checked; reload();
  });
  const busca = container.querySelector("#filtroBusca");
  busca.addEventListener("input", debounce((e) => {
    estado.busca = e.target.value.trim(); reload();
  }, 320));
}


function bindReload(container) {
  container.querySelector("#btnReload").addEventListener("click", () => {
    carregarSumario(container);
    carregar(container);
  });
}


// -----------------------------------------------------------------------------
// KPIs
// -----------------------------------------------------------------------------

async function carregarSumario(container) {
  const grid = container.querySelector("#saudeKpis");
  if (!grid) return;
  try {
    const k = await AdminAPI.saude.sumario();
    const variacaoCls = k.variacao_pct > 0 ? "kpi-up" : k.variacao_pct < 0 ? "kpi-down" : "";
    const variacaoIcone = k.variacao_pct > 0 ? "fa-arrow-up"
                         : k.variacao_pct < 0 ? "fa-arrow-down" : "fa-equals";
    grid.innerHTML = [
      kpi("fa-bolt", "Eventos nas últimas 24h", k.eventos_24h,
          `${k.eventos_24h_anterior} no período anterior`),
      kpiTendencia("fa-chart-line", "Variação 24h x 24h anteriores",
                   k.variacao_pct, variacaoIcone, variacaoCls,
                   `${k.eventos_7d} eventos nos últimos 7 dias`),
      kpi("fa-circle-exclamation", "Grupos abertos", k.grupos_abertos,
          `${k.criticos} crítico(s) em aberto`),
      kpi("fa-volume-xmark", "Silenciados", k.grupos_silenciados,
          "Conhecidos / em backlog"),
      kpi("fa-circle-check", "Resolvidos (7d)", k.grupos_resolvidos_7d,
          "Marcados pelo suporte"),
      kpi("fa-server", "Serviços afetados", k.servicos_afetados,
          "Componentes com erro nas últimas 24h"),
    ].join("");
  } catch (err) {
    grid.innerHTML = `<div class="admin-error">${escapeHtml(err.message)}</div>`;
  }
}


function kpi(icone, titulo, valor, hint = "") {
  return `
    <div class="kpi-card">
      <div class="kpi-icon"><i class="fas ${icone}"></i></div>
      <div class="kpi-body">
        <span class="kpi-titulo">${escapeHtml(titulo)}</span>
        <strong class="kpi-valor">${escapeHtml(String(valor ?? 0))}</strong>
        ${hint ? `<small class="kpi-hint">${escapeHtml(hint)}</small>` : ""}
      </div>
    </div>`;
}


function kpiTendencia(icone, titulo, valor, iconeTendencia, cls, hint = "") {
  const sinal = valor > 0 ? "+" : "";
  return `
    <div class="kpi-card ${cls}">
      <div class="kpi-icon"><i class="fas ${icone}"></i></div>
      <div class="kpi-body">
        <span class="kpi-titulo">${escapeHtml(titulo)}</span>
        <strong class="kpi-valor">
          <i class="fas ${iconeTendencia}"></i> ${sinal}${escapeHtml(String(valor))}%
        </strong>
        ${hint ? `<small class="kpi-hint">${escapeHtml(hint)}</small>` : ""}
      </div>
    </div>`;
}


// -----------------------------------------------------------------------------
// Feed de grupos
// -----------------------------------------------------------------------------

async function carregar(container, { silencioso = false } = {}) {
  const feed = container.querySelector("#saudeFeed");
  if (!silencioso) {
    feed.innerHTML = `<div class="admin-loading"><i class="fas fa-spinner fa-spin"></i> Carregando feed…</div>`;
  }
  try {
    const filtros = {
      page: estado.page,
      page_size: estado.page_size,
      janela: estado.janela,
      severidade: estado.severidade,
      status: estado.status,
      ambiente: estado.ambiente,
      busca: estado.busca,
      ordenar_por: estado.ordenar_por,
      so_5xx: estado.so_5xx ? "1" : "",
      ocultar_silenciados: estado.ocultar_silenciados ? "1" : "",
    };
    const data = await AdminAPI.saude.listar(filtros);
    renderFeed(feed, data.results, container);
    renderPaginacao(container.querySelector("#saudePagination"), data, container);
  } catch (err) {
    feed.innerHTML = `<div class="admin-error">${escapeHtml(err.message)}</div>`;
  }
}


function renderFeed(feed, grupos, container) {
  if (!grupos || !grupos.length) {
    feed.innerHTML = `
      <div class="admin-empty saude-empty">
        <i class="fas fa-shield-heart"></i>
        <h3>Tudo tranquilo por aqui</h3>
        <p>Nenhum erro registrado para os filtros selecionados. Bom trabalho!</p>
      </div>`;
    return;
  }
  feed.innerHTML = grupos.map((g) => itemFeed(g)).join("");
  feed.querySelectorAll("[data-grupo-id]").forEach((el) => {
    el.addEventListener("click", () => abrirDetalhe(container, Number(el.dataset.grupoId)));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        abrirDetalhe(container, Number(el.dataset.grupoId));
      }
    });
  });
}


function itemFeed(g) {
  const sevCls = SEVERIDADE_CLS[g.severidade] || "info";
  const statCls = STATUS_CLS[g.status] || "info";
  const silenciado = g.silenciado_ativo
    ? `<span class="saude-silenciado" title="Silenciado até ${escapeHtml(g.silenciado_ate || "—")}">
         <i class="fas fa-volume-xmark"></i> Silenciado
       </span>` : "";
  return `
    <article class="saude-card ${sevCls}" data-grupo-id="${g.id}" tabindex="0"
             role="button" aria-label="Abrir detalhes do erro #${g.id}">
      <div class="saude-card-head">
        <span class="status-pill ${sevCls}">${escapeHtml(SEVERIDADE_LABEL[g.severidade] || g.severidade)}</span>
        <span class="status-pill ${statCls}">${escapeHtml(STATUS_LABEL[g.status] || g.status)}</span>
        ${silenciado}
        ${g.ambiente ? `<small class="saude-ambiente">${escapeHtml(g.ambiente)}</small>` : ""}
      </div>
      <h3 class="saude-card-titulo">${escapeHtml(g.titulo || "Erro")}</h3>
      <div class="saude-card-meta">
        <span><i class="fas fa-code"></i> ${escapeHtml(g.tipo_excecao || "—")}</span>
        <span><i class="fas fa-link"></i> ${escapeHtml(g.metodo_http || "")} ${escapeHtml(g.endpoint || "—")}</span>
        ${g.servico ? `<span><i class="fas fa-cube"></i> ${escapeHtml(g.servico)}</span>` : ""}
      </div>
      <div class="saude-card-stats">
        <span><strong>${g.total_eventos}</strong> ocorrência(s)</span>
        ${g.usuarios_afetados > 0
          ? `<span><strong>${g.usuarios_afetados}</strong> usuário(s) afetado(s)</span>` : ""}
        <span><i class="fas fa-clock"></i> Última: ${escapeHtml(g.ultima_ocorrencia)}</span>
        <span><i class="fas fa-flag"></i> Primeira: ${escapeHtml(g.primeira_ocorrencia)}</span>
      </div>
    </article>
  `;
}


function renderPaginacao(container, data, parent) {
  if (!container) return;
  const { total, pages, page } = data;
  if (!pages || pages <= 1) {
    container.innerHTML = total ? `<small>${total} grupo(s) de erro</small>` : "";
    return;
  }
  container.innerHTML = `
    <button class="btn btn-sm btn-outline-secondary" ${page <= 1 ? "disabled" : ""} data-action="prev">
      <i class="fas fa-chevron-left"></i> Anterior
    </button>
    <span class="page-info">Página ${page} de ${pages} · ${total} grupo(s)</span>
    <button class="btn btn-sm btn-outline-secondary" ${page >= pages ? "disabled" : ""} data-action="next">
      Próxima <i class="fas fa-chevron-right"></i>
    </button>
  `;
  container.querySelector('[data-action="prev"]')?.addEventListener("click", () => {
    if (estado.page > 1) { estado.page -= 1; carregar(parent); }
  });
  container.querySelector('[data-action="next"]')?.addEventListener("click", () => {
    if (estado.page < pages) { estado.page += 1; carregar(parent); }
  });
}


// -----------------------------------------------------------------------------
// Detalhe (drawer lateral)
// -----------------------------------------------------------------------------

async function abrirDetalhe(container, grupoId) {
  const drawer = container.querySelector("#saudeDrawer");
  const corpo = drawer.querySelector("#saudeDrawerCorpo");
  drawer.hidden = false;
  drawer.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => drawer.classList.add("open"));
  corpo.innerHTML = `<div class="admin-loading"><i class="fas fa-spinner fa-spin"></i> Carregando detalhes…</div>`;

  // Fechamento por overlay/Esc — registrado uma vez (idempotente)
  drawer.querySelectorAll("[data-fechar]").forEach((el) => {
    el.onclick = () => fecharDrawer(drawer);
  });
  document.addEventListener("keydown", function esc(ev) {
    if (ev.key === "Escape") {
      document.removeEventListener("keydown", esc);
      fecharDrawer(drawer);
    }
  });

  try {
    const grupo = await AdminAPI.saude.detalhe(grupoId);
    renderDetalhe(corpo, grupo, container);
  } catch (err) {
    corpo.innerHTML = `<div class="admin-error">${escapeHtml(err.message)}</div>`;
  }
}


function fecharDrawer(drawer) {
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  setTimeout(() => { drawer.hidden = true; }, 200);
}


function renderDetalhe(corpo, g, container) {
  const sevCls = SEVERIDADE_CLS[g.severidade] || "info";
  const statCls = STATUS_CLS[g.status] || "info";
  corpo.innerHTML = `
    <header class="saude-detalhe-head">
      <button class="btn-icon" type="button" data-fechar title="Fechar">
        <i class="fas fa-xmark"></i>
      </button>
      <div class="saude-detalhe-titulo">
        <span class="status-pill ${sevCls}">${escapeHtml(SEVERIDADE_LABEL[g.severidade] || g.severidade)}</span>
        <span class="status-pill ${statCls}">${escapeHtml(STATUS_LABEL[g.status] || g.status)}</span>
        ${g.silenciado_ativo
          ? `<small class="saude-silenciado">Silenciado até ${escapeHtml(g.silenciado_ate || "—")}</small>`
          : ""}
      </div>
      <h2>${escapeHtml(g.titulo)}</h2>
      <p class="saude-detalhe-meta">
        <span><i class="fas fa-code"></i> ${escapeHtml(g.tipo_excecao || "—")}</span>
        <span><i class="fas fa-link"></i> ${escapeHtml(g.metodo_http || "")} ${escapeHtml(g.endpoint || "—")}</span>
        ${g.servico ? `<span><i class="fas fa-cube"></i> ${escapeHtml(g.servico)}</span>` : ""}
        ${g.ambiente ? `<span><i class="fas fa-flag"></i> ${escapeHtml(g.ambiente)}</span>` : ""}
        ${g.versao_app ? `<span><i class="fas fa-tag"></i> v${escapeHtml(g.versao_app)}</span>` : ""}
      </p>
    </header>

    <section class="saude-detalhe-stats">
      <div><span>Ocorrências</span><strong>${g.total_eventos}</strong></div>
      <div><span>Usuários afetados</span><strong>${g.usuarios_afetados}</strong></div>
      <div><span>Primeira</span><strong>${escapeHtml(g.primeira_ocorrencia || "—")}</strong></div>
      <div><span>Última</span><strong>${escapeHtml(g.ultima_ocorrencia || "—")}</strong></div>
    </section>

    <section class="saude-detalhe-secao">
      <h3>Mensagem técnica</h3>
      <pre class="saude-pre">${escapeHtml(g.mensagem_tecnica || "—")}</pre>
    </section>

    ${g.eventos_recentes && g.eventos_recentes.length ? `
      <section class="saude-detalhe-secao">
        <h3>Eventos recentes (${g.eventos_recentes.length})</h3>
        <ul class="saude-eventos">
          ${g.eventos_recentes.map(eventoMarkup).join("")}
        </ul>
      </section>
    ` : `
      <section class="saude-detalhe-secao">
        <p class="admin-empty-inline">Sem amostras de eventos disponíveis.</p>
      </section>
    `}

    <footer class="saude-detalhe-acoes">
      <button class="btn btn-outline-secondary" type="button" data-acao="ticket">
        <i class="fas fa-ticket"></i> Gerar ticket de suporte
      </button>
      <button class="btn btn-outline-secondary" type="button" data-acao="escalar">
        <i class="fas fa-bullhorn"></i> Escalar para engenharia
      </button>
      <button class="btn btn-outline-secondary" type="button" data-acao="silenciar">
        <i class="fas fa-volume-xmark"></i> Silenciar 24h
      </button>
      ${g.status !== "resolvido"
        ? `<button class="btn btn-primary" type="button" data-acao="resolver">
             <i class="fas fa-check"></i> Marcar como resolvido
           </button>`
        : `<button class="btn btn-outline-secondary" type="button" data-acao="reabrir">
             <i class="fas fa-rotate-left"></i> Reabrir
           </button>`}
    </footer>
  `;

  // Bindings de fechamento e ações
  corpo.querySelectorAll("[data-fechar]").forEach((el) => {
    el.onclick = () => fecharDrawer(container.querySelector("#saudeDrawer"));
  });
  corpo.querySelector('[data-acao="resolver"]')?.addEventListener("click", () => acaoMarcarResolvido(container, g));
  corpo.querySelector('[data-acao="reabrir"]')?.addEventListener("click", () => acaoReabrir(container, g));
  corpo.querySelector('[data-acao="silenciar"]')?.addEventListener("click", () => acaoSilenciar(container, g));
  corpo.querySelector('[data-acao="ticket"]')?.addEventListener("click", () => acaoGerarTicket(g));
  corpo.querySelector('[data-acao="escalar"]')?.addEventListener("click", () => acaoEscalar(g));
}


function eventoMarkup(e) {
  const payload = e.payload_sanitizado
    ? `<details><summary>Payload</summary><pre>${escapeHtml(JSON.stringify(e.payload_sanitizado, null, 2))}</pre></details>` : "";
  const stack = e.stack_trace
    ? `<details><summary>Stack trace</summary><pre>${escapeHtml(e.stack_trace)}</pre></details>` : "";
  return `
    <li class="saude-evento">
      <header>
        <strong>${escapeHtml(e.criado_em)}</strong>
        <code>${escapeHtml(e.request_id || "—")}</code>
        ${e.status_http ? `<span class="status-pill ${e.status_http >= 500 ? "danger" : "warn"}">HTTP ${e.status_http}</span>` : ""}
        ${e.deploy_recente ? `<span class="status-pill warn">Deploy recente</span>` : ""}
      </header>
      <div class="saude-evento-meta">
        ${e.metodo_http ? `<span><i class="fas fa-bolt"></i> ${escapeHtml(e.metodo_http)} ${escapeHtml(e.caminho || "")}</span>` : ""}
        ${e.tempo_resposta_ms ? `<span><i class="fas fa-clock"></i> ${e.tempo_resposta_ms} ms</span>` : ""}
        ${e.usuario_email ? `<span><i class="fas fa-user"></i> ${escapeHtml(e.usuario_email)}</span>` : ""}
        ${e.ip ? `<span><i class="fas fa-globe"></i> ${escapeHtml(e.ip)}</span>` : ""}
        ${e.versao_app ? `<span><i class="fas fa-tag"></i> v${escapeHtml(e.versao_app)}</span>` : ""}
      </div>
      ${payload}
      ${stack}
    </li>
  `;
}


// -----------------------------------------------------------------------------
// Ações
// -----------------------------------------------------------------------------

async function acaoMarcarResolvido(container, grupo) {
  const ok = await confirmarAcao({
    titulo: "Marcar como resolvido",
    mensagem: `Confirmar que o erro "${grupo.titulo}" foi corrigido? Se reaparecer, o grupo será reaberto automaticamente.`,
    confirmar: "Sim, resolver",
  });
  if (!ok) return;
  try {
    await AdminAPI.saude.atualizar(grupo.id, { status: "resolvido" });
    toast("Grupo marcado como resolvido.", "success");
    fecharDrawer(container.querySelector("#saudeDrawer"));
    carregar(container);
    carregarSumario(container);
  } catch (err) { toast(err.message, "error"); }
}


async function acaoReabrir(container, grupo) {
  try {
    await AdminAPI.saude.atualizar(grupo.id, { status: "aberto" });
    toast("Grupo reaberto.", "info");
    fecharDrawer(container.querySelector("#saudeDrawer"));
    carregar(container);
    carregarSumario(container);
  } catch (err) { toast(err.message, "error"); }
}


async function acaoSilenciar(container, grupo) {
  const horasStr = prompt(
    "Silenciar este grupo por quantas horas? (padrão 24h, máx 168 = 7 dias)",
    "24",
  );
  if (horasStr === null) return;
  const horas = Number(horasStr);
  if (!Number.isFinite(horas) || horas <= 0 || horas > 168) {
    toast("Valor inválido. Use um número entre 1 e 168.", "error");
    return;
  }
  try {
    await AdminAPI.saude.atualizar(grupo.id, {
      status: "silenciado",
      silenciar_por_horas: horas,
    });
    toast(`Silenciado por ${horas}h.`, "success");
    fecharDrawer(container.querySelector("#saudeDrawer"));
    carregar(container);
    carregarSumario(container);
  } catch (err) { toast(err.message, "error"); }
}


async function acaoGerarTicket(grupo) {
  // Chama o endpoint que cria o Ticket de suporte com os dados do grupo
  // já pré-preenchidos. Retorna {ticket_id, titulo, prioridade} em caso
  // de sucesso; o admin recebe um toast com link para abrir o ticket.
  try {
    const resposta = await AdminAPI.saude.gerarTicket(grupo.id);
    toast(
      `Ticket #${resposta.ticket_id} criado (prioridade ${resposta.prioridade}).`,
      "success",
    );
    // Navega para a aba de Suporte automaticamente para que o admin já
    // veja o ticket recém-criado na listagem.
    window.location.hash = "#suporte";
  } catch (err) {
    toast(`Falha ao gerar ticket: ${err.message}`, "error");
  }
}


function acaoEscalar(grupo) {
  // Em um próximo iteração isso vai postar em Slack/Teams via webhook.
  // Por ora, monta um mailto: como prova de conceito — equipe ajusta o
  // destinatário em Configurações se quiser desviar para outro canal.
  const assunto = encodeURIComponent(`[Engenharia] Incidente em ${grupo.endpoint}`);
  const corpo = encodeURIComponent(
    `Time, precisamos de ajuda neste erro:\n\n`
    + `Título: ${grupo.titulo}\n`
    + `Endpoint: ${grupo.metodo_http} ${grupo.endpoint}\n`
    + `Serviço: ${grupo.servico}\n`
    + `Ambiente: ${grupo.ambiente}\n`
    + `Ocorrências: ${grupo.total_eventos}\n`
    + `Última: ${grupo.ultima_ocorrencia}\n\n`
    + `Mensagem:\n${grupo.mensagem_tecnica}\n`,
  );
  window.location.href = `mailto:engenharia@pitstop.local?subject=${assunto}&body=${corpo}`;
}
