// configuracoes-view.js — Aba "Configurações" do painel administrativo.

import { AdminAPI } from "../services/admin-api.js";
import { escapeHtml, toast } from "./admin-ui.js";


export async function renderConfiguracoes(container) {
  container.innerHTML = `
    <section class="admin-section">
      <header class="admin-section-head">
        <h2><i class="fas fa-sliders-h"></i> Configurações globais</h2>
        <p>Parâmetros que afetam toda a aplicação.</p>
      </header>
      <div id="configList" class="config-list"><div class="admin-loading">Carregando…</div></div>
    </section>
  `;

  const lista = container.querySelector("#configList");
  let configs;
  try {
    configs = await AdminAPI.configuracoes.listar();
  } catch (err) {
    lista.innerHTML = `<div class="admin-error">${escapeHtml(err.message)}</div>`;
    return;
  }

  if (!configs.length) {
    lista.innerHTML = `<p class="admin-empty">Nenhuma configuração definida.</p>`;
    return;
  }

  lista.innerHTML = configs.map((c) => `
    <article class="config-card">
      <header>
        <code>${escapeHtml(c.chave)}</code>
        <small>Atualizado em ${escapeHtml(c.atualizado_em ? new Date(c.atualizado_em).toLocaleString("pt-BR") : "—")}
        por ${escapeHtml(c.atualizado_por_nome || "Sistema")}</small>
      </header>
      <p class="config-desc">${escapeHtml(c.descricao || "Sem descrição.")}</p>
      <div class="config-field">
        ${renderInputFor(c)}
        <button class="btn btn-primary btn-sm" data-action="save" data-chave="${escapeHtml(c.chave)}">
          <i class="fas fa-save"></i> Salvar
        </button>
      </div>
    </article>
  `).join("");

  lista.querySelectorAll('[data-action="save"]').forEach((btn) => {
    btn.addEventListener("click", () => salvar(lista, btn.dataset.chave));
  });
}


function renderInputFor(config) {
  const id = `cfg-${cssId(config.chave)}`;
  const tipo = detectarTipo(config.valor);
  if (tipo === "boolean") {
    return `
      <label class="switch">
        <input type="checkbox" id="${id}" ${config.valor ? "checked" : ""}>
        <span class="slider"></span>
        <span class="switch-label">${config.valor ? "Ativado" : "Desativado"}</span>
      </label>`;
  }
  if (tipo === "number") {
    return `<input id="${id}" type="number" class="form-control" value="${config.valor ?? ""}">`;
  }
  if (tipo === "object") {
    return `<textarea id="${id}" class="form-control" rows="4">${escapeHtml(JSON.stringify(config.valor, null, 2))}</textarea>`;
  }
  return `<input id="${id}" type="text" class="form-control" value="${escapeHtml(String(config.valor ?? ""))}">`;
}


function detectarTipo(v) {
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") return "number";
  if (v !== null && typeof v === "object") return "object";
  return "string";
}


async function salvar(lista, chave) {
  const id = `cfg-${cssId(chave)}`;
  const el = lista.querySelector(`#${CSS.escape(id)}`);
  if (!el) return;
  let valor;
  if (el.tagName === "TEXTAREA") {
    try { valor = JSON.parse(el.value || "null"); }
    catch { toast("JSON inválido.", "error"); return; }
  } else if (el.type === "checkbox") {
    valor = el.checked;
  } else if (el.type === "number") {
    valor = el.value === "" ? null : Number(el.value);
  } else {
    valor = el.value;
  }
  try {
    await AdminAPI.configuracoes.atualizar(chave, valor);
    toast(`Configuração "${chave}" atualizada.`, "success");
  } catch (err) {
    toast(err.message, "error");
  }
}


function cssId(chave) {
  return String(chave).replace(/[^a-z0-9_-]+/gi, "-");
}
