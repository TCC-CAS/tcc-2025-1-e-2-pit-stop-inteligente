document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. SIMULAÇÃO DE CARREGAMENTO DE DADOS (MOCK BACKEND) ---
    // Esta função simula o retorno de uma API REST
    const fetchOfficeData = async () => {
        // Simulando delay de rede (500ms)
        return new Promise(resolve => {
            setTimeout(() => {
                // DADOS MOCKADOS (Substituiria a resposta do banco de dados)
                resolve({
                    dadosBasicos: {
                        nome: "Pit Stop Mecânica Geral",
                        cnpj: "12.345.678/0001-90",
                        email: "contato@pitstop.com.br",
                        telefone: "(11) 99999-9999",
                        especialidade: "geral", // Value do option
                        logoUrl: null // null ou url da imagem
                    },
                    endereco: {
                        cep: "06000-000",
                        logradouro: "Av. dos Autonomistas",
                        numero: "1500",
                        complemento: "Galpão B",
                        bairro: "Centro",
                        cidade: "Osasco",
                        estado: "SP"
                    },
                    horarios: {
                        abertura: "08:00",
                        fechamento: "18:00",
                        // IDs dos dias que devem vir marcados no banco
                        diasFuncionamento: ["seg", "ter", "qua", "qui", "sex", "sab"] 
                    },
                    plano: {
                        nome: "Premium",
                        vencimento: "10/12/2026"
                    },
                    status: {
                        ultimaAtualizacao: "15/02/2026",
                        horarioConfigurado: true
                    },
                    historico: [
                        { data: "15/02/2026", titulo: "Alteração de Endereço", desc: "Atualização do número do logradouro." },
                        { data: "10/01/2026", titulo: "Renovação de Plano", desc: "Migração para o plano Premium anual." }
                    ]
                });
            }, 500);
        });
    };

    // --- 2. FUNÇÃO PARA POPULAR O FORMULÁRIO ---
    const populateForm = (data) => {
        // Preenchendo Cards de Status
        setText('statusDataUltimaAtualizacao', data.status.ultimaAtualizacao);
        setText('statusHorarioConfig', data.status.horarioConfigurado ? 'Configurado' : 'Pendente');
        setText('statusPlanoVencimento', `Vence em: ${data.plano.vencimento}`);
        setText('statusPlanoNome', data.plano.nome);

        // Preenchendo Inputs (Dados Básicos)
        setValue('inputNomeOficina', data.dadosBasicos.nome);
        setValue('inputCnpj', data.dadosBasicos.cnpj);
        setValue('inputEmail', data.dadosBasicos.email);
        setValue('inputTelefone', data.dadosBasicos.telefone);
        setValue('selectEspecialidade', data.dadosBasicos.especialidade);

        // Preenchendo Inputs (Endereço)
        setValue('inputCep', data.endereco.cep);
        setValue('inputLogradouro', data.endereco.logradouro);
        setValue('inputNumero', data.endereco.numero);
        setValue('inputComplemento', data.endereco.complemento);
        setValue('inputBairro', data.endereco.bairro);
        setValue('inputCidade', data.endereco.cidade);
        setValue('selectEstado', data.endereco.estado);

        // Preenchendo Inputs (Horários)
        setValue('inputAbertura', data.horarios.abertura);
        setValue('inputFechamento', data.horarios.fechamento);
        
        // Marcando os dias da semana
        if (data.horarios.diasFuncionamento) {
            data.horarios.diasFuncionamento.forEach(dia => {
                const checkbox = document.getElementById(`dia-${dia}`);
                if (checkbox) checkbox.checked = true;
            });
        }

        // Renderizando Histórico
        const historyContainer = document.getElementById('historyTimeline');
        if (historyContainer && data.historico) {
            historyContainer.innerHTML = ''; // Limpa antes de preencher
            data.historico.forEach(item => {
                const li = document.createElement('li');
                li.className = 'timeline-item';
                li.innerHTML = `
                    <div class="timeline-date">${item.data}</div>
                    <div class="timeline-content">
                        <h4>${item.titulo}</h4>
                        <p>${item.desc}</p>
                    </div>
                `;
                historyContainer.appendChild(li);
            });
        }
    };

    // Helpers para evitar erro se elemento não existir
    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el && value) el.value = value;
    };
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el && text) el.textContent = text;
    };

    // --- 3. INICIALIZAÇÃO ---
    // Chama a função mock ao carregar a página
    fetchOfficeData().then(data => {
        populateForm(data);
    }).catch(err => console.error("Erro ao carregar dados:", err));


    // --- 4. LÓGICA DE UI (ABAS E MODAIS) ---
    
    // Gestão de Abas
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // Salvar Geral (Simulação)
    const saveButton = document.getElementById('saveButton');
    if(saveButton) {
        saveButton.addEventListener('click', () => {
            // Verifica se está na aba de segurança
            const activeTab = document.querySelector('.tab-content.active').id;
            
            if (activeTab === 'security') {
                alert('Para alterar a senha, utilize o botão "Salvar Nova Senha" dentro da aba de segurança.');
                return;
            }
            
            saveButton.classList.add('loading');
            saveButton.disabled = true;

            setTimeout(() => {
                saveButton.classList.remove('loading');
                saveButton.disabled = false;
                document.getElementById('confirmationModal').classList.add('active');
            }, 1500);
        });
    }

    // Fechar Modal
    const closeModalBtn = document.getElementById('closeModalButton');
    if(closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            document.getElementById('confirmationModal').classList.remove('active');
        });
    }

    // Fechar ao clicar fora
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('active');
        }
    });

    // --- 5. LÓGICA DE SEGURANÇA (SENHA) ---
    
    // Toggle Olho
    window.togglePasswordVisibility = function(inputId, iconElement) {
        const input = document.getElementById(inputId);
        if (input.type === "password") {
            input.type = "text";
            iconElement.classList.remove('fa-eye');
            iconElement.classList.add('fa-eye-slash');
        } else {
            input.type = "password";
            iconElement.classList.remove('fa-eye-slash');
            iconElement.classList.add('fa-eye');
        }
    };

    // Salvar Senha
    const btnSavePassword = document.getElementById('btnSavePassword');
    if (btnSavePassword) {
        btnSavePassword.addEventListener('click', () => {
            const currentPass = document.getElementById('currentPassword').value;
            const newPass = document.getElementById('newPassword').value;
            const confirmPass = document.getElementById('confirmPassword').value;
            const errorMsg = document.getElementById('passwordMatchError');

            errorMsg.style.display = 'none';

            // Validações Básicas
            if (!currentPass) {
                alert('Por favor, digite sua senha atual.');
                return;
            }
            if (newPass.length < 8) {
                alert('A nova senha deve ter no mínimo 8 caracteres.');
                return;
            }
            if (newPass !== confirmPass) {
                errorMsg.style.display = 'block';
                return;
            }

            // Simula salvamento
            const originalText = btnSavePassword.innerHTML;
            btnSavePassword.innerHTML = '<div class="loader" style="display:block; border-color: rgba(255,255,255,0.5); border-top-color: white;"></div>';
            btnSavePassword.disabled = true;

            setTimeout(() => {
                btnSavePassword.innerHTML = originalText;
                btnSavePassword.disabled = false;
                document.getElementById('formSecurity').reset();
                alert('Senha alterada com sucesso! Você receberá um e-mail de confirmação.');
            }, 2000);
        });
    }
});