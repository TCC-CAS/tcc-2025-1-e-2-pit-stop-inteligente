// admin.js — entrypoint do painel administrativo.
// Faz guard de sessão/permissão, gerencia troca de abas e disparo lazy
// dos módulos correspondentes.

import { garantirAcesso } from "../../../shared/services/auth-guard.js";
import { renderDashboard } from "../components/dashboard-view.js";
import { renderOficinas } from "../components/oficinas-view.js";
import { renderUsuarios } from "../components/usuarios-view.js";
import { renderConfiguracoes } from "../components/configuracoes-view.js";
import { renderAuditoria } from "../components/auditoria-view.js";
import { renderOSAdmin } from "../components/os-view.js";
import { renderBackup } from "../components/backup-view.js";
import {
  renderNotificacoes,
  atualizarBadgeNotificacoesGlobal,
} from "../components/notificacoes-view.js";
import {
  renderSuporteAdmin,
  atualizarBadgeSuporteGlobal,
} from "../components/suporte-view.js";
import { renderSaudeAplicacao, pararPolling as pararPollingSaude } from "../components/saude-view.js";
import { renderSeguranca } from "../components/seguranca-view.js";
import { toast } from "../components/admin-ui.js";


const ABAS = {
  dashboard:    { titulo: "Dashboard",          render: renderDashboard },
  oficinas:     { titulo: "Oficinas",           render: renderOficinas },
  usuarios:     { titulo: "Usuários",           render: renderUsuarios },
  os:           { titulo: "Ordens de Serviço",  render: renderOSAdmin },
  suporte:      { titulo: "Suporte",            render: renderSuporteAdmin },
  saude:        { titulo: "Saúde da aplicação", render: renderSaudeAplicacao },
  seguranca:    { titulo: "Segurança",          render: renderSeguranca },
  configuracoes:{ titulo: "Configurações",      render: renderConfiguracoes },
  notificacoes: { titulo: "Notificações",       render: renderNotificacoes },
  auditoria:    { titulo: "Auditoria",          render: renderAuditoria },
  backup:       { titulo: "Backup do banco",    render: renderBackup },
};


document.addEventListener("DOMContentLoaded", async () => {
  const perfil = await garantirAcesso();
  if (!perfil) return;

  // Verificação extra de papel global (staff/superuser) — front-end + back-end
  const u = perfil.user || {};
  if (!u.is_superuser && !u.is_staff) {
    toast("Você não tem permissão para acessar o painel administrativo.", "error");
    setTimeout(() => {
      window.location.href = "../../modulo_oficina/dashboard/pages/dashboard.html";
    }, 1500);
    return;
  }

  preencherIdentidade(perfil);
  configurarDrawer();
  configurarNavegacao();
  ativarAba(abaInicial());

  // Polling leve dos badges do menu (notificações + suporte)
  atualizarBadgeNotificacoesGlobal();
  atualizarBadgeSuporteGlobal();
  setInterval(() => {
    atualizarBadgeNotificacoesGlobal();
    atualizarBadgeSuporteGlobal();
  }, 30_000);
});


function abaInicial() {
  const hash = (window.location.hash || "").replace(/^#/, "");
  return ABAS[hash] ? hash : "dashboard";
}


function ativarAba(chave) {
  const conf = ABAS[chave] || ABAS.dashboard;
  // Para qualquer polling de aba que possa estar ativa antes de trocar
  pararPollingSaude();

  document.querySelectorAll(".admin-nav-item").forEach((a) => {
    const ativo = a.dataset.tab === chave;
    a.classList.toggle("active", ativo);
    a.setAttribute("aria-current", ativo ? "page" : "false");
  });
  document.getElementById("adminPageTitle").textContent = conf.titulo;
  history.replaceState(null, "", `#${chave}`);
  const main = document.getElementById("adminContent");
  conf.render(main);

  fecharDrawer();
}


function configurarNavegacao() {
  document.querySelectorAll(".admin-nav-item").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      ativarAba(a.dataset.tab);
    });
  });

  window.addEventListener("hashchange", () => ativarAba(abaInicial()));
}


function preencherIdentidade(perfil) {
  const nome = perfil.user.nome_completo || perfil.user.username || "Admin";
  const inicial = (nome.trim().charAt(0) || "A").toUpperCase();
  const papel = perfil.user.is_superuser ? "Super Admin"
              : perfil.user.is_staff ? "Staff"
              : "Sem acesso";
  document.getElementById("adminUserName").textContent = nome;
  document.getElementById("adminUserRole").textContent = papel;
  document.getElementById("adminUserAvatar").textContent = inicial;
}


// -----------------------------------------------------------------------------
// Drawer mobile
// -----------------------------------------------------------------------------

function configurarDrawer() {
  const aside = document.getElementById("adminSidebar");
  const overlay = document.getElementById("adminOverlay");
  const btnAbrir = document.getElementById("btnAbrirAdminMenu");

  btnAbrir?.addEventListener("click", () => {
    aside.classList.add("open");
    overlay.classList.add("open");
    btnAbrir.setAttribute("aria-expanded", "true");
  });
  overlay?.addEventListener("click", fecharDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fecharDrawer();
  });
}


function fecharDrawer() {
  document.getElementById("adminSidebar")?.classList.remove("open");
  document.getElementById("adminOverlay")?.classList.remove("open");
  document.getElementById("btnAbrirAdminMenu")?.setAttribute("aria-expanded", "false");
}
