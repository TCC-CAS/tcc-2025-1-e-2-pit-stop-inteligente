// aprovacao-pdf.js
//
// Exportação para PDF do conteúdo da modal de aprovação. Usa html2pdf
// (carregado dinamicamente via CDN somente quando o usuário clica em Exportar).

import { state } from "./aprovacao-state.js";


const HTML2PDF_CDN =
  new URL("../../../../../../shared/vendor/html2pdf/html2pdf.bundle.min.js", import.meta.url).href;


export function configurarExportacaoPDF() {
  const btn = document.getElementById("btnExportarPDF");
  if (!btn) return;

  btn.addEventListener("click", () => exportar(btn));
}


async function exportar(btn) {
  const container = document.querySelector(".aprovacao-modal-container");
  if (!container) return;

  try {
    if (typeof html2pdf === "undefined") {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';
      await carregarScript(HTML2PDF_CDN);
    }
    await html2pdf().set(opcoes()).from(container).save();
  } catch (error) {
    console.error("Erro ao gerar PDF:", error);
    alert("Não foi possível gerar o PDF. Tente novamente.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-file-pdf"></i> Exportar PDF';
  }
}


function opcoes() {
  return {
    margin: [10, 10, 10, 10],
    filename: `aprovacao-orcamento-${state.currentOsId}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
  };
}


function carregarScript(url) {
  return new Promise((resolve, reject) => {
    if (typeof html2pdf !== "undefined") return resolve();
    const script = document.createElement("script");
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Falha ao carregar " + url));
    document.head.appendChild(script);
  });
}
