export class OficinaTabs extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
        this.setupListeners();
    }

    setupListeners() {
        const tabs = this.shadowRoot.querySelectorAll('.tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const target = e.currentTarget;
                if (target.classList.contains('locked')) {
                    console.warn("Esta etapa está bloqueada até a conclusão do Checklist.");
                    return;
                }
                this.activateTab(target.dataset.target);
            });
        });
    }

    activateTab(targetId) {
        this.shadowRoot.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        const activeTab = this.shadowRoot.querySelector(`[data-target="${targetId}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
            this.dispatchEvent(new CustomEvent('os:tab-change', {
                detail: { targetId },
                bubbles: true,
                composed: true
            }));
        }
    }

    setLockedByChecklist(completed) {
        const tabs = this.shadowRoot.querySelectorAll('.tab');
        tabs.forEach(tab => {
            const target = tab.dataset.target;
            if (target === 'checklist') {
                tab.classList.remove('locked');
                const lockIcon = tab.querySelector('.fa-lock');
                if (lockIcon) lockIcon.remove();
            } else {
                if (completed) {
                    tab.classList.remove('locked');
                    const lockIcon = tab.querySelector('.fa-lock');
                    if (lockIcon) lockIcon.remove();
                } else {
                    tab.classList.add('locked');
                    if (!tab.querySelector('.fa-lock')) {
                        const icon = document.createElement('i');
                        icon.className = 'fas fa-lock';
                        tab.prepend(icon);
                    }
                }
            }
        });
    }

    unlockAll() {
        const tabs = this.shadowRoot.querySelectorAll('.tab');
        tabs.forEach(tab => {
            tab.classList.remove('locked');
            const lockIcon = tab.querySelector('.fa-lock');
            if (lockIcon) lockIcon.remove();
        });
    }

    render() {
        // Limpa o shadow DOM
        this.shadowRoot.innerHTML = '';

        // Adiciona o link do Font Awesome
        const fontAwesome = document.createElement('link');
        fontAwesome.rel = 'stylesheet';
        fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
        this.shadowRoot.appendChild(fontAwesome);

        // Constrói o caminho absoluto para o CSS baseado na localização deste script
        const scriptURL = new URL(import.meta.url);
        const cssPath = new URL('oficina-tabs.css', scriptURL).href;

        const styleLink = document.createElement('link');
        styleLink.rel = 'stylesheet';
        styleLink.href = cssPath;
        this.shadowRoot.appendChild(styleLink);

        // Cria o container das abas
        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'tabs';
        tabsContainer.setAttribute('role', 'tablist');

        // Clona os elementos filhos do light DOM para dentro do shadow DOM
        Array.from(this.children).forEach(child => {
            tabsContainer.appendChild(child.cloneNode(true));
        });

        this.shadowRoot.appendChild(tabsContainer);
    }
}

customElements.define('oficina-tabs', OficinaTabs);