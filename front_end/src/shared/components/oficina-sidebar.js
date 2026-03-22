export class OficinaSidebar extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
        // NOVO: Chama a função que adiciona a interatividade logo após desenhar o menu
        this.addClickEvents();
    }

    // NOVO: Método para gerenciar os cliques
    addClickEvents() {
        // Seleciona todos os links dentro da shadow DOM
        const links = this.shadowRoot.querySelectorAll('nav a');

        links.forEach(link => {
            link.addEventListener('click', (e) => {
                // Opcional: Previne o comportamento padrão se forem apenas links visuais (#)
                // Se você for navegar para outras páginas reais, pode remover esta linha.
                // e.preventDefault();

                // 1. Remove a classe 'active' de todos os links
                links.forEach(l => l.classList.remove('active'));

                // 2. Adiciona a classe 'active' apenas ao link clicado
                e.currentTarget.classList.add('active');
            });
        });
    }

    render() {
        // Captura o valor inicial do atributo 'page' (vinda do HTML)
        const activePage = this.getAttribute('page');

        const style = `
            <style>
                :host {
                    display: block;
                    width: 250px;
                    height: 100vh;
                    background-color: var(--bg-card, #ffffff); 
                    border-right: 1px solid var(--border-light, #e2e8f0);
                    display: flex;
                    flex-direction: column;
                    box-shadow: 2px 0 5px rgba(0,0,0,0.02);
                }

                .brand {
                    padding: 1.5rem;
                    font-size: 1.5rem;
                    font-weight: 800;
                    color: var(--color-primary, #2563eb);
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    border-bottom: 1px solid var(--border-light, #e2e8f0);
                    margin-bottom: 1rem;
                }
                
                .brand i {
                    font-size: 1.2rem;
                }

                nav ul {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }

                nav li {
                    margin-bottom: 0.5rem;
                    padding: 0 1rem;
                }

                nav a {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 0.75rem 1rem;
                    text-decoration: none;
                    color: var(--text-secondary, #64748b);
                    border-radius: 0.5rem;
                    font-weight: 500;
                    transition: all 0.2s ease;
                    cursor: pointer; /* Garante que o cursor mostre que é clicável */
                }

                nav a:hover {
                    background-color: var(--bg-light, #f8fafc);
                    color: var(--color-primary, #2563eb);
                }

                /* Estilo do item selecionado */
                nav a.active {
                    background-color: var(--color-primary-light, #eff6ff);
                    color: var(--color-primary, #2563eb);
                    font-weight: 600;
                }

                .icon {
                    font-size: 1.2rem;
                    width: 24px;
                    display: flex;
                    justify-content: center;
                }

                .sidebar-footer {
                    margin-top: auto;
                    padding: 1.5rem;
                    border-top: 1px solid var(--border-light, #e2e8f0);
                }

                .user-profile {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    color: var(--text-primary, #1e293b);
                    font-weight: 600;
                }
            </style>
        `;

        this.shadowRoot.innerHTML = `
            ${style}
            <div class="brand">
                <span>🔧 Pit Stop</span>
            </div>
            <nav>
                <ul>
                    <li>
                        <a href="#" class="${activePage === 'dashboard' ? 'active' : ''}">
                            <span class="icon">📊</span> Dashboard
                        </a>
                    </li>
                    <li>
                        <a href="/front_end/src/modulos/modulo_oficina/cadastro_cliente/pages/cadastro-cliente.html" class="${activePage === 'clientes' ? 'active' : ''}">
                            <span class="icon">👥</span> Clientes
                        </a>
                    </li>
                    <li>
                        <a href="/front_end/src/modulos/modulo_oficina/ordem_servico/shared/page/os-visao-geral.html" class="${activePage === 'operacoes' ? 'active' : ''}">
                            <span class="icon">🛠️</span> Operações e Serviços
                        </a>
                    </li>
                    <li>
                        <a href="/front_end/src/modulos/modulo_oficina/atualizar_dados_oficina/pages/atualizacao_dados_oficina.html" class="${activePage === 'atualizacao' ? 'active' : ''}">
                            <span class="icon">🔄</span> Atualização de Dados
                        </a>
                    </li>
                    <li>
                        <a href="/front_end/src/modulos/modulo_oficina/precos_servicos/configuracoes_gerais/pages/servicos.html" class="${activePage === 'precos' ? 'active' : ''}">
                            <span class="icon">💲</span> Preços e Serviços
                        </a>
                    </li>
                </ul>
            </nav>
            
            <div class="sidebar-footer">
                <div class="user-profile">
                    <span class="icon">👤</span> Admin
                </div>
            </div>
        `;
    }
}
customElements.define('oficina-sidebar', OficinaSidebar);