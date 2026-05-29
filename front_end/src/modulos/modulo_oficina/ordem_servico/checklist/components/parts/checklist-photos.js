// checklist-photos.js
//
// Tudo relacionado a fotos do checklist:
//  - Configuração de dropzones (drag & drop + click para abrir picker)
//  - Atualização das prévias por categoria e da prévia geral
//  - Carregamento das fotos já enviadas para o servidor
//
// O estado das fotos vive em state.fotosExterno / fotosInterno / fotosMecanica.

import { API_BASE_URL, apiUrl } from "../../../../../../shared/config/api-config.js";
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
    state[arrayKey].push(renomeado);
  });
  atualizarPreviewCategoria(previewSel, counterSel, state[arrayKey]);
  atualizarPreviewGeral();
}


/** Renderiza miniaturas de uma categoria específica. */
export function atualizarPreviewCategoria(previewSel, counterSel, arrayFotos) {
  const grid = document.querySelector(previewSel);
  const counter = document.querySelector(counterSel);
  if (!grid) return;

  grid.innerHTML = "";
  arrayFotos.forEach((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const thumb = document.createElement("div");
      thumb.className = "photo-thumb";
      thumb.style.backgroundImage = `url(${e.target.result})`;
      grid.appendChild(thumb);
    };
    reader.readAsDataURL(file);
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
    const reader = new FileReader();
    reader.onload = (e) => {
      const thumb = document.createElement("div");
      thumb.className = "photo-thumb";
      thumb.style.backgroundImage = `url(${e.target.result})`;
      gridGeral.appendChild(thumb);
    };
    reader.readAsDataURL(file);
  });

  if (counterGeral) {
    counterGeral.innerText = `${todas.length} foto(s) no total`;
    counterGeral.style.color =
      todas.length >= 4 ? "var(--success)" : "var(--warning)";
  }
}


/** Atualiza prévias das 3 categorias com o conteúdo atual de state. */
export function atualizarTodasAsPrevias() {
  const buckets = bucketsPorCategoria();
  Object.values(buckets).forEach((cfg) => {
    atualizarPreviewCategoria(cfg.previewSel, cfg.counterSel, state[cfg.arrayKey]);
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

    const todasFotos = [];
    for (const doc of fotos) {
      const urlCompleta = `${API_BASE_URL}${doc.arquivo}`;
      const response = await fetch(urlCompleta);
      const blob = await response.blob();
      const nomeArquivo = doc.nome_arquivo || "foto.jpg";
      const file = new File([blob], nomeArquivo, { type: blob.type });
      todasFotos.push(file);

      const categoria = categoriaDoDocumento(doc, nomeArquivo);
      if (categoria === "externo") state.fotosExterno.push(file);
      else if (categoria === "interno") state.fotosInterno.push(file);
      else if (categoria === "mecanica") state.fotosMecanica.push(file);
    }

    atualizarTodasAsPrevias();
    renderizarGridGeralComArquivos(todasFotos);
  } catch (e) {
    console.error("Erro ao carregar fotos do servidor:", e);
  }
}


function renderizarGridGeralComArquivos(arquivos) {
  const gridGeral = document.getElementById("photoPreviewGrid");
  const counterGeral = document.getElementById("photoCounter");
  if (!gridGeral) return;

  gridGeral.innerHTML = "";
  arquivos.forEach((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const thumb = document.createElement("div");
      thumb.className = "photo-thumb";
      thumb.style.backgroundImage = `url(${e.target.result})`;
      gridGeral.appendChild(thumb);
    };
    reader.readAsDataURL(file);
  });

  if (counterGeral) {
    counterGeral.innerText = `${arquivos.length} foto(s) no total`;
    counterGeral.style.color =
      arquivos.length >= 4 ? "var(--success)" : "var(--warning)";
  }
}
