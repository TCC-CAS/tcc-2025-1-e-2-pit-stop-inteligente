// cliente-toast.js
//
// Sistema mínimo de notificações tipo "toast" (success/error/warning/info).

const ICONS = {
  success: "check-circle",
  error: "exclamation-circle",
  warning: "exclamation-triangle",
  info: "info-circle",
};


export function showToast(mensagem, tipo = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${tipo}`;
  toast.setAttribute("role", "alert");
  toast.setAttribute("aria-live", "polite");
  toast.innerHTML = `
    <i class="fas fa-${ICONS[tipo] || ICONS.info}" aria-hidden="true"></i>
    <span>${mensagem}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
