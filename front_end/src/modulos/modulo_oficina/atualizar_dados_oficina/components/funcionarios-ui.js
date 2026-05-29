/**
 * funcionarios-ui.js
 * Renderização da tabela e modal de gestão de funcionários da oficina.
 * Toda a comunicação HTTP fica encapsulada em funcionarios-service.js.
 */
import {
    listarFuncionarios,
    criarFuncionario,
    atualizarFuncionario,
    alterarStatusFuncionario,
    excluirFuncionario,
} from "../services/funcionarios-service.js";
import { escapeHtml, PERMISSOES_MAP, setVal } from "./dom-utils.js";

let usuariosCache = [];

function montarLinha(user) {
    const perm = PERMISSOES_MAP[user.permissao] || PERMISSOES_MAP.visualizador;
    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td><strong>${escapeHtml(user.nome)}</strong></td>
        <td>${escapeHtml(user.email)}</td>
        <td>
            <span class="permission-badge ${perm.classe}">
                <i class="fas fa-shield-alt" aria-hidden="true"></i> ${perm.nome}
            </span>
        </td>
        <td>
            <span class="user-status ${user.is_active ? "active" : "inactive"}">
                <i class="fas fa-circle" aria-hidden="true"></i> ${user.is_active ? "Ativo" : "Inativo"}
            </span>
        </td>
        <td>
            <div class="actions-cell">
                <button class="btn-icon-sm edit-user" data-id="${user.id}" title="Editar" aria-label="Editar usuário">
                    <i class="fas fa-pen" aria-hidden="true"></i>
                </button>
                <button class="btn-icon-sm toggle-user-status" data-id="${user.id}" title="${user.is_active ? "Desativar" : "Ativar"}" aria-label="${user.is_active ? "Desativar" : "Ativar"} usuário">
                    <i class="fas ${user.is_active ? "fa-ban" : "fa-check"}" aria-hidden="true"></i>
                </button>
                <button class="btn-icon-sm delete delete-user" data-id="${user.id}" title="Excluir" aria-label="Excluir usuário">
                    <i class="fas fa-trash-alt" aria-hidden="true"></i>
                </button>
            </div>
        </td>
    `;
    return tr;
}

function popularTabela(usuarios) {
    usuariosCache = usuarios || [];
    const tbody = document.getElementById("usersTableBody");
    const noUsersMsg = document.getElementById("noUsersMessage");
    const table = document.getElementById("usersTable");

    if (!tbody) return;
    tbody.innerHTML = "";

    if (!usuariosCache.length) {
        if (noUsersMsg) noUsersMsg.style.display = "block";
        if (table) table.style.display = "none";
        return;
    }

    if (noUsersMsg) noUsersMsg.style.display = "none";
    if (table) table.style.display = "table";

    usuariosCache.forEach((user) => tbody.appendChild(montarLinha(user)));

    tbody.querySelectorAll(".edit-user").forEach((btn) => {
        btn.addEventListener("click", () => abrirModal(parseInt(btn.dataset.id, 10)));
    });
    tbody.querySelectorAll(".toggle-user-status").forEach((btn) => {
        btn.addEventListener("click", () => alternarStatus(parseInt(btn.dataset.id, 10)));
    });
    tbody.querySelectorAll(".delete-user").forEach((btn) => {
        btn.addEventListener("click", () => excluir(parseInt(btn.dataset.id, 10)));
    });
}

async function recarregar() {
    try {
        const usuarios = await listarFuncionarios();
        popularTabela(usuarios);
    } catch (erro) {
        console.error(erro);
        if (!String(erro.message).includes("Sessão expirada")) {
            alert("Não foi possível carregar os usuários da oficina.");
        }
    }
}

function abrirModal(userId = null) {
    const modal = document.getElementById("userModal");
    const title = document.getElementById("userModalTitle");
    const form = document.getElementById("formUser");
    const senhaField = document.getElementById("userSenha");
    const senhaLabel = senhaField?.closest(".form-group")?.querySelector("label");

    form?.reset();
    setVal("userId", "");
    document.getElementById("permissionDescription").textContent =
        "Selecione um nível de permissão para ver a descrição.";

    if (userId) {
        if (title) title.textContent = "Editar Usuário";
        const user = usuariosCache.find((u) => u.id === userId);
        if (user) {
            setVal("userId", user.id);
            setVal("userNome", user.nome);
            setVal("userEmail", user.email);
            setVal("userPermissao", user.permissao);
            senhaField?.removeAttribute("required");
            if (senhaLabel)
                senhaLabel.innerHTML = 'Senha <small>(deixe em branco para manter)</small>';
            atualizarDescricaoPermissao(user.permissao);
        }
    } else {
        if (title) title.textContent = "Adicionar Usuário";
        senhaField?.setAttribute("required", "required");
        if (senhaLabel)
            senhaLabel.innerHTML = 'Senha <small>(mínimo 8 caracteres)</small>';
    }

    modal?.classList.add("active");
}

function fecharModal() {
    document.getElementById("userModal")?.classList.remove("active");
    document.getElementById("formUser")?.reset();
}

function atualizarDescricaoPermissao(permissaoId) {
    const descEl = document.getElementById("permissionDescription");
    if (!descEl) return;
    descEl.textContent =
        PERMISSOES_MAP[permissaoId]?.descricao ||
        "Selecione um nível de permissão para ver a descrição.";
}

async function alternarStatus(userId) {
    const user = usuariosCache.find((u) => u.id === userId);
    if (!user) return;
    const novoStatus = !user.is_active;
    try {
        await alterarStatusFuncionario(userId, novoStatus);
        await recarregar();
        alert(`Usuário ${user.nome} foi ${novoStatus ? "ativado" : "desativado"}.`);
    } catch (e) {
        console.error(e);
        alert("Erro ao alterar status do usuário.");
    }
}

async function excluir(id) {
    const user = usuariosCache.find((u) => u.id === id);
    if (!confirm(`Tem certeza que deseja excluir o usuário "${user?.nome}" permanentemente?`)) return;
    try {
        await excluirFuncionario(id);
        await recarregar();
        alert("Usuário excluído com sucesso.");
    } catch (e) {
        console.error(e);
        alert("Erro ao excluir usuário.");
    }
}

async function salvar(event) {
    event.preventDefault();

    const userId = document.getElementById("userId").value;
    const nomeCompleto = document.getElementById("userNome").value.trim();
    const email = document.getElementById("userEmail").value.trim();
    const senha = document.getElementById("userSenha").value;
    const permissao = document.getElementById("userPermissao").value;

    if (!nomeCompleto || !email || !permissao) {
        alert("Preencha todos os campos obrigatórios.");
        return;
    }
    if (!userId && (!senha || senha.length < 8)) {
        alert("A senha deve ter no mínimo 8 caracteres.");
        return;
    }

    const [primeiroNome, ...resto] = nomeCompleto.split(" ");
    const ultimoNome = resto.join(" ");

    const payload = {
        email,
        primeiro_nome: primeiroNome,
        ultimo_nome: ultimoNome,
        permissao,
        is_active: true,
    };

    try {
        if (userId) {
            payload.password = senha; // se vier vazia, back ignora e mantém a atual
            await atualizarFuncionario(userId, payload);
            fecharModal();
            await recarregar();
            alert("Usuário atualizado com sucesso!");
        } else {
            payload.password = senha;
            await criarFuncionario(payload);
            fecharModal();
            await recarregar();
            mostrarCredenciaisCriadas(email, senha);
        }
    } catch (erro) {
        console.error(erro);
        alert(`Erro: ${erro.message}`);
    }
}


/**
 * Modal informativo pós-criação: mostra e-mail + senha ao admin para que
 * ele consiga comunicar ao funcionário recém-cadastrado. Inclui um botão
 * "Copiar credenciais" para facilitar o repasse.
 */
function mostrarCredenciaisCriadas(email, senha) {
    const existing = document.getElementById("credentialsModal");
    existing?.remove();

    const overlay = document.createElement("div");
    overlay.id = "credentialsModal";
    overlay.className = "credentials-modal";
    overlay.innerHTML = `
      <div role="dialog" aria-modal="true" aria-labelledby="credsTitle" class="credentials-card">
        <header>
          <h3 id="credsTitle"><i class="fas fa-user-check" aria-hidden="true"></i> Usuário criado</h3>
        </header>
        <p>Compartilhe estas credenciais com o novo funcionário para o primeiro acesso:</p>
        <dl class="credentials-list">
          <dt>E-mail</dt><dd><code>${email}</code></dd>
          <dt>Senha</dt><dd><code>${senha}</code></dd>
        </dl>
        <p class="credentials-hint">
          <i class="fas fa-info-circle" aria-hidden="true"></i>
          Recomende ao funcionário alterar a senha no primeiro acesso.
        </p>
        <div class="credentials-actions">
          <button class="btn btn-secondary" id="btnCopiarCreds" type="button">
            <i class="fas fa-copy"></i> Copiar credenciais
          </button>
          <button class="btn btn-primary" id="btnFecharCreds" type="button">Entendi</button>
        </div>
      </div>`;
    Object.assign(overlay.style, {
        position: "fixed", inset: "0",
        background: "rgba(15, 23, 42, 0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: "1200", padding: "1rem",
    });
    document.body.appendChild(overlay);

    overlay.querySelector("#btnFecharCreds").addEventListener("click", () => overlay.remove());
    overlay.querySelector("#btnCopiarCreds").addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(`E-mail: ${email}\nSenha: ${senha}`);
            const btn = overlay.querySelector("#btnCopiarCreds");
            const original = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Copiado!';
            setTimeout(() => (btn.innerHTML = original), 1500);
        } catch {
            alert("Não foi possível copiar. Selecione manualmente.");
        }
    });
}

export function inicializarFuncionariosUI() {
    document.getElementById("closeUserModal")?.addEventListener("click", fecharModal);
    document.getElementById("btnCancelUser")?.addEventListener("click", fecharModal);
    document.getElementById("formUser")?.addEventListener("submit", salvar);
    document.getElementById("btnAddUser")?.addEventListener("click", () => abrirModal());
    document.getElementById("userPermissao")?.addEventListener("change", (e) => {
        atualizarDescricaoPermissao(e.target.value);
    });

    recarregar();
}
