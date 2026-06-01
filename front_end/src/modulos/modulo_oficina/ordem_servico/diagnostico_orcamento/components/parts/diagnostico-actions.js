// diagnostico-actions.js
//
// Ações sobre os itens do orçamento (CRUD): salvar, editar, excluir
// + ações periféricas (enviar para aprovação, gerar PDF).

import { DiagnosticoService } from "../../services/diagnostico-service.js";
import { apiUrl, getCsrfToken } from "../../../../../../shared/config/api-config.js";
import { urlInterna } from "../../../../../../shared/services/base-path.js";
import { state } from "./diagnostico-state.js";
import { gerarRelatorioPDF } from "../../../shared/page/parts/visao-relatorio-pdf.js";


/** Coleta o payload do modal e persiste (criar ou atualizar). */
export async function salvarItem({ aoFinalizar }) {
  const tipo = document.getElementById("itemTipo").value;
  const itemData = tipo === "peca" ? coletarPeca() : coletarServico();

  if (!itemData) return; // validação interna abortou

  const btnSalvar = document.getElementById("btnSalvarItemModal");
  btnSalvar.disabled = true;
  btnSalvar.innerHTML = "Salvando...";

  try {
    if (state.editandoItemId) {
      await DiagnosticoService.atualizarItem(itemData, state.currentOsId, state.editandoItemId);
      alert("Item atualizado com sucesso!");
    } else {
      await DiagnosticoService.salvarItem(itemData, state.currentOsId);
      alert("Item adicionado com sucesso!");
    }
    document.getElementById("modalNovoItem").close();
    await aoFinalizar?.();
  } catch (error) {
    console.error("Erro ao salvar item:", error);
    alert(`Erro ao salvar item: ${error.message}`);
  } finally {
    if (btnSalvar) {
      btnSalvar.disabled = false;
      btnSalvar.innerHTML = "Salvar";
    }
  }
}


function coletarPeca() {
  const valor = parseValorMonetario(document.getElementById("pecaValor").value);
  const nome = document.getElementById("pecaNome").value.trim();
  const descricao = document.getElementById("pecaDescricao").value.trim();
  const nomeCompleto = descricao ? `${nome} - ${descricao}` : nome;

  if (!nomeCompleto) {
    alert("Preencha a descrição do item.");
    return null;
  }
  if (valor <= 0) {
    alert("Informe um valor unitário válido para a peça.");
    return null;
  }

  return {
    tipo: "peca",
    nome_descricao: nomeCompleto,
    quantidade: parseInt(document.getElementById("pecaQtd").value, 10) || 1,
    valor_unitario: valor,
    status_aprovacao: "pendente",
  };
}


function coletarServico() {
  const valor = parseValorMonetario(document.getElementById("servicoPreco").value);
  if (isNaN(valor) || valor <= 0) {
    alert("Informe um valor válido para o serviço.");
    return null;
  }

  const descricao = document.getElementById("servicoDescricao").value.trim();
  if (!descricao) {
    alert("Preencha a descrição do serviço.");
    return null;
  }

  const categoria = document.getElementById("servicoDificuldade").value;
  if (!categoria) {
    alert("Selecione uma categoria/dificuldade.");
    return null;
  }

  return {
    tipo: "servico",
    nome_descricao: descricao,
    quantidade: 1,
    valor_unitario: valor,
    categoria_veiculo: categoria,
    status_aprovacao: "pendente",
  };
}


function parseValorMonetario(str) {
  const limpo = (str || "").replace(/\./g, "").replace(",", ".");
  return parseFloat(limpo) || 0;
}


/** Carrega um item específico e abre o modal em modo edição. */
export async function editarItem(itemId, abrirModalCom) {
  try {
    const item = await DiagnosticoService.getItem(state.currentOsId, itemId);
    abrirModalCom(item);
  } catch (error) {
    console.error("Erro ao carregar item para edição:", error);
    alert(`Erro ao carregar item: ${error.message}`);
  }
}


/** Remove um item do orçamento (com confirmação do usuário). */
export async function deletarItem(itemId, aoFinalizar) {
  if (!confirm("Tem certeza que deseja remover este item?")) return;
  try {
    await DiagnosticoService.deletarItem(state.currentOsId, itemId);
    await aoFinalizar?.();
    alert("Item removido com sucesso!");
  } catch (error) {
    console.error("Erro ao deletar item:", error);
    alert(`Erro ao deletar item: ${error.message}`);
  }
}


/**
 * Envia o diagnóstico para aprovação em uma ação única:
 *  1. POST /os/<id>/enviar-aprovacao/
 *  2. Reseta itens para "pendente" no back-end.
 *  3. Gera código de acesso para o cliente.
 *  4. Exibe modal com o código + instruções de compartilhamento.
 *  5. Navega o usuário para a aba "Aprovação" automaticamente.
 */
export async function enviarParaAprovacao() {
  const osId = state.currentOsId;
  if (!osId) {
    alert("Selecione uma OS antes de enviar para aprovação.");
    return;
  }

  const btn = document.getElementById("btnEnviarAprovacao");
  const original = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando…';
  }

  try {
    const response = await fetch(apiUrl(`/os/${osId}/enviar-aprovacao/`), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCsrfToken(),
      },
      body: JSON.stringify({ validade_dias: 7, max_tentativas: 5 }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.erro || data.detail || "Falha ao enviar para aprovação.");
    }
    exibirModalEnvioConcluido(data, osId);
    irParaAbaAprovacao();
  } catch (err) {
    alert(err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }
}


function exibirModalEnvioConcluido(payload, osId) {
  const modal = document.getElementById("mainModal");
  if (!modal) {
    alert(`Diagnóstico enviado com sucesso! Código: ${payload.codigo?.codigo}`);
    return;
  }
  while (modal.firstChild) modal.removeChild(modal.firstChild);

  const titulo = document.createElement("span");
  titulo.setAttribute("slot", "title");
  titulo.textContent = `OS #${osId} · Enviada para aprovação`;

  const codigoFmt = (payload.codigo?.codigo || "").replace(/(.{4})/, "$1-");
  const link = urlInterna("modulos/modulo_cliente/login/pages/login-cliente.html");
  const mensagem =
    `Olá! Sua Ordem de Serviço já está disponível para aprovação no portal Pit Stop.\n\n` +
    `🔐 Código de acesso: ${codigoFmt}\n` +
    `📅 Válido até: ${payload.codigo?.expira_em}\n\n` +
    `Acesse: ${link}\n` +
    `Informe o código acima junto com seu CPF/CNPJ.`;

  const body = document.createElement("div");
  body.setAttribute("slot", "body");
  body.innerHTML = `
    <div class="envio-aprovacao-state">
      <i class="fas fa-paper-plane fa-2x" style="color: var(--color-success, #16a34a);"></i>
      <h3 style="margin: 0.5rem 0 0.25rem;">${payload.total_itens} item(ns) enviados ao cliente</h3>
      <p style="color: var(--text-secondary, #475569);">
        O cliente pode acompanhar e aprovar pelo portal usando o código abaixo.
      </p>

      <div class="codigo-display ok" style="margin: 1rem auto;">
        <code id="codigoEnvioApr">${codigoFmt}</code>
        <button class="btn-icon" type="button" id="btnCopiarCod" title="Copiar código">
          <i class="fas fa-copy"></i>
        </button>
      </div>
      <small style="display:block; color: var(--text-muted, #94a3b8);">
        Validade: ${payload.codigo?.expira_em} · ${payload.codigo?.max_tentativas} tentativas
      </small>

      <label style="display:block; font-weight:600; margin: 1rem 0 0.4rem;">
        Mensagem para o cliente:
      </label>
      <textarea id="msgEnvioCliente" rows="5"
                style="width:100%; padding: 0.6rem; border-radius:8px; border:1px solid var(--border-medium,#cbd5e1); font-family: inherit;">${mensagem}</textarea>

      <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.75rem;">
        <button class="btn btn-outline-secondary" type="button" id="btnCopiarMsg">
          <i class="fas fa-clipboard"></i> Copiar mensagem
        </button>
        <a class="btn btn-success" id="btnWhats" target="_blank" rel="noopener">
          <i class="fab fa-whatsapp"></i> Enviar por WhatsApp
        </a>
      </div>
    </div>
  `;

  const footer = document.createElement("div");
  footer.setAttribute("slot", "footer");
  footer.innerHTML = `<button class="btn btn-primary close-modal" type="button">Concluído</button>`;

  modal.appendChild(titulo);
  modal.appendChild(body);
  modal.appendChild(footer);
  modal.open?.();

  modal.querySelector(".close-modal")?.addEventListener("click", () => modal.close?.());

  const copiar = async (texto, btn) => {
    try {
      await navigator.clipboard.writeText(texto);
      const original = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-check"></i> Copiado!';
      setTimeout(() => (btn.innerHTML = original), 1500);
    } catch {
      alert("Não foi possível copiar — selecione manualmente.");
    }
  };
  modal
    .querySelector("#btnCopiarCod")
    ?.addEventListener("click", (e) => copiar(codigoFmt, e.currentTarget));
  modal
    .querySelector("#btnCopiarMsg")
    ?.addEventListener("click", (e) =>
      copiar(modal.querySelector("#msgEnvioCliente").value, e.currentTarget),
    );
  const linkWhats = modal.querySelector("#btnWhats");
  if (linkWhats) {
    const atualizar = () => {
      const msg = encodeURIComponent(modal.querySelector("#msgEnvioCliente").value);
      linkWhats.href = `https://wa.me/?text=${msg}`;
    };
    atualizar();
    modal.querySelector("#msgEnvioCliente")?.addEventListener("input", atualizar);
  }
}


function irParaAbaAprovacao() {
  const tabs = document.querySelector("oficina-tabs");
  if (tabs?.activateTab) {
    tabs.activateTab("aprovacao");
  }
}


export function gerarPDF() {
  if (!state.currentOsId) {
    alert("Selecione uma OS antes de gerar o PDF.");
    return;
  }
  gerarRelatorioPDF(state.currentOsId);
}
