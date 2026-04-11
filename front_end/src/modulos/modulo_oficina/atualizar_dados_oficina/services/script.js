document.addEventListener("DOMContentLoaded", () => {
  // ==========================================
  // 1. FERRAMENTAS AUXILIARES
  // ==========================================

  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value || "";
  };

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text || "";
  };

  function getCSRFToken() {
    const name = "csrftoken";
    const cookies = document.cookie.split(";");
    for (let cookie of cookies) {
      const [key, value] = cookie.trim().split("=");
      if (key === name) return value;
    }
    return "";
  }

  const DJANGO_BASE_URL = "http://127.0.0.1:8000";
  const API_URL = `${DJANGO_BASE_URL}/api/oficina/perfil/`;

  const fetchOfficeData = async () => {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error("Erro ao carregar dados da oficina");
    return await response.json();
  };

  // =====================================
  // 2. FUNÇÃO QUE PREENCHE OS DADOS NA TELA
  // =====================================

  // Atualiza badges dos cards dinamicamente
  const updateBadges = (data) => {
    // Badge Dados Cadastrais
    const basicos = data.dadosBasicos;
    const end = data.endereco;
    const horarios = data.horarios;
    const todosPreenchidos =
      basicos.nome &&
      basicos.cnpj &&
      basicos.email &&
      basicos.telefone &&
      basicos.especialidade &&
      end.cep &&
      end.logradouro &&
      end.numero &&
      end.bairro &&
      end.cidade &&
      end.estado &&
      horarios.abertura &&
      horarios.fechamento &&
      horarios.diasFuncionamento &&
      horarios.diasFuncionamento.length > 0;

    const badgeDados = document.querySelector(
      ".status-card:first-child .badge",
    );
    if (badgeDados) {
      if (todosPreenchidos) {
        badgeDados.textContent = "Completo";
        badgeDados.className = "badge success";
      } else {
        badgeDados.textContent = "Incompleto";
        badgeDados.className = "badge warning";
      }
    }

    // Badge Horários: verifica se está aberto agora
    const badgeHorarios = document.querySelector(
      ".status-card:nth-child(2) .badge",
    );
    if (badgeHorarios) {
      if (
        !data.horarios.abertura ||
        !data.horarios.fechamento ||
        !data.horarios.diasFuncionamento?.length
      ) {
        badgeHorarios.textContent = "Não configurado";
        badgeHorarios.className = "badge warning";
      } else if (data.aberto_agora) {
        badgeHorarios.textContent = "Aberto";
        badgeHorarios.className = "badge success";
      } else {
        badgeHorarios.textContent = "Fechado";
        badgeHorarios.className = "badge warning";
      }
    }
  };

  // PREENCHIMENTO DOS STATUS DOS CARDS
  const populateStatusCards = (data) => {
    // CORREÇÃO: Preenche a data da última atualização
    if (data.status && data.status.ultimaAtualizacao) {
      setText("statusDataUltimaAtualizacao", data.status.ultimaAtualizacao);
    }
    // CORREÇÃO: Preenche o horário no card de status
    if (data.horarios) {
      const { abertura, fechamento } = data.horarios;
      if (abertura && fechamento) {
        setText("statusHorarioConfig", `${abertura} às ${fechamento}`);
      } else {
        setText("statusHorarioConfig", "Não configurado");
      }
    }
    // CORREÇÃO: Preenche a data de vencimento do plano
    if (data.plano && data.plano.expiracao) {
      setText("statusPlanoVencimento", data.plano.expiracao);
    } else {
      setText("statusPlanoVencimento", "---");
    }
  };

  // PREENCHIMENTO DA TIMELINE (HISTÓRICO)
  const populateHistory = (historyArray) => {
    const timelineContainer = document.getElementById("historyTimeline");
    if (!timelineContainer) return;
    timelineContainer.innerHTML = ""; // limpa
    if (!historyArray || historyArray.length === 0) {
      timelineContainer.innerHTML = "<li>Nenhum evento registrado</li>";
      return;
    }
    historyArray.forEach((item) => {
      const li = document.createElement("li");
      li.className = "timeline-item";
      li.innerHTML = `
        <div class="timeline-date">${item.data || ""}</div>
        <div class="timeline-content">
          <strong>${item.acao || item.descricao || ""}</strong>
          <p>${item.usuario ? `Por: ${item.usuario}` : "Sistema"}</p>
        </div>
      `;
      timelineContainer.appendChild(li);
    });
  };

  const populateForm = (data) => {
    // Dados Básicos
    setVal("inputNomeOficina", data.dadosBasicos.nome);
    setVal("inputCnpj", data.dadosBasicos.cnpj);
    setVal("inputEmail", data.dadosBasicos.email);
    setVal("inputTelefone", data.dadosBasicos.telefone);
    setVal("selectEspecialidade", data.dadosBasicos.especialidade);

    // Endereço
    setVal("inputCep", data.endereco.cep);
    setVal("inputLogradouro", data.endereco.logradouro);
    setVal("inputNumero", data.endereco.numero);
    setVal("inputComplemento", data.endereco.complemento);
    setVal("inputBairro", data.endereco.bairro);
    setVal("inputCidade", data.endereco.cidade);
    setVal("selectEstado", data.endereco.estado);

    // Horários
    setVal("inputAbertura", data.horarios.abertura);
    setVal("inputFechamento", data.horarios.fechamento);

    // Plano: atualiza o campo oculto e o texto no status card
    const planoAtual = data.plano.tipo;
    setVal("planoAtual", planoAtual);
    const statusPlanoNome = document.getElementById("statusPlanoNome");
    if (statusPlanoNome) {
      statusPlanoNome.textContent =
        planoAtual === "premium" ? "Premium" : "Básico";
    }

    // Dias de funcionamento (checkboxes)
    const diasFuncionamento = data.horarios.diasFuncionamento || [];
    document.querySelectorAll(".week-checkbox").forEach((checkbox) => {
      checkbox.checked = diasFuncionamento.includes(checkbox.value);
    });

    // Status cards
    populateStatusCards(data);

    // Histórico (timeline)
    if (data.historico && Array.isArray(data.historico)) {
      populateHistory(data.historico);
    }

    // Logo da oficina
    if (data.status && data.status.logoEnviada && data.logo_url) {
      const preview = document.getElementById("previewLogo");
      const uploadText = document.getElementById("uploadText");
      if (preview) {
        // Concatena com a base do Django para evitar 404 no Live Server
        preview.src = `${DJANGO_BASE_URL}${data.logo_url}`;
        preview.style.display = "block";
        if (uploadText) uploadText.style.display = "none";
      }
    } else {
      const preview = document.getElementById("previewLogo");
      if (preview) preview.style.display = "none";
    }

    // Atualiza badges dinâmicos
    updateBadges(data);
  };

  // COLETA DOS DADOS PARA ENVIO
  const collectFormData = () => {
    const diasSelecionados = Array.from(
      document.querySelectorAll(".week-checkbox:checked"),
    ).map((cb) => cb.value);

    return {
      dadosBasicos: {
        nome: document.getElementById("inputNomeOficina").value,
        email: document.getElementById("inputEmail").value,
        telefone: document.getElementById("inputTelefone").value,
        especialidade: document.getElementById("selectEspecialidade").value,
      },
      endereco: {
        cep: document.getElementById("inputCep").value,
        logradouro: document.getElementById("inputLogradouro").value,
        numero: document.getElementById("inputNumero").value,
        complemento: document.getElementById("inputComplemento").value,
        bairro: document.getElementById("inputBairro").value,
        cidade: document.getElementById("inputCidade").value,
        estado: document.getElementById("selectEstado").value,
      },
      horarios: {
        abertura: document.getElementById("inputAbertura").value,
        fechamento: document.getElementById("inputFechamento").value,
        diasFuncionamento: diasSelecionados,
      },
      plano: {
        tipo: document.getElementById("planoAtual").value,
      },
    };
  };

  // ==========================
  // 3. SALVAMENTO DOS DADOS
  // ===========================

  const saveButton = document.getElementById("saveButton");
  // CORREÇÃO: Remove qualquer listener anterior e adiciona o correto
  if (saveButton) {
    // Remove listeners duplicados (se houver) – método simplificado
    const newSaveButton = saveButton.cloneNode(true);
    saveButton.parentNode.replaceChild(newSaveButton, saveButton);
    const finalSaveButton = document.getElementById("saveButton");

    finalSaveButton.addEventListener("click", async () => {
      const activeTab = document.querySelector(".tab-content.active")?.id;
      if (activeTab === "security") {
        alert(
          'Para alterar a senha, utilize o botão "Salvar Nova Senha" dentro da aba de segurança.',
        );
        return;
      }

      const dataToSave = collectFormData();

      finalSaveButton.classList.add("loading");
      finalSaveButton.disabled = true;

      try {
        const response = await fetch(API_URL, {
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCSRFToken(),
          },
          body: JSON.stringify(dataToSave),
        });

        if (response.ok) {
          document.getElementById("confirmationModal").classList.add("active");
          // Recarrega os dados para atualizar status cards e histórico
          const updatedData = await fetchOfficeData();
          populateForm(updatedData);
        } else {
          alert("Erro ao salvar. Tente novamente.");
        }
      } catch (err) {
        console.error(err);
        alert("Erro de conexão.");
      } finally {
        finalSaveButton.classList.remove("loading");
        finalSaveButton.disabled = false;
      }
    });
  }

  // LÓGICA DE SELEÇÃO DE PLANO
  const setupPlanButtons = () => {
    const planButtons = document.querySelectorAll(".plan-select-btn");
    const planoAtualInput = document.getElementById("planoAtual");
    const statusPlanoNome = document.getElementById("statusPlanoNome");

    // Função para atualizar a aparência dos botões
    const highlightSelectedPlan = (selectedPlan) => {
      planButtons.forEach((btn) => {
        const plan = btn.getAttribute("data-plan");
        if (plan === selectedPlan) {
          btn.classList.add("btn-primary");
          btn.classList.remove("btn-outline");
          // Altera texto do botão para "Atual" (opcional)
          if (btn.textContent.trim() !== "Atual") btn.textContent = "Atual";
        } else {
          btn.classList.add("btn-outline");
          btn.classList.remove("btn-primary");
          if (btn.textContent.trim() !== "Selecionar")
            btn.textContent = "Selecionar";
        }
      });
    };

    planButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const plano = btn.getAttribute("data-plan");
        if (planoAtualInput) planoAtualInput.value = plano;
        if (statusPlanoNome)
          statusPlanoNome.textContent =
            plano === "premium" ? "Premium" : "Básico";
        highlightSelectedPlan(plano);
        alert(
          `Plano ${plano === "premium" ? "Premium" : "Básico"} selecionado. Salve as alterações para efetivar.`,
        );
      });
    });

    // Destaca o plano atual baseado no valor do campo oculto (após carregar dados)
    const currentPlan = planoAtualInput?.value;
    if (currentPlan) highlightSelectedPlan(currentPlan);
  };

  // Upload de logo
  const logoUploadArea = document.getElementById("logoUploadArea");
  const inputLogo = document.getElementById("inputLogo");

  if (logoUploadArea) {
    logoUploadArea.addEventListener("click", () => inputLogo?.click());
    inputLogo?.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("logo", file);
      try {
        const response = await fetch(API_URL, {
          method: "PUT",
          credentials: "include",
          headers: { "X-CSRFToken": getCSRFToken() },
          body: formData,
        });
        if (response.ok) {
          const data = await response.json();
          // Atualiza preview
          const preview = document.getElementById("previewLogo");
          if (preview && data.logo_url) {
            preview.src = data.logo_url; // URL real do servidor
            preview.style.display = "block";
            document.getElementById("uploadText").style.display = "none";
          }
          alert("Logo atualizada com sucesso!");
        } else {
          alert("Erro ao enviar logo");
        }
      } catch (err) {
        console.error(err);
        alert("Erro de conexão");
      }
    });
  }

  // --- 3. INICIALIZAÇÃO ---
  const iniciarTela = async () => {
    try {
      const data = await fetchOfficeData();
      populateForm(data);
      setupPlanButtons(); // ativa os botões de plano
    } catch (error) {
      console.error("Erro ao carregar os dados da tela:", error);
    }
  };

  iniciarTela();

  // --- 4. LÓGICA DE UI (ABAS E MODAIS) ---

  // Gestão de Abas
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));

      btn.classList.add("active");
      const tabId = btn.getAttribute("data-tab");
      document.getElementById(tabId).classList.add("active");
    });
  });

  // Fechar Modal
  const closeModalBtn = document.getElementById("closeModalButton");
  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
      document.getElementById("confirmationModal").classList.remove("active");
    });
  }

  // Fechar ao clicar fora
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal")) {
      e.target.classList.remove("active");
    }
  });

  // --- 5. LÓGICA DE SEGURANÇA (SENHA) ---

  // Toggle Olho
  window.togglePasswordVisibility = function (inputId, iconElement) {
    const input = document.getElementById(inputId);
    if (input.type === "password") {
      input.type = "text";
      iconElement.classList.remove("fa-eye");
      iconElement.classList.add("fa-eye-slash");
    } else {
      input.type = "password";
      iconElement.classList.remove("fa-eye-slash");
      iconElement.classList.add("fa-eye");
    }
  };

  // Salvar Senha
  const btnSavePassword = document.getElementById("btnSavePassword");
  if (btnSavePassword) {
    btnSavePassword.addEventListener("click", () => {
      const currentPass = document.getElementById("currentPassword").value;
      const newPass = document.getElementById("newPassword").value;
      const confirmPass = document.getElementById("confirmPassword").value;
      const errorMsg = document.getElementById("passwordMatchError");

      errorMsg.style.display = "none";

      // Validações Básicas
      if (!currentPass) {
        alert("Por favor, digite sua senha atual.");
        return;
      }
      if (newPass.length < 8) {
        alert("A nova senha deve ter no mínimo 8 caracteres.");
        return;
      }
      if (newPass !== confirmPass) {
        errorMsg.style.display = "block";
        return;
      }

      // Simula salvamento
      const originalText = btnSavePassword.innerHTML;
      btnSavePassword.innerHTML =
        '<div class="loader" style="display:block; border-color: rgba(255,255,255,0.5); border-top-color: white;"></div>';
      btnSavePassword.disabled = true;

      setTimeout(() => {
        btnSavePassword.innerHTML = originalText;
        btnSavePassword.disabled = false;
        document.getElementById("formSecurity").reset();
        alert(
          "Senha alterada com sucesso! Você receberá um e-mail de confirmação.",
        );
      }, 2000);
    });
  }
});
