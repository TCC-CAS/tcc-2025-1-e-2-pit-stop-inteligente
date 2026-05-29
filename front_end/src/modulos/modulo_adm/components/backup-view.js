// backup-view.js — aba "Backup & Restauração" do painel SaaS.
//
// Permite ao Super Admin:
//   - baixar um snapshot completo do banco em JSON
//   - restaurar a partir de um arquivo gerado anteriormente
// Toda ação é registrada em auditoria pelo back-end.

import { AdminAPI, adminFetch } from "../services/admin-api.js";
import { confirmarAcao, escapeHtml, toast } from "./admin-ui.js";


export async function renderBackup(container) {
  container.innerHTML = `
    <section class="admin-section">
      <header class="admin-section-head">
        <h2><i class="fas fa-database"></i> Backup & Restauração</h2>
        <p>Snapshot completo do banco em JSON. Use para migrações, auditorias ou contingência.</p>
      </header>

      <div class="admin-grid-2">
        <article class="admin-card">
          <header><h3><i class="fas fa-cloud-arrow-down"></i> Exportar backup</h3></header>
          <p style="color: var(--text-secondary); margin-bottom: 1rem;">
            Gera um arquivo <code>.json</code> contendo todos os registros
            das oficinas, clientes, OS, configurações e usuários (exceto
            sessões e logs nativos do Django).
          </p>
          <a href="${AdminAPI.backup.exportarUrl()}" id="btnBackupExport"
             class="btn btn-primary" download>
            <i class="fas fa-cloud-arrow-down"></i> Baixar agora
          </a>
          <p class="admin-hint" style="margin-top: 0.85rem; font-size: 0.8rem; color: var(--text-muted, #94a3b8);">
            <i class="fas fa-circle-info"></i>
            Recomendamos arquivar este backup em local seguro (storage criptografado).
          </p>
        </article>

        <article class="admin-card">
          <header><h3><i class="fas fa-cloud-arrow-up"></i> Restaurar backup</h3></header>
          <p style="color: var(--text-secondary); margin-bottom: 1rem;">
            Selecione um arquivo previamente exportado. A operação é
            transacional — se falhar, o banco volta ao estado anterior.
          </p>
          <form id="formBackupImport" enctype="multipart/form-data">
            <input type="file" id="arquivoBackup" name="arquivo" accept=".json"
                   class="form-control" required>
            <p id="resumoArquivo" class="admin-hint" style="margin: 0.55rem 0 0; font-size: 0.8rem; color: var(--text-muted, #94a3b8);"></p>
            <button class="btn btn-danger" id="btnBackupRestore" type="submit"
                    style="margin-top: 1rem;">
              <i class="fas fa-cloud-arrow-up"></i> Restaurar banco
            </button>
          </form>
          <p class="admin-hint" style="margin-top: 0.85rem; font-size: 0.78rem; color: var(--color-danger, #dc2626);">
            <i class="fas fa-triangle-exclamation"></i>
            Esta operação substitui registros do banco. Faça uma exportação
            antes de prosseguir e use apenas em janelas de manutenção.
          </p>
        </article>
      </div>

      <article class="admin-card">
        <header><h3><i class="fas fa-history"></i> Últimos backups (auditoria)</h3></header>
        <ol id="historicoBackups" class="rank-list">
          <li class="admin-loading">Carregando…</li>
        </ol>
      </article>
    </section>
  `;

  vincularExport(container);
  vincularImport(container);
  carregarHistoricoBackups(container);
}


function vincularExport(container) {
  container.querySelector("#btnBackupExport")?.addEventListener("click", () => {
    toast("Download iniciado.", "info");
    setTimeout(() => carregarHistoricoBackups(container), 1500);
  });
}


function vincularImport(container) {
  const input = container.querySelector("#arquivoBackup");
  const resumo = container.querySelector("#resumoArquivo");
  input?.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) { resumo.textContent = ""; return; }
    resumo.innerHTML =
      `<i class="fas fa-file-code"></i> <strong>${escapeHtml(file.name)}</strong> · ${(file.size / 1024).toFixed(1)} KB`;
  });

  container.querySelector("#formBackupImport")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = input?.files?.[0];
    if (!file) return;

    const ok = await confirmarAcao({
      titulo: `Restaurar a partir de "${file.name}"?`,
      mensagem: "Esta operação irá sobrescrever registros do banco. " +
                "Recomendamos exportar um backup antes. Continuar?",
      perigo: true,
      confirmar: "Sim, restaurar",
    });
    if (!ok) return;

    const btn = container.querySelector("#btnBackupRestore");
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Restaurando…`;

    try {
      const r = await AdminAPI.backup.restaurar(file);
      toast(`Backup restaurado. ${r.registros_aplicados} registros aplicados.`, "success");
      input.value = "";
      resumo.textContent = "";
      carregarHistoricoBackups(container);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });
}


async function carregarHistoricoBackups(container) {
  const lista = container.querySelector("#historicoBackups");
  if (!lista) return;
  try {
    const r = await adminFetch("/auditoria/?recurso=banco&page_size=10");
    const itens = r?.results || [];
    if (!itens.length) {
      lista.innerHTML = `<li class="admin-empty">Sem operações de backup registradas ainda.</li>`;
      return;
    }
    lista.innerHTML = itens.map((ev) => `
      <li>
        <span class="rank-name">
          <strong>${escapeHtml(ev.acao)}</strong>
          <small style="display:block; color: var(--text-muted, #94a3b8);">
            ${escapeHtml(ev.descricao || "")}
          </small>
        </span>
        <span class="rank-count">${escapeHtml(ev.criado_em)}</span>
      </li>
    `).join("");
  } catch (err) {
    lista.innerHTML = `<li class="admin-error">${escapeHtml(err.message)}</li>`;
  }
}
