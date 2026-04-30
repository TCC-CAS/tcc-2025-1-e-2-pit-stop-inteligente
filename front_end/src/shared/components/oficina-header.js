export class OficinaHeader extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
        this.setupListeners();
        this.loadTheme();
    }

    setupListeners() {
        const themeToggle = this.shadowRoot.getElementById('themeToggle');
        themeToggle.addEventListener('click', () => this.toggleTheme());
    }

    loadTheme() {
        // Verifica preferência salva ou do sistema
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.body.classList.toggle('dark-mode', savedTheme === 'dark');
        this.updateIcon(savedTheme === 'dark');
    }

    toggleTheme() {
        const isDark = document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        this.updateIcon(isDark);
    }

    updateIcon(isDark) {
        const btn = this.shadowRoot.getElementById('themeToggle');
        btn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    }

    render() {
        // Importa FontAwesome para dentro do Shadow DOM
        const fontAwesome = `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">`;
        
        const style = `
            <style>
                :host { display: block; position: sticky; top: 0; z-index: 100; }
                header {
                    background-color: var(--primary, #2563eb);
                    color: white;
                    padding: 1rem 2rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                    height: 64px;
                    box-sizing: border-box;
                }
                .logo { display: flex; align-items: center; gap: 0.5rem; font-weight: bold; font-size: 1.2rem; }
                .header-actions { display: flex; gap: 1.5rem; align-items: center; }
                .theme-toggle { background: none; border: none; color: white; cursor: pointer; font-size: 1.2rem; padding: 0.5rem; border-radius: 50%; transition: background 0.2s; }
                .theme-toggle:hover { background-color: rgba(255,255,255,0.1); }
                .user-info { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; }
                .avatar { width: 32px; height: 32px; background-color: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; }
            </style>
        `;

        this.shadowRoot.innerHTML = `
            ${fontAwesome}
            ${style}
            <header>
                <div class="logo">
                    <i class="fas fa-wrench"></i>
                    <span>Pit Stop Inteligente</span>
                </div>
                <div class="header-actions">
                    <button class="theme-toggle" id="themeToggle" title="Alternar Tema">
                        <i class="fas fa-moon"></i>
                    </button>
                    <div class="user-info">
                        <span>Admin</span>
                        <div class="avatar"><i class="fas fa-user"></i></div>
                    </div>
                </div>
            </header>
        `;
    }
}

customElements.define('oficina-header', OficinaHeader);