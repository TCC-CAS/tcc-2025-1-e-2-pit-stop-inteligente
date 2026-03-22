// front_end/src/modulos/modulo_oficina/ordem_servico/checklist/components/checklist-tab.js

import { ChecklistService } from '../services/checklist-service.js';

let currentStep = 1;
let tabsRef = null;
let photos = [];
let currentOsId = null;

export function initChecklist(tabsComponent, osId) {
    tabsRef = tabsComponent;
    currentOsId = osId;

    const btnOpen = document.getElementById('btnOpenChecklist');
    if (btnOpen) {
        btnOpen.onclick = openWizard;
    }

    if (osId) {
        carregarResumoChecklist(osId);
    }
}

async function carregarResumoChecklist(osId) {
    try {
        const dados = await ChecklistService.buscarChecklist(osId);
        const statusCard = document.getElementById('checklistStatusCard');
        const statusTitle = document.getElementById('statusTitle');
        const statusDesc = document.getElementById('statusDesc');
        const btnOpen = document.getElementById('btnOpenChecklist');
        const summaryStatus = document.getElementById('summaryStatus');
        const summaryDate = document.getElementById('summaryDate');
        const summaryResponsible = document.getElementById('summaryResponsible');
        const summarySignClient = document.getElementById('summarySignClient');
        const summarySignTech = document.getElementById('summarySignTech');
        const summaryPhotosCount = document.getElementById('summaryPhotosCount');

        if (dados && dados.concluido) {
            // Checklist concluído
            statusTitle.innerHTML = '<i class="fas fa-check-circle"></i> Checklist Concluído';
            statusDesc.innerText = 'Checklist já foi preenchido e assinado. As demais etapas estão liberadas.';
            if (btnOpen) {
                btnOpen.style.display = 'none'; // ou muda para "Visualizar" se desejar
            }
            summaryStatus.innerText = 'Concluído';
            summaryStatus.className = 'badge badge-success';
            summarySignClient.innerHTML = '<i class="fas fa-check-circle"></i> Assinado';
            summarySignTech.innerHTML = '<i class="fas fa-check-circle"></i> Assinado';

            if (dados.criado_em) {
                summaryDate.innerText = new Date(dados.criado_em).toLocaleDateString();
            } else {
                summaryDate.innerText = '-';
            }

            // Se você tiver campos adicionais no backend (consultor, fotos), ajuste aqui
            // Exemplo: summaryResponsible.innerText = dados.consultor || '-';
            // Exemplo: summaryPhotosCount.innerText = (dados.fotos?.length || 0) + ' fotos';

            if (tabsRef && typeof tabsRef.setLockedByChecklist === 'function') {
                tabsRef.setLockedByChecklist(true);
            }
        } else {
            // Checklist pendente
            statusTitle.innerHTML = '<i class="fas fa-exclamation-circle"></i> Checklist Pendente';
            statusDesc.innerText = 'A O.S. está bloqueada. O preenchimento e assinatura são obrigatórios para liberar as demais etapas.';
            if (btnOpen) {
                btnOpen.style.display = 'inline-block';
            }
            summaryStatus.innerText = 'Pendente';
            summaryStatus.className = 'badge badge-warning';
            summarySignClient.innerHTML = '<i class="fas fa-times-circle"></i> Não assinado';
            summarySignTech.innerHTML = '<i class="fas fa-times-circle"></i> Não assinado';
            summaryDate.innerText = '-';
            summaryResponsible.innerText = '-';
            summaryPhotosCount.innerText = '0 fotos';

            if (tabsRef && typeof tabsRef.setLockedByChecklist === 'function') {
                tabsRef.setLockedByChecklist(false);
            }
        }
    } catch (error) {
        console.log('Nenhum checklist encontrado para esta OS.', error);
        // Se não existir, trata como pendente
        const statusTitle = document.getElementById('statusTitle');
        const statusDesc = document.getElementById('statusDesc');
        const btnOpen = document.getElementById('btnOpenChecklist');
        if (statusTitle) statusTitle.innerHTML = '<i class="fas fa-exclamation-circle"></i> Checklist Pendente';
        if (statusDesc) statusDesc.innerText = 'A O.S. está bloqueada. O preenchimento e assinatura são obrigatórios para liberar as demais etapas.';
        if (btnOpen) btnOpen.style.display = 'inline-block';
    }
}

function openWizard() {
    const modal = document.getElementById('modalChecklist');
    const body = document.getElementById('checklist-wizard-body');
    const temp = document.getElementById('wizardTemplate');

    if (temp && body) {
        body.innerHTML = '';
        body.appendChild(temp.content.cloneNode(true));
    }

    currentStep = 1;
    photos = [];

    setupWizardListeners();
    updateUI();

    if (modal && typeof modal.open === 'function') {
        modal.open();
    } else {
        console.error('Modal não encontrada ou método open inexistente');
    }
}

function setupWizardListeners() {
    const btnNext = document.getElementById('btnProximoPasso');
    const btnPrev = document.getElementById('btnAnteriorPasso');
    const btnSave = document.getElementById('btnSalvarChecklist');

    if (btnNext) {
        btnNext.onclick = () => {
            if (currentStep < 6) {
                currentStep++;
                updateUI();
            }
        };
    }

    if (btnPrev) {
        btnPrev.onclick = () => {
            if (currentStep > 1) {
                currentStep--;
                updateUI();
            }
        };
    }

    if (btnSave) {
        btnSave.onclick = finishChecklist;
    }

    setTimeout(() => {
        configurarCanvas('sigClient');
        configurarCanvas('sigTech');
    }, 100);

    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    if (dropZone && fileInput) {
        dropZone.onclick = () => fileInput.click();
        fileInput.onchange = (e) => {
            const files = Array.from(e.target.files);
            files.forEach(file => photos.push(file));
            atualizarPreviewFotos();
        };
    }

    atualizarPassosWizard();
}

function atualizarPassosWizard() {
    const steps = document.querySelectorAll('.wizard-step');
    steps.forEach(step => {
        step.classList.remove('active');
        if (parseInt(step.dataset.step) === currentStep) {
            step.classList.add('active');
        }
    });
}

async function finishChecklist() {
    const sigClient = document.getElementById('sigClient');
    const sigTech = document.getElementById('sigTech');
    const btnSave = document.getElementById('btnSalvarChecklist');

    if (isCanvasBlank(sigClient)) {
        alert("Assinatura do cliente é obrigatória!");
        return;
    }
    if (isCanvasBlank(sigTech)) {
        alert("Assinatura do técnico é obrigatória!");
        return;
    }

    if (!currentOsId) {
        alert("Nenhuma OS selecionada. Crie uma OS primeiro.");
        return;
    }

    // Coletar dados dos campos adicionais
    const dataRecebimento = document.querySelector('[name="data_recebimento"]')?.value || new Date().toISOString().split('T')[0];
    const consultor = document.querySelector('[name="consultor"]')?.value || 'Admin';

    const dadosParaSalvar = {
        concluido: true,
        assinatura_cliente: sigClient.toDataURL('image/png'),
        assinatura_tecnico: sigTech.toDataURL('image/png'),
        data_recebimento: dataRecebimento,
        consultor: consultor,
        // O backend atualmente só espera os campos do modelo, então podemos ignorar fotos por enquanto
    };

    try {
        btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        btnSave.disabled = true;

        await ChecklistService.salvarChecklist(currentOsId, dadosParaSalvar);

        document.getElementById('modalChecklist').close();

        // Recarrega o resumo (isso atualizará toda a interface)
        await carregarResumoChecklist(currentOsId);

        // Atualiza status da OS no backend para 'checklist_concluido' (opcional)
        await fetch(`http://127.0.0.1:8000/api/oficina/os/${currentOsId}/`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'checklist_concluido' })
        });

        alert("Checklist salvo com sucesso!");

    } catch (erro) {
        console.error(erro);
        alert("Erro ao salvar o checklist.");
    } finally {
        btnSave.innerHTML = 'Salvar e Concluir';
        btnSave.disabled = false;
    }
}

function updateUI() {
    const panels = document.querySelectorAll('.wizard-panel');
    panels.forEach(p => {
        p.style.display = parseInt(p.dataset.step) === currentStep ? 'block' : 'none';
    });

    const btnNext = document.getElementById('btnProximoPasso');
    const btnPrev = document.getElementById('btnAnteriorPasso');
    const btnSave = document.getElementById('btnSalvarChecklist');

    if (currentStep === 6) {
        if (btnNext) btnNext.style.display = 'none';
        if (btnPrev) btnPrev.style.display = 'inline-block';
        if (btnSave) btnSave.style.display = 'inline-block';
    } else {
        if (btnNext) btnNext.style.display = 'inline-block';
        if (btnPrev) btnPrev.style.display = currentStep > 1 ? 'inline-block' : 'none';
        if (btnSave) btnSave.style.display = 'none';
    }

    atualizarPassosWizard();
}

function isCanvasBlank(canvas) {
    if (!canvas) return true;
    const blank = document.createElement('canvas');
    blank.width = canvas.width;
    blank.height = canvas.height;
    return canvas.toDataURL() === blank.toDataURL();
}

window.clearSig = function(id) {
    const canvas = document.getElementById(id);
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
};

function configurarCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let desenhando = false;

    canvas.width = canvas.parentElement.offsetWidth || 400;
    canvas.height = canvas.parentElement.offsetHeight || 150;

    const iniciarDesenho = (e) => {
        desenhando = true;
        desenhar(e);
    };

    const pararDesenho = () => {
        desenhando = false;
        ctx.beginPath();
    };

    const desenhar = (e) => {
        if (!desenhando) return;
        e.preventDefault();

        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#0f172a';

        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const x = clientX - rect.left;
        const y = clientY - rect.top;

        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    canvas.addEventListener('mousedown', iniciarDesenho);
    canvas.addEventListener('mouseup', pararDesenho);
    canvas.addEventListener('mousemove', desenhar);
    canvas.addEventListener('mouseout', pararDesenho);

    canvas.addEventListener('touchstart', iniciarDesenho, { passive: false });
    canvas.addEventListener('touchend', pararDesenho);
    canvas.addEventListener('touchmove', desenhar, { passive: false });
}

function atualizarPreviewFotos() {
    const grid = document.getElementById('photoPreviewGrid');
    if (!grid) return;
    grid.innerHTML = '';
    photos.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.style.cssText = `
                width: 80px; height: 80px;
                background-image: url(${e.target.result});
                background-size: cover;
                background-position: center;
                border-radius: 8px; border: 1px solid #cbd5e1;
            `;
            grid.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
}