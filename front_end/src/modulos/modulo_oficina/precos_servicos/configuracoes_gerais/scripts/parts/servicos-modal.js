// servicos-modal.js
//
// Modal de criação/edição de Serviço.

import { atualizarPreviewPreco } from "./servicos-render.js";
import { state } from "./servicos-state.js";


export function abrirModalNovoServico() {
  document.getElementById("formServico")?.reset();
  document.getElementById("servicoId").value = "";
  document.getElementById("modalTitulo").innerText = "Novo Serviço";
  document.getElementById("previewTotal").innerText = "0,00";
  document.getElementById("modalServico").classList.add("active");
}


export function fecharModal() {
  document.getElementById("modalServico")?.classList.remove("active");
}


export function abrirModalEdicao(servicoId) {
  const servico = state.servicos.find((s) => s.id === servicoId);
  if (!servico) return;

  document.getElementById("servicoId").value = servico.id;
  document.getElementById("nomeServico").value = servico.nome;
  document.getElementById("descricaoServico").value = servico.descricao || "";
  document.getElementById("tempoServico").value = servico.tempo;

  atualizarPreviewPreco();

  document.getElementById("modalTitulo").innerText = "Editar Serviço";
  document.getElementById("modalServico").classList.add("active");
}


/** Coleta o payload do formulário do modal. Retorna null se inválido. */
export function coletarPayloadServico() {
  const nome = document.getElementById("nomeServico")?.value.trim();
  const tempo = document.getElementById("tempoServico")?.value;
  const descricao = document.getElementById("descricaoServico")?.value || "";

  if (!nome || !tempo) {
    alert("Preencha todos os campos obrigatórios (*)");
    return null;
  }
  return {
    id: document.getElementById("servicoId")?.value || null,
    payload: {
      nome,
      descricao,
      tempo: parseFloat(tempo),
    },
  };
}
