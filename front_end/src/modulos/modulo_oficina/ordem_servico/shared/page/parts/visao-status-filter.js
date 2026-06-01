// visao-status-filter.js
//
// Conecta os chips de filtro de status (Todas / Pendentes / Em Execução /
// Concluídas) na lista lateral <os-list>. Também controla a abertura do
// drawer com a lista em telas pequenas e atualiza os contadores ao vivo.

const SIDEBAR_OPEN_BREAKPOINT = "(min-width: 1024px)";


export function configurarChipsStatus({ osList, chipsContainer }) {
  if (!osList || !chipsContainer) return;

  const setActive = (filtro) => {
    chipsContainer.querySelectorAll(".status-chip").forEach((chip) => {
      const isActive = chip.dataset.filtro === filtro;
      chip.classList.toggle("active", isActive);
      chip.setAttribute("aria-pressed", String(isActive));
    });
  };

  chipsContainer.querySelectorAll(".status-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const filtro = chip.dataset.filtro || "todos";
      osList.setStatusFilter?.(filtro);
      setActive(filtro);
      // Em mobile, abre o drawer da lista para o usuário ver o resultado
      if (!window.matchMedia(SIDEBAR_OPEN_BREAKPOINT).matches) {
        abrirListaOS();
      }
    });
  });

  // Mantém contadores sincronizados
  osList.addEventListener("os:list-counts", (e) => atualizarContadores(chipsContainer, e.detail));
  osList.addEventListener("os:filter-changed", (e) => setActive(e.detail?.status || "todos"));
}


export function configurarDrawerListaOS() {
  const aside = document.getElementById("osListPanel");
  const overlay = document.getElementById("osListOverlay");
  const btnAbrir = document.getElementById("btnAbrirListaOS");
  const btnFechar = document.getElementById("btnFecharListaOS");

  if (!aside) return;

  btnAbrir?.addEventListener("click", abrirListaOS);
  btnFechar?.addEventListener("click", fecharListaOS);
  overlay?.addEventListener("click", fecharListaOS);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && aside.classList.contains("open")) {
      fecharListaOS();
    }
  });

  // Em desktop, sempre fechar overlay (caso resize)
  window.addEventListener("resize", () => {
    if (window.matchMedia(SIDEBAR_OPEN_BREAKPOINT).matches) {
      fecharListaOS();
    }
  });

  // Selecionar OS fecha o drawer (em mobile)
  document.querySelector("os-list")?.addEventListener("os:select", () => {
    if (!window.matchMedia(SIDEBAR_OPEN_BREAKPOINT).matches) {
      fecharListaOS();
    }
  });
}


export function abrirListaOS() {
  const aside = document.getElementById("osListPanel");
  const overlay = document.getElementById("osListOverlay");
  const btnAbrir = document.getElementById("btnAbrirListaOS");
  aside?.classList.add("open");
  overlay?.classList.add("open");
  btnAbrir?.setAttribute("aria-expanded", "true");
}


export function fecharListaOS() {
  const aside = document.getElementById("osListPanel");
  const overlay = document.getElementById("osListOverlay");
  const btnAbrir = document.getElementById("btnAbrirListaOS");
  aside?.classList.remove("open");
  overlay?.classList.remove("open");
  btnAbrir?.setAttribute("aria-expanded", "false");
}


function atualizarContadores(container, contagem) {
  if (!contagem) return;
  Object.entries(contagem).forEach(([chave, valor]) => {
    const el = container.querySelector(`[data-count="${chave}"]`);
    if (el) el.textContent = String(valor);
  });
}
