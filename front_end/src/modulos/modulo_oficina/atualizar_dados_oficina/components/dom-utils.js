/**
 * dom-utils.js
 * Helpers genéricos de DOM e dados compartilhados (perfis de permissão).
 */

export const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value || "";
};

export const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text || "";
};

export const escapeHtml = (str) => {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
};

export const PERMISSOES_MAP = {
    admin: {
        nome: "Administrador",
        classe: "admin",
        descricao:
            "Acesso total ao sistema. Pode gerenciar dados cadastrais, finanças, usuários e todas as configurações da oficina.",
    },
    gerente: {
        nome: "Gerente",
        classe: "gerente",
        descricao:
            "Gerencia ordens de serviço, clientes e funcionários. Não pode alterar dados cadastrais da oficina nem gerenciar planos.",
    },
    mecanico: {
        nome: "Mecânico",
        classe: "mecanico",
        descricao:
            "Visualiza e atualiza ordens de serviço. Acessa dados técnicos e histórico de veículos. Sem acesso a dados financeiros.",
    },
    atendente: {
        nome: "Atendente",
        classe: "atendente",
        descricao:
            "Cria ordens de serviço, gerencia agenda de clientes e visualiza informações básicas. Sem acesso a configurações.",
    },
    visualizador: {
        nome: "Visualizador",
        classe: "visualizador",
        descricao:
            "Acesso somente leitura. Pode visualizar informações básicas da oficina, sem permissão para editar qualquer dado.",
    },
};
