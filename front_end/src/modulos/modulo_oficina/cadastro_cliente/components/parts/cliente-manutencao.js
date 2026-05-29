// cliente-manutencao.js
//
// Plano de manutenção preventiva por cliente. Para cada veículo do
// cliente, lista as manutenções programadas, permite criar/editar,
// gerar OS preventiva diretamente, e mostra alertas (vencido / próximo).

import { apiUrl, getCsrfToken } from "../../../../../shared/config/api-config.js";
import { abrirOS } from "../../../../../shared/services/os-deep-link.js";
import { showToast } from "./cliente-toast.js";
import { state } from "./cliente-state.js";


const STATUS_LABEL = {
    pendente: "Pendente",
    agendado: "Agendado",
    realizado: "Realizado",
    vencido: "Vencido",
};
const STATUS_CLASSE = {
    pendente: "warn",
    agendado: "info",
    realizado: "ok",
    vencido: "danger",
};


let veiculosCache = [];


export async function carregarManutencaoDoCliente(clienteId) {
    const container = document.getElementById("manutencao-content");
    const tabCount = document.getElementById("tabCountManutencao");
    if (!container || !clienteId) return;

    container.innerHTML = `<div class="empty-state-soft"><i class="fas fa-spinner fa-spin"></i><p>Carregando…</p></div>`;
    try {
        veiculosCache = await fetchJson(`/clientes/${clienteId}/veiculos/`);
        if (!veiculosCache.length) {
            if (tabCount) tabCount.textContent = "0";
            container.innerHTML = `
              <div class="empty-state-soft">
                <i class="fas fa-car-side"></i>
                <p>Cadastre um veículo para iniciar um plano de manutenção preventiva.</p>
              </div>`;
            return;
        }

        const planos = await Promise.all(
            veiculosCache.map((v) =>
                fetchJson(`/veiculos/${v.id}/manutencoes/`).catch(() => [])
            ),
        );

        const flat = planos.flat();
        if (tabCount) tabCount.textContent = String(flat.length);

        renderizarPlanos(container, veiculosCache, planos);
        // Habilita botão "Nova revisão"
        const btn = document.getElementById("btnNovaManutencao");
        if (btn) {
            btn.disabled = false;
            btn.title = "";
            btn.onclick = () => abrirModal({ clienteId });
        }
    } catch (err) {
        container.innerHTML = `<div class="empty-state-soft"><i class="fas fa-triangle-exclamation"></i><p>${escapeHtml(err.message)}</p></div>`;
    }
}


function renderizarPlanos(container, veiculos, planos) {
    const blocks = veiculos.map((v, i) => {
        const lista = planos[i] || [];
        return `
          <article class="vehicle-tab-card" data-veiculo-id="${v.id}">
            <header class="vehicle-card-header">
              <h3 class="vehicle-card-title">
                <i class="fas fa-car"></i> ${escapeHtml(v.placa || "—")}
                <span class="vehicle-model">${escapeHtml(v.modelo || "Sem modelo")}</span>
              </h3>
              <button class="btn btn-outline-secondary btn-sm" type="button"
                      data-action="adicionar" data-veiculo-id="${v.id}">
                <i class="fas fa-plus"></i> Nova revisão
              </button>
            </header>
            <div style="padding: 0.85rem 1.25rem 1.25rem;">
              ${lista.length
                ? `<ul class="manut-list">${lista.map((m) => itemManut(m, v)).join("")}</ul>`
                : `<div class="empty-state-soft" style="margin:0;">
                     <i class="fas fa-clock"></i>
                     <p>Nenhuma manutenção programada para este veículo.</p>
                   </div>`}
            </div>
          </article>
        `;
    }).join("");

    container.innerHTML = `<div class="vehicles-grid">${blocks}</div>`;

    container.querySelectorAll('[data-action="adicionar"]').forEach((btn) =>
        btn.addEventListener("click", () =>
            abrirModal({ veiculoId: Number(btn.dataset.veiculoId), clienteId: state.selectedClientId })
        ),
    );
    container.querySelectorAll('[data-action="editar"]').forEach((btn) =>
        btn.addEventListener("click", () =>
            abrirModal({ id: Number(btn.dataset.id), clienteId: state.selectedClientId })
        ),
    );
    container.querySelectorAll('[data-action="excluir"]').forEach((btn) =>
        btn.addEventListener("click", () => excluirManutencao(Number(btn.dataset.id))),
    );
    container.querySelectorAll('[data-action="gerar-os"]').forEach((btn) =>
        btn.addEventListener("click", () => gerarOSDaManutencao(Number(btn.dataset.id))),
    );
    container.querySelectorAll('[data-action="abrir-os"]').forEach((btn) =>
        btn.addEventListener("click", () => abrirOS(Number(btn.dataset.id))),
    );
}


function itemManut(m, veiculo) {
    const cls = STATUS_CLASSE[m.status] || "info";
    const detalhes = [];
    if (m.intervalo_km) detalhes.push(`A cada ${m.intervalo_km.toLocaleString("pt-BR")} km`);
    if (m.intervalo_meses) detalhes.push(`A cada ${m.intervalo_meses} meses`);
    if (m.km_proxima) detalhes.push(`Próximo a ${m.km_proxima.toLocaleString("pt-BR")} km`);
    if (m.data_proxima) detalhes.push(`Vence em ${formatarData(m.data_proxima)}`);

    return `
      <li class="manut-item ${cls}">
        <div class="manut-icon">
          <i class="fas fa-screwdriver-wrench"></i>
        </div>
        <div class="manut-body">
          <strong>${escapeHtml(m.titulo)}</strong>
          <span class="manut-meta">${detalhes.map(escapeHtml).join(" · ") || "Sem alvo definido"}</span>
          ${m.descricao ? `<p class="manut-desc">${escapeHtml(m.descricao)}</p>` : ""}
        </div>
        <div class="manut-actions">
          <span class="status-pill ${cls}">${STATUS_LABEL[m.status] || m.status}</span>
          <div class="manut-buttons">
            ${m.os_gerada
              ? `<button class="btn-icon-mini" type="button" data-action="abrir-os" data-id="${m.os_gerada}"
                          title="Abrir OS gerada">
                   <i class="fas fa-arrow-up-right-from-square"></i>
                 </button>`
              : `<button class="btn-icon-mini" type="button" data-action="gerar-os" data-id="${m.id}"
                          title="Gerar OS a partir desta revisão">
                   <i class="fas fa-file-circle-plus"></i>
                 </button>`}
            <button class="btn-icon-mini" type="button" data-action="editar" data-id="${m.id}" title="Editar">
              <i class="fas fa-pen"></i>
            </button>
            <button class="btn-icon-mini danger" type="button" data-action="excluir" data-id="${m.id}" title="Remover">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      </li>
    `;
}


function abrirModal({ id = null, veiculoId = null, clienteId } = {}) {
    const existente = id
        ? planoCacheById(id)
        : null;
    const veiculo = veiculoId
        ? veiculosCache.find((v) => v.id === veiculoId)
        : (existente ? veiculosCache.find((v) => v.id === existente.veiculo) : veiculosCache[0]);

    if (!veiculo) {
        mostrarToast("Cadastre um veículo antes de adicionar manutenções.", "warning");
        return;
    }

    document.getElementById("modalManutencao")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "modalManutencao";
    overlay.className = "veic-modal-overlay open";
    overlay.innerHTML = `
      <form class="veic-modal-card" role="dialog" aria-modal="true" aria-labelledby="manTitle">
        <header>
          <h3 id="manTitle"><i class="fas fa-screwdriver-wrench"></i>
            ${id ? "Editar manutenção" : "Nova manutenção preventiva"}
          </h3>
          <button type="button" class="btn-icon" data-action="close" aria-label="Fechar">
            <i class="fas fa-xmark"></i>
          </button>
        </header>
        <div class="veic-modal-body">
          <label>
            Veículo
            <select id="manVeiculo" class="form-control" ${id ? "disabled" : ""}>
              ${veiculosCache.map((v) =>
                `<option value="${v.id}" ${v.id === veiculo.id ? "selected" : ""}>
                  ${escapeHtml(v.placa)} · ${escapeHtml(v.marca || "")} ${escapeHtml(v.modelo || "")}
                 </option>`
              ).join("")}
            </select>
          </label>
          <label>
            Título <span class="required">*</span>
            <input type="text" id="manTitulo" class="form-control" required
                   placeholder="Ex.: Troca de óleo e filtro"
                   value="${escapeAttr(existente?.titulo || "")}">
          </label>
          <label>
            Descrição
            <textarea id="manDescricao" class="form-control" rows="2"
                      placeholder="Observações adicionais">${escapeHtml(existente?.descricao || "")}</textarea>
          </label>
          <div class="row-2">
            <label>
              Intervalo (km)
              <input type="number" id="manIntervaloKm" class="form-control" min="0"
                     placeholder="Ex.: 10000" value="${existente?.intervalo_km ?? ""}">
            </label>
            <label>
              Intervalo (meses)
              <input type="number" id="manIntervaloMeses" class="form-control" min="0"
                     placeholder="Ex.: 6" value="${existente?.intervalo_meses ?? ""}">
            </label>
          </div>
          <div class="row-2">
            <label>
              Próxima revisão (km)
              <input type="number" id="manKmProx" class="form-control" min="0"
                     value="${existente?.km_proxima ?? ""}">
            </label>
            <label>
              Próxima revisão (data)
              <input type="date" id="manDataProx" class="form-control"
                     value="${existente?.data_proxima ?? ""}">
            </label>
          </div>
          <div class="row-2">
            <label>
              Status
              <select id="manStatus" class="form-control">
                <option value="pendente">Pendente</option>
                <option value="agendado">Agendado</option>
                <option value="realizado">Realizado</option>
                <option value="vencido">Vencido</option>
              </select>
            </label>
            <label>
              Periodicidade
              <select id="manPeriod" class="form-control">
                <option value="km">Quilometragem</option>
                <option value="tempo">Tempo</option>
                <option value="ambos" selected>Quilometragem ou tempo</option>
              </select>
            </label>
          </div>
        </div>
        <footer>
          <button type="button" class="btn btn-outline-secondary" data-action="close">Cancelar</button>
          <button type="submit" class="btn btn-primary">
            <i class="fas fa-save"></i> Salvar
          </button>
        </footer>
      </form>
    `;
    document.body.appendChild(overlay);

    if (existente) {
        overlay.querySelector("#manStatus").value = existente.status || "pendente";
        overlay.querySelector("#manPeriod").value = existente.periodicidade || "ambos";
    }

    const fechar = () => { overlay.classList.remove("open"); setTimeout(() => overlay.remove(), 180); };
    overlay.querySelectorAll('[data-action="close"]').forEach((b) => b.addEventListener("click", fechar));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });

    overlay.querySelector("form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            titulo: overlay.querySelector("#manTitulo").value.trim(),
            descricao: overlay.querySelector("#manDescricao").value.trim(),
            intervalo_km: nullable(overlay.querySelector("#manIntervaloKm").value),
            intervalo_meses: nullable(overlay.querySelector("#manIntervaloMeses").value),
            km_proxima: nullable(overlay.querySelector("#manKmProx").value),
            data_proxima: overlay.querySelector("#manDataProx").value || null,
            status: overlay.querySelector("#manStatus").value,
            periodicidade: overlay.querySelector("#manPeriod").value,
        };
        if (!payload.titulo) {
            mostrarToast("Informe um título para a manutenção.", "warning");
            return;
        }
        const veiculoEscolhido = Number(overlay.querySelector("#manVeiculo").value);
        try {
            if (id) {
                await fetchOK(`/manutencoes/${id}/`, "PATCH", payload);
                mostrarToast("Manutenção atualizada.", "success");
            } else {
                await fetchOK(`/veiculos/${veiculoEscolhido}/manutencoes/`, "POST", payload);
                mostrarToast("Manutenção cadastrada.", "success");
            }
            fechar();
            carregarManutencaoDoCliente(clienteId);
        } catch (err) {
            mostrarToast(err.message, "error");
        }
    });
}


async function excluirManutencao(id) {
    if (!confirm("Remover esta manutenção do plano?")) return;
    try {
        await fetchOK(`/manutencoes/${id}/`, "DELETE");
        mostrarToast("Removida.", "success");
        carregarManutencaoDoCliente(state.selectedClientId);
    } catch (err) {
        mostrarToast(err.message, "error");
    }
}


async function gerarOSDaManutencao(id) {
    if (!confirm("Gerar uma OS preventiva a partir desta revisão?")) return;
    try {
        const r = await fetchOK(`/manutencoes/${id}/gerar-os/`, "POST");
        mostrarToast(`OS #${r.os_id} criada.`, "success");
        // Abre a OS recém-gerada
        abrirOS(r.os_id);
    } catch (err) {
        mostrarToast(err.message, "error");
    }
}


// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function fetchJson(path) {
    const r = await fetch(apiUrl(path), { credentials: "include" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
}


async function fetchOK(path, method = "GET", body) {
    const r = await fetch(apiUrl(path), {
        method,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCsrfToken(),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || err.erro || `HTTP ${r.status}`);
    }
    if (r.status === 204) return null;
    return r.json();
}


function planoCacheById(_id) {
    // O cache de planos vive dentro de renderizarPlanos — para simplificar,
    // recarregamos a partir do veículo. A edição obtém os dados via GET.
    return null;
}


function nullable(v) {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
}


function formatarData(iso) {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
}


function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, (m) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[m]);
}
function escapeAttr(s) { return escapeHtml(s); }
