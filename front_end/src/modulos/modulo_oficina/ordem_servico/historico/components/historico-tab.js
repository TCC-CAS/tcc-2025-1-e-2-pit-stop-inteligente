// historico-tab.js
import { jsPDF } from 'https://cdn.skypack.dev/jspdf@2.5.1';
import html2canvas from 'https://cdn.skypack.dev/html2canvas@1.4.1';

let currentOSId = null;

function formatDateTime(dateString) {
    if (!dateString) return '--/--/---- --:--';
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getEventIcon(tipo) {
    const icons = {
        'criacao': 'fa-plus-circle',
        'checklist': 'fa-clipboard-list',
        'diagnostico': 'fa-stethoscope',
        'aprovacao': 'fa-check-double',
        'execucao': 'fa-wrench',
        'conclusao': 'fa-flag-checkered',
        'status': 'fa-exchange-alt',
        'default': 'fa-history'
    };
    return icons[tipo] || icons['default'];
}

function getEventColor(tipo) {
    const colors = {
        'criacao': 'var(--primary)',
        'checklist': 'var(--info)',
        'diagnostico': 'var(--warning)',
        'aprovacao': 'var(--success)',
        'execucao': 'var(--secondary)',
        'conclusao': 'var(--success-dark)',
        'status': 'var(--warning-dark)',
        'default': 'var(--gray)'
    };
    return colors[tipo] || colors['default'];
}

function renderTimeline(events) {
    const timelineContainer = document.getElementById('timelineBody');
    if (!timelineContainer) return;

    if (!events || events.length === 0) {
        timelineContainer.innerHTML = '<div class="timeline-empty">Nenhum evento registrado.</div>';
        return;
    }

    let html = '';
    events.forEach((event, index) => {
        const tipo = event.tipo || 'default';
        const iconClass = getEventIcon(tipo);
        const color = getEventColor(tipo);
        const dataHora = formatDateTime(event.data_hora || event.created_at);
        const descricao = event.descricao || 'Evento sem descrição';
        const usuario = event.usuario ? `<span class="timeline-author">por ${escapeHtml(event.usuario)}</span>` : '';

        html += `
            <div class="timeline-item">
                <div class="timeline-marker" style="background-color: ${color};">
                    <i class="fas ${iconClass}"></i>
                </div>
                <div class="timeline-content">
                    <div class="timeline-date">${dataHora}</div>
                    <div class="timeline-title">${escapeHtml(descricao)} ${usuario}</div>
                    ${event.detalhes ? `<div class="timeline-details">${escapeHtml(event.detalhes)}</div>` : ''}
                </div>
            </div>
        `;
    });
    timelineContainer.innerHTML = html;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

async function loadHistory(osId) {
    const timelineContainer = document.getElementById('timelineBody');
    if (timelineContainer) {
        timelineContainer.innerHTML = '<div class="timeline-loading">Carregando histórico...</div>';
    }

    try {
        const response = await fetch(`http://127.0.0.1:8000/api/oficina/os/${osId}/historico/`);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        renderTimeline(data);
    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        if (timelineContainer) {
            timelineContainer.innerHTML = '<div class="timeline-error">Erro ao carregar histórico. Verifique o console.</div>';
        }
    }
}

async function exportToPDF() {
    const timelineContainer = document.querySelector('.timeline-container');
    if (!timelineContainer) return;

    const btn = document.getElementById('btnExportarHistoricoPDF');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando PDF...';
    btn.disabled = true;

    try {
        const clone = timelineContainer.cloneNode(true);
        clone.style.margin = '0';
        clone.style.padding = '20px';
        clone.style.backgroundColor = '#fff';
        const title = document.createElement('h2');
        title.textContent = `Histórico da OS #${currentOSId}`;
        title.style.marginBottom = '20px';
        title.style.fontFamily = 'sans-serif';
        clone.insertBefore(title, clone.firstChild);

        clone.style.position = 'absolute';
        clone.style.top = '-9999px';
        clone.style.left = '-9999px';
        document.body.appendChild(clone);

        const canvas = await html2canvas(clone, {
            scale: 2,
            logging: false,
            useCORS: true,
            backgroundColor: '#ffffff'
        });
        const imgData = canvas.toDataURL('image/png');

        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgWidth = 190;
        const pageHeight = 297;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft > 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }

        pdf.save(`historico_os_${currentOSId}.pdf`);
        document.body.removeChild(clone);
    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        alert('Não foi possível gerar o PDF. Tente novamente mais tarde.');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

export function initHistorico(osId) {
    currentOSId = osId;
    if (!osId) {
        console.warn('initHistorico called without osId');
        return;
    }
    loadHistory(osId);

    const exportBtn = document.getElementById('btnExportarHistoricoPDF');
    if (exportBtn) {
        const newBtn = exportBtn.cloneNode(true);
        exportBtn.parentNode.replaceChild(newBtn, exportBtn);
        newBtn.addEventListener('click', exportToPDF);
    }
}