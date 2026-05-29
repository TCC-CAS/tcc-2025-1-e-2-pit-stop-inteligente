// visao-utils.js
//
// Utilitários compartilhados pela página de visão geral da OS.

/**
 * Aplica máscara de CPF/CNPJ progressivamente. Decide qual padrão usar
 * por quantidade de dígitos (≤11 = CPF, ≥12 = CNPJ). Funciona enquanto
 * o usuário digita — não exige campo já preenchido por inteiro.
 *
 *   "1234567"          → "123.456.7"
 *   "12345678901"      → "123.456.789-01"      (CPF)
 *   "12345678000190"   → "12.345.678/0001-90"  (CNPJ)
 */
export function formatarCPFouCNPJ(valor) {
  if (valor === null || valor === undefined) return "";
  const digitos = String(valor).replace(/\D/g, "").slice(0, 14);
  if (digitos.length === 0) return "";

  if (digitos.length <= 11) {
    return digitos
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }
  return digitos
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}


/** Retorna apenas os dígitos de uma string. */
export function apenasDigitos(valor) {
  return (valor || "").replace(/\D/g, "");
}


/**
 * Vincula a máscara CPF/CNPJ a um <input>. Idempotente: chamadas extras
 * substituem o listener anterior. Aceita modo "paste", e preserva a
 * posição do cursor.
 */
export function vincularMascaraCpfCnpj(input) {
  if (!input) return;
  if (input._mascaraCpfCnpjHandler) {
    input.removeEventListener("input", input._mascaraCpfCnpjHandler);
  }
  const handler = (e) => {
    const alvo = e.target;
    const cursor = alvo.selectionEnd ?? alvo.value.length;
    const antes = alvo.value.length;
    alvo.value = formatarCPFouCNPJ(alvo.value);
    const delta = alvo.value.length - antes;
    try {
      const novaPos = Math.max(0, cursor + delta);
      alvo.setSelectionRange(novaPos, novaPos);
    } catch {
      /* navegadores antigos não suportam */
    }
  };
  input.addEventListener("input", handler);
  input._mascaraCpfCnpjHandler = handler;
  input.setAttribute("inputmode", "numeric");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("maxlength", "18"); // 14 dígitos + 4 separadores
  // Já normaliza valor inicial se houver
  if (input.value) input.value = formatarCPFouCNPJ(input.value);
}
