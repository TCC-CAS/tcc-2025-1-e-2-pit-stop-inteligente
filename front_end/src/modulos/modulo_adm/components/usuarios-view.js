// usuarios-view.js — Aba "Usuários" do painel administrativo.

import { AdminAPI } from "../services/admin-api.js";
import { confirmarAcao, debounce, escapeHtml, toast } from "./admin-ui.js";


const estado = { usuarios: [], busca: "", papel: "", ativos: "" };


export async function renderUsuarios(container) {
  container.innerHTML = `
    <section class="admin-section">
      <header class="admin-section-head">
        <h2><i class="fas fa-user-shield"></i> Usuários & permissões</h2>
        <p>Gerencie quem pode acessar o sistema e em qual papel.</p>
      </header>

      <div class="admin-toolbar">
        <div class="admin-search">
          <i class="fas fa-search" aria-hidden="true"></i>
          <input type="search" id="userBusca" placeholder="Buscar por e-mail ou nome…" aria-label="Buscar usuários">
        </div>
        <select id="userPapel" class="admin-select" aria-label="Filtrar por papel">
          <option value="">Todos os papéis</option>
          <option value="superuser">Super Admin</option>
          <option value="staff">Staff (admin)</option>
          <option value="comum">Usuário comum</option>
        </select>
        <select id="userAtivos" class="admin-select" aria-label="Status">
          <option value="">Todos</option>
          <option value="1">Apenas ativos</option>
          <option value="0">Apenas inativos</option>
        </select>
        <button class="btn btn-primary" id="btnNovoUsuario" type="button">
          <i class="fas fa-user-plus"></i> Novo usuário
        </button>
      </div>

      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>E-mail</th>
              <th>Papel global</th>
              <th>Vínculos</th>
              <th>Status</th>
              <th>Último login</th>
              <th class="th-acoes">Ações</th>
            </tr>
          </thead>
          <tbody id="userTbody"><tr><td colspan="7" class="admin-loading">Carregando…</td></tr></tbody>
        </table>
      </div>

      <!-- Modal de novo/editar usuário -->
      <div class="admin-modal" id="userModal" hidden role="dialog" aria-modal="true" aria-labelledby="userModalTitle">
        <div class="admin-modal-card">
          <header>
            <h3 id="userModalTitle">Novo usuário</h3>
            <button class="btn-icon" type="button" data-action="close" aria-label="Fechar"><i class="fas fa-xmark"></i></button>
          </header>
          <form id="userForm" novalidate>
            <input type="hidden" id="fUserId">
            <div class="form-grid">
              <div class="form-group">
                <label for="fNome">Nome</label>
                <input id="fNome" name="first_name" type="text" class="form-control" required>
              </div>
              <div class="form-group">
                <label for="fSobrenome">Sobrenome</label>
                <input id="fSobrenome" name="last_name" type="text" class="form-control">
              </div>
              <div class="form-group span-2">
                <label for="fEmail">E-mail</label>
                <input id="fEmail" name="email" type="email" class="form-control" required autocomplete="email">
              </div>
              <div class="form-group">
                <label for="fSenha">Senha <small>(mínimo 8)</small></label>
                <input id="fSenha" name="password" type="password" class="form-control" autocomplete="new-password" minlength="8">
              </div>
              <div class="form-group">
                <label for="fAtivo">Status</label>
                <select id="fAtivo" class="form-control">
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </div>
              <div class="form-group">
                <label class="checkbox-line">
                  <input type="checkbox" id="fStaff"> Pode acessar o painel administrativo (staff)
                </label>
              </div>
              <div class="form-group">
                <label class="checkbox-line">
                  <input type="checkbox" id="fSuper"> Super Admin (acesso irrestrito)
                </label>
              </div>
            </div>
            <footer class="form-actions">
              <button type="button" class="btn btn-outline-secondary" data-action="close">Cancelar</button>
              <button type="submit" class="btn btn-primary">Salvar</button>
            </footer>
          </form>
        </div>
      </div>
    </section>
  `;

  vincularToolbar(container);
  vincularModal(container);
  await carregar(container);
}


async function carregar(container) {
  const tbody = container.querySelector("#userTbody");
  tbody.innerHTML = `<tr><td colspan="7" class="admin-loading">Carregando…</td></tr>`;
  try {
    estado.usuarios = await AdminAPI.usuarios.listar({
      busca: estado.busca,
      papel: estado.papel,
      ativos: estado.ativos,
    });
    renderTabela(tbody);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="admin-error">${escapeHtml(err.message)}</td></tr>`;
  }
}


function renderTabela(tbody) {
  if (!estado.usuarios.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="admin-empty">Nenhum usuário encontrado.</td></tr>`;
    return;
  }
  tbody.innerHTML = "";
  estado.usuarios.forEach((u) => {
    const papel = u.is_superuser ? "Super Admin"
                : u.is_staff ? "Staff"
                : "Comum";
    const papelClass = u.is_superuser ? "papel-super" : u.is_staff ? "papel-staff" : "papel-comum";
    const vinculos = (u.vinculos || []).map((v) =>
      `<span class="vinc-chip">${escapeHtml(v.nome)} · ${escapeHtml(v.permissao)}</span>`
    ).join(" ") || `<span class="vinc-empty">Sem vínculo</span>`;
    const status = u.is_active
      ? `<span class="status-pill ok">Ativo</span>`
      : `<span class="status-pill off">Inativo</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(u.nome_completo)}</strong><br><small>#${u.id}</small></td>
      <td>${escapeHtml(u.email || u.username)}</td>
      <td><span class="papel-badge ${papelClass}">${papel}</span></td>
      <td class="vinculos-cell">${vinculos}</td>
      <td>${status}</td>
      <td>${escapeHtml(u.ultimo_login || "—")}</td>
      <td class="td-acoes">
        <button class="btn-icon" data-action="senha" data-id="${u.id}" title="Redefinir senha"><i class="fas fa-key"></i></button>
        <button class="btn-icon" data-action="vincular" data-id="${u.id}" title="Vincular a oficina"><i class="fas fa-link"></i></button>
        <button class="btn-icon" data-action="toggle" data-id="${u.id}" data-ativo="${u.is_active}" title="Ativar/Inativar"><i class="fas fa-power-off"></i></button>
        <button class="btn-icon danger" data-action="excluir" data-id="${u.id}" data-email="${escapeHtml(u.email || u.username)}" title="Excluir"><i class="fas fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => onAcao(btn, tbody));
  });
}


function vincularToolbar(container) {
  container.querySelector("#userBusca").addEventListener("input", debounce((e) => {
    estado.busca = e.target.value.trim();
    carregar(container);
  }, 350));
  container.querySelector("#userPapel").addEventListener("change", (e) => {
    estado.papel = e.target.value;
    carregar(container);
  });
  container.querySelector("#userAtivos").addEventListener("change", (e) => {
    estado.ativos = e.target.value;
    carregar(container);
  });
  container.querySelector("#btnNovoUsuario").addEventListener("click", () => abrirModal(container));
}


function vincularModal(container) {
  const modal = container.querySelector("#userModal");
  modal.querySelectorAll('[data-action="close"]').forEach((b) =>
    b.addEventListener("click", () => fecharModal(modal)),
  );
  modal.addEventListener("click", (e) => { if (e.target === modal) fecharModal(modal); });

  container.querySelector("#userForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      first_name: container.querySelector("#fNome").value.trim(),
      last_name: container.querySelector("#fSobrenome").value.trim(),
      email: container.querySelector("#fEmail").value.trim(),
      is_active: container.querySelector("#fAtivo").value === "true",
      is_staff: container.querySelector("#fStaff").checked,
      is_superuser: container.querySelector("#fSuper").checked,
    };
    const senha = container.querySelector("#fSenha").value;
    if (senha) body.password = senha;
    const id = container.querySelector("#fUserId").value;
    try {
      if (id) {
        await AdminAPI.usuarios.atualizar(Number(id), body);
        toast("Usuário atualizado.", "success");
      } else {
        await AdminAPI.usuarios.criar({ ...body, password: senha });
        toast("Usuário criado.", "success");
      }
      fecharModal(modal);
      carregar(container);
    } catch (err) {
      toast(err.message, "error");
    }
  });
}


function abrirModal(container, user = null) {
  const modal = container.querySelector("#userModal");
  modal.querySelector("#userModalTitle").textContent = user ? "Editar usuário" : "Novo usuário";
  container.querySelector("#fUserId").value = user?.id || "";
  container.querySelector("#fNome").value = user?.first_name || "";
  container.querySelector("#fSobrenome").value = user?.last_name || "";
  container.querySelector("#fEmail").value = user?.email || "";
  container.querySelector("#fAtivo").value = user ? String(user.is_active) : "true";
  container.querySelector("#fStaff").checked = !!user?.is_staff;
  container.querySelector("#fSuper").checked = !!user?.is_superuser;
  container.querySelector("#fSenha").value = "";
  container.querySelector("#fSenha").required = !user;
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add("open"));
}


function fecharModal(modal) {
  modal.classList.remove("open");
  setTimeout(() => (modal.hidden = true), 180);
}


async function onAcao(btn, tbody) {
  const id = Number(btn.dataset.id);
  const action = btn.dataset.action;
  const container = tbody.closest(".admin-section").parentElement;

  if (action === "toggle") {
    const ativo = btn.dataset.ativo === "true";
    try {
      await AdminAPI.usuarios.ativar(id, !ativo);
      toast(`Usuário ${!ativo ? "ativado" : "inativado"}.`, "success");
      carregar(container);
    } catch (err) { toast(err.message, "error"); }
    return;
  }

  if (action === "senha") {
    const senha = prompt("Nova senha (mínimo 8 caracteres):");
    if (!senha) return;
    try {
      await AdminAPI.usuarios.resetarSenha(id, senha);
      toast("Senha redefinida. Comunique ao usuário.", "success");
    } catch (err) { toast(err.message, "error"); }
    return;
  }

  if (action === "vincular") {
    const oficinaId = prompt("ID da oficina:");
    if (!oficinaId) return;
    const permissao = prompt("Permissão (admin/gerente/atendente/mecanico/visualizador):", "visualizador") || "visualizador";
    try {
      await AdminAPI.usuarios.vincularOficina(id, Number(oficinaId), permissao);
      toast("Vínculo criado/atualizado.", "success");
      carregar(container);
    } catch (err) { toast(err.message, "error"); }
    return;
  }

  if (action === "excluir") {
    const email = btn.dataset.email;
    const ok = await confirmarAcao({
      titulo: `Excluir usuário "${email}"?`,
      mensagem: "Todos os vínculos serão removidos. Esta ação é irreversível.",
      perigo: true,
      confirmar: "Excluir",
    });
    if (!ok) return;
    try {
      await AdminAPI.usuarios.excluir(id);
      toast("Usuário excluído.", "success");
      btn.closest("tr").remove();
    } catch (err) { toast(err.message, "error"); }
  }
}
