/**
 * script.js
 * Orquestrador da tela "Atualizar Dados da Oficina".
 * Apenas instancia/registra os módulos — todas as responsabilidades
 * (HTTP, DOM, comportamentos UI) ficam em arquivos dedicados.
 *
 * Acesso restrito: apenas `admin` da oficina (a tela edita perfil, plano,
 * funcionários e senha). O guard cuida de redirecionar para o dashboard
 * caso o papel não seja suficiente.
 */
import { garantirAcesso } from "../../../../shared/services/auth-guard.js";
import { fetchPerfil, salvarPerfil } from "./perfil-service.js";
import {
    coletarDadosFormulario,
    popularFormulario,
} from "../components/perfil-form.js";
import { inicializarFuncionariosUI } from "../components/funcionarios-ui.js";
import {
    inicializarAbas,
    inicializarCep,
    inicializarModais,
    inicializarTrocaSenha,
    inicializarUploadLogo,
} from "../components/ui-controllers.js";
import { inicializarAbaRenovacaoPlano } from "../../pagamentos/components/plano-checkout.js";

document.addEventListener("DOMContentLoaded", async () => {
    if (!(await garantirAcesso({ permissaoMinima: "admin", paginaChave: "atualizacao" }))) return;
    configurarBotaoSalvar();
    inicializarAbas();
    inicializarModais();
    inicializarUploadLogo();
    inicializarTrocaSenha();
    inicializarCep();
    inicializarFuncionariosUI();
    carregarPerfilInicial();
});

async function carregarPerfilInicial() {
    try {
        const data = await fetchPerfil();
        popularFormulario(data);
        // O catálogo + assinatura agora vêm do back-end (AbacatePay).
        // Falha aqui não derruba o resto da tela.
        inicializarAbaRenovacaoPlano().catch((err) =>
            console.error("Falha ao montar aba de plano:", err),
        );
    } catch (error) {
        console.error("Erro ao carregar os dados da tela:", error);
        alert("Erro ao carregar dados. Tente novamente.");
    }
}

function configurarBotaoSalvar() {
    const original = document.getElementById("saveButton");
    if (!original) return;

    // Clona para garantir que listeners antigos sejam removidos.
    const saveButton = original.cloneNode(true);
    original.parentNode.replaceChild(saveButton, original);

    saveButton.addEventListener("click", async () => {
        const activeTab = document.querySelector(".tab-content.active")?.id;
        if (activeTab === "security") {
            alert(
                'Para alterar a senha, utilize o botão "Salvar Nova Senha" dentro da aba de segurança.\n\nPara gerenciar usuários, acesse a aba "Usuários".',
            );
            return;
        }
        if (activeTab === "users") {
            alert(
                "Utilize os botões 'Adicionar Usuário' e os controles da tabela para gerenciar os usuários.",
            );
            return;
        }
        if (activeTab === "plan") {
            alert(
                "Para alterar o plano, escolha um dos cards e clique em 'Assinar' — o pagamento é processado pelo AbacatePay.",
            );
            return;
        }

        const dataToSave = coletarDadosFormulario();
        saveButton.classList.add("loading");
        saveButton.disabled = true;

        try {
            await salvarPerfil(dataToSave);
            document.getElementById("confirmationModal")?.classList.add("active");
            const updated = await fetchPerfil();
            popularFormulario(updated);
        } catch (err) {
            console.error(err);
            alert("Erro ao salvar. Tente novamente.");
        } finally {
            saveButton.classList.remove("loading");
            saveButton.disabled = false;
        }
    });
}
