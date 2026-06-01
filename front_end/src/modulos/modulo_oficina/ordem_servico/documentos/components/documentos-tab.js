// documentos-tab.js
import { API_BASE_URL, apiUrl, getCsrfToken } from "../../../../../shared/config/api-config.js";

// Cache das regras de upload (carregadas do back-end). Permite mostrar
// os limites na UI e validar localmente antes de enviar.
let regrasUploadCache = null;

const DocumentosService = {
  getDocumentos: async (osId) => {
    const response = await fetch(apiUrl(`/os/${osId}/documentos/`), {
        credentials: 'include'
    });
    if (!response.ok) throw new Error("Erro ao carregar documentos");
    const data = await response.json();
    // Mapeia para incluir a URL completa de download (usando o campo 'arquivo')
    return data.map((doc) => ({
      ...doc,
      download_url: `${API_BASE_URL}${doc.arquivo}`,
    }));
  },
  getRegrasUpload: async () => {
    if (regrasUploadCache) return regrasUploadCache;
    try {
      const response = await fetch(apiUrl("/upload-os/regras/"), {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Erro ao carregar regras de upload");
      regrasUploadCache = await response.json();
    } catch (err) {
      // Fallback conservador para evitar quebra de UI se o endpoint falhar
      regrasUploadCache = {
        tamanho_max_mb: 10,
        tamanho_max_bytes: 10 * 1024 * 1024,
        mimes_permitidos: ["image/jpeg", "image/png", "application/pdf"],
        extensoes_permitidas: ["jpg", "jpeg", "png", "pdf"],
      };
    }
    return regrasUploadCache;
  },
  uploadDocumentos: async (osId, files) => {
    const formData = new FormData();
    for (let file of files) {
      formData.append("files", file);
    }
    const response = await fetch(apiUrl(`/os/${osId}/documentos/upload/`), {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRFToken": getCsrfToken() },
      body: formData,
    });
    if (!response.ok) {
      // Tenta extrair mensagem amigável do back (400/402)
      let mensagem = `Erro HTTP ${response.status}`;
      try {
        const body = await response.json();
        mensagem = body.erro || body.error || mensagem;
      } catch { /* ignore */ }
      const err = new Error(mensagem);
      err.status = response.status;
      throw err;
    }
    return response.json();
  },
  removerDocumento: async (documentoId) => {
    const response = await fetch(apiUrl(`/documentos/${documentoId}/`), {
      method: "DELETE",
      credentials: "include",
      headers: { "X-CSRFToken": getCsrfToken() },
    });
    if (!response.ok) throw new Error("Erro ao remover documento");
  },
  downloadDocumento: async (documentoId, url) => {
    // Abrir em nova aba ou forçar download
    window.open(url, "_blank");
  },
};

let currentOsId = null;

export function initDocumentos(osId) {
  currentOsId = osId;
  if (!currentOsId) return;

  const btnIncluir = document.getElementById("btnIncluirDocumento");
  const grid = document.getElementById("docsGridBody");
  const modal = document.getElementById("mainModal");
  const tmplDoc = document.getElementById("tmplDocumento");

  if (!btnIncluir || !grid || !modal || !tmplDoc) {
    console.error("Elementos obrigatórios não encontrados na aba Documentos.");
    return;
  }

  carregarDocumentos(grid, tmplDoc);

  btnIncluir.addEventListener("click", () => {
    abrirModalDocumentos(modal, grid, tmplDoc);
  });
}

async function carregarDocumentos(gridElement, templateElement) {
  try {
    const documentos = await DocumentosService.getDocumentos(currentOsId);
    renderizarGrade(gridElement, templateElement, documentos);
  } catch (error) {
    console.error("Erro ao carregar documentos:", error);
    gridElement.innerHTML =
      '<div class="error-message">Erro ao carregar documentos.</div>';
  }
}

function renderizarGrade(gridElement, templateElement, documentos) {
  gridElement.innerHTML = "";

  if (documentos.length === 0) {
    gridElement.innerHTML =
      '<div class="empty-state">Nenhum documento anexado.</div>';
    return;
  }

  documentos.forEach((doc) => {
    const clone = document.importNode(templateElement.content, true);
    const card = clone.querySelector(".doc-card");
    card.dataset.id = doc.id;
    card.dataset.url = doc.download_url;

    // Ícone conforme extensão
    const icon = clone.querySelector(".doc-icon i");
    setIconForType(icon, doc.tipo || doc.nome);

    clone.querySelector(".doc-name").textContent = doc.nome;
    clone.querySelector(".doc-date").textContent = doc.dataInclusao || "";

    // Clique no card para baixar/visualizar
    card.addEventListener("click", (e) => {
      if (e.target.closest(".btn-remover-doc")) return; // evitar conflito
      DocumentosService.downloadDocumento(doc.id, doc.download_url);
    });

    // Botão remover
    const btnRemover = clone.querySelector(".btn-remover-doc");
    btnRemover.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm(`Remover "${doc.nome}" permanentemente?`)) {
        try {
          await DocumentosService.removerDocumento(doc.id);
          carregarDocumentos(gridElement, templateElement);
        } catch (error) {
          console.error(error);
          alert("Erro ao remover documento.");
        }
      }
    });

    gridElement.appendChild(clone);
  });
}

function setIconForType(iconElement, nomeOuExtensao) {
  const ext = (nomeOuExtensao || "").split(".").pop().toLowerCase();
  if (ext === "pdf") {
    iconElement.className = "fas fa-file-pdf";
  } else if (["jpg", "jpeg", "png", "gif", "bmp", "webp"].includes(ext)) {
    iconElement.className = "fas fa-file-image";
  } else if (["doc", "docx"].includes(ext)) {
    iconElement.className = "fas fa-file-word";
  } else if (["xls", "xlsx"].includes(ext)) {
    iconElement.className = "fas fa-file-excel";
  } else if (["txt", "rtf"].includes(ext)) {
    iconElement.className = "fas fa-file-alt";
  } else {
    iconElement.className = "fas fa-file";
  }
}

async function abrirModalDocumentos(modalElement, gridElement, templateElement) {
  // Limpa conteúdo anterior do modal
  while (modalElement.firstChild) {
    modalElement.removeChild(modalElement.firstChild);
  }

  const osNumero =
    document.getElementById("header-os-id")?.textContent || currentOsId;

  // Carrega regras de upload do servidor para configurar `accept` do input
  // e exibir limites ao usuário.
  const regras = await DocumentosService.getRegrasUpload();
  const acceptAttr = (regras.extensoes_permitidas || [])
    .map((e) => `.${e}`)
    .join(",");
  const tiposLegiveis = (regras.extensoes_permitidas || [])
    .map((e) => e.toUpperCase())
    .join(", ");

  const titleSpan = document.createElement("span");
  titleSpan.setAttribute("slot", "title");
  titleSpan.textContent = `Documentos - OS #${osNumero}`;

  const bodyDiv = document.createElement("div");
  bodyDiv.setAttribute("slot", "body");
  bodyDiv.innerHTML = `
        <div class="upload-area">
            <label for="fileUpload" class="btn btn-secondary">
                <i class="fas fa-cloud-upload-alt"></i> Selecionar arquivos
            </label>
            <input type="file" id="fileUpload" multiple accept="${acceptAttr}" style="display: none;">
            <span class="selected-files"></span>
            <button class="btn btn-primary" id="btnUploadArquivos" disabled>Enviar arquivos</button>
        </div>
        <p class="upload-regras" style="margin: 8px 0 4px; color: #475569; font-size: 12px;">
          <i class="fas fa-circle-info"></i>
          Aceitamos ${tiposLegiveis || "todos os tipos"}
          até <strong>${regras.tamanho_max_mb || 10} MB</strong> por arquivo.
        </p>
        <p class="upload-erros" style="margin: 0 0 8px; color: #b91c1c; font-size: 12px;"></p>
        <div class="docs-grid modal-docs-grid" id="modalDocsGrid"></div>
    `;

  const footerDiv = document.createElement("div");
  footerDiv.setAttribute("slot", "footer");
  footerDiv.innerHTML = `
        <button class="btn btn-secondary close-modal" type="button">Fechar</button>
    `;

  modalElement.appendChild(titleSpan);
  modalElement.appendChild(bodyDiv);
  modalElement.appendChild(footerDiv);

  const fileInput = modalElement.querySelector("#fileUpload");
  const btnUpload = modalElement.querySelector("#btnUploadArquivos");
  const selectedSpan = modalElement.querySelector(".selected-files");
  let modalGrid = modalElement.querySelector("#modalDocsGrid");

  // Clona a grade atual para dentro do modal
  const cloneGrid = gridElement.cloneNode(true);
  cloneGrid.id = "modalDocsGrid";
  if (modalGrid) {
    modalGrid.replaceWith(cloneGrid);
  } else {
    bodyDiv.appendChild(cloneGrid);
  }

  // Atualiza a grade sempre que o modal abrir
  carregarDocumentos(cloneGrid, templateElement);

  const errosEl = modalElement.querySelector(".upload-erros");

  fileInput.addEventListener("change", () => {
    errosEl.textContent = "";
    const files = Array.from(fileInput.files || []);
    if (files.length === 0) {
      selectedSpan.textContent = "";
      btnUpload.disabled = true;
      return;
    }

    // Validação local com base nas regras carregadas
    const erro = validarArquivosLocal(files, regras);
    if (erro) {
      errosEl.textContent = erro;
      selectedSpan.textContent = "";
      fileInput.value = "";
      btnUpload.disabled = true;
      return;
    }

    selectedSpan.textContent = `${files.length} arquivo(s) selecionado(s)`;
    btnUpload.disabled = false;
  });

  btnUpload.addEventListener("click", async (event) => {
    event.preventDefault();
    const files = fileInput.files;
    if (files.length === 0) return;

    errosEl.textContent = "";
    btnUpload.disabled = true;
    btnUpload.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

    try {
      await DocumentosService.uploadDocumentos(currentOsId, files);
      // Recarrega a grade principal e a do modal
      await carregarDocumentos(gridElement, templateElement);
      const novaGrid = gridElement.cloneNode(true);
      novaGrid.id = "modalDocsGrid";
      const modalGridContainer = modalElement.querySelector("#modalDocsGrid");
      if (modalGridContainer) modalGridContainer.replaceWith(novaGrid);
      await carregarDocumentos(novaGrid, templateElement);

      fileInput.value = "";
      selectedSpan.textContent = "";
      btnUpload.disabled = true;
      btnUpload.innerHTML = "Enviar arquivos";
    } catch (error) {
      // Mostra mensagem do servidor (ex.: limite/MIME/quota) em vez de
      // alert genérico — UX significativamente melhor.
      console.error("Erro no upload:", error);
      errosEl.textContent = error.message || "Erro ao enviar arquivos.";
      btnUpload.disabled = false;
      btnUpload.innerHTML = "Enviar arquivos";
    }
  });

  modalElement
    .querySelector(".close-modal")
    .addEventListener("click", () => modalElement.close());
  modalElement.open();
}


/**
 * Valida cada arquivo localmente antes de enviar — espelha a regra do
 * backend para evitar request inútil + dar feedback imediato.
 * Retorna string de erro do PRIMEIRO arquivo inválido, ou "" se tudo OK.
 */
function validarArquivosLocal(files, regras) {
  const maxBytes = regras.tamanho_max_bytes || (regras.tamanho_max_mb || 10) * 1024 * 1024;
  const mimes = new Set((regras.mimes_permitidos || []).map((m) => m.toLowerCase()));
  const exts = new Set((regras.extensoes_permitidas || []).map((e) => e.toLowerCase()));

  for (const file of files) {
    // 1) Tamanho
    if (maxBytes > 0 && file.size > maxBytes) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      return `Arquivo "${file.name}" tem ${mb} MB — excede o limite de ${regras.tamanho_max_mb} MB.`;
    }

    // 2) MIME (quando disponível)
    const mime = (file.type || "").toLowerCase();
    if (mimes.size > 0 && mime && !mimes.has(mime)) {
      return `Tipo "${mime}" não é aceito. Aceitos: ${[...mimes].join(", ")}.`;
    }

    // 3) Extensão (sanity check)
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (exts.size > 0 && ext && !exts.has(ext)) {
      return `Extensão ".${ext}" não é aceita. Aceitas: ${[...exts].map((e) => "." + e).join(", ")}.`;
    }
  }
  return "";
}
