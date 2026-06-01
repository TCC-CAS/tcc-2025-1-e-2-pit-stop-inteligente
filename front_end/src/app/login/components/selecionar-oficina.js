// selecionar-oficina.js
//
// Tela exibida após o login quando o usuário tem acesso a 2+ oficinas.
// Lista os vínculos via /auth/me/, deixa o usuário escolher uma e
// redireciona para o dashboard.

import {
  carregarPerfil,
  logout,
  selecionarOficina,
} from "../../../shared/services/auth-service.js";
import {
  redirecionarPara,
  redirecionarParaLogin,
  ROTAS,
} from "../../../shared/services/auth-guard.js";


const PAPEIS_LABEL = {
  admin: "Administrador",
  gerente: "Gerente",
  atendente: "Atendente",
  mecanico: "Mecânico",
  visualizador: "Visualizador",
};


document.addEventListener("DOMContentLoaded", inicializar);


async function inicializar() {
  document.getElementById("btnSair")?.addEventListener("click", sair);

  let perfil;
  try {
    perfil = await carregarPerfil({ force: true });
  } catch (error) {
    console.error(error);
    return redirecionarParaLogin();
  }

  if (!perfil) return redirecionarParaLogin();

  // Se já houver oficina ativa, vai direto pro dashboard
  if (perfil.oficina_atual_id) {
    return redirecionarPara(ROTAS.dashboard);
  }

  // Se houver apenas uma oficina, seleciona automaticamente
  if (perfil.oficinas.length === 1) {
    return await escolher(perfil.oficinas[0].oficina.id);
  }

  // Se não houver oficina vinculada, mensagem de orientação
  if (perfil.oficinas.length === 0) {
    renderizarSemVinculo();
    return;
  }

  renderizarLista(perfil);
}


function renderizarLista(perfil) {
  const container = document.getElementById("listaOficinas");
  if (!container) return;

  const subtitulo = document.getElementById("selectorSubtitle");
  if (subtitulo) {
    subtitulo.textContent = `Olá, ${perfil.user.nome_completo || perfil.user.username}! Selecione a oficina que deseja gerenciar.`;
  }

  container.setAttribute("aria-busy", "false");
  container.innerHTML = "";

  perfil.oficinas.forEach((vinculo) => {
    container.appendChild(montarCard(vinculo));
  });
}


function montarCard(vinculo) {
  const { oficina, permissao } = vinculo;
  const card = document.createElement("button");
  card.type = "button";
  card.className = "oficina-card";
  card.setAttribute("aria-label", `Selecionar oficina ${oficina.nome}`);

  card.innerHTML = `
    <div class="oficina-icon" aria-hidden="true">
      <i class="fas fa-warehouse"></i>
    </div>
    <div class="oficina-info">
      <strong class="oficina-nome">${escapeHtml(oficina.nome)}</strong>
      <span class="oficina-cnpj">CNPJ: ${escapeHtml(oficina.cnpj || "—")}</span>
      <span class="oficina-papel">${PAPEIS_LABEL[permissao] || permissao}</span>
    </div>
    <div class="oficina-arrow" aria-hidden="true">
      <i class="fas fa-chevron-right"></i>
    </div>
  `;
  card.addEventListener("click", () => escolher(oficina.id));
  return card;
}


function renderizarSemVinculo() {
  const container = document.getElementById("listaOficinas");
  if (!container) return;
  container.setAttribute("aria-busy", "false");
  container.innerHTML = `
    <div class="sem-vinculo" role="alert">
      <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
      <h2>Sem oficina vinculada</h2>
      <p>Sua conta ainda não está associada a nenhuma oficina ativa. Procure o administrador para liberar seu acesso.</p>
    </div>
  `;
}


async function escolher(oficinaId) {
  const cards = document.querySelectorAll(".oficina-card");
  cards.forEach((c) => (c.disabled = true));

  try {
    await selecionarOficina(oficinaId);
    redirecionarPara(ROTAS.dashboard);
  } catch (error) {
    alert(error.message);
    cards.forEach((c) => (c.disabled = false));
  }
}


async function sair() {
  try {
    await logout();
  } finally {
    redirecionarParaLogin();
  }
}


function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[m]);
}
