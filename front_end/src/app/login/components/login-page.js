// login-page.js
document.addEventListener('DOMContentLoaded', () => {
    const formLogin = document.getElementById('formLogin');
    const inputUsername = document.getElementById('username');
    const inputPassword = document.getElementById('password');
    const btnTogglePass = document.getElementById('btnTogglePass');
    const btnGoogleLogin = document.getElementById('btnGoogleLogin');
    const checkboxRemember = document.getElementById('rememberMe');

    // 1. Alternar Visibilidade da Senha
    if (btnTogglePass && inputPassword) {
        btnTogglePass.addEventListener('click', () => {
            const isPassword = inputPassword.type === 'password';
            inputPassword.type = isPassword ? 'text' : 'password';
            
            const icon = btnTogglePass.querySelector('i');
            icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
            btnTogglePass.setAttribute('aria-label', isPassword ? 'Ocultar senha' : 'Mostrar senha');
        });
    }

    // 2. Submissão com estado de Loading
    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Limpa erros anteriores
            document.querySelectorAll('.error-msg').forEach(el => el.textContent = '');

            const username = inputUsername.value.trim();
            const password = inputPassword.value;
            const rememberMe = checkboxRemember.checked;

            // Validação simples
            let isValid = true;
            if (!username) {
                document.getElementById('error-username').textContent = 'Informe seu e-mail ou usuário.';
                isValid = false;
            }
            if (!password) {
                document.getElementById('error-password').textContent = 'Informe sua senha.';
                isValid = false;
            }

            if (!isValid) return;

            // Ativa o estado de Loading no botão
            const btnEntrar = document.getElementById('btnEntrar');
            const btnText = btnEntrar.querySelector('.btn-text');
            const btnSpinner = btnEntrar.querySelector('.btn-spinner');
            
            btnEntrar.disabled = true;
            btnText.textContent = 'Autenticando...';
            btnSpinner.style.display = 'inline-block';

            try {
                // Simulação de requisição para o Back-End Django
                console.log('Dados de Login:', { username, password, rememberMe });
                
                // Aguarda 1.5s para simular a rede (remover em produção)
                await new Promise(resolve => setTimeout(resolve, 1500));

                // Redireciona para o módulo de oficina do Pit Stop
                window.location.href = '../../modulos/modulo_oficina/dashboard/pages/dashboard.html';

            } catch (error) {
                console.error("Erro no login:", error);
                alert("Falha na comunicação com o servidor.");
                
                // Reseta o botão em caso de erro
                btnEntrar.disabled = false;
                btnText.textContent = 'Entrar';
                btnSpinner.style.display = 'none';
            }
        });
    }

    // 3. Login OAuth do Google
    if (btnGoogleLogin) {
        btnGoogleLogin.addEventListener('click', () => {
            // Efeito visual rápido de clique
            const originalText = btnGoogleLogin.innerHTML;
            btnGoogleLogin.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Redirecionando...';
            btnGoogleLogin.disabled = true;

            setTimeout(() => {
                console.log('Iniciando fluxo OAuth com Google...');
                // Integração futura com Django Allauth ou similar
                // window.location.href = '/accounts/google/login/';
                
                // Reseta (apenas para o mock)
                btnGoogleLogin.innerHTML = originalText;
                btnGoogleLogin.disabled = false;
            }, 1000);
        });
    }
});