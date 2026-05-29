/**
 * perfil-form.js
 * Renderização e coleta de dados do formulário de perfil da oficina.
 */
import { API_BASE_URL } from "../../../../shared/config/api-config.js";
import { setText, setVal } from "./dom-utils.js";

function atualizarBadgeDados(data) {
    const basicos = data.dadosBasicos;
    const end = data.endereco;
    const horarios = data.horarios;
    const todosPreenchidos =
        basicos.nome &&
        basicos.cnpj &&
        basicos.email &&
        basicos.telefone &&
        basicos.especialidade &&
        end.cep &&
        end.logradouro &&
        end.numero &&
        end.bairro &&
        end.cidade &&
        end.estado &&
        horarios.abertura &&
        horarios.fechamento &&
        horarios.diasFuncionamento &&
        horarios.diasFuncionamento.length > 0;

    const badge = document.querySelector(".status-card:first-child .badge");
    if (!badge) return;
    badge.textContent = todosPreenchidos ? "Completo" : "Incompleto";
    badge.className = `badge ${todosPreenchidos ? "success" : "warning"}`;
}

function atualizarBadgeHorarios(data) {
    const badge = document.querySelector(".status-card:nth-child(2) .badge");
    if (!badge) return;

    const semConfig =
        !data.horarios.abertura ||
        !data.horarios.fechamento ||
        !data.horarios.diasFuncionamento?.length;

    if (semConfig) {
        badge.textContent = "Não configurado";
        badge.className = "badge warning";
        return;
    }
    badge.textContent = data.aberto_agora ? "Aberto" : "Fechado";
    badge.className = `badge ${data.aberto_agora ? "success" : "warning"}`;
}

function popularStatusCards(data) {
    if (data.status?.ultimaAtualizacao) {
        setText("statusDataUltimaAtualizacao", data.status.ultimaAtualizacao);
    }
    const { abertura, fechamento } = data.horarios || {};
    setText(
        "statusHorarioConfig",
        abertura && fechamento ? `${abertura} às ${fechamento}` : "Não configurado",
    );
    setText("statusPlanoVencimento", data.plano?.expiracao || "---");
}

function popularHistorico(historico) {
    const container = document.getElementById("historyTimeline");
    if (!container) return;
    container.innerHTML = "";

    if (!historico?.length) {
        container.innerHTML = "<li>Nenhum evento registrado</li>";
        return;
    }

    historico.forEach((item) => {
        const li = document.createElement("li");
        li.className = "timeline-item";
        li.innerHTML = `
            <div class="timeline-date">${item.data || ""}</div>
            <div class="timeline-content">
                <strong>${item.acao || item.descricao || ""}</strong>
                <p>${item.usuario ? `Por: ${item.usuario}` : "Sistema"}</p>
            </div>
        `;
        container.appendChild(li);
    });
}

function popularLogo(data) {
    const preview = document.getElementById("previewLogo");
    const placeholder = document.getElementById("logoPlaceholder");
    const temLogo = data.status?.logoEnviada && data.logo_url;

    if (preview) {
        if (temLogo) {
            const url = data.logo_url.startsWith("http")
                ? data.logo_url
                : `${API_BASE_URL}${data.logo_url}`;
            // cache-buster evita preview antigo quando o usuário troca a logo
            preview.src = `${url}?v=${Date.now()}`;
            preview.style.display = "block";
            preview.onerror = () => {
                preview.style.display = "none";
                if (placeholder) placeholder.style.display = "flex";
            };
            if (placeholder) placeholder.style.display = "none";
        } else {
            preview.style.display = "none";
            if (placeholder) placeholder.style.display = "flex";
        }
    }
}

export function popularFormulario(data) {
    setVal("inputNomeOficina", data.dadosBasicos.nome);
    setVal("inputCnpj", data.dadosBasicos.cnpj);
    setVal("inputEmail", data.dadosBasicos.email);
    setVal("inputTelefone", data.dadosBasicos.telefone);
    setVal("selectEspecialidade", data.dadosBasicos.especialidade);

    setVal("inputCep", data.endereco.cep);
    setVal("inputLogradouro", data.endereco.logradouro);
    setVal("inputNumero", data.endereco.numero);
    setVal("inputComplemento", data.endereco.complemento);
    setVal("inputBairro", data.endereco.bairro);
    setVal("inputCidade", data.endereco.cidade);
    setVal("selectEstado", data.endereco.estado);

    setVal("inputAbertura", data.horarios.abertura);
    setVal("inputFechamento", data.horarios.fechamento);

    // Plano é renderizado dinamicamente pelo módulo de pagamentos
    // (`pagamentos/components/plano-checkout.js`), que consulta a
    // assinatura via API. Aqui só preenchemos o badge inicial.
    const planoAtual = data.plano?.tipo;
    const statusPlanoNome = document.getElementById("statusPlanoNome");
    if (statusPlanoNome && planoAtual) {
        statusPlanoNome.textContent = planoAtual === "premium" ? "Premium" : "Básico";
    }

    const dias = data.horarios.diasFuncionamento || [];
    document.querySelectorAll(".week-checkbox").forEach((cb) => {
        cb.checked = dias.includes(cb.value);
    });

    popularStatusCards(data);
    if (Array.isArray(data.historico)) popularHistorico(data.historico);
    popularLogo(data);
    atualizarBadgeDados(data);
    atualizarBadgeHorarios(data);
}

export function coletarDadosFormulario() {
    const dias = Array.from(
        document.querySelectorAll(".week-checkbox:checked"),
    ).map((cb) => cb.value);

    return {
        dadosBasicos: {
            nome: document.getElementById("inputNomeOficina").value,
            email: document.getElementById("inputEmail").value,
            telefone: document.getElementById("inputTelefone").value,
            especialidade: document.getElementById("selectEspecialidade").value,
        },
        endereco: {
            cep: document.getElementById("inputCep").value,
            logradouro: document.getElementById("inputLogradouro").value,
            numero: document.getElementById("inputNumero").value,
            complemento: document.getElementById("inputComplemento").value,
            bairro: document.getElementById("inputBairro").value,
            cidade: document.getElementById("inputCidade").value,
            estado: document.getElementById("selectEstado").value,
        },
        horarios: {
            abertura: document.getElementById("inputAbertura").value,
            fechamento: document.getElementById("inputFechamento").value,
            diasFuncionamento: dias,
        },
        // O plano é alterado pelo fluxo de pagamento (AbacatePay), nunca
        // pelo botão "Salvar Alterações" desta tela — então não enviamos.
    };
}
