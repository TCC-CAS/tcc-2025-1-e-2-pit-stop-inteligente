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
        'criacao': 'fas fa-plus-circle',
        'checklist': 'fas fa-clipboard-list',
        'diagnostico': 'fas fa-stethoscope',
        'aprovacao': 'fas fa-check-double',
        'execucao': 'fas fa-wrench',
        'conclusao': 'fas fa-flag-checkered',
        'status': 'fas fa-exchange-alt',
        'default': 'fas fa-history'
    };
    return icons[tipo] || icons['default'];
}

function getBadgeClass(tipo) {
    const classes = {
        'criacao': 'bg-primary',
        'checklist': 'bg-info',
        'diagnostico': 'bg-warning',
        'aprovacao': 'bg-success',
        'execucao': 'bg-secondary',
        'conclusao': 'bg-success',
        'status': 'bg-warning',
        'default': 'bg-secondary'
    };
    return classes[tipo] || classes['default'];
}

function renderTimeline(events) {
    const timelineContainer = document.getElementById('timelineBody');
    if (!timelineContainer) return;

    if (!events || events.length === 0) {
        timelineContainer.innerHTML = '<li class="timeline-item text-muted">Nenhum evento registrado.</li>';
        return;
    }

    let html = '';
    events.forEach(event => {
        const tipo = event.tipo || 'default';
        const iconClass = getEventIcon(tipo);
        const badgeClass = getBadgeClass(tipo);
        const dataHora = formatDateTime(event.data_hora || event.created_at);
        const descricao = event.descricao || 'Evento sem descrição';
        const usuario = event.usuario ? `<small class="text-muted ms-2">por ${event.usuario}</small>` : '';

        html += `
            <li class="timeline-item">
                <div class="timeline-icon ${badgeClass}">
                    <i class="${iconClass}"></i>
                </div>
                <div class="timeline-content">
                    <div class="timeline-date">${dataHora}</div>
                    <div class="timeline-title">${descricao} ${usuario}</div>
                    ${event.detalhes ? `<div class="timeline-details text-muted small">${event.detalhes}</div>` : ''}
                </div>
            </li>
        `;
    });
    timelineContainer.innerHTML = html;
}

async function loadHistory(osId) {
    const timelineContainer = document.getElementById('timelineBody');
    if (timelineContainer) {
        timelineContainer.innerHTML = '<li class="timeline-item">Carregando histórico...</li>';
    }

    try {
        // Ajuste a URL conforme seu endpoint real
        const response = await fetch(`http://127.0.0.1:8000/api/oficina/os/${osId}/historico/`);
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }
        const data = await response.json();
        renderTimeline(data);
    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        if (timelineContainer) {
            timelineContainer.innerHTML = '<li class="timeline-item text-danger">Erro ao carregar histórico. Verifique o console.</li>';
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