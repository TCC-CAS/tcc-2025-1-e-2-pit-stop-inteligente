function getCSRFToken() {
  const name = "csrftoken";
  const cookies = document.cookie.split(";");
  for (let cookie of cookies) {
    const [key, value] = cookie.trim().split("=");
    if (key === name) return value;
  }
  return "";
}

// diagnostico-service.js
const API_BASE = "http://127.0.0.1:8000/api/oficina";

export const DiagnosticoService = {
  /**
   * Obtém todos os itens de orçamento de uma OS.
   * @param {number} osId - ID da Ordem de Serviço
   * @returns {Promise<Array>}
   */
  async getItensOrcamento(osId) {
    const response = await fetch(`${API_BASE}/os/${osId}/itens/`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Erro ao buscar itens: ${response.status} - ${errorText}`,
      );
    }
    return response.json();
  },

  /**
   * Obtém um item específico.
   * @param {number} osId - ID da OS
   * @param {number} itemId - ID do item
   * @returns {Promise<Object>}
   */
  async getItem(osId, itemId) {
    const response = await fetch(`${API_BASE}/os/${osId}/itens/${itemId}/`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao buscar item: ${response.status} - ${errorText}`);
    }
    return response.json();
  },

  /**
   * Cria um novo item de orçamento.
   * @param {Object} itemData - Dados do item (sem os_id)
   * @param {number} osId - ID da OS
   * @returns {Promise<Object>}
   */
  async salvarItem(itemData, osId) {
    const payload = { ...itemData, os_id: osId };
    const response = await fetch(`${API_BASE}/os/${osId}/itens/`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCSRFToken(),
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao salvar item (${response.status}): ${errorText}`);
    }
    return response.json();
  },

  /**
   * Atualiza um item existente.
   * @param {Object} itemData - Dados a atualizar
   * @param {number} osId - ID da OS
   * @param {number} itemId - ID do item
   * @returns {Promise<Object>}
   */
  async atualizarItem(itemData, osId, itemId) {
    const payload = { ...itemData, os_id: osId };
    const response = await fetch(`${API_BASE}/os/${osId}/itens/${itemId}/`, {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCSRFToken(),
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Erro ao atualizar item: ${response.status} - ${errorText}`,
      );
    }
    return response.json();
  },

  /**
   * Remove um item.
   * @param {number} osId - ID da OS
   * @param {number} itemId - ID do item
   * @returns {Promise<boolean>}
   */
  async deletarItem(osId, itemId) {
    const response = await fetch(`${API_BASE}/os/${osId}/itens/${itemId}/`, {
      method: "DELETE",
      credentials: "include",
      headers: { "X-CSRFToken": getCSRFToken() },
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Erro ao deletar item: ${response.status} - ${errorText}`,
      );
    }
    return true;
  },

  /**
   * Atualiza o status de aprovação de um ou mais itens.
   * @param {number} osId - ID da OS
   * @param {Array} itensStatus - Lista de objetos { id, status }
   * @returns {Promise<Object>}
   */
  async atualizarStatusItens(osId, itensStatus) {
    const response = await fetch(`${API_BASE}/os/${osId}/itens/status/`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCSRFToken(),
      },
      body: JSON.stringify({ itens: itensStatus }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Erro ao atualizar status: ${response.status} - ${errorText}`,
      );
    }
    return response.json();
  },

  // --- NOVOS MÉTODOS PARA AUTOCOMPLETE ---

  async getServicos() {
    const response = await fetch(`${API_BASE}/servicos/`);
    if (!response.ok) throw new Error("Erro ao buscar serviços");
    return response.json();
  },

  async getCategorias() {
    const response = await fetch(`${API_BASE}/categorias/`);
    if (!response.ok) throw new Error("Erro ao buscar categorias");
    return response.json();
  },

  async getConfiguracao() {
    const response = await fetch(`${API_BASE}/configuracao/`);
    if (!response.ok) throw new Error("Erro ao buscar configuracao");
    return response.json();
  },
};
