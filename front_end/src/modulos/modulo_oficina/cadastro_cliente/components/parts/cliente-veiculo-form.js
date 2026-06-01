// cliente-veiculo-form.js — modal lightweight para cadastrar veículo
// vinculado ao cliente selecionado. Reaproveita o endpoint atual de
// criação de veículo: POST /api/oficina/veiculos/ com { cliente: id, ... }.

import { apiUrl, getCsrfToken } from "../../../../../shared/config/api-config.js";
import { abrirNovaOS } from "../../../../../shared/services/os-deep-link.js";
import { showToast } from "./cliente-toast.js";
import { state } from "./cliente-state.js";
import { carregarVeiculosDoCliente } from "./cliente-veiculos.js";


export function configurarBotaoNovoVeiculo() {
    const btn = document.getElementById("btnNovoVeiculo");
    if (!btn) return;
    btn.addEventListener("click", () => {
        if (!state.selectedClientId) {
            mostrarToast("Selecione um cliente para cadastrar veículo.", "warning");
            return;
        }
        abrirModalNovoVeiculo();
    });
}


function abrirModalNovoVeiculo() {
    if (document.getElementById("modalNovoVeiculo")) return;

    const overlay = document.createElement("div");
    overlay.id = "modalNovoVeiculo";
    overlay.className = "veic-modal-overlay";
    overlay.innerHTML = `
      <form class="veic-modal-card" role="dialog" aria-modal="true" aria-labelledby="veicTitle">
        <header>
          <h3 id="veicTitle"><i class="fas fa-car-side"></i> Cadastrar novo veículo</h3>
          <button type="button" class="btn-icon" data-action="close" aria-label="Fechar">
            <i class="fas fa-xmark"></i>
          </button>
        </header>
        <div class="veic-modal-body">
          <div class="row-2">
            <label>
              Placa <span class="required">*</span>
              <input type="text" id="veicPlaca" maxlength="10" required class="form-control"
                     placeholder="ABC1D23">
            </label>
            <label>
              Ano
              <input type="text" id="veicAno" maxlength="4" class="form-control" placeholder="2020">
            </label>
          </div>
          <div class="row-2">
            <label>
              Marca
              <input type="text" id="veicMarca" class="form-control" placeholder="Volkswagen">
            </label>
            <label>
              Modelo
              <input type="text" id="veicModelo" class="form-control" placeholder="Gol">
            </label>
          </div>
          <div class="row-2">
            <label>
              Cor
              <input type="text" id="veicCor" class="form-control" placeholder="Prata">
            </label>
            <label>
              Tipo de uso
              <select id="veicTipoUso" class="form-control">
                <option value="particular">Particular</option>
                <option value="comercial">Comercial / Frota</option>
              </select>
            </label>
          </div>
          <label>
            Chassi
            <input type="text" id="veicChassi" class="form-control" placeholder="9BWZZZ377VT004251">
          </label>
        </div>
        <footer>
          <label class="check-line" style="margin-right:auto;">
            <input type="checkbox" id="veicAbrirOS"> Abrir OS para este veículo após cadastrar
          </label>
          <button type="button" class="btn btn-outline-secondary" data-action="close">Cancelar</button>
          <button type="submit" class="btn btn-primary">
            <i class="fas fa-save"></i> Salvar veículo
          </button>
        </footer>
      </form>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("open"));

    const fechar = () => {
        overlay.classList.remove("open");
        setTimeout(() => overlay.remove(), 180);
    };
    overlay.querySelectorAll('[data-action="close"]').forEach((b) =>
        b.addEventListener("click", fechar),
    );
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });
    document.addEventListener("keydown", function esc(ev) {
        if (ev.key === "Escape") { document.removeEventListener("keydown", esc); fechar(); }
    });

    overlay.querySelector("form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            cliente: state.selectedClientId,
            placa: (overlay.querySelector("#veicPlaca").value || "").toUpperCase().trim(),
            ano: overlay.querySelector("#veicAno").value.trim(),
            marca: overlay.querySelector("#veicMarca").value.trim(),
            modelo: overlay.querySelector("#veicModelo").value.trim(),
            cor: overlay.querySelector("#veicCor").value.trim(),
            chassi: overlay.querySelector("#veicChassi").value.trim(),
            tipo_uso: overlay.querySelector("#veicTipoUso").value,
        };
        const abrirOS = overlay.querySelector("#veicAbrirOS").checked;

        if (!payload.placa) {
            mostrarToast("Informe a placa do veículo.", "warning");
            return;
        }

        try {
            const r = await fetch(apiUrl("/veiculos/"), {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": getCsrfToken(),
                },
                body: JSON.stringify(payload),
            });
            if (!r.ok) {
                const err = await r.json().catch(() => ({}));
                throw new Error(err.detail || err.erro || "Falha ao salvar veículo");
            }
            const novo = await r.json();
            mostrarToast("Veículo cadastrado com sucesso!", "success");
            fechar();
            await carregarVeiculosDoCliente(state.selectedClientId);
            if (abrirOS) abrirNovaOS({ veiculoId: novo.id, clienteId: state.selectedClientId });
        } catch (err) {
            mostrarToast(err.message, "error");
        }
    });
}
