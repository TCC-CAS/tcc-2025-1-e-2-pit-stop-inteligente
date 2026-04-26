// execucao-tab.js
const ExecucaoService = {
    getCSRFToken() {
        const name = 'csrftoken';
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [key, value] = cookie.trim().split('=');
            if (key === name) return value;
        }
        return '';
    },

    async _extractErrorMessage(response) {
        let errorMsg = `Erro ${response.status}: ${response.statusText}`;
        try {
            const errorData = await response.json();
            errorMsg = errorData.detail || errorData.message || JSON.stringify(errorData);
        } catch (e) {
            try {
                const text = await response.text();
                if (text) errorMsg = text;
            } catch (textError) {}
        }
        return errorMsg;
    },

    async getTarefas(osId) {
        const response = await fetch(`http://127.0.0.1:8000/api/oficina/os/${osId}/tarefas/`, {
            credentials: 'include',
            headers: { 'X-CSRFToken': this.getCSRFToken() },
            cache: 'no-store'
        });
        if (!response.ok) {
            const errorMsg = await this._extractErrorMessage(response);
            throw new Error(`Erro ao buscar: ${errorMsg}`);
        }
        return response.json();
    },

    async salvarTarefa(osId, tarefaData) {
        const response = await fetch(`http://127.0.0.1:8000/api/oficina/os/${osId}/tarefas/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': this.getCSRFToken()
            },
            body: JSON.stringify(tarefaData),
            credentials: 'include'
        });
        if (!response.ok) {
            const errorMsg = await this._extractErrorMessage(response);
            throw new Error(errorMsg);
        }
        return response.json();
    },

    async atualizarTarefa(osId, tarefaId, tarefaData) {
        const response = await fetch(`http://127.0.0.1:8000/api/oficina/os/${osId}/tarefas/${tarefaId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': this.getCSRFToken()
            },
            body: JSON.stringify(tarefaData),
            credentials: 'include'
        });
        if (!response.ok) {
            const errorMsg = await this._extractErrorMessage(response);
            throw new Error(errorMsg);
        }
        return response.json();
    },

    async deletarTarefa(osId, tarefaId) {
        const response = await fetch(`http://127.0.0.1:8000/api/oficina/os/${osId}/tarefas/${tarefaId}/`, {
            method: 'DELETE',
            headers: { 'X-CSRFToken': this.getCSRFToken() },
            credentials: 'include'
        });
        if (!response.ok) {
            const errorMsg = await this._extractErrorMessage(response);
            throw new Error(errorMsg);
        }
        return true;
    },

    async finalizarOS(osId) {
        const response = await fetch(`http://127.0.0.1:8000/api/oficina/os/${osId}/finalizar/`, {
            method: 'POST',
            headers: { 'X-CSRFToken': this.getCSRFToken() },
            credentials: 'include'
        });
        if (!response.ok) {
            const errorMsg = await this._extractErrorMessage(response);
            throw new Error(errorMsg);
        }
        return response.json();
    }
};

let currentOsId = null;
let todasTarefas = [];
let filtroAtual = 'todas';

export function initExecucao(osId) {
    currentOsId = osId;
    if (!currentOsId) return;

    atualizarVisualBotao();
    carregarTarefas();

    const btnIncluir = document.getElementById('btnIncluirTarefa');
    if (btnIncluir) {
        btnIncluir.removeEventListener('click', adicionarTarefaHandler);
        btnIncluir.addEventListener('click', adicionarTarefaHandler);
    }

    const btnFinalizar = document.getElementById('btnFinalizarOS');
    if (btnFinalizar) {
        btnFinalizar.removeEventListener('click', finalizarOSHandler);
        btnFinalizar.addEventListener('click', finalizarOSHandler);
    }

    const filtroSelect = document.getElementById('filtroStatus');
    if (filtroSelect) {
        filtroSelect.addEventListener('change', (e) => {
            filtroAtual = e.target.value;
            renderizarListaTarefas();
        });
    }

    // Filtro via clique nos cards de resumo
    document.querySelectorAll('.resumo-item').forEach(item => {
        item.addEventListener('click', () => {
            const filtro = item.dataset.filtro;
            if (filtro && filtroSelect) {
                filtroSelect.value = filtro;
                filtroAtual = filtro;
                renderizarListaTarefas();
            }
        });
    });
}

const adicionarTarefaHandler = () => adicionarTarefa();
const finalizarOSHandler = () => finalizarOS();

async function atualizarVisualBotao() {
    const btnIncluir = document.getElementById('btnIncluirTarefa');
    if (!btnIncluir) return;
    
    const status = await checarChecklistNoBackend();
    if (!status.concluido) {
        btnIncluir.style.opacity = '0.7';
    } else {
        btnIncluir.style.opacity = '1';
    }
}

async function checarChecklistNoBackend() {
    try {
        const response = await fetch(`http://127.0.0.1:8000/api/oficina/checklist/${currentOsId}/`, {
            credentials: 'include',
            headers: { 'X-CSRFToken': ExecucaoService.getCSRFToken() }
        });

        if (response.ok) {
            let data = await response.json();
            if (data.results) data = data.results;
            const dados = Array.isArray(data) ? data[0] : data;

            if (dados) {
                const concluido = (
                    dados.concluido === true || 
                    dados.concluido === 'true' ||
                    String(dados.status).toLowerCase() === 'concluido' ||
                    String(dados.status).toLowerCase() === 'concluído'
                );
                return { concluido: concluido, raw: dados };
            }
        }
        return { concluido: false, erro: `HTTP ${response.status}` };
    } catch (error) {
        return { concluido: false, erro: error.message };
    }
}

async function carregarTarefas() {
    const lista = document.getElementById('listaTarefas');
    if (!lista) return;

    lista.innerHTML = '<li class="loading-placeholder"><i class="fas fa-spinner fa-pulse"></i> Carregando tarefas...</li>';

    try {
        const tarefas = await ExecucaoService.getTarefas(currentOsId);
        todasTarefas = Array.isArray(tarefas) ? tarefas : [];
        atualizarContadores();
        renderizarListaTarefas();
    } catch (error) {
        lista.innerHTML = `<li class="text-muted" style="color:red;">Erro ao carregar: ${escapeHtml(error.message)}</li>`;
    }
}

function atualizarContadores() {
    const total = todasTarefas.length;
    const pendente = todasTarefas.filter(t => t.status === 'pendente').length;
    const execucao = todasTarefas.filter(t => t.status === 'execucao' || t.status === 'em_execucao').length;
    const concluido = todasTarefas.filter(t => t.status === 'concluido').length;

    document.getElementById('totalCount').innerText = total;
    document.getElementById('pendenteCount').innerText = pendente;
    document.getElementById('execucaoCount').innerText = execucao;
    document.getElementById('concluidoCount').innerText = concluido;
}

function renderizarListaTarefas() {
    const lista = document.getElementById('listaTarefas');
    if (!lista) return;

    let tarefasFiltradas = [...todasTarefas];
    if (filtroAtual !== 'todas') {
        let statusFiltro = filtroAtual;
        if (statusFiltro === 'execucao') statusFiltro = 'execucao';
        tarefasFiltradas = tarefasFiltradas.filter(t => {
            const tStatus = (t.status === 'em_execucao') ? 'execucao' : t.status;
            return tStatus === statusFiltro;
        });
    }

    if (tarefasFiltradas.length === 0) {
        lista.innerHTML = '<li class="text-muted">Nenhuma tarefa encontrada.</li>';
        return;
    }

    lista.innerHTML = '';
    tarefasFiltradas.forEach(t => {
        const li = document.createElement('li');
        li.className = 'task-item';
        
        let statusValue = t.status;
        let statusClass = '';
        if (statusValue === 'pendente') statusClass = 'status-pendente';
        else if (statusValue === 'em_execucao' || statusValue === 'execucao') {
            statusValue = 'execucao';
            statusClass = 'status-execucao';
        }
        else if (statusValue === 'concluido') statusClass = 'status-concluido';

        li.innerHTML = `
            <select class="task-status ${statusClass}" data-id="${t.id}">
                <option value="pendente" ${t.status === 'pendente' ? 'selected' : ''}>⏳ Pendente</option>
                <option value="execucao" ${(t.status === 'em_execucao' || t.status === 'execucao') ? 'selected' : ''}>⚙️ Em Execução</option>
                <option value="concluido" ${t.status === 'concluido' ? 'selected' : ''}>✅ Concluído</option>
            </select>
            <span class="task-desc-label">${escapeHtml(t.descricao)}</span>
            <button class="btn-icon-danger" data-id="${t.id}" title="Remover tarefa">
                <i class="fas fa-trash-alt"></i>
            </button>
        `;
        lista.appendChild(li);
    });

    // Eventos de mudança de status
    document.querySelectorAll('.task-status').forEach(select => {
        select.removeEventListener('change', statusChangeHandler);
        select.addEventListener('change', statusChangeHandler);
    });

    // Eventos de remoção
    document.querySelectorAll('.btn-icon-danger').forEach(btn => {
        btn.removeEventListener('click', deleteHandler);
        btn.addEventListener('click', deleteHandler);
    });
}

const statusChangeHandler = async (e) => {
    const tarefaId = e.target.dataset.id;
    let newStatus = e.target.value;
    try {
        await ExecucaoService.atualizarTarefa(currentOsId, tarefaId, { status: newStatus });
        await carregarTarefas();
    } catch (error) {
        alert(`Erro ao atualizar status: ${error.message}`);
        await carregarTarefas();
    }
};

const deleteHandler = async (e) => {
    const tarefaId = e.currentTarget.dataset.id;
    if (confirm('Deseja remover esta tarefa permanentemente?')) {
        try {
            await ExecucaoService.deletarTarefa(currentOsId, tarefaId);
            await carregarTarefas();
        } catch (error) {
            alert(error.message);
        }
    }
};

async function adicionarTarefa() {
    const check = await checarChecklistNoBackend();
    if (!check.concluido) {
        const continuar = confirm(`⚠️ O checklist ainda não foi concluído.\nDeseja forçar a inclusão da tarefa mesmo assim?`);
        if (!continuar) return;
    }

    const descricao = prompt('Descrição da nova tarefa:');
    if (!descricao || descricao.trim() === '') return;

    try {
        await ExecucaoService.salvarTarefa(currentOsId, { 
            descricao: descricao.trim(), 
            status: 'pendente'
        });
        await carregarTarefas();
    } catch (error) {
        alert(`Erro ao salvar a tarefa:\n${error.message}`);
    }
}

async function finalizarOS() {
    if (!confirm('Deseja marcar esta O.S como finalizada?\nEsta ação não poderá ser desfeita.')) return;
    try {
        await ExecucaoService.finalizarOS(currentOsId);
        alert('✅ OS finalizada com sucesso!');
        const statusBadge = document.querySelector('.os-status-bar .badge');
        if (statusBadge) statusBadge.textContent = 'Concluído';
        window.dispatchEvent(new CustomEvent('os:criada'));
    } catch (error) {
        alert(`Erro ao finalizar OS:\n${error.message}`);
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
        return map[m] || m;
    });
}