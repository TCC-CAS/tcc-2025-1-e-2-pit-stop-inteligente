/**
 * password-strength.js
 *
 * Validacao visual da politica de senha em tempo real. Mantemos as regras
 * em sincronia EXATA com o back-end (apps/modulo_adm/password_validators.py):
 *
 *   - length:  >= 8 caracteres
 *   - upper:   1 letra MAIUSCULA (A-Z + acentuadas)
 *   - lower:   1 letra minuscula (a-z + acentuadas)
 *   - number:  1 digito (0-9)
 *   - special: 1 caractere especial do conjunto canonico
 *
 * Tambem cuida da confirmacao de senha (se houver um segundo campo).
 *
 * Uso:
 *   import { vincularValidacaoSenha } from "/.../password-strength.js";
 *   vincularValidacaoSenha({
 *     senhaInput:        document.getElementById("adminSenha"),
 *     confirmInput:      document.getElementById("adminSenhaConfirm"),
 *     listaRegras:       document.getElementById("passwordRules"),
 *     msgConfirmacao:    document.getElementById("passwordMatchMsg"),
 *     onChange: (estado) => { ... },  // opcional
 *   });
 */

// Conjunto canonico de caracteres especiais. Mesma definicao do back-end.
const ESPECIAIS = "!@#$%^&*()-_=+[]{};:'\",.<>/?\\|`~";

const REGRAS = {
    length: (s) => s.length >= 8,
    upper: (s) => /[A-ZÁÉÍÓÚÂÊÔÃÕÀÇ]/.test(s),
    lower: (s) => /[a-záéíóúâêôãõàç]/.test(s),
    number: (s) => /\d/.test(s),
    special: (s) => new RegExp(`[${escapeRegex(ESPECIAIS)}]`).test(s),
};

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


/**
 * Avalia uma senha e devolve um snapshot com {length, upper, lower, number,
 * special, atendeTudo}. Util para validar antes do submit sem precisar
 * inspecionar o DOM.
 */
export function avaliarSenha(senha) {
    const estado = {};
    let total = 0;
    for (const [chave, fn] of Object.entries(REGRAS)) {
        const ok = Boolean(senha) && fn(senha);
        estado[chave] = ok;
        if (ok) total += 1;
    }
    estado.atendeTudo = total === Object.keys(REGRAS).length;
    estado.totalRegrasAtendidas = total;
    estado.totalRegras = Object.keys(REGRAS).length;
    return estado;
}


/**
 * Liga os eventos `input` aos campos de senha e atualiza a UI conforme o
 * usuario digita. Retorna um handle com `desconectar()` para limpar os
 * listeners (util em SPAs).
 */
export function vincularValidacaoSenha({
    senhaInput,
    confirmInput = null,
    listaRegras = null,
    msgConfirmacao = null,
    onChange = null,
}) {
    if (!senhaInput) return { desconectar: () => {} };

    function atualizar() {
        const senha = senhaInput.value || "";
        const estado = avaliarSenha(senha);

        if (listaRegras) {
            listaRegras.querySelectorAll("li[data-rule]").forEach((li) => {
                const chave = li.dataset.rule;
                const ok = !!estado[chave];
                li.classList.toggle("ok", ok);
                li.classList.toggle("pendente", !ok);
                const icone = li.querySelector("i");
                if (icone) {
                    icone.classList.toggle("fa-check-circle", ok);
                    icone.classList.toggle("fa-circle", !ok);
                }
            });
        }

        if (confirmInput && msgConfirmacao) {
            const conf = confirmInput.value || "";
            if (!conf) {
                msgConfirmacao.textContent = "";
                msgConfirmacao.classList.remove("ok", "erro");
            } else if (conf === senha) {
                msgConfirmacao.textContent = "Senhas conferem.";
                msgConfirmacao.classList.remove("erro");
                msgConfirmacao.classList.add("ok");
            } else {
                msgConfirmacao.textContent = "As senhas nao conferem.";
                msgConfirmacao.classList.remove("ok");
                msgConfirmacao.classList.add("erro");
            }
        }

        if (typeof onChange === "function") {
            onChange({ ...estado, confirmacaoOk: confirmInput ? confirmInput.value === senha : true });
        }
    }

    senhaInput.addEventListener("input", atualizar);
    if (confirmInput) confirmInput.addEventListener("input", atualizar);

    atualizar(); // estado inicial

    return {
        desconectar() {
            senhaInput.removeEventListener("input", atualizar);
            if (confirmInput) confirmInput.removeEventListener("input", atualizar);
        },
    };
}
