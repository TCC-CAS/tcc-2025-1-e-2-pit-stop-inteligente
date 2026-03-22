export class OficinaModal extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.isOpen = false;
    }

    connectedCallback() {
        this.render();
        this.setupListeners();
    }

    setupListeners() {
        const closeBtn = this.shadowRoot.querySelector('.close-btn');
        const overlay = this.shadowRoot.querySelector('.modal-overlay');
        const closeAction = this.shadowRoot.querySelector('.close-action'); // Botão cancelar do footer (se houver)

        // Fechar ao clicar no X
        if(closeBtn) closeBtn.addEventListener('click', () => this.close());
        
        // Fechar ao clicar no fundo escuro
        if(overlay) overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.close();
        });

        // Fechar com tecla ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) this.close();
        });
    }

    // MÉTODO PÚBLICO: Chamado pelo seu JS para abrir a modal
    open() {
        this.isOpen = true;
        const overlay = this.shadowRoot.querySelector('.modal-overlay');
        const container = this.shadowRoot.querySelector('.modal-container');
        
        // Adiciona a classe que torna visível
        overlay.classList.add('active');
        container.classList.add('active');
        
        // Impede rolagem da página de fundo
        document.body.style.overflow = 'hidden'; 
        
        this.dispatchEvent(new CustomEvent('os:modal-open'));
    }

    // MÉTODO PÚBLICO: Fecha a modal
    close() {
        this.isOpen = false;
        const overlay = this.shadowRoot.querySelector('.modal-overlay');
        const container = this.shadowRoot.querySelector('.modal-container');
        
        overlay.classList.remove('active');
        container.classList.remove('active');
        
        document.body.style.overflow = ''; 
        
        this.dispatchEvent(new CustomEvent('os:modal-close'));
    }

    render() {
        const style = `
            <style>
                :host { 
                    z-index: 9999; 
                    position: relative; 
                }
                
                /* Fundo Escuro Semitransparente */
                .modal-overlay {
                    position: fixed; 
                    top: 0; 
                    left: 0; 
                    width: 100%; 
                    height: 100%;
                    background: rgba(0, 0, 0, 0.6); /* Escurecimento */
                    backdrop-filter: blur(3px); /* Desfoque suave */
                    display: flex; 
                    justify-content: center; 
                    align-items: center;
                    
                    /* Estado Inicial: Invisível */
                    opacity: 0; 
                    visibility: hidden;
                    transition: all 0.3s ease;
                    z-index: 1000;
                }
                
                /* Estado Ativo: Visível */
                .modal-overlay.active { 
                    opacity: 1; 
                    visibility: visible; 
                }

                /* Container Branco Centralizado */
                .modal-container {
                    background: #ffffff;
                    width: 90%; 
                    max-width: 600px;
                    border-radius: 8px;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.3);
                    
                    /* Animação de entrada */
                    transform: translateY(20px) scale(0.95);
                    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    display: flex; 
                    flex-direction: column;
                    max-height: 90vh;
                }

                .modal-container.active { 
                    transform: translateY(0) scale(1); 
                }

                .modal-header {
                    padding: 1.25rem 1.5rem;
                    border-bottom: 1px solid #e2e8f0;
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center;
                }

                .modal-title { 
                    font-size: 1.25rem; 
                    font-weight: 600; 
                    color: #1e293b; 
                    margin: 0; 
                }

                .close-btn {
                    background: none; 
                    border: none; 
                    font-size: 1.5rem; 
                    cursor: pointer; 
                    color: #64748b;
                    padding: 0;
                    line-height: 1;
                }
                .close-btn:hover { color: #ef4444; }

                .modal-body { 
                    padding: 1.5rem; 
                    overflow-y: auto; 
                }
                
                .modal-footer {
                    padding: 1rem 1.5rem;
                    border-top: 1px solid #e2e8f0;
                    display: flex; 
                    justify-content: flex-end; 
                    gap: 0.75rem;
                    background: #f8fafc;
                    border-radius: 0 0 8px 8px;
                }
            </style>
        `;

        this.shadowRoot.innerHTML = `
            ${style}
            <div class="modal-overlay">
                <div class="modal-container" role="dialog" aria-modal="true">
                    <div class="modal-header">
                        <h3 class="modal-title"><slot name="title">Título</slot></h3>
                        <button class="close-btn" aria-label="Fechar">&times;</button>
                    </div>
                    <div class="modal-body">
                        <slot name="body"></slot>
                    </div>
                    <div class="modal-footer">
                        <slot name="footer"></slot>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('oficina-modal', OficinaModal);