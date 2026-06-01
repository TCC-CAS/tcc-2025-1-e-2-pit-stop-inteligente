// seguranca-view.js — Aba "Segurança" do painel admin.
//
// Mostra:
//   - KPIs (eventos 24h, falhas de login, lockouts, honeypots acionados, IPs bloqueados)
//   - Feed de eventos com filtros (categoria, severidade, IP, alvo, janela)
//   - Ações: bloquear IP manualmente, desbloquear IP

import { AdminAPI } from "../services/admin-api.js";
import { escapeHtml, toast, debounce, confirmarAcao } from "./admin-ui.js";


const CATEGORIA_LABEL = {
  login_falha: "Falha de login",
  login_lockout: "Lockout",
  rate_limit: "Rate limit",
  honeypot: "Honeypot (bot)",
  user_agent_suspeito: "User-Agent suspeito",
  ip_bloqueado: "IP bloqueado",
  "4xx_anomalo": "4xx anômalo",
  cliente_chave_invalida: "Chave cliente inválida",
  recuperacao_abuso: "Abuso recuperação",
};
const SEV_CLS = {
  info: "info",
  warning: "warn",
  critical: "danger",
};


let estado = {
  page: 1,
  page_size: 25,
  categoria: "",
  severidade: "",
  ip: "",
  alvo: "",
  janela: "24h",
};


export async function renderSeguranca(container) {
  container.innerHTML = `
    <section class="admin-section saude-section">
      <header class="admin-section-head">
        <div>
          <h2><i class="fas fa-shield-halved"></i> Segurança</h2>
          <p>Tentativas suspeitas, lockouts, IPs bloqueados e ações defensivas.</p>
        </div>
        <button class="btn btn-outline-secondary btn-sm" id="btnRefreshSeg" type="button">
          <i class="fas fa-rotate"></i> Atualizar
        </button>
      </header>

      <div class="kpi-grid" id="segKpis">
        <div class="kpi-card"><div class="kpi-icon"><i class="fas fa-spinner fa-spin"></i></div>
          <div class="kpi-body"><span class="kpi-titulo">Carregando…</span></div></div>
      </div>

      <div class="saude-toolbar">
        <div class="saude-toolbar-grupo">
          <label>
            Janela
            <select id="segJanela" class="admin-select">
              <option value="1h">Última hora</option>
              <option value="24h" selected>Últimas 24h</option>
              <option value="7d">Últimos 7d</option>
              <option value="30d">Últimos 30d</option>
            </select>
          </label>
          <label>
            Categoria
            <select id="segCategoria" class="admin-select">
              <option value="">Todas</option>
              ${Object.entries(CATEGORIA_LABEL).map(
                ([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`,
              ).join("")}
            </select>
          </label>
          <label>
            Severidade
            <select id="segSeveridade" class="admin-select">
              <option value="">Todas</option>
              <option value="info">Info</option>
              <option value="warning">Atenção</option>
              <option value="critical">Crítico</option>
            </select>
          </label>
        </div>
        <div class="saude-toolbar-grupo">
          <input type="search" id="segIp" class="form-control form-control-sm"
                 placeholder="Filtrar por IP" style="min-width: 140px;">
          <input type="search" id="segAlvo" class="form-control form-control-sm"
                 placeholder="Filtrar por alvo (e-mail/cpf)" style="min-width: 220px;">
          <button class="btn btn-outline-secondary btn-sm" id="btnBloquearIp" type="button">
            <i class="fas fa-ban"></i> Bloquear IP
          </button>
        </div>
      </div>

      <div id="segFeed" class="saude-feed">
        <div class="admin-loading">Carregando feed…</div>
      </div>
      <div class="pagination" id="segPagination"></div>
    </section>
  `;

  bindFiltros(container);
  carregarSumario(container);
  carregar(container);
}


function bindFiltros(container) {
  const reload = () => { estado.page = 1; carregar(container); };

  container.querySelector("#segJanela").addEventListener("change", (e) => {
    estado.janela = e.target.value; reload();
  });
  container.querySelector("#segCategoria").addEventListener("change", (e) => {
    estado.categoria = e.target.value; reload();
  });
  container.querySelector("#segSeveridade").addEventListener("change", (e) => {
    estado.severidade = e.target.value; reload();
  });
  container.querySelector("#segIp").addEventListener("input", debounce((e) => {
    estado.ip = e.target.value.trim(); reload();
  }, 320));
  container.querySelector("#segAlvo").addEventListener("input", debounce((e) => {
    estado.alvo = e.target.value.trim(); reload();
  }, 320));

  container.querySelector("#btnRefreshSeg").addEventListener("click", () => {
    carregarSumario(container);
    carregar(container);
  });

  container.querySelector("#btnBloquearIp").addEventListener("click", () =>
    abrirModalBloquearIp(container),
  );
}


async function carregarSumario(container) {
  const grid = container.querySelector("#segKpis");
  if (!grid) return;
  try {
    const k = await AdminAPI.seguranca.sumario();
    const variacao = k.ev_24h_anterior > 0
      ? (((k.total_24h - k.ev_24h_anterior) / k.ev_24h_anterior) * 100).toFixed(1)
      : (k.total_24h > 0 ? "100.0" : "0.0");

    grid.innerHTML = [
      kpi("fa-shield-halved", "Eventos 24h", k.total_24h ?? 0,
          `Variação ${variacao}% vs período anterior`),
      kpi("fa-fire", "Críticos 24h", k.criticos_24h ?? 0, "Severidade 'critical'"),
      kpi("fa-key", "Falhas de login 24h", k.login_falhas ?? 0,
          `${k.login_lockouts || 0} lockout(s) acionados`),
      kpi("fa-robot", "Bots detectados", k.honeypots ?? 0,
          `${k.ua_suspeitos || 0} UA suspeitos`),
      kpi("fa-ban", "IPs bloqueados 24h", k.ips_bloqueados ?? 0,
          "Banimento automático ou manual"),
      kpi("fa-calendar-week", "Eventos 7d", k.eventos_7d ?? 0,
          "Volume da última semana"),
    ].join("");
  } catch (err) {
    grid.innerHTML = `<div class="admin-error">${escapeHtml(err.message)}</div>`;
  }
}


function kpi(icone, titulo, valor, hint) {
  return `
    <div class="kpi-card">
      <div class="kpi-icon"><i class="fas ${icone}"></i></div>
      <div class="kpi-body">
        <span class="kpi-titulo">${escapeHtml(titulo)}</span>
        <strong class="kpi-valor">${escapeHtml(String(valor))}</strong>
        ${hint ? `<small class="kpi-hint">${escapeHtml(hint)}</small>` : ""}
      </div>
    </div>`;
}


async function carregar(container) {
  const feed = container.querySelector("#segFeed");
  feed.innerHTML = `<div class="admin-loading"><i class="fas fa-spinner fa-spin"></i> Carregando feed…</div>`;
  try {
    const data = await AdminAPI.seguranca.eventos({
      page: estado.page,
      page_size: estado.page_size,
      janela: estado.janela,
      categoria: estado.categoria,
      severidade: estado.severidade,
      ip: estado.ip,
      alvo: estado.alvo,
    });
    renderFeed(feed, data.results, container);
    renderPaginacao(container.querySelector("#segPagination"), data, container);
  } catch (err) {
    feed.innerHTML = `<div class="admin-error">${escapeHtml(err.message)}</div>`;
  }
}


function renderFeed(feed, eventos, container) {
  if (!eventos || !eventos.length) {
    feed.innerHTML = `
      <div class="admin-empty saude-empty">
        <i class="fas fa-shield-halved"></i>
        <h3>Sem eventos no período</h3>
        <p>Tudo tranquilo. Nenhuma atividade suspeita registrada.</p>
      </div>`;
    return;
  }
  feed.innerHTML = eventos.map(itemFeed).join("");
  feed.querySelectorAll('[data-acao="desbloquear"]').forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ip = btn.dataset.ip;
      const ok = await confirmarAcao({
        titulo: `Desbloquear IP ${ip}?`,
        mensagem: "O IP voltará a poder acessar normalmente.",
        confirmar: "Desbloquear",
      });
      if (!ok) return;
      try {
        await AdminAPI.seguranca.desbloquearIp(ip);
        toast(`IP ${ip} desbloqueado.`, "success");
        carregar(container);
        carregarSumario(container);
      } catch (err) { toast(err.message, "error"); }
    });
  });
}


function itemFeed(ev) {
  const sevCls = SEV_CLS[ev.severidade] || "info";
  const cat = CATEGORIA_LABEL[ev.categoria] || ev.categoria;
  const metaJson = ev.metadados
    ? `<details><summary>Metadados</summary><pre>${escapeHtml(JSON.stringify(ev.metadados, null, 2))}</pre></details>`
    : "";
  const isIpBloqueado = ev.categoria === "ip_bloqueado" && ev.ip;
  return `
    <article class="saude-card ${sevCls}">
      <div class="saude-card-head">
        <span class="status-pill ${sevCls}">${escapeHtml(ev.severidade)}</span>
        <span class="status-pill info">${escapeHtml(cat)}</span>
        ${isIpBloqueado
          ? `<button class="btn btn-outline-secondary btn-sm" data-acao="desbloquear" data-ip="${escapeHtml(ev.ip)}">
               <i class="fas fa-unlock"></i> Desbloquear
             </button>`
          : ""}
      </div>
      <h3 class="saude-card-titulo">${escapeHtml(cat)}</h3>
      <div class="saude-card-meta">
        ${ev.ip ? `<span><i class="fas fa-globe"></i> ${escapeHtml(ev.ip)}</span>` : ""}
        ${ev.alvo ? `<span><i class="fas fa-bullseye"></i> ${escapeHtml(ev.alvo)}</span>` : ""}
        ${ev.endpoint ? `<span><i class="fas fa-link"></i> ${escapeHtml(ev.endpoint)}</span>` : ""}
      </div>
      ${ev.user_agent ? `<small style="color:#64748b; font-family: monospace; font-size: 11px;">UA: ${escapeHtml(ev.user_agent)}</small>` : ""}
      <div class="saude-card-stats">
        <span><i class="fas fa-clock"></i> ${escapeHtml(ev.criado_em)}</span>
      </div>
      ${metaJson}
    </article>
  `;
}


function renderPaginacao(container, data, parent) {
  if (!container) return;
  const { total, pages, page } = data;
  if (!pages || pages <= 1) {
    container.innerHTML = total ? `<small>${total} evento(s)</small>` : "";
    return;
  }
  container.innerHTML = `
    <button class="btn btn-sm btn-outline-secondary" ${page <= 1 ? "disabled" : ""} data-action="prev">
      <i class="fas fa-chevron-left"></i> Anterior
    </button>
    <span class="page-info">Página ${page} de ${pages} · ${total} evento(s)</span>
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


async function abrirModalBloquearIp(container) {
  const ip = prompt("IP a bloquear:");
  if (!ip || !ip.trim()) return;
  const horasStr = prompt("Por quantas horas? (default 2, máx 168)", "2");
  if (horasStr === null) return;
  const horas = Math.max(0.1, Math.min(168, Number(horasStr) || 2));
  const motivo = prompt("Motivo (opcional):", "Bloqueio manual via painel") || "";

  try {
    await AdminAPI.seguranca.bloquearIp({ ip: ip.trim(), horas, motivo });
    toast(`IP ${ip} bloqueado por ${horas}h.`, "success");
    carregar(container);
    carregarSumario(container);
  } catch (err) { toast(err.message, "error"); }
}
