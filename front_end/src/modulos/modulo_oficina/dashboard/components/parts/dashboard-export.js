// dashboard-export.js
//
// Exportação do dashboard para PDF com tratamento de gráficos
// e formatação avançada para evitar cortes.

import { state } from './dashboard-state.js';

/**
 * Exporta a aba atualmente visível do dashboard para PDF.
 * Aguarda o carregamento, redimensiona gráficos e gera o arquivo.
 */
export async function exportarPDF() {
  const elemento = document.querySelector('.tab-panel.active');
  if (!elemento) {
    alert('Nenhum conteúdo para exportar.');
    return;
  }

  // Redimensiona todos os gráficos para garantir que estejam atualizados
  Object.values(state.charts).forEach(chart => {
    if (chart && typeof chart.resize === 'function') {
      chart.resize();
    }
  });

  // Feedback visual no botão
  const btn = document.getElementById('btnExportarPDF');
  const originalHTML = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando PDF...';
  }

  try {
    const opt = {
      margin: [10, 10, 10, 10],                     // margens reduzidas
      filename: `dashboard_${new Date().toISOString().slice(0, 10)}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: {
        scale: 1.5,          // escala moderada (evita cortes por excesso de zoom)
        useCORS: true,
        logging: false,
        windowWidth: 1600    // largura virtual da página para captura completa
      },
      jsPDF: {
        unit: 'mm',
        format: 'a3',        // formato maior que A4, ideal para dashboards largos
        orientation: 'landscape'
      },
      pagebreak: { mode: ['css', 'legacy'] }         // permite quebra de página automática
    };

    await html2pdf().set(opt).from(elemento).save();
  } catch (erro) {
    console.error('Erro ao exportar PDF:', erro);
    alert('Não foi possível gerar o PDF. Tente novamente.');
  } finally {
    // Restaura o botão
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  }
}