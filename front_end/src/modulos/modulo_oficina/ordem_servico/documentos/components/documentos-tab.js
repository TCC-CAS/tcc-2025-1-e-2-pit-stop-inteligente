// documentos-tab.js
const DocumentosService = {
    getDocumentos: async (osId) => {
        // Listagem dos documentos da OS
        const response = await fetch(`http://127.0.0.1:8000/api/oficina/os/${osId}/documentos/`);
        if (!response.ok) throw new Error('Erro ao carregar documentos');
        return response.json();
    },
    uploadDocumentos: async (osId, files) => {
        const formData = new FormData();
        for (let file of files) {
            formData.append('files', file);
        }
        // Endpoint específico para upload (pode ser o mesmo da listagem com POST, mas vamos usar um separado)
        const response = await fetch(`http://127.0.0.1:8000/api/oficina/os/${osId}/documentos/upload/`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error('Erro ao fazer upload');
        return response.json();
    },
    removerDocumento: async (documentoId) => {
        const response = await fetch(`http://127.0.0.1:8000/api/oficina/documentos/${documentoId}/`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Erro ao remover documento');
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
    const osId = currentOsId;
    try {
        const documentos = await DocumentosService.getDocumentos(osId);
        renderizarGrade(gridElement, templateElement, documentos);
    } catch (error) {
        console.error('Erro ao carregar documentos:', error);
    }
}

function renderizarGrade(gridElement, templateElement, documentos) {
    gridElement.innerHTML = '';

    documentos.forEach(doc => {
        const clone = document.importNode(templateElement.content, true);
        const card = clone.querySelector('.doc-card');
        card.dataset.id = doc.id;

        const icon = clone.querySelector('.doc-icon i');
        setIconForType(icon, doc.tipo);

        clone.querySelector('.doc-name').textContent = doc.nome;
        clone.querySelector('.doc-date').textContent = doc.dataInclusao || '';

        const btnRemover = clone.querySelector('.btn-remover-doc');
        btnRemover.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm('Remover este documento?')) {
                await DocumentosService.removerDocumento(doc.id);
                carregarDocumentos(gridElement, templateElement);
            }
        });

        gridElement.appendChild(clone);
    });
}

function setIconForType(iconElement, tipo) {
    const ext = (tipo || '').toLowerCase();
    if (ext.includes('pdf')) {
        iconElement.className = 'fas fa-file-pdf';
    } else if (ext.includes('jpg') || ext.includes('jpeg') || ext.includes('png') || ext.includes('gif')) {
        iconElement.className = 'fas fa-file-image';
    } else if (ext.includes('doc') || ext.includes('docx')) {
        iconElement.className = 'fas fa-file-word';
    } else if (ext.includes('xls') || ext.includes('xlsx')) {
        iconElement.className = 'fas fa-file-excel';
    } else {
        iconElement.className = 'fas fa-file-alt';
    }
}

function abrirModalDocumentos(modalElement, gridElement, templateElement) {
    while (modalElement.firstChild) {
        modalElement.removeChild(modalElement.firstChild);
    }

    const osNumero = document.getElementById('header-os-id')?.textContent || '';

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

    const cloneGrid = gridElement.cloneNode(true);
    cloneGrid.id = 'modalDocsGrid';
    if (modalGrid) {
        modalGrid.replaceWith(cloneGrid);
    } else {
        modalGrid = cloneGrid;
        bodyDiv.appendChild(cloneGrid);
    }

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

    btnUpload.addEventListener('click', async () => {
        const files = fileInput.files;
        if (files.length === 0) return;

        btnUpload.disabled = true;
        btnUpload.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

        try {
            await DocumentosService.uploadDocumentos(currentOsId, files);
            await carregarDocumentos(gridElement, templateElement);
            const novaGrid = gridElement.cloneNode(true);
            novaGrid.id = 'modalDocsGrid';
            const modalGridContainer = modalElement.querySelector('#modalDocsGrid');
            if (modalGridContainer) modalGridContainer.replaceWith(novaGrid);

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