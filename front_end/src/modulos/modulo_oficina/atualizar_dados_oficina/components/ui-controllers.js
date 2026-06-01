/**
 * ui-controllers.js
 * Controladores menores de UI: abas, modais, plano, upload de logo, troca de senha
 * e máscara/busca de CEP.
 */
import { enviarLogo } from "../services/perfil-service.js";
import { buscarEnderecoPorCep } from "../services/cep-service.js";
import { setVal } from "./dom-utils.js";
import { API_BASE_URL } from "../../../../shared/config/api-config.js";


/** Normaliza uma URL de mídia vinda do back-end. Aceita absolute ou relativa. */
function urlDeMidia(url) {
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    if (url.startsWith("/")) return `${API_BASE_URL}${url}`;
    return `${API_BASE_URL}/${url}`;
}

// ---- Abas ----------------------------------------------------------------
export function inicializarAbas() {
    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");

    const ativar = (tabId) => {
        if (!tabId) return false;
        const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        const content = document.getElementById(tabId);
        if (!btn || !content) return false;
        tabBtns.forEach((b) => b.classList.remove("active"));
        tabContents.forEach((c) => c.classList.remove("active"));
        btn.classList.add("active");
        content.classList.add("active");
        return true;
    };

    tabBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            ativar(btn.getAttribute("data-tab"));
        });
    });

    // Permite abrir uma aba específica via `#plan`, `#users` etc. — usado
    // quando outros fluxos do sistema (cadastro pós-pagamento) precisam
    // direcionar o admin para a aba certa.
    const hash = (location.hash || "").replace(/^#/, "");
    if (hash) ativar(hash);
}

// ---- Modais (genérico) ---------------------------------------------------
export function inicializarModais() {
    document.getElementById("closeModalButton")?.addEventListener("click", () => {
        document.getElementById("confirmationModal")?.classList.remove("active");
    });

    document.addEventListener("click", (e) => {
        if (e.target.classList?.contains("modal")) {
            e.target.classList.remove("active");
        }
    });
}

// ---- Upload de logo -----------------------------------------------------
export function inicializarUploadLogo() {
    const area = document.getElementById("logoUploadArea");
    const inputLogo = document.getElementById("inputLogo");
    if (!area || !inputLogo) return;

    area.addEventListener("click", () => inputLogo.click());
    area.addEventListener("dragover", (e) => {
        e.preventDefault();
        area.style.borderColor = "var(--color-primary)";
        area.style.background = "rgba(37,99,235,0.05)";
    });
    area.addEventListener("dragleave", () => {
        area.style.borderColor = "var(--border-light)";
        area.style.background = "rgba(0,0,0,0.01)";
    });
    area.addEventListener("drop", (e) => {
        e.preventDefault();
        area.style.borderColor = "var(--border-light)";
        area.style.background = "rgba(0,0,0,0.01)";
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith("image/")) {
            inputLogo.files = e.dataTransfer.files;
            inputLogo.dispatchEvent(new Event("change"));
        }
    });

    inputLogo.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Preview imediato
        const reader = new FileReader();
        reader.onload = (ev) => {
            const preview = document.getElementById("previewLogo");
            const placeholder = document.getElementById("logoPlaceholder");
            if (preview) {
                preview.src = ev.target.result;
                preview.style.display = "block";
                if (placeholder) placeholder.style.display = "none";
            }
        };
        reader.readAsDataURL(file);

        // Upload
        try {
            const data = await enviarLogo(file);
            const preview = document.getElementById("previewLogo");
            if (preview && data.logo_url) {
                // O back pode devolver URL relativa (/media/...) ou absoluta;
                // o cache-buster força o browser a recarregar a imagem atualizada.
                const versao = `?v=${Date.now()}`;
                preview.src = urlDeMidia(data.logo_url) + versao;
                preview.style.display = "block";
                document.getElementById("logoPlaceholder").style.display = "none";
            }
            alert("Logo atualizada com sucesso!");
        } catch (err) {
            console.error(err);
            alert("Erro ao enviar logo");
        }
    });
}

// ---- Troca de senha (placeholder visual) -------------------------------
export function inicializarTrocaSenha() {
    window.togglePasswordVisibility = function (inputId, iconElement) {
        const input = document.getElementById(inputId);
        if (!input) return;
        if (input.type === "password") {
            input.type = "text";
            iconElement.classList.remove("fa-eye");
            iconElement.classList.add("fa-eye-slash");
        } else {
            input.type = "password";
            iconElement.classList.remove("fa-eye-slash");
            iconElement.classList.add("fa-eye");
        }
    };

    const btnSave = document.getElementById("btnSavePassword");
    if (!btnSave) return;

    btnSave.addEventListener("click", () => {
        const currentPass = document.getElementById("currentPassword").value;
        const newPass = document.getElementById("newPassword").value;
        const confirmPass = document.getElementById("confirmPassword").value;
        const errorMsg = document.getElementById("passwordMatchError");

        errorMsg.style.display = "none";

        if (!currentPass) {
            alert("Por favor, digite sua senha atual.");
            return;
        }
        if (newPass.length < 8) {
            alert("A nova senha deve ter no mínimo 8 caracteres.");
            return;
        }
        if (newPass !== confirmPass) {
            errorMsg.style.display = "block";
            return;
        }

        const originalText = btnSave.innerHTML;
        btnSave.innerHTML =
            '<div class="loader" style="display:block; border-color: rgba(255,255,255,0.5); border-top-color: white;"></div>';
        btnSave.disabled = true;

        setTimeout(() => {
            btnSave.innerHTML = originalText;
            btnSave.disabled = false;
            document.getElementById("formSecurity")?.reset();
            alert("Senha alterada com sucesso! Você receberá um e-mail de confirmação.");
        }, 2000);
    });
}

// ---- CEP (máscara + busca) ----------------------------------------------
function aplicarMascaraCep(event) {
    let value = event.target.value.replace(/\D/g, "");
    if (value.length > 5) {
        value = value.substring(0, 5) + "-" + value.substring(5, 8);
    }
    event.target.value = value;
}

async function preencherEnderecoPorCep() {
    const cepInput = document.getElementById("inputCep");
    const btnBuscar = document.getElementById("btnBuscarCep");
    const loadingEl = document.getElementById("cepLoading");
    if (!cepInput) return;

    const cep = cepInput.value.replace(/\D/g, "");
    if (cep.length !== 8) {
        alert("Por favor, digite um CEP válido com 8 dígitos.");
        cepInput.focus();
        return;
    }

    if (btnBuscar) btnBuscar.disabled = true;
    if (loadingEl) loadingEl.style.display = "flex";

    try {
        const data = await buscarEnderecoPorCep(cep);
        setVal("inputLogradouro", data.logradouro);
        setVal("inputBairro", data.bairro);
        setVal("inputCidade", data.localidade);
        setVal("selectEstado", data.uf);
        setVal("inputComplemento", data.complemento);
        document.getElementById("inputNumero")?.focus();

        if (loadingEl) {
            loadingEl.innerHTML = '<i class="fas fa-check-circle" aria-hidden="true"></i> Endereço encontrado!';
            loadingEl.style.color = "var(--color-success)";
            setTimeout(() => {
                loadingEl.style.display = "none";
                loadingEl.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Buscando endereço...';
                loadingEl.style.color = "var(--color-primary)";
            }, 2000);
        }
    } catch (error) {
        console.error("Erro ao buscar CEP:", error);
        alert(error.message || "Erro ao buscar o CEP.");
    } finally {
        if (btnBuscar) btnBuscar.disabled = false;
        if (loadingEl && loadingEl.style.display === "flex") {
            loadingEl.style.display = "none";
        }
    }
}

export function inicializarCep() {
    document.getElementById("btnBuscarCep")?.addEventListener("click", preencherEnderecoPorCep);
    document.getElementById("inputCep")?.addEventListener("input", aplicarMascaraCep);
    document.getElementById("inputCep")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            preencherEnderecoPorCep();
        }
    });
}
