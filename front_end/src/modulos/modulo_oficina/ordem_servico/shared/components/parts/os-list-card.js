// os-list-card.js
//
// Construção de cada card de OS na lista lateral.
// Recebe callbacks externos para selecionar / excluir, mantendo
// o componente principal desacoplado.

import { excluirOrdem } from "./os-list-api.js";
import "../../../../../../shared/components/status-badge.js";


/**
 * Cria o elemento DOM de um card de OS.
 *
 * @param {object} os               registro da OS (vindo do back)
 * @param {object} callbacks
 * @param {(os) => void}  callbacks.onSelect    chamado ao clicar no card
 * @param {() => void}    callbacks.onChange    chamado após exclusão bem-sucedida
 */
export function criarCardOS(os, { onSelect, onChange }) {
  const el = document.createElement("div");
  el.className = "os-card";
  el.setAttribute("data-id", os.id);
  el.setAttribute("data-status", os.status);
  el.innerHTML = `
    <div class="os-card-header">
      <span class="os-id">#${os.id}</span>
      <status-badge type="os" status="${os.status}" size="sm"></status-badge>
    </div>
    <div class="os-info">
      <strong>${os.veiculo_modelo || "Sem modelo"}</strong>
      <span>${os.veiculo_placa || "Sem placa"}</span>
    </div>
    <div class="os-client">
      <i class="fas fa-user"></i> ${os.cliente_nome || "Sem cliente"}
    </div>
  `;

  el.appendChild(criarBotaoExcluir(os, onChange));
  el.addEventListener("click", () => onSelect?.(os, el));

  return el;
}


function criarBotaoExcluir(os, onChange) {
  const btn = document.createElement("button");
  btn.className = "delete-os-btn";
  btn.innerHTML = '<i class="fas fa-trash"></i>';
  btn.title = `Excluir OS #${os.id}`;
  btn.setAttribute("aria-label", `Excluir OS número ${os.id}`);

  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm(`Tem certeza que deseja excluir a OS #${os.id}?`)) return;

    try {
      await excluirOrdem(os.id);
      alert("OS excluída com sucesso.");
      onChange?.();
    } catch (err) {
      console.error("Erro ao excluir OS:", err);
      alert(`Erro ao excluir OS: ${err.message}`);
    }
  });

  return btn;
}
