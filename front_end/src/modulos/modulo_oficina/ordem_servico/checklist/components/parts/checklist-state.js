// checklist-state.js
//
// Estado compartilhado pelos módulos do checklist (wizard, fotos, assinaturas, etc.).
// Importadores devem mutar via referências (ex.: state.currentStep = 2).
//
// Inclui também:
//  - isCanvasBlank: utilitário puro (sem DOM externo) usado pela validação e pelo save
//  - stepValidationMap: regras de validação por passo do wizard

export const state = {
  currentStep: 1,
  currentOsId: null,
  isReadOnlyMode: false,
  fotosExterno: [],
  fotosInterno: [],
  fotosMecanica: [],
  checklistDataCache: null,
  tabsRef: null,
};

/** Retorna true se o canvas estiver totalmente vazio (sem traços). */
export function isCanvasBlank(canvas) {
  if (!canvas) return true;
  const ctx = canvas.getContext("2d");
  const pixelBuffer = new Uint32Array(
    ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer,
  );
  return !pixelBuffer.some((color) => color !== 0);
}

/** Mapa de validação por passo do wizard. Cada validador retorna boolean. */
export const stepValidationMap = {
  1: () => {
    const data = document.querySelector('[name="data_recebimento"]')?.value;
    const consultor = document.querySelector('[name="consultor"]')?.value;
    const km = document.querySelector('[name="km"]')?.value;
    return !!(data && consultor && km);
  },
  2: () => true,
  3: () => true,
  4: () => true,
  5: () =>
    state.fotosExterno.length +
      state.fotosInterno.length +
      state.fotosMecanica.length >=
    4,
  6: () => {
    // Apenas a assinatura do TÉCNICO é exigida no portal da oficina.
    // A assinatura do CLIENTE é coletada via portal do cliente e fica
    // bloqueada/somente-leitura aqui — não impede a finalização.
    const sigTech = document.getElementById("sigTech");
    return !isCanvasBlank(sigTech);
  },
};

/**
 * Aguarda canvases ficarem prontos no passo 6 antes de validar.
 * Centraliza o "delay" que estava espalhado no original.
 */
export async function validarPassoAtual() {
  const validador = stepValidationMap[state.currentStep];
  if (!validador) return true;
  if (state.currentStep === 6) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return validador();
}
