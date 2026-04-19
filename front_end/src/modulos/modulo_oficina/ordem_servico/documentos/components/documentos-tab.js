// documentos-tab.js
function getCSRFToken() {
    const name = 'csrftoken';
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const [key, value] = cookie.trim().split('=');
        if (key === name) return value;
    }
    return '';
}

const API_BASE = 'http://127.0.0.1:8000/api/oficina';

const DocumentosService = {
    getDocumentos: async (osId) => {
        const response = await fetch(`${API_BASE}/os/${osId}/documentos/`);
        if (!response.ok) throw new Error('Erro ao carregar documentos');
        const data = await response.json();
        // Garantir que cada documento tenha uma URL completa para download
        return data.map(doc => ({
            ...doc,
            download_url: doc.arquivo_url || `${API_BASE}/documentos/${doc.id}/download/`
        }));
    },
    uploadDocumentos: async (osId, files) => {
        const formData = new FormData();
        for (let file of files) {
            formData.append('files', file);
        }
        const response = await fetch(`${API_BASE}/os/${osId}/documentos/upload/`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'X-CSRFToken': getCSRFToken() },
            body: formData
        });
        if (!response.ok) throw new Error('Erro ao fazer upload');
        return response.json();
    },
    removerDocumento: async (documentoId) => {
        const response = await fetch(`${API_BASE}/documentos/${documentoId}/`, {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'X-CSRFToken': getCSRFToken() }
        });
        if (!response.ok) throw new Error('Erro ao remover documento');
    },
    downloadDocumento: async (documentoId, url) => {
        // Abrir em nova aba ou forçar download
        window.open(url, '_blank');
    }
};

let currentOsId = null;

export function initDocumentos(osId) {
    currentOsId = osId;
    if (!currentOsId) return;

    const btnIncluir = document.getElementById('btnIncluirDocumento');
    const grid = document.getElementById('docsGridBody');
    const modal = document.getElementById('mainModal');
    const tmplDoc = document.getElementById('tmplDocumento');

    if (!btnIncluir || !grid || !modal || !tmplDoc) {
        console.error('Elementos obrigatórios não encontrados na aba Documentos.');
        return;
    }

    carregarDocumentos(grid, tmplDoc);

    btnIncluir.addEventListener('click', () => {
        abrirModalDocumentos(modal, grid, tmplDoc);
    });
}

async function carregarDocumentos(gridElement, templateElement) {
    try {
        const documentos = await DocumentosService.getDocumentos(currentOsId);
        renderizarGrade(gridElement, templateElement, documentos);
    } catch (error) {
        console.error('Erro ao carregar documentos:', error);
        gridElement.innerHTML = '<div class="error-message">Erro ao carregar documentos.</div>';
    }
}

function renderizarGrade(gridElement, templateElement, documentos) {
    gridElement.innerHTML = '';

    if (documentos.length === 0) {
        gridElement.innerHTML = '<div class="empty-state">Nenhum documento anexado.</div>';
        return;
    }

    documentos.forEach(doc => {
        const clone = document.importNode(templateElement.content, true);
        const card = clone.querySelector('.doc-card');
        card.dataset.id = doc.id;
        card.dataset.url = doc.download_url;

        // Ícone conforme extensão
        const icon = clone.querySelector('.doc-icon i');
        setIconForType(icon, doc.tipo || doc.nome);

        clone.querySelector('.doc-name').textContent = doc.nome;
        clone.querySelector('.doc-date').textContent = doc.dataInclusao || '';

        // Clique no card para baixar/visualizar
        card.addEventListener('click', (e) => {
            if (e.target.closest('.btn-remover-doc')) return; // evitar conflito
            DocumentosService.downloadDocumento(doc.id, doc.download_url);
        });

        // Botão remover
        const btnRemover = clone.querySelector('.btn-remover-doc');
        btnRemover.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`Remover "${doc.nome}" permanentemente?`)) {
                try {
                    await DocumentosService.removerDocumento(doc.id);
                    carregarDocumentos(gridElement, templateElement);
                } catch (error) {
                    console.error(error);
                    alert('Erro ao remover documento.');
                }
            }
        });

        gridElement.appendChild(clone);
    });
}

function setIconForType(iconElement, nomeOuExtensao) {
    const ext = (nomeOuExtensao || '').split('.').pop().toLowerCase();
    if (ext === 'pdf') {
        iconElement.className = 'fas fa-file-pdf';
    } else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) {
        iconElement.className = 'fas fa-file-image';
    } else if (['doc', 'docx'].includes(ext)) {
        iconElement.className = 'fas fa-file-word';
    } else if (['xls', 'xlsx'].includes(ext)) {
        iconElement.className = 'fas fa-file-excel';
    } else if (['txt', 'rtf'].includes(ext)) {
        iconElement.className = 'fas fa-file-alt';
    } else {
        iconElement.className = 'fas fa-file';
    }
}

function abrirModalDocumentos(modalElement, gridElement, templateElement) {
    // Limpa conteúdo anterior do modal
    while (modalElement.firstChild) {
        modalElement.removeChild(modalElement.firstChild);
    }

    const osNumero = document.getElementById('header-os-id')?.textContent || currentOsId;

    const titleSpan = document.createElement('span');
    titleSpan.setAttribute('slot', 'title');
    titleSpan.textContent = `Documentos - OS #${osNumero}`;

    const bodyDiv = document.createElement('div');
    bodyDiv.setAttribute('slot', 'body');
    bodyDiv.innerHTML = `
        <div class="upload-area">
            <label for="fileUpload" class="btn btn-secondary">
                <i class="fas fa-cloud-upload-alt"></i> Selecionar arquivos
            </label>
            <input type="file" id="fileUpload" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" style="display: none;">
            <span class="selected-files"></span>
            <button class="btn btn-primary" id="btnUploadArquivos" disabled>Enviar arquivos</button>
        </div>
        <div class="docs-grid modal-docs-grid" id="modalDocsGrid"></div>
    `;

    const footerDiv = document.createElement('div');
    footerDiv.setAttribute('slot', 'footer');
    footerDiv.innerHTML = `
        <button class="btn btn-secondary close-modal" type="button">Fechar</button>
    `;

    modalElement.appendChild(titleSpan);
    modalElement.appendChild(bodyDiv);
    modalElement.appendChild(footerDiv);

    const fileInput = modalElement.querySelector('#fileUpload');
    const btnUpload = modalElement.querySelector('#btnUploadArquivos');
    const selectedSpan = modalElement.querySelector('.selected-files');
    let modalGrid = modalElement.querySelector('#modalDocsGrid');

    // Clona a grade atual para dentro do modal
    const cloneGrid = gridElement.cloneNode(true);
    cloneGrid.id = 'modalDocsGrid';
    if (modalGrid) {
        modalGrid.replaceWith(cloneGrid);
    } else {
        bodyDiv.appendChild(cloneGrid);
    }

    // Atualiza a grade sempre que o modal abrir
    carregarDocumentos(cloneGrid, templateElement);

    fileInput.addEventListener('change', () => {
        const files = fileInput.files;
        if (files.length > 0) {
            selectedSpan.textContent = `${files.length} arquivo(s) selecionado(s)`;
            btnUpload.disabled = false;
        } else {
            selectedSpan.textContent = '';
            btnUpload.disabled = true;
        }
    });

    btnUpload.addEventListener('click', async (event) => {
        event.preventDefault();
        const files = fileInput.files;
        if (files.length === 0) return;

        btnUpload.disabled = true;
        btnUpload.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

        try {
            await DocumentosService.uploadDocumentos(currentOsId, files);
            // Recarrega a grade principal e a do modal
            await carregarDocumentos(gridElement, templateElement);
            const novaGrid = gridElement.cloneNode(true);
            novaGrid.id = 'modalDocsGrid';
            const modalGridContainer = modalElement.querySelector('#modalDocsGrid');
            if (modalGridContainer) modalGridContainer.replaceWith(novaGrid);
            await carregarDocumentos(novaGrid, templateElement);

            fileInput.value = '';
            selectedSpan.textContent = '';
            btnUpload.disabled = true;
            btnUpload.innerHTML = 'Enviar arquivos';
        } catch (error) {
            console.error('Erro no upload:', error);
            alert('Erro ao enviar arquivos. Verifique o console.');
            btnUpload.disabled = false;
            btnUpload.innerHTML = 'Enviar arquivos';
        }
    });

    modalElement.querySelector('.close-modal').addEventListener('click', () => modalElement.close());
    modalElement.open();
}