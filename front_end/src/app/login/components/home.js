/* home.js - Lógica da Interface da Home */

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Efeito de Scroll Suave para links internos
    const menuLinks = document.querySelectorAll('a[href^="#"]');
    
    menuLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 80, // Ajuste para o header fixo
                    behavior: 'smooth'
                });
            }
        });
    });

    // 2. Animação de Entrada ao Rolar a Página
    const animatedElements = document.querySelectorAll('.animate-on-scroll');
    
    const checkScroll = () => {
        const triggerBottom = window.innerHeight / 5 * 4;
        
        animatedElements.forEach(el => {
            const elTop = el.getBoundingClientRect().top;
            
            if (elTop < triggerBottom) {
                el.classList.add('visible');
            }
        });
    };

    // Executa ao carregar e ao rolar
    window.addEventListener('scroll', checkScroll);
    checkScroll();

    // 3. Feedback Visual no Botão de Login
    const loginBtn = document.querySelector('.btn-login-header');
    if (loginBtn) {
        loginBtn.addEventListener('mousedown', () => {
            loginBtn.style.transform = 'scale(0.95)';
        });
        loginBtn.addEventListener('mouseup', () => {
            loginBtn.style.transform = 'scale(1)';
        });
    }
});