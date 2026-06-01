// oficinas-view.js — Aba "Oficinas" do painel administrativo.
//
// Lista todas as oficinas com indicadores agregados (funcionários, clientes,
// O.S.), busca por nome/CNPJ e ações administrativas básicas.

import { AdminAPI } from "../services/admin-api.js";
import { confirmarAcao, debounce, escapeHtml, toast } from "./admin-ui.js";


let estado = {
  oficinas: [],
  busca: "",
  estado: "",
  plano: "",
};


export async function renderOficinas(container) {
  container.innerHTML = `
    <section class="admin-section">
      <header class="admin-section-head">
        <h2><i class="fas fa-store"></i> Oficinas cadastradas</h2>
        <p>Gerencie todas as oficinas da plataforma.</p>
      </header>

      <div class="admin-toolbar">
        <div class="admin-search">
          <i class="fas fa-search" aria-hidden="true"></i>
          <input type="search" id="ofBusca" placeholder="Buscar por nome ou CNPJ…" aria-label="Buscar oficinas">
        </div>
        <select id="ofPlano" class="admin-select" aria-label="Filtrar por plano">
          <option value="">Todos os planos</option>
          <option value="basico">Básico</option>
          <option value="premium">Premium</option>
        </select>
        <input type="text" id="ofEstado" class="admin-input-uf" maxlength="2" placeholder="UF" aria-label="Filtrar por UF">
        <button class="btn btn-outline-secondary" id="btnRefreshOficinas" type="button">
          <i class="fas fa-rotate"></i> Atualizar
        </button>
      </div>

      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Oficina</th>
              <th>CNPJ</th>
              <th>Local</th>
              <th>Plano</th>
              <th>Pagamento</th>
              <th>Status</th>
              <th class="text-right">Funcionários</th>
              <th class="text-right">Clientes</th>
              <th class="text-right">OS</th>
              <th>Criada em</th>
              <th class="th-acoes">Ações</th>
            </tr>
          </thead>
          <tbody id="ofTbody"><tr><td colspan="11" class="admin-loading">Carregando…</td></tr></tbody>
        </table>
      </div>
    </section>
  `;

  const carregar = async () => {
    const tbody = container.querySelector("#ofTbody");
    tbody.innerHTML = `<tr><td colspan="11" class="admin-loading">Carregando…</td></tr>`;
    try {
      estado.oficinas = await AdminAPI.oficinas.listar({
        busca: estado.busca,
        plano: estado.plano,
        estado: estado.estado,
      });
      renderTabela(tbody);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="11" class="admin-error">${escapeHtml(err.message)}</td></tr>`;
    }
  };

  const busca = container.querySelector("#ofBusca");
  busca.addEventListener("input", debounce((e) => {
    estado.busca = e.target.value.trim();
    carregar();
  }, 350));

  container.querySelector("#ofPlano").addEventListener("change", (e) => {
    estado.plano = e.target.value;
    carregar();
  });
  container.querySelector("#ofEstado").addEventListener("change", (e) => {
    estado.estado = e.target.value.trim().toUpperCase();
    carregar();
  });
  container.querySelector("#btnRefreshOficinas").addEventListener("click", carregar);

  await carregar();
}


function renderTabela(tbody) {
  if (!estado.oficinas.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="admin-empty">Nenhuma oficina encontrada.</td></tr>`;
    return;
  }
  tbody.innerHTML = "";
  estado.oficinas.forEach((o) => {
    const tr = document.createElement("tr");
    if (o.inativa) tr.classList.add("row-inativa");

    const statusPill = o.inativa
      ? `<span class="status-pill off" title="Funcionários desativados — oficina sem acesso">
           <i class="fas fa-power-off"></i> Inativa
         </span>`
      : `<span class="status-pill ok">
           <i class="fas fa-check-circle"></i> Ativa
         </span>`;

    const acoes = o.inativa
      ? `<button class="btn-icon success" data-action="reativar" data-id="${o.id}"
                  data-nome="${escapeHtml(o.nome)}" title="Reativar oficina"
                  aria-label="Reativar ${escapeHtml(o.nome)}">
           <i class="fas fa-rotate-left"></i>
         </button>`
      : `<button class="btn-icon" data-action="inativar" data-id="${o.id}"
                  data-nome="${escapeHtml(o.nome)}" title="Inativar oficina"
                  aria-label="Inativar ${escapeHtml(o.nome)}">
           <i class="fas fa-power-off"></i>
         </button>`;

    tr.innerHTML = `
      <td><strong>${escapeHtml(o.nome)}</strong><br><small>${escapeHtml(o.email || "—")}</small></td>
      <td>${escapeHtml(o.cnpj)}</td>
      <td>${escapeHtml(o.cidade || "—")} / ${escapeHtml(o.estado || "—")}</td>
      <td><span class="plano-tag plano-${escapeHtml(o.plano_atual)}">${escapeHtml(o.plano_atual || "—")}</span></td>
      <td>${renderPagamentoCell(o.pagamento)}</td>
      <td>${statusPill}</td>
      <td class="text-right">
        <strong>${o.funcionarios_ativos ?? 0}</strong>
        <small style="color: var(--text-muted, #94a3b8);">/${o.total_funcionarios ?? 0}</small>
      </td>
      <td class="text-right">${o.total_clientes ?? 0}</td>
      <td class="text-right">${o.total_os ?? 0}</td>
      <td>${escapeHtml(o.criado_em || "—")}</td>
      <td class="td-acoes">
        <div class="td-acoes-inner">
          <button class="btn-icon" data-action="consumo" data-id="${o.id}"
                  data-nome="${escapeHtml(o.nome)}" title="Ver consumo e limites"
                  aria-label="Consumo de ${escapeHtml(o.nome)}">
            <i class="fas fa-gauge-high"></i>
          </button>
          ${acoes}
          <button class="btn-icon danger" data-action="excluir" data-id="${o.id}"
                  data-nome="${escapeHtml(o.nome)}" title="Excluir oficina"
                  aria-label="Excluir ${escapeHtml(o.nome)}">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => onAcao(btn));
  });
}


async function onAcao(btn) {
  const id = Number(btn.dataset.id);
  const nome = btn.dataset.nome;
  const action = btn.dataset.action;

  if (action === "consumo") {
    abrirModalConsumo(id, nome);
    return;
  }

  if (action === "inativar") {
    const ok = await confirmarAcao({
      titulo: `Inativar oficina "${nome}"?`,
      mensagem: "Todos os funcionários vinculados ficarão sem acesso. A ação pode ser revertida.",
      perigo: true,
      confirmar: "Inativar",
    });
    if (!ok) return;
    try {
      await AdminAPI.oficinas.inativar(id, false);
      toast("Oficina inativada.", "success");
      // recarrega para refletir status atualizado
      const sec = btn.closest(".admin-section");
      sec && sec.querySelector("#btnRefreshOficinas")?.click();
    } catch (err) {
      toast(err.message, "error");
    }
  } else if (action === "reativar") {
    try {
      await AdminAPI.oficinas.inativar(id, true);
      toast("Oficina reativada.", "success");
      const sec = btn.closest(".admin-section");
      sec && sec.querySelector("#btnRefreshOficinas")?.click();
    } catch (err) {
      toast(err.message, "error");
    }
  } else if (action === "excluir") {
    const ok = await confirmarAcao({
      titulo: `Excluir oficina "${nome}"?`,
      mensagem: "Esta ação é IRREVERSÍVEL — todos os dados relacionados serão removidos. Apenas o Super Admin pode confirmar.",
      perigo: true,
      confirmar: "Excluir definitivamente",
    });
    if (!ok) return;
    try {
      await AdminAPI.oficinas.excluir(id);
      toast("Oficina excluída.", "success");
      btn.closest("tr").remove();
    } catch (err) {
      toast(err.message, "error");
    }
  }
}


// ---------------------------------------------------------------------------
// Modal de Consumo + Limites
// ---------------------------------------------------------------------------

/**
 * Mostra um drawer lateral com:
 *  - barras de progresso de usuários / OS-mês / armazenamento
 *  - indicadores preventivos (status, alertas)
 *  - inputs para sobrescrever limite por oficina (override do plano)
 *
 * Os overrides são salvos em /api/admin/oficinas/<id>/limites/. Deixar
 * o campo em branco = "usar o default do plano".
 */
async function abrirModalConsumo(oficinaId, oficinaNome) {
  const drawer = obterOuCriarDrawer();
  drawer.querySelector("#consumoCorpo").innerHTML = `
    <div class="admin-loading"><i class="fas fa-spinner fa-spin"></i> Carregando consumo…</div>
  `;
  drawer.querySelector("#consumoTitulo").textContent = `Consumo · ${oficinaNome}`;
  abrir(drawer);

  let dados;
  try {
    dados = await AdminAPI.oficinas.consumo(oficinaId);
  } catch (err) {
    drawer.querySelector("#consumoCorpo").innerHTML =
      `<div class="admin-error">${escapeHtml(err.message)}</div>`;
    return;
  }
  renderModalConsumo(drawer, oficinaId, dados);
}


function renderModalConsumo(drawer, oficinaId, dados) {
  const corpo = drawer.querySelector("#consumoCorpo");
  const recursosHtml = (dados.recursos || []).map(renderRecursoCard).join("");
  const ov = dados.override || {};
  const overrideInfo = (ov.limite_usuarios || ov.limite_os_mensal || ov.limite_storage_mb)
    ? `<small>Override ativo · atualizado em ${escapeHtml(ov.atualizado_em || "—")}
         por ${escapeHtml(ov.atualizado_por || "—")}</small>`
    : `<small>Sem override — usando defaults do plano <b>${escapeHtml(dados.plano)}</b>.</small>`;

  corpo.innerHTML = `
    <div class="consumo-meta">
      <span class="plano-tag plano-${escapeHtml(dados.plano)}">${escapeHtml(dados.plano)}</span>
      ${overrideInfo}
    </div>

    <div class="consumo-recursos">
      ${recursosHtml}
    </div>

    <section class="consumo-limites">
      <h3><i class="fas fa-sliders"></i> Ajustar limites desta oficina</h3>
      <p class="hint">Deixe em branco para usar o default do plano. Use com cautela — registramos auditoria.</p>

      <form id="formLimites" class="consumo-form">
        <label>
          <span>Usuários (default plano: <b id="defUsuarios">—</b>)</span>
          <input type="number" min="0" id="limUsuarios" value="${valorOuVazio(ov.limite_usuarios)}">
        </label>
        <label>
          <span>O.S. por mês (default plano: <b id="defOs">—</b>)</span>
          <input type="number" min="0" id="limOs" value="${valorOuVazio(ov.limite_os_mensal)}">
        </label>
        <label>
          <span>Armazenamento (MB) (default plano: <b id="defStorage">—</b>)</span>
          <input type="number" min="0" id="limStorage" value="${valorOuVazio(ov.limite_storage_mb)}">
        </label>
        <label>
          <span>Motivo (opcional)</span>
          <input type="text" id="limMotivo" maxlength="255" placeholder="Ex.: piloto comercial"
                 value="${escapeHtml(ov.motivo || "")}">
        </label>
        <div class="form-actions">
          <button type="button" class="btn btn-outline-secondary" id="btnResetLimites">
            <i class="fas fa-rotate-left"></i> Voltar ao default
          </button>
          <button type="submit" class="btn btn-primary">
            <i class="fas fa-floppy-disk"></i> Salvar limites
          </button>
        </div>
      </form>
    </section>
  `;

  // Preenche os "defaults do plano" exibidos como hint (lê do recurso atual,
  // assumindo que se o override for null o valor exibido vem do plano).
  const recursos = Object.fromEntries(
    (dados.recursos || []).map((r) => [r.chave, r.limite]),
  );
  drawer.querySelector("#defUsuarios").textContent = recursos["usuarios"] ?? "—";
  drawer.querySelector("#defOs").textContent = recursos["os_mensal"] ?? "—";
  drawer.querySelector("#defStorage").textContent = recursos["storage_mb"] ?? "—";

  // Handlers do form
  drawer.querySelector("#formLimites").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      limite_usuarios: valOuNull(drawer.querySelector("#limUsuarios").value),
      limite_os_mensal: valOuNull(drawer.querySelector("#limOs").value),
      limite_storage_mb: valOuNull(drawer.querySelector("#limStorage").value),
      motivo: drawer.querySelector("#limMotivo").value.trim(),
    };
    try {
      const resp = await AdminAPI.oficinas.salvarLimites(oficinaId, payload);
      toast("Limites atualizados.", "success");
      // Re-renderiza com o snapshot devolvido (já contém override e recursos)
      renderModalConsumo(drawer, oficinaId, resp.snapshot);
    } catch (err) {
      toast(err.message, "error");
    }
  });

  drawer.querySelector("#btnResetLimites").addEventListener("click", async () => {
    const ok = await confirmarAcao({
      titulo: "Remover override de limites?",
      mensagem: "A oficina voltará a usar os limites padrão do plano.",
      confirmar: "Sim, remover",
    });
    if (!ok) return;
    try {
      await AdminAPI.oficinas.resetLimites(oficinaId);
      toast("Override removido.", "info");
      const novosDados = await AdminAPI.oficinas.consumo(oficinaId);
      renderModalConsumo(drawer, oficinaId, novosDados);
    } catch (err) {
      toast(err.message, "error");
    }
  });
}


function renderRecursoCard(r) {
  const pct = Math.min(100, r.percentual_uso || 0);
  let estado = "ok";
  let icone = "fa-circle-check";
  let aviso = "";
  if (r.atingiu_limite) {
    estado = "danger";
    icone = "fa-circle-exclamation";
    aviso = `<small class="aviso">Limite atingido — operação bloqueada${r.bloqueio_ativo ? "" : " (bloqueio off)"}.</small>`;
  } else if (r.proximo_do_limite) {
    estado = "warn";
    icone = "fa-triangle-exclamation";
    aviso = `<small class="aviso">Atenção: ≥ 80% do limite consumido.</small>`;
  }
  const unidade = r.unidade ? ` ${escapeHtml(r.unidade)}` : "";
  return `
    <article class="recurso-card ${estado}">
      <header>
        <i class="fas ${icone}"></i>
        <strong>${escapeHtml(r.label)}</strong>
        <span class="recurso-pct">${pct}%</span>
      </header>
      <div class="recurso-barra"><span style="width: ${pct}%"></span></div>
      <footer>
        <span>${formatarNum(r.usado)}${unidade} usados</span>
        <span>${formatarNum(r.limite)}${unidade} limite</span>
      </footer>
      ${aviso}
    </article>
  `;
}


function obterOuCriarDrawer() {
  let drawer = document.getElementById("consumoDrawer");
  if (drawer) return drawer;
  drawer = document.createElement("aside");
  drawer.id = "consumoDrawer";
  drawer.className = "consumo-drawer";
  drawer.hidden = true;
  drawer.innerHTML = `
    <div class="consumo-overlay" data-fechar></div>
    <div class="consumo-card" role="dialog" aria-modal="true">
      <header class="consumo-head">
        <h2 id="consumoTitulo">Consumo</h2>
        <button class="btn-icon" type="button" data-fechar aria-label="Fechar">
          <i class="fas fa-xmark"></i>
        </button>
      </header>
      <div id="consumoCorpo" class="consumo-corpo"></div>
    </div>
  `;
  document.body.appendChild(drawer);
  drawer.querySelectorAll("[data-fechar]").forEach((el) => {
    el.addEventListener("click", () => fechar(drawer));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !drawer.hidden) fechar(drawer);
  });
  return drawer;
}


function abrir(drawer) {
  drawer.hidden = false;
  requestAnimationFrame(() => drawer.classList.add("open"));
}
function fechar(drawer) {
  drawer.classList.remove("open");
  setTimeout(() => { drawer.hidden = true; }, 200);
}


function valorOuVazio(v) {
  return v === null || v === undefined ? "" : v;
}
function valOuNull(s) {
  const v = String(s ?? "").trim();
  return v === "" ? null : Math.max(0, parseInt(v, 10) || 0);
}
function formatarNum(n) {
  if (n === null || n === undefined) return "—";
  if (Number.isInteger(n)) return n.toLocaleString("pt-BR");
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}


/**
 * Renderiza a célula "Pagamento" no formato pill colorida com data do
 * último pagamento abaixo. `pagamento` vem do back via
 * `OficinaAdminListaSerializer.get_pagamento`.
 *
 * Cores (status-pill):
 *   ok       → verde   (Aprovado / vigente)
 *   atencao  → amarelo (Pendente)
 *   erro     → vermelho (Recusado, vencido, cancelado)
 *   neutro   → cinza   (Sem assinatura)
 */
function renderPagamentoCell(pagamento) {
  if (!pagamento) {
    return `<span class="status-pill neutro">—</span>`;
  }

  const iconePorCor = {
    ok: "fa-circle-check",
    atencao: "fa-clock",
    erro: "fa-circle-exclamation",
    neutro: "fa-minus",
  };
  const icone = iconePorCor[pagamento.cor] || "fa-question";
  const resumo = pagamento.resumo || pagamento.status_label || "—";

  const partesAux = [];
  if (pagamento.plano_nome) partesAux.push(`Plano: ${pagamento.plano_nome}`);
  if (pagamento.expira_em) {
    partesAux.push(`Vence: ${formatarData(pagamento.expira_em)}`);
  }
  if (pagamento.ultimo_pagamento_em) {
    const metodo = pagamento.ultimo_pagamento_metodo
      ? ` (${pagamento.ultimo_pagamento_metodo})` : "";
    partesAux.push(
      `Último: ${formatarData(pagamento.ultimo_pagamento_em)}${metodo}`,
    );
  }
  if (pagamento.total_pagamentos_pagos !== undefined) {
    partesAux.push(`${pagamento.total_pagamentos_pagos} pago(s)`);
  }

  const titulo = partesAux.join(" • ");

  return `
    <span class="status-pill ${escapeHtml(pagamento.cor || "neutro")}" title="${escapeHtml(titulo)}">
      <i class="fas ${icone}"></i> ${escapeHtml(resumo)}
    </span>
    ${pagamento.expira_em
      ? `<br><small class="pag-detalhe">vence ${escapeHtml(formatarData(pagamento.expira_em))}</small>`
      : ""}
  `;
}


function formatarData(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}
