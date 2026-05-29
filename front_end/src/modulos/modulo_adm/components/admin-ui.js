// admin-ui.js — utilitários de UI (toast e confirm) usados em todas as abas.
// Mantém o look-and-feel consistente sem depender de libs externas.

let toastContainer;


/** Toast leve no canto inferior direito; expira em 4s. */
export function toast(message, kind = "success") {
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.className = "admin-toast-container";
    document.body.appendChild(toastContainer);
  }
  const el = document.createElement("div");
  el.className = `admin-toast admin-toast-${kind}`;
  el.setAttribute("role", "status");
  el.innerHTML = `
    <i class="fas ${iconFor(kind)}" aria-hidden="true"></i>
    <span>${escapeHtml(message)}</span>
  `;
  toastContainer.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 250);
  }, 3800);
}


/** Confirma uma ação destrutiva — promise que resolve com boolean. */
export function confirmarAcao({ titulo, mensagem, confirmar = "Confirmar", cancelar = "Cancelar", perigo = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "admin-confirm-overlay";
    overlay.innerHTML = `
      <div class="admin-confirm-card" role="alertdialog" aria-modal="true"
           aria-labelledby="acTitle" aria-describedby="acMsg">
        <h3 id="acTitle">${escapeHtml(titulo)}</h3>
        <p id="acMsg">${escapeHtml(mensagem)}</p>
        <div class="admin-confirm-actions">
          <button type="button" class="btn btn-outline-secondary" data-action="cancel">${escapeHtml(cancelar)}</button>
          <button type="button" class="btn ${perigo ? "btn-danger" : "btn-primary"}" data-action="ok">${escapeHtml(confirmar)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = (resultado) => {
      overlay.classList.add("closing");
      setTimeout(() => overlay.remove(), 180);
      resolve(resultado);
    };
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });
    overlay.querySelector('[data-action="cancel"]').addEventListener("click", () => close(false));
    overlay.querySelector('[data-action="ok"]').addEventListener("click", () => close(true));
    document.addEventListener("keydown", function esc(ev) {
      if (ev.key === "Escape") { document.removeEventListener("keydown", esc); close(false); }
    });
    requestAnimationFrame(() => overlay.classList.add("open"));
    overlay.querySelector('[data-action="ok"]').focus();
  });
}


export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[m]);
}


export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}


function iconFor(kind) {
  return {
    success: "fa-check-circle",
    error:   "fa-times-circle",
    warning: "fa-exclamation-triangle",
    info:    "fa-info-circle",
  }[kind] || "fa-info-circle";
}
