// cliente-os-api.js
//
// Endpoints da OS para o portal do cliente. Cada função expõe uma chamada
// REST tipada (em comentário) — o tratamento de erro vive no chamador,
// que decide se mostra toast/alert ou empty state.

import { clienteApiFetch } from "./cliente-api-config.js";


export const ClienteOSApi = {
  listarOrdens() {
    return clienteApiFetch("/os/");
  },

  detalheOrdem(osId) {
    return clienteApiFetch(`/os/${osId}/`);
  },

  checklist(osId) {
    return clienteApiFetch(`/os/${osId}/checklist/`);
  },

  assinarChecklist(osId, assinaturaDataUrl) {
    return clienteApiFetch(`/os/${osId}/checklist/assinar/`, {
      method: "POST",
      body: { assinatura: assinaturaDataUrl },
    });
  },

  documentos(osId) {
    return clienteApiFetch(`/os/${osId}/documentos/`);
  },

  historico(osId) {
    return clienteApiFetch(`/os/${osId}/historico/`);
  },

  itens(osId) {
    return clienteApiFetch(`/os/${osId}/itens/`);
  },

  decidirItem(osId, itemId, status, justificativa = "") {
    return clienteApiFetch(`/os/${osId}/itens/${itemId}/decisao/`, {
      method: "POST",
      body: { status, justificativa },
    });
  },

  aprovarOrcamento(osId, itens, termoAceito) {
    return clienteApiFetch(`/os/${osId}/aprovar/`, {
      method: "POST",
      body: { termo_aceito: termoAceito, itens },
    });
  },
};
