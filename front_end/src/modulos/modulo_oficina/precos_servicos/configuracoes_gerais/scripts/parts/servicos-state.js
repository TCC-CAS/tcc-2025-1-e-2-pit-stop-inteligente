// servicos-state.js
//
// Estado compartilhado da tela "Preços e Serviços" + utilitários puros.

export const CATEGORIAS_PADRAO = [
  { nome: "Carros Populares",         icone: "fa-car-side",       cor: "#22c55e", percentual: 0  },
  { nome: "Carros Elétricos",         icone: "fa-bolt",           cor: "#0ea5e9", percentual: 40 },
  { nome: "Carros de Luxo",           icone: "fa-gem",            cor: "#8b5cf6", percentual: 60 },
  { nome: "Esportivos",               icone: "fa-flag-checkered", cor: "#ef4444", percentual: 80 },
  { nome: "Utilitários e Comerciais", icone: "fa-truck",          cor: "#f59e0b", percentual: 30 },
  { nome: "Minivans e Familiares",    icone: "fa-shuttle-van",    cor: "#6366f1", percentual: 20 },
];


export const state = {
  valorHora: 0,
  categorias: [],
  servicos: [],
};


/** Converte cor hex para rgba com alpha customizado. */
export function hexToRgba(hex, alpha) {
  if (!/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) return hex;
  let c = hex.substring(1).split("");
  if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
  const intVal = parseInt("0x" + c.join(""), 16);
  return `rgba(${(intVal >> 16) & 255}, ${(intVal >> 8) & 255}, ${intVal & 255}, ${alpha})`;
}
