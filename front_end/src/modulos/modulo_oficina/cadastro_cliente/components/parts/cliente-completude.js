// cliente-completude.js
//
// Avalia se o cadastro do cliente está completo (todos os dados úteis
// para emissão de O.S., comunicação e documentos fiscais) e atualiza um
// chip de status no hero da página.

const CAMPOS = [
    { chave: "nome", label: "Nome", critico: true },
    { chave: "cpf_cnpj", label: "CPF/CNPJ", critico: true },
    { chave: "telefone", label: "Telefone", critico: true },
    { chave: "email", label: "E-mail", critico: false },
    { chave: "cep", label: "CEP", critico: false },
    { chave: "logradouro", label: "Logradouro", critico: false },
    { chave: "numero", label: "Número", critico: false },
    { chave: "bairro", label: "Bairro", critico: false },
    { chave: "cidade", label: "Cidade", critico: false },
    { chave: "estado", label: "UF", critico: false },
];


export function avaliarCadastro(cliente) {
    if (!cliente) return { completo: false, faltantes: [], criticasFaltantes: [] };
    const faltantes = CAMPOS.filter((c) => !((cliente[c.chave] || "").toString().trim()));
    const criticas = faltantes.filter((c) => c.critico);
    return {
        completo: faltantes.length === 0,
        faltantes,
        criticasFaltantes: criticas,
        percentual: Math.round(((CAMPOS.length - faltantes.length) / CAMPOS.length) * 100),
    };
}


export function atualizarChipCompletude(cliente) {
    const titulo = document.getElementById("clienteHeroTitle");
    const sub = document.getElementById("clienteHeroSub");
    if (!titulo || !sub) return;

    if (!cliente || !cliente.id) {
        titulo.textContent = "Novo cliente";
        sub.innerHTML = "Cadastre, atualize informações e mantenha o relacionamento próximo.";
        removerChip();
        return;
    }

    const avaliacao = avaliarCadastro(cliente);
    titulo.textContent = cliente.nome || "Cliente sem nome";

    let chip = "";
    if (avaliacao.completo) {
        chip = `
          <span class="cliente-completude-chip ok">
            <i class="fas fa-circle-check"></i> Cadastro completo (100%)
          </span>`;
    } else if (avaliacao.criticasFaltantes.length > 0) {
        const nomes = avaliacao.criticasFaltantes.map((c) => c.label).join(", ");
        chip = `
          <span class="cliente-completude-chip danger"
                title="Campos obrigatórios para emissão de documentos">
            <i class="fas fa-triangle-exclamation"></i>
            Faltam dados críticos: ${nomes}
          </span>`;
    } else {
        chip = `
          <span class="cliente-completude-chip warning"
                title="${avaliacao.faltantes.map((c) => c.label).join(", ")}">
            <i class="fas fa-circle-info"></i>
            Cadastro incompleto (${avaliacao.percentual}%)
          </span>`;
    }

    sub.innerHTML = `
      ${chip}
      <span class="cliente-completude-aux">
        ID #${cliente.id} ·
        ${cliente.cpf_cnpj ? "Documento: " + esc(cliente.cpf_cnpj) : "Sem documento"}
      </span>
    `;
}


function removerChip() {
    const sub = document.getElementById("clienteHeroSub");
    if (sub) {
        sub.innerHTML = "Cadastre, atualize informações e mantenha o relacionamento próximo.";
    }
}


function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, (m) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[m]);
}
