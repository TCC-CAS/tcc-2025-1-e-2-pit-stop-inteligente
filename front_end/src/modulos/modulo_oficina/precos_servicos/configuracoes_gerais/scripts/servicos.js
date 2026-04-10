function getCSRFToken() {
    const name = 'csrftoken';
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const [key, value] = cookie.trim().split('=');
        if (key === name) return value;
    }
    return '';
}

/* scripts/servicos.js */

// --- CONFIGURAÇÃO ---
const API_BASE_URL = 'http://127.0.0.1:8000/api/oficina'; 

// --- CATEGORIAS PADRÃO ---
const CATEGORIAS_PADRAO = [
    { nome: 'Carros Populares', icone: 'fa-car-side', cor: '#22c55e', percentual: 0 },
    { nome: 'Carros Elétricos', icone: 'fa-bolt', cor: '#0ea5e9', percentual: 40 },
    { nome: 'Carros de Luxo', icone: 'fa-gem', cor: '#8b5cf6', percentual: 60 },
    { nome: 'Esportivos', icone: 'fa-flag-checkered', cor: '#ef4444', percentual: 80 },
    { nome: 'Utilitários e Comerciais', icone: 'fa-truck', cor: '#f59e0b', percentual: 30 },
    { nome: 'Minivans e Familiares', icone: 'fa-shuttle-van', cor: '#6366f1', percentual: 20 }
];

// --- ESTADO GLOBAL ---
let estado = {
    valorHora: 0,
    categorias: [],
    servicos: []
};

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    configurarEventos();
    carregarDadosIniciais();
});

function configurarEventos() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => trocarAba(e.target));
    });

    const btnAtualizar = document.getElementById('btnAtualizar');
    if(btnAtualizar) btnAtualizar.addEventListener('click', carregarDadosIniciais);

    const btnNovoServico = document.getElementById('btnNovoServico');
    if(btnNovoServico) btnNovoServico.addEventListener('click', abrirModalNovoServico);

    const btnSalvarHora = document.getElementById('btnSalvarHora');
    if(btnSalvarHora) btnSalvarHora.addEventListener('click', salvarValorHora);

    const btnRestaurar = document.getElementById('btnRestaurarPadroes');
    if(btnRestaurar) btnRestaurar.addEventListener('click', restaurarPadroes);

    document.getElementById('btnFecharModal').addEventListener('click', fecharModal);
    document.getElementById('btnCancelarModal').addEventListener('click', fecharModal);
    document.getElementById('btnSalvarServico').addEventListener('click', salvarServico);

    document.getElementById('tempoServico').addEventListener('input', atualizarPreviewPreco);
    document.getElementById('buscaServico').addEventListener('input', (e) => filtrarServicos(e.target.value));

    const modal = document.getElementById('modalServico');
    modal.addEventListener('click', (e) => {
        if (e.target === modal) fecharModal();
    });
}

// --- INTEGRAÇÃO COM BACKEND ---

async function carregarDadosIniciais() {
    mostrarCarregando(true);
    
    try {
        const [resConfig, resCategorias, resServicos] = await Promise.all([
            fetch(`${API_BASE_URL}/configuracao/`),
            fetch(`${API_BASE_URL}/categorias/`),
            fetch(`${API_BASE_URL}/servicos/`)
        ]);

        if (!resConfig.ok || !resCategorias.ok || !resServicos.ok) {
            throw new Error('Falha ao buscar dados.');
        }

        const config = await resConfig.json();
        const categoriasBackend = await resCategorias.json();
        const servicos = await resServicos.json();

        estado.valorHora = config.valor_hora ? parseFloat(config.valor_hora) : 0;
        estado.servicos = servicos;

        estado.categorias = CATEGORIAS_PADRAO.map(catPadrao => {
            const backendMatch = categoriasBackend.find(
                cb => cb.nome.toLowerCase() === catPadrao.nome.toLowerCase()
            );
            if (backendMatch) {
                return { ...catPadrao, id: backendMatch.id, percentual: backendMatch.percentual };
            }
            return { ...catPadrao };
        });

        renderizarTela();

    } catch (erro) {
        console.error('Erro ao carregar:', erro);
    } finally {
        mostrarCarregando(false);
    }
}

// --- LÓGICA DE NEGÓCIOS ---

async function salvarValorHora() {
    const input = document.getElementById('valorHoraMecanico');
    const novoValor = parseFloat(input.value);
    
    if (isNaN(novoValor) || novoValor <= 0) return alert("Insira um valor válido.");

    try {
        const response = await fetch(`${API_BASE_URL}/configuracao/`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json','X-CSRFToken': getCSRFToken()},
            body: JSON.stringify({ valor_hora: novoValor })
        });

        if (!response.ok) throw new Error('Erro ao salvar.');

        estado.valorHora = novoValor;
        
        const btn = document.getElementById('btnSalvarHora');
        const iconOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => btn.innerHTML = iconOriginal, 2000);

        renderizarTabelaServicos(); 
    } catch (erro) {
        alert('Não foi possível salvar o valor da hora.');
    }
}

async function salvarCategoria(index, novoPercentual) {
    const cat = estado.categorias[index];
    const payload = {
        nome: cat.nome,
        percentual: parseFloat(novoPercentual),
        icone: cat.icone,
        cor: cat.cor
    };

    try {
        let response;
        if (cat.id) {
            response = await fetch(`${API_BASE_URL}/categorias/${cat.id}/`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken()},
                body: JSON.stringify({ percentual: payload.percentual })
            });
        } else {
            response = await fetch(`${API_BASE_URL}/categorias/`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken()},
                body: JSON.stringify(payload)
            });
        }

        if (!response.ok) throw new Error('Falha ao salvar categoria');
        
        const data = await response.json();
        estado.categorias[index].id = data.id; 
        estado.categorias[index].percentual = data.percentual;
        
    } catch (erro) {
        console.error('Erro:', erro);
    }
}

async function restaurarPadroes() {
    if(confirm("Deseja restaurar os percentuais padrão para todas as categorias?")) {
        estado.categorias = estado.categorias.map(cat => {
            const padrao = CATEGORIAS_PADRAO.find(p => p.nome === cat.nome);
            if (padrao) cat.percentual = padrao.percentual;
            return cat;
        });
        
        for (let i = 0; i < estado.categorias.length; i++) {
            await salvarCategoria(i, estado.categorias[i].percentual);
        }
        renderizarTela();
        alert("Padrões restaurados e salvos no banco de dados!");
    }
}

// --- CRUD DE SERVIÇOS ---

async function salvarServico() {
    const id = document.getElementById('servicoId').value;
    const nome = document.getElementById('nomeServico').value;
    const tempo = document.getElementById('tempoServico').value;
    const descricao = document.getElementById('descricaoServico').value;

    if (!nome || !tempo) {
        alert("Preencha todos os campos obrigatórios (*)");
        return;
    }

    const payload = {
        nome: nome,
        descricao: descricao,
        tempo: parseFloat(tempo)
    };

    try {
        let response;
        if (id) {
            response = await fetch(`${API_BASE_URL}/servicos/${id}/`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken()},
                body: JSON.stringify(payload)
            });
        } else {
            response = await fetch(`${API_BASE_URL}/servicos/`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken()},
                body: JSON.stringify(payload)
            });
        }

        if (!response.ok) {
            const erroJson = await response.json();
            alert("O servidor recusou os dados. Motivo:\n" + JSON.stringify(erroJson, null, 2));
            return;
        }

        fecharModal();
        carregarDadosIniciais(); 

    } catch (erro) {
        console.error('Erro requisição:', erro);
    }
}

window.editarServico = function(id) {
    const s = estado.servicos.find(item => item.id === id);
    if (!s) return;

    document.getElementById('servicoId').value = s.id;
    document.getElementById('nomeServico').value = s.nome;
    document.getElementById('descricaoServico').value = s.descricao;
    document.getElementById('tempoServico').value = s.tempo;

    atualizarPreviewPreco();
    
    document.getElementById('modalTitulo').innerText = 'Editar Serviço';
    document.getElementById('modalServico').classList.add('active');
};

window.excluirServico = async function(id) {
    if(confirm('Excluir este serviço definitivamente do Banco de Dados?')) {
        try {
            const response = await fetch(`${API_BASE_URL}/servicos/${id}/`, { method: 'DELETE', credentials: 'include', headers: {'X-CSRFToken': getCSRFToken()} });
            if (!response.ok) throw new Error('Falha ao excluir');

            estado.servicos = estado.servicos.filter(s => s.id !== id);
            renderizarTabelaServicos();
        } catch (erro) {
            alert('Não foi possível excluir.');
        }
    }
};

window.alterarCategoria = function(index, val) {
    salvarCategoria(index, val);
};

// --- RENDERIZAÇÃO ---

function renderizarTela() {
    document.getElementById('valorHoraMecanico').value = estado.valorHora.toFixed(2);

    const container = document.getElementById('containerCategorias');
    container.innerHTML = '';

    estado.categorias.forEach((cat, index) => {
        const card = document.createElement('div');
        card.className = 'category-card';
        card.style.borderTop = `4px solid ${cat.cor}`;
        card.innerHTML = `
            <div class="category-header">
                <div class="cat-icon-box" style="background-color: ${hexToRgba(cat.cor, 0.1)}; color: ${cat.cor}">
                    <i class="fas ${cat.icone}"></i>
                </div>
                <span class="cat-title">${cat.nome}</span>
            </div>
            <div class="cat-input-container">
                <label class="text-sm text-secondary mb-1 d-block">Acréscimo (%)</label>
                <div class="cat-input-wrapper">
                    <input type="number" value="${cat.percentual || 0}" min="0" max="300" onchange="alterarCategoria(${index}, this.value)">
                    <span class="text-secondary font-bold">%</span>
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    renderizarTabelaServicos();
}

function renderizarTabelaServicos() {
    const tbody = document.getElementById('listaServicosBody');
    tbody.innerHTML = '';

    if (!estado.servicos || estado.servicos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-secondary">Nenhum serviço cadastrado no banco.</td></tr>`;
        return;
    }

    estado.servicos.forEach(servico => {
        const tempoNumber = parseFloat(servico.tempo) || 0;
        const valorBase = tempoNumber * estado.valorHora;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <strong style="color: var(--text-light)">${servico.nome}</strong>
                <div class="text-xs text-secondary">${servico.descricao || ''}</div>
            </td>
            <td class="text-center">${tempoNumber} h</td>
            <td class="text-right font-bold text-primary">R$ ${valorBase.toFixed(2)}</td>
            <td class="text-center">
                <button class="btn-icon btn-edit" onclick="editarServico(${servico.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon btn-delete" onclick="excluirServico(${servico.id})">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function atualizarPreviewPreco() {
    const tempo = parseFloat(document.getElementById('tempoServico').value) || 0;
    document.getElementById('previewTempo').innerText = tempo;
    document.getElementById('previewValorHora').innerText = estado.valorHora.toFixed(2);
    document.getElementById('previewTotal').innerText = (tempo * estado.valorHora).toFixed(2);
}

function abrirModalNovoServico() {
    document.getElementById('formServico').reset();
    document.getElementById('servicoId').value = '';
    document.getElementById('modalTitulo').innerText = 'Novo Serviço';
    document.getElementById('previewTotal').innerText = '0,00';
    document.getElementById('modalServico').classList.add('active');
}

function fecharModal() { document.getElementById('modalServico').classList.remove('active'); }

function trocarAba(btn) {
    document.querySelectorAll('.tab, .tab-pane').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
}

// CORREÇÃO: Função mostrarCarregando arrumada
function mostrarCarregando(show) {
    const tbody = document.getElementById('listaServicosBody');
    if (show) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-secondary"><i class="fas fa-spinner fa-spin"></i> Sincronizando com o Banco de Dados...</td></tr>`;
    }
    // Quando show for false, NÃO apagamos a tabela, pois o renderizarTabelaServicos() já a preencheu!
}

function filtrarServicos(termo) {
    termo = termo.toLowerCase();
    document.querySelectorAll('#listaServicosBody tr').forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(termo) ? '' : 'none';
    });
}

function hexToRgba(hex, alpha) {
    if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
        let c = hex.substring(1).split('');
        if(c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
        c = '0x'+c.join('');
        return `rgba(${(c>>16)&255}, ${(c>>8)&255}, ${c&255}, ${alpha})`;
    }
    return hex;
}