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

    lista.innerHTML = '<li>Carregando tarefas...</li>';

    try {
        const tarefas = await ExecucaoService.getTarefas(currentOsId);
        lista.innerHTML = '';

        if (!Array.isArray(tarefas) || tarefas.length === 0) {
            lista.innerHTML = '<li class="text-muted">Nenhuma tarefa adicionada.</li>';
            return;
        }

        tarefas.forEach(t => {
            const li = document.createElement('li');
            li.className = 'task-item';
            li.innerHTML = `
                <select class="task-status" data-id="${t.id}">
                    <option value="pendente" ${t.status === 'pendente' ? 'selected' : ''}>Pendente</option>
                    <option value="em_execucao" ${t.status === 'em_execucao' ? 'selected' : ''}>Em Execução</option>
                    <option value="concluido" ${t.status === 'concluido' ? 'selected' : ''}>Concluído</option>
                </select>
                <span class="task-desc-label">${escapeHtml(t.descricao)}</span>
                <button class="btn-icon-danger" data-id="${t.id}" title="Remover"><i class="fas fa-trash"></i></button>
            `;
            lista.appendChild(li);
        });

        // Adiciona evento de mudança de status
        document.querySelectorAll('.task-status').forEach(select => {
            select.addEventListener('change', statusChangeHandler);
        });

        // Eventos de remoção
        document.querySelectorAll('.btn-icon-danger').forEach(btn => {
            btn.addEventListener('click', deleteHandler);
        });

    } catch (error) {
        lista.innerHTML = `<li style="color:red;">Erro ao carregar: ${error.message}</li>`;
    }
}

const statusChangeHandler = async (e) => {
    const tarefaId = e.target.dataset.id;
    const newStatus = e.target.value;
    try {
        await ExecucaoService.atualizarTarefa(currentOsId, tarefaId, { status: newStatus });
        // Recarrega a lista para garantir que a interface reflita o novo status
        carregarTarefas();
    } catch (error) {
        alert(error.message);
        // Recarrega para restaurar o valor anterior
        carregarTarefas();
    }
};

const deleteHandler = async (e) => {
    const tarefaId = e.currentTarget.dataset.id;
    if (confirm('Deseja realmente remover esta tarefa?')) {
        try {
            await ExecucaoService.deletarTarefa(currentOsId, tarefaId);
            carregarTarefas();
        } catch (error) {
            alert(error.message);
        }
    }
};

async function adicionarTarefa() {
    const check = await checarChecklistNoBackend();
    if (!check.concluido) {
        const continuar = confirm(`⚠️ O backend informou que o checklist NÃO está concluído.\n(Retorno: ${check.erro || JSON.stringify(check.raw)})\n\nDeseja forçar a inclusão da tarefa mesmo assim?`);
        if (!continuar) return;
    }

    const descricao = prompt('Descrição da nova tarefa:');
    if (!descricao || descricao.trim() === '') return;

    try {
        // Cria a tarefa com status inicial 'pendente'
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
    if (!confirm('Deseja marcar esta O.S como finalizada?')) return;
    try {
        await ExecucaoService.finalizarOS(currentOsId);
        alert('OS finalizada com sucesso!');
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