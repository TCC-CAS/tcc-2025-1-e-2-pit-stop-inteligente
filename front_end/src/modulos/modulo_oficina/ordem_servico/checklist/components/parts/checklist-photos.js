// checklist-photos.js
//
// Tudo relacionado a fotos do checklist:
//  - Configuração de dropzones (drag & drop + click para abrir picker)
//  - Atualização das prévias por categoria e da prévia geral
//  - Carregamento das fotos já enviadas para o servidor
//  - Remoção de fotos (local + DELETE no servidor quando aplicável)
//
// O estado das fotos vive em state.fotosExterno / fotosInterno / fotosMecanica.
// Cada `File` carrega dois atributos auxiliares anexados em runtime:
//   - `_arrayKey`: a chave do array em `state` ("fotosExterno" etc.) — permite
//                  descobrir o array de origem na grade geral.
//   - `documentoId`: presente apenas em fotos vindas do back-end. Quando
//                    existe, a remoção dispara DELETE na API antes de tirar
//                    do array local.

import { API_BASE_URL, apiUrl, getCsrfToken } from "../../../../../../shared/config/api-config.js";
import { state } from "./checklist-state.js";


// Mapas categoria → seletores e referência ao array em state.
function bucketsPorCategoria() {
  return {
    externo: {
      arrayKey: "fotosExterno",
      previewSel: ".preview-externo",
      counterSel: ".count-externo",
    },
    interno: {
      arrayKey: "fotosInterno",
      previewSel: ".preview-interno",
      counterSel: ".count-interno",
    },
    mecanica: {
      arrayKey: "fotosMecanica",
      previewSel: ".preview-mecanica",
      counterSel: ".count-mecanica",
    },
  };
}


function buscarBucket({ arrayKey }) {
  return Object.values(bucketsPorCategoria()).find(
    (b) => b.arrayKey === arrayKey,
  );
}


/** Configura todas as dropzones (chamado ao abrir o wizard em modo edição). */
export function configurarUploads() {
  setTimeout(() => {
    const buckets = bucketsPorCategoria();
    Object.entries(buckets).forEach(([categoria, cfg]) => {
      configurarDropzone(categoria, cfg.arrayKey, cfg.previewSel, cfg.counterSel);
    });
  }, 50);
}


function configurarDropzone(categoria, arrayKey, previewSel, counterSel) {
  const dropzone = document.querySelector(
    `.photo-dropzone[data-categoria="${categoria}"]`,
  );
  const fileInput = document.querySelector(`.file-input-${categoria}`);
  if (!dropzone || !fileInput) return;

  dropzone.onclick = () => fileInput.click();

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "var(--primary)";
    dropzone.style.background = "#eff6ff";
  });
  dropzone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "var(--gray-300)";
    dropzone.style.background = "var(--gray-50)";
  });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "var(--gray-300)";
    dropzone.style.background = "var(--gray-50)";
    const arquivos = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/"),
    );
    adicionarFotos(arquivos, categoria, arrayKey, previewSel, counterSel);
  });

  fileInput.onchange = (e) => {
    const arquivos = Array.from(e.target.files);
    adicionarFotos(arquivos, categoria, arrayKey, previewSel, counterSel);
    fileInput.value = "";
  };
}


function adicionarFotos(files, categoria, arrayKey, previewSel, counterSel) {
  files.forEach((file) => {
    const renomeado = new File([file], `${categoria}_${file.name}`, {
      type: file.type,
    });
    // Marca a qual array essa foto pertence; usado pela grade geral
    // para localizar o array correto na hora de remover.
    renomeado._arrayKey = arrayKey;
    state[arrayKey].push(renomeado);
  });
  atualizarPreviewCategoria(previewSel, counterSel, state[arrayKey], arrayKey);
  atualizarPreviewGeral();
}


/**
 * Cria a miniatura (.photo-thumb) com o botão "X" de remover.
 * Internamente lê o arquivo via FileReader e configura o handler de remoção.
 * Quando `removivel` é false, retorna o thumb sem o botão (uso futuro / fallback).
 */
function _criarThumb({ file, onRemover, removivel = true }) {
  const thumb = document.createElement("div");
  thumb.className = "photo-thumb";

  const reader = new FileReader();
  reader.onload = (e) => {
    thumb.style.backgroundImage = `url(${e.target.result})`;
  };
  reader.readAsDataURL(file);

  if (removivel && typeof onRemover === "function") {
    const btnRemover = document.createElement("button");
    btnRemover.type = "button";
    btnRemover.className = "photo-thumb-remover";
    btnRemover.setAttribute("aria-label", "Remover foto");
    btnRemover.title = "Remover foto";
    btnRemover.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
    btnRemover.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      btnRemover.disabled = true;
      try {
        await onRemover();
      } finally {
        // O thumb será removido pelo re-render — não precisamos reabilitar.
      }
    });
    thumb.appendChild(btnRemover);
  }
  return thumb;
}


/**
 * Remove uma foto: se a foto já existe no servidor (tem documentoId),
 * dispara DELETE na API; em seguida tira do array de state e re-renderiza
 * as prévias afetadas.
 */
async function removerFoto({ arrayKey, file }) {
  const arr = state[arrayKey];
  const idx = arr.indexOf(file);
  if (idx === -1) return;

  if (file.documentoId) {
    try {
      const res = await fetch(apiUrl(`/documentos/${file.documentoId}/`), {
        method: "DELETE",
        credentials: "include",
        headers: { "X-CSRFToken": getCsrfToken() },
      });
      if (!res.ok && res.status !== 404) {
        const corpo = await res.text().catch(() => "");
        console.error("[checklist-photos] DELETE falhou", res.status, corpo);
        alert("Não foi possível remover a foto do servidor. Tente novamente.");
        return;
      }
    } catch (err) {
      console.error("[checklist-photos] erro ao remover foto:", err);
      alert("Erro de conexão ao remover a foto. Verifique sua internet.");
      return;
    }
  }

  arr.splice(idx, 1);
  const bucket = buscarBucket({ arrayKey });
  if (bucket) {
    atualizarPreviewCategoria(bucket.previewSel, bucket.counterSel, arr, arrayKey);
  }
  atualizarPreviewGeral();
}


/**
 * Renderiza miniaturas de uma categoria específica.
 *
 * `arrayKey` é opcional — quando informado, cada miniatura ganha um botão
 * "X" de remover. Sem ele, mantém comportamento legado (somente leitura).
 */
export function atualizarPreviewCategoria(previewSel, counterSel, arrayFotos, arrayKey) {
  const grid = document.querySelector(previewSel);
  const counter = document.querySelector(counterSel);
  if (!grid) return;

  grid.innerHTML = "";
  arrayFotos.forEach((file) => {
    const thumb = _criarThumb({
      file,
      removivel: Boolean(arrayKey),
      onRemover: arrayKey
        ? () => removerFoto({ arrayKey, file })
        : null,
    });
    grid.appendChild(thumb);
  });
  if (counter) counter.innerText = `${arrayFotos.length} foto(s)`;
}


/** Renderiza grade geral com todas as fotos somadas, e atualiza contador colorido. */
export function atualizarPreviewGeral() {
  const gridGeral = document.getElementById("photoPreviewGrid");
  const counterGeral = document.getElementById("photoCounter");
  if (!gridGeral) return;

  const todas = [
    ...state.fotosExterno,
    ...state.fotosInterno,
    ...state.fotosMecanica,
  ];

  gridGeral.innerHTML = "";
  todas.forEach((file) => {
    const arrayKey = file._arrayKey || _inferirArrayKey(file);
    const thumb = _criarThumb({
      file,
      removivel: Boolean(arrayKey),
      onRemover: arrayKey
        ? () => removerFoto({ arrayKey, file })
        : null,
    });
    gridGeral.appendChild(thumb);
  });

  if (counterGeral) {
    counterGeral.innerText = `${todas.length} foto(s) no total`;
    counterGeral.style.color =
      todas.length >= 4 ? "var(--success)" : "var(--warning)";
  }
}


/**
 * Tenta descobrir o arrayKey de um arquivo pelo prefixo do nome
 * (categoria_xxx.jpg). Usado como fallback caso `_arrayKey` esteja ausente.
 */
function _inferirArrayKey(file) {
  const nome = file?.name || "";
  if (nome.startsWith("externo_")) return "fotosExterno";
  if (nome.startsWith("interno_")) return "fotosInterno";
  if (nome.startsWith("mecanica_")) return "fotosMecanica";
  return null;
}


/** Atualiza prévias das 3 categorias com o conteúdo atual de state. */
export function atualizarTodasAsPrevias() {
  const buckets = bucketsPorCategoria();
  Object.values(buckets).forEach((cfg) => {
    atualizarPreviewCategoria(
      cfg.previewSel, cfg.counterSel, state[cfg.arrayKey], cfg.arrayKey,
    );
  });
}


/** Detecta a categoria de uma foto a partir do registro salvo no banco. */
function categoriaDoDocumento(doc, nomeArquivo) {
  if (doc.categoria) return doc.categoria;
  if (nomeArquivo.startsWith("externo_")) return "externo";
  if (nomeArquivo.startsWith("interno_")) return "interno";
  if (nomeArquivo.startsWith("mecanica_")) return "mecanica";
  return "externo";
}


/** Baixa as fotos do servidor para os arrays do state e re-renderiza prévias. */
export async function carregarFotosDoServidor() {
  try {
    const res = await fetch(apiUrl(`/os/${state.currentOsId}/documentos/`), {
      credentials: 'include'
    });
    if (!res.ok) return;

    const docs = await res.json();
    const fotos = docs.filter((d) => d.origem === "checklist");

    // Reset
    state.fotosExterno.length = 0;
    state.fotosInterno.length = 0;
    state.fotosMecanica.length = 0;

    for (const doc of fotos) {
      const urlCompleta = `${API_BASE_URL}${doc.arquivo}`;
      const response = await fetch(urlCompleta);
      const blob = await response.blob();
      const nomeArquivo = doc.nome_arquivo || "foto.jpg";
      const file = new File([blob], nomeArquivo, { type: blob.type });
      // ID do documento no banco — habilita o DELETE na API ao remover.
      file.documentoId = doc.id;

      const categoria = categoriaDoDocumento(doc, nomeArquivo);
      const arrayKey =
        categoria === "interno"  ? "fotosInterno"  :
        categoria === "mecanica" ? "fotosMecanica" :
                                    "fotosExterno";
      file._arrayKey = arrayKey;
      state[arrayKey].push(file);
    }

    atualizarTodasAsPrevias();
    atualizarPreviewGeral();
  } catch (e) {
    console.error("Erro ao carregar fotos do servidor:", e);
  }
}
