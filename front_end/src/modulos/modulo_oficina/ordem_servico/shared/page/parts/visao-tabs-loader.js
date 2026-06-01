// visao-tabs-loader.js
//
// Carregamento dinâmico (lazy) das abas da OS:
//  1. fetch do HTML da aba e injeção em #content-area;
//  2. import dinâmico do módulo JS correspondente;
//  3. chamada da função init<NomeDaAba>(osId).
//
// Cada aba expõe sua própria init pública (initChecklist, initDetalhes, …),
// detectada por convenção de nome.

const TAB_HTML_PATHS = {
  checklist: "../../checklist/components/checklist-tab.html",
  detalhes: "../../detalhes/components/detalhes-tab.html",
  diagnostico: "../../diagnostico_orcamento/components/diagnostico-tab.html",
  aprovacao: "../../aprovacao/components/aprovacao-tab.html",
  execucao: "../../execucao/components/execucao-tab.html",
  documentos: "../../documentos/components/documentos-tab.html",
  historico: "../../historico/components/historico-tab.html",
};

const TAB_MODULES = {
  checklist: () => import("../../../checklist/components/checklist-tab.js"),
  detalhes: () => import("../../../detalhes/components/detalhes-tab.js"),
  diagnostico: () => import("../../../diagnostico_orcamento/components/diagnostico-tab.js"),
  aprovacao: () => import("../../../aprovacao/components/aprovacao-tab.js"),
  execucao: () => import("../../../execucao/components/execucao-tab.js"),
  documentos: () => import("../../../documentos/components/documentos-tab.js"),
  historico: () => import("../../../historico/components/historico-tab.js"),
};


/** Carrega a aba alvo no #content-area e chama o init correspondente. */
export async function carregarAba(tabName, { tabsComponent, osId, onEmpty }) {
  if (!osId) {
    onEmpty?.();
    return;
  }

  const contentArea = document.getElementById("content-area");
  const path = TAB_HTML_PATHS[tabName];
  if (!path || !contentArea) return;

  try {
    const html = await fetchHtml(path);
    montarContent(contentArea, html, osId);
    await chamarInit(tabName, tabsComponent, osId);
  } catch (error) {
    console.error("Erro ao carregar aba:", error);
    contentArea.innerHTML = `<p style="color:red;">Erro ao carregar conteúdo da aba.</p>`;
  }
}


async function fetchHtml(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
  return response.text();
}


function montarContent(contentArea, html, osId) {
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;

  // Insere um campo hidden #os-id para que abas legadas possam ler o ID
  const hidden = document.createElement("input");
  hidden.type = "hidden";
  hidden.id = "os-id";
  hidden.value = osId;
  tempDiv.insertBefore(hidden, tempDiv.firstChild);

  contentArea.innerHTML = "";
  contentArea.appendChild(tempDiv);
}


async function chamarInit(tabName, tabsComponent, osId) {
  const loader = TAB_MODULES[tabName];
  if (!loader) return;

  const module = await loader();

  if (tabName === "checklist" && module.initChecklist) {
    module.initChecklist(tabsComponent, osId);
  } else if (tabName === "detalhes" && module.initDetalhes) {
    module.initDetalhes(osId);
  } else if (tabName === "diagnostico" && module.initDiagnostico) {
    module.initDiagnostico(osId);
  } else if (tabName === "aprovacao" && module.initAprovacao) {
    module.initAprovacao(osId);
  } else if (tabName === "execucao" && module.initExecucao) {
    module.initExecucao(osId);
  } else if (tabName === "documentos" && module.initDocumentos) {
    module.initDocumentos(osId);
  } else if (tabName === "historico" && module.initHistorico) {
    module.initHistorico(osId);
  }
}
