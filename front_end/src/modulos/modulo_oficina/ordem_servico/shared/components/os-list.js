// front_end/src/modulos/modulo_oficina/ordem_servico/shared/components/os-list.js
export class OSList extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.orders = [];
    }

    connectedCallback() {
        this.render();
        this.setupListeners();
        this.carregarOrdens();
    }

    // Função para obter o token CSRF do cookie (necessário para Django com sessão)
    getCSRFToken() {
        const name = 'csrftoken';
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [key, value] = cookie.trim().split('=');
            if (key === name) return value;
        }
        return '';
    }

    async carregarOrdens() {
        const listContainer = this.shadowRoot.querySelector('.list');
        listContainer.innerHTML = `<div class="loading">Carregando...</div>`;

        try {
            const response = await fetch('http://127.0.0.1:8000/api/oficina/os/');
            if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
            this.orders = await response.json();
            this.renderList(this.orders);
        } catch (error) {
            console.error('Falha ao carregar lista de OS:', error);
            listContainer.innerHTML = `<div class="error-message">
                <i class="fas fa-exclamation-triangle"></i> Erro ao carregar OS.<br>
                <small>${error.message}</small>
            </div>`;
        }
    }

    setupListeners() {
        const searchInput = this.shadowRoot.getElementById('searchOS');
        const statusFilter = this.shadowRoot.getElementById('filterStatus');
        const btnRefresh = this.shadowRoot.getElementById('btnRefresh');
        const btnNew = this.shadowRoot.getElementById('btnNovaOS');

        searchInput?.addEventListener('input', () => this.filterOrders());
        statusFilter?.addEventListener('change', () => this.filterOrders());

        btnRefresh?.addEventListener('click', () => {
            const icon = btnRefresh.querySelector('i');
            if (icon) {
                icon.style.transform = 'rotate(360deg)';
                setTimeout(() => { icon.style.transform = 'none'; }, 500);
            }
            this.carregarOrdens();
        });

        btnNew?.addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('os:create-new', { bubbles: true, composed: true }));
        });

        window.addEventListener('os:criada', () => this.carregarOrdens());
    }

    filterOrders() {
        const term = this.shadowRoot.getElementById('searchOS').value.toLowerCase();
        const status = this.shadowRoot.getElementById('filterStatus').value;

        const filtered = this.orders.filter(os => {
            const placa = (os.veiculo_placa || '').toLowerCase();
            const cliente = (os.cliente_nome || '').toLowerCase();
            const matchesTerm = placa.includes(term) || cliente.includes(term);
            const matchesStatus = status === 'todos' || os.status === status;
            return matchesTerm && matchesStatus;
        });

        this.renderList(filtered);
    }

    renderList(lista) {
        const listContainer = this.shadowRoot.querySelector('.list');
        listContainer.innerHTML = '';

        if (lista.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-message">
                    <i class="fas fa-inbox"></i><br>
                    Nenhuma OS encontrada.
                </div>`;
            return;
        }

        lista.forEach(os => {
            const el = document.createElement('div');
            el.className = 'os-card';
            el.setAttribute('data-id', os.id);
            el.setAttribute('data-status', os.status);
            el.innerHTML = `
                <div class="os-card-header">
                    <span class="os-id">#${os.id}</span>
                    <span class="os-status status-${os.status}">${os.status}</span>
                </div>
                <div class="os-info">
                    <strong>${os.veiculo_modelo || 'Sem modelo'}</strong>
                    <span>${os.veiculo_placa || 'Sem placa'}</span>
                </div>
                <div class="os-client">
                    <i class="fas fa-user"></i> ${os.cliente_nome || 'Sem cliente'}
                </div>
            `;

            // Botão de exclusão
            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.className = 'delete-os-btn';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`Tem certeza que deseja excluir a OS #${os.id}?`)) {
                    const csrfToken = this.getCSRFToken();
                    fetch(`http://127.0.0.1:8000/api/oficina/os/${os.id}/excluir/`, {
                        method: 'DELETE',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRFToken': csrfToken  // Envia o token CSRF
                        },
                        credentials: 'include' // Importante para enviar cookies de sessão
                    })
                    .then(async response => {
                        if (response.ok) {
                            this.carregarOrdens();
                            alert('OS excluída com sucesso.');
                        } else {
                            const erro = await response.json().catch(() => ({ erro: 'Erro desconhecido' }));
                            alert(`Erro ao excluir OS: ${erro.erro || response.statusText}`);
                        }
                    })
                    .catch(err => {
                        console.error('Erro de conexão:', err);
                        alert('Erro de conexão. Verifique o servidor.');
                    });
                }
            };
            el.appendChild(deleteBtn);

            el.addEventListener('click', () => {
                this.shadowRoot.querySelectorAll('.os-card').forEach(card => card.classList.remove('selected'));
                el.classList.add('selected');
                this.dispatchEvent(new CustomEvent('os:select', {
                    detail: os,
                    bubbles: true,
                    composed: true
                }));
            });
            listContainer.appendChild(el);
        });
    }

    render() {
        // CSS embutido diretamente no template (elimina problemas de caminho)
        const style = `
            <style>
                @import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css');

                :host {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    font-family: 'Segoe UI', sans-serif;
                    background-color: #fff;
                    color: #333;
                }

                .header {
                    padding: 1.2rem;
                    border-bottom: 1px solid #ddd;
                    background-color: #f8f9fa;
                    display: flex;
                    flex-direction: column;
                    gap: 0.8rem;
                }

                .title-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .title {
                    font-size: 1.1rem;
                    font-weight: 700;
                    color: #222;
                }

                .btn-primary {
                    background-color: #007bff;
                    color: white;
                    border: none;
                    padding: 0.5rem 1rem;
                    border-radius: 4px;
                    font-weight: 600;
                    cursor: pointer;
                    font-size: 0.85rem;
                    transition: background 0.2s;
                }
                .btn-primary:hover { background-color: #0056b3; }

                .search-box {
                    width: 100%;
                    padding: 0.6rem;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    box-sizing: border-box;
                    font-size: 0.9rem;
                }

                .actions-row {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }

                .filter-select {
                    flex-grow: 1;
                    padding: 0.5rem;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    background: white;
                    color: #333;
                    font-size: 0.9rem;
                    height: 36px;
                }

                .btn-icon {
                    flex-shrink: 0;
                    width: 36px;
                    height: 36px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 1px solid #ccc;
                    background: white;
                    border-radius: 4px;
                    cursor: pointer;
                    color: #555;
                    transition: all 0.2s;
                }
                .btn-icon:hover {
                    background-color: #e2e6ea;
                    color: #000;
                }
                .btn-icon i { font-size: 1rem; transition: transform 0.5s; }

                .list {
                    flex: 1;
                    overflow-y: auto;
                    padding: 1rem;
                    background-color: #fff;
                }

                .loading, .error-message, .empty-message {
                    padding: 2rem;
                    text-align: center;
                    color: #555;
                }
                .error-message { color: #dc3545; }
                .empty-message i { font-size: 2rem; color: #ccc; margin-bottom: 10px; }

                .os-card {
                    position: relative;
                    background: white;
                    border: 1px solid #eee;
                    border-radius: 8px;
                    padding: 1rem 2.8rem 1rem 1rem;
                    margin-bottom: 0.8rem;
                    cursor: pointer;
                    transition: transform 0.2s, box-shadow 0.2s;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                    border-left: 4px solid transparent;
                }
                .os-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                    border-color: #b3d7ff;
                }
                .os-card.selected {
                    background-color: #e7f1ff;
                    border-left: 4px solid #007bff;
                }

                .os-card[data-status="pendente"] {
                    border-left-color: #ffc107;
                }
                .os-card[data-status="execucao"] {
                    border-left-color: #17a2b8;
                }
                .os-card[data-status="concluido"] {
                    border-left-color: #28a745;
                }

                .os-card-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 0.5rem;
                    padding-right: 5px;
                }

                .os-id {
                    font-weight: bold;
                    color: #555;
                    font-size: 0.85rem;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 70%;
                }

                .os-status {
                    font-size: 0.75rem;
                    padding: 2px 8px;
                    border-radius: 12px;
                    text-transform: uppercase;
                    font-weight: 700;
                    white-space: nowrap;
                    flex-shrink: 0;
                }
                .status-pendente { background: #fff3cd; color: #856404; }
                .status-execucao { background: #cce5ff; color: #004085; }
                .status-concluido { background: #d4edda; color: #155724; }

                .os-info strong {
                    display: block;
                    color: #222;
                    font-size: 0.95rem;
                }
                .os-info span {
                    color: #666;
                    font-size: 0.85rem;
                }
                .os-client {
                    margin-top: 0.5rem;
                    font-size: 0.85rem;
                    color: #555;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }

                .delete-os-btn {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    background: transparent;
                    border: none;
                    color: #999;
                    cursor: pointer;
                    font-size: 1rem;
                    padding: 4px;
                    border-radius: 4px;
                    transition: color 0.2s;
                    z-index: 2;
                }
                .delete-os-btn:hover {
                    color: #dc3545;
                }

                @media (max-width: 400px) {
                    .os-card {
                        padding-right: 2.2rem;
                    }
                    .os-id {
                        max-width: 60%;
                    }
                }
            </style>
        `;

        this.shadowRoot.innerHTML = `
            ${style}
            <div class="header">
                <div class="title-row">
                    <span class="title">Ordens de Serviço</span>
                    <button id="btnNovaOS" class="btn-primary">+ Nova</button>
                </div>
                
                <input type="text" id="searchOS" class="search-box" placeholder="Buscar placa, cliente...">
                
                <div class="actions-row">
                    <select id="filterStatus" class="filter-select">
                        <option value="todos">Todos Status</option>
                        <option value="pendente">Pendente</option>
                        <option value="execucao">Em Execução</option>
                        <option value="concluido">Concluído</option>
                    </select>
                    <button id="btnRefresh" class="btn-icon" title="Atualizar Lista">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                </div>
            </div>
            <div class="list">
                <div class="loading">Carregando...</div>
            </div>
        `;
    }
}

customElements.define('os-list', OSList);