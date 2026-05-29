// suporte-chat.js
//
// Render reutilizável de UI de tickets (lista + chat) compartilhado por
// oficina, cliente e painel admin. Recebe uma "API client" injetada com
// 4 métodos:
//   listar(filtros), detalhe(id), criar(payload), responder(id, conteudo)
// — e (opcional) `atualizar(id, payload)` para o ADM mexer em status.
//
// Mantemos tudo em funções puras + delegação de eventos para que cada
// contexto importe a função apropriada (renderSuporte(container, api,
// opts)) sem precisar reimplementar markup/CSS.

import "../components/status-badge.js";


const CATEGORIA_LABEL = {
  tecnico: "Técnico",
  financeiro: "Financeiro",
  acesso: "Acesso",
  duvida: "Dúvida geral",
  sugestao: "Sugestão",
  outro: "Outro",
};

const STATUS_LABEL = {
  aberto: "Aberto",
  em_atendimento: "Em atendimento",
  aguardando_usuario: "Aguardando usuário",
  resolvido: "Resolvido",
  fechado: "Fechado",
};
const STATUS_CLS = {
  aberto: "warn",
  em_atendimento: "info",
  aguardando_usuario: "info",
  resolvido: "ok",
  fechado: "off",
};

const PRIORIDADE_CLS = {
  baixa: "info",
  normal: "info",
  alta: "warn",
  urgente: "danger",
};


let estado = {
  tickets: [],
  filtros: { status: "", prioridade: "", busca: "" },
  selecionado: null,
};


export async function renderSuporte(container, api, opts = {}) {
  estado = { tickets: [], filtros: { status: "", prioridade: "", busca: "" }, selecionado: null };

  container.innerHTML = `
    <section class="suporte-shell" data-modo="${opts.modo || "usuario"}">
      <aside class="suporte-lista">
        <header>
          <h2>${opts.titulo || "Suas solicitações"}</h2>
          ${opts.podeCriar !== false
            ? `<button class="btn btn-primary btn-sm" id="btnNovoTicket" type="button">
                 <i class="fas fa-plus"></i> Novo chamado
               </button>` : ""}
        </header>
        <div class="suporte-filtros">
          <input type="search" id="filtroBusca" class="form-control form-control-sm"
                 placeholder="Buscar por título, descrição…" aria-label="Buscar tickets">
          <select id="filtroStatus" class="form-control form-control-sm">
            <option value="">Todos os status</option>
            ${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
          </select>
          <select id="filtroPrioridade" class="form-control form-control-sm">
            <option value="">Todas as prioridades</option>
            <option value="urgente">Urgente</option>
            <option value="alta">Alta</option>
            <option value="normal">Normal</option>
            <option value="baixa">Baixa</option>
          </select>
        </div>
        <ul id="ticketsList" class="suporte-tickets">
          <li class="suporte-empty">Carregando…</li>
        </ul>
      </aside>

      <article class="suporte-detalhe" id="ticketDetalhe">
        <div class="suporte-empty-state">
          <i class="fas fa-comments" aria-hidden="true"></i>
          <h3>Selecione um chamado</h3>
          <p>${opts.modo === "admin"
              ? "Escolha um ticket na lista para responder ao usuário."
              : "Escolha um chamado existente ou abra um novo."}</p>
        </div>
      </article>
    </section>

    <div class="suporte-modal" id="suporteModalNovo" hidden role="dialog" aria-modal="true">
      <form class="suporte-modal-card" id="suporteFormNovo">
        <header>
          <h3><i class="fas fa-plus-circle"></i> Abrir novo chamado</h3>
          <button class="btn-icon" type="button" data-fechar><i class="fas fa-xmark"></i></button>
        </header>
        <div class="suporte-modal-body">
          <label>
            Título <span class="required">*</span>
            <input type="text" id="novoTitulo" class="form-control" required
                   maxlength="160" placeholder="Resuma em uma frase">
          </label>
          <label>
            Categoria
            <select id="novoCategoria" class="form-control">
              ${Object.entries(CATEGORIA_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
            </select>
          </label>
          <label>
            Prioridade
            <select id="novoPrioridade" class="form-control">
              <option value="baixa">Baixa</option>
              <option value="normal" selected>Normal</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
          </label>
          <label>
            Descrição <span class="required">*</span>
            <textarea id="novoDescricao" class="form-control" rows="6" required
                      placeholder="Descreva o problema, contexto e passos para reproduzir."></textarea>
          </label>
        </div>
        <footer>
          <button class="btn btn-outline-secondary" type="button" data-fechar>Cancelar</button>
          <button class="btn btn-primary" type="submit">
            <i class="fas fa-paper-plane"></i> Abrir chamado
          </button>
        </footer>
      </form>
    </div>
  `;

  vincularEventosBase(container, api, opts);
  await carregar(container, api);
}


// -----------------------------------------------------------------------------
// Carregamento e render da lista
// -----------------------------------------------------------------------------

async function carregar(container, api) {
  const lista = container.querySelector("#ticketsList");
  lista.innerHTML = `<li class="suporte-empty"><i class="fas fa-spinner fa-spin"></i> Carregando…</li>`;
  try {
    const dados = await api.listar(estado.filtros);
    // API admin retorna { results }, demais retornam array
    estado.tickets = Array.isArray(dados) ? dados : (dados.results || []);
    renderLista(container, api);
  } catch (err) {
    lista.innerHTML = `<li class="suporte-empty erro">${escape(err.message)}</li>`;
  }
}


function renderLista(container, api) {
  const lista = container.querySelector("#ticketsList");
  if (!estado.tickets.length) {
    lista.innerHTML = `
      <li class="suporte-empty">
        <i class="fas fa-inbox"></i>
        Nenhum chamado encontrado.
      </li>`;
    return;
  }
  lista.innerHTML = estado.tickets.map((t) => itemLista(t)).join("");
  lista.querySelectorAll("[data-ticket-id]").forEach((el) => {
    el.addEventListener("click", () => abrirDetalhe(container, api, Number(el.dataset.ticketId)));
  });
  if (estado.selecionado) destacarSelecionado(container, estado.selecionado);
}


function itemLista(t) {
  const statusCls = STATUS_CLS[t.status] || "info";
  const prioCls = PRIORIDADE_CLS[t.prioridade] || "info";
  const naoLidas = (t.nao_lidas_usuario || 0) + (t.nao_lidas_admin || 0);
  const naoLidasBadge = naoLidas > 0
    ? `<span class="suporte-unread" title="${naoLidas} sem leitura">${naoLidas}</span>`
    : "";
  return `
    <li class="suporte-card" data-ticket-id="${t.id}" tabindex="0" role="button"
        aria-label="Abrir ticket #${t.id}">
      <header>
        <strong>#${t.id} · ${escape(t.titulo)}</strong>
        ${naoLidasBadge}
      </header>
      <div class="suporte-card-meta">
        <span class="status-pill ${statusCls}">${STATUS_LABEL[t.status] || t.status}</span>
        <span class="status-pill ${prioCls}">${escape(t.prioridade)}</span>
        <small><i class="fas fa-tag"></i> ${escape(CATEGORIA_LABEL[t.categoria] || t.categoria)}</small>
      </div>
      <small>
        <i class="fas fa-clock"></i> ${escape(t.atualizado_em || t.criado_em)}
        ${t.autor_nome ? `· <i class="fas fa-user"></i> ${escape(t.autor_nome)}` : ""}
      </small>
    </li>
  `;
}


function destacarSelecionado(container, id) {
  container.querySelectorAll("[data-ticket-id]").forEach((el) => {
    el.classList.toggle("active", Number(el.dataset.ticketId) === id);
  });
}


// -----------------------------------------------------------------------------
// Detalhe + chat
// -----------------------------------------------------------------------------

async function abrirDetalhe(container, api, ticketId) {
  estado.selecionado = ticketId;
  destacarSelecionado(container, ticketId);
  const painel = container.querySelector("#ticketDetalhe");
  painel.innerHTML = `<div class="suporte-empty-state"><i class="fas fa-spinner fa-spin"></i><p>Carregando…</p></div>`;
  try {
    const ticket = await api.detalhe(ticketId);
    renderDetalhe(container, api, ticket);
  } catch (err) {
    painel.innerHTML = `<div class="suporte-empty-state erro">${escape(err.message)}</div>`;
  }
}


function renderDetalhe(container, api, ticket) {
  const painel = container.querySelector("#ticketDetalhe");
  const modoAdmin = container.querySelector(".suporte-shell").dataset.modo === "admin";
  const podeFechar = !modoAdmin && !["resolvido", "fechado"].includes(ticket.status);

  painel.innerHTML = `
    <header class="suporte-detalhe-head">
      <div>
        <small>Chamado #${ticket.id}</small>
        <h2>${escape(ticket.titulo)}</h2>
        <div class="suporte-detalhe-meta">
          <span class="status-pill ${STATUS_CLS[ticket.status]}">${STATUS_LABEL[ticket.status]}</span>
          <span class="status-pill ${PRIORIDADE_CLS[ticket.prioridade]}">${escape(ticket.prioridade)}</span>
          <small><i class="fas fa-tag"></i> ${escape(CATEGORIA_LABEL[ticket.categoria] || ticket.categoria)}</small>
          <small><i class="fas fa-user"></i> ${escape(ticket.autor_nome)}</small>
          ${ticket.oficina_nome ? `<small><i class="fas fa-store"></i> ${escape(ticket.oficina_nome)}</small>` : ""}
          ${ticket.atribuido_a_nome ? `<small><i class="fas fa-user-shield"></i> Atribuído a ${escape(ticket.atribuido_a_nome)}</small>` : ""}
        </div>
      </div>
      <div class="suporte-detalhe-acoes">
        ${modoAdmin ? blocoAcoesAdmin(ticket) : ""}
        ${podeFechar
          ? `<button class="btn btn-outline-secondary btn-sm" type="button" id="btnFecharTicket">
               <i class="fas fa-check"></i> Marcar como resolvido
             </button>` : ""}
      </div>
    </header>

    <div class="suporte-chat" id="chatThread" aria-live="polite">
      ${montarMensagensIniciais(ticket)}
    </div>

    ${ticket.status === "fechado" ? "" : `
      <form class="suporte-chat-form" id="chatForm">
        <textarea id="chatInput" rows="2" class="form-control"
                  placeholder="Escreva sua mensagem… (Ctrl+Enter envia)"
                  required></textarea>
        ${modoAdmin ? `
          <label class="check-line">
            <input type="checkbox" id="chkInterna"> Anotação interna (não visível ao usuário)
          </label>` : ""}
        <button class="btn btn-primary" type="submit">
          <i class="fas fa-paper-plane"></i> Enviar
        </button>
      </form>
    `}
  `;

  vincularChat(container, api, ticket);
  scrollChatToBottom(container);
}


function blocoAcoesAdmin(ticket) {
  return `
    <select id="admStatus" class="form-control form-control-sm" aria-label="Status">
      ${Object.entries(STATUS_LABEL).map(([k, v]) =>
        `<option value="${k}" ${k === ticket.status ? "selected" : ""}>${v}</option>`).join("")}
    </select>
    <select id="admPrioridade" class="form-control form-control-sm" aria-label="Prioridade">
      ${["baixa", "normal", "alta", "urgente"].map((k) =>
        `<option value="${k}" ${k === ticket.prioridade ? "selected" : ""}>${k}</option>`).join("")}
    </select>
    <button class="btn btn-primary btn-sm" id="btnSalvarAdmTicket" type="button">
      <i class="fas fa-save"></i> Aplicar
    </button>
  `;
}


function montarMensagensIniciais(ticket) {
  const descricao = `
    <div class="msg msg-${ticket.origem === "cliente" ? "cliente" : "oficina"}">
      <div class="msg-bubble">
        <header><strong>${escape(ticket.autor_nome)}</strong>
          <time>${escape(ticket.criado_em)}</time></header>
        <p>${escape(ticket.descricao || "(sem descrição)")}</p>
      </div>
    </div>`;
  const mensagens = (ticket.mensagens || []).map((m) => {
    const cls = m.eh_interna ? "msg-interna"
      : m.autor_tipo === "admin" ? "msg-admin"
      : m.autor_tipo === "cliente" ? "msg-cliente"
      : "msg-oficina";
    return `
      <div class="msg ${cls}">
        <div class="msg-bubble">
          <header>
            <strong>${escape(m.autor_nome)}</strong>
            <time>${escape(m.criado_em)}</time>
            ${m.eh_interna ? `<span class="msg-tag">interna</span>` : ""}
          </header>
          <p>${escape(m.conteudo)}</p>
        </div>
      </div>
    `;
  }).join("");
  return descricao + mensagens;
}


function vincularChat(container, api, ticket) {
  const form = container.querySelector("#chatForm");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = container.querySelector("#chatInput");
    const txt = (input?.value || "").trim();
    if (!txt) {
      alert("Digite uma mensagem antes de enviar.");
      input?.focus();
      return;
    }
    const interna = container.querySelector("#chkInterna")?.checked || false;
    try {
      const atualizado = await api.responder(ticket.id, txt, { eh_interna: interna });
      renderDetalhe(container, api, atualizado);
      // recarrega lista para atualizar contadores
      const dados = await api.listar(estado.filtros);
      estado.tickets = Array.isArray(dados) ? dados : (dados.results || []);
      renderLista(container, api);
    } catch (err) {
      alert(err.message);
    }
  });
  const input = container.querySelector("#chatInput");
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      form?.requestSubmit();
    }
  });

  container.querySelector("#btnFecharTicket")?.addEventListener("click", async () => {
    if (!confirm("Marcar este chamado como resolvido?")) return;
    try {
      const atualizado = await api.atualizar(ticket.id, { acao: "fechar" });
      renderDetalhe(container, api, atualizado);
      const dados = await api.listar(estado.filtros);
      estado.tickets = Array.isArray(dados) ? dados : (dados.results || []);
      renderLista(container, api);
    } catch (err) { alert(err.message); }
  });

  container.querySelector("#btnSalvarAdmTicket")?.addEventListener("click", async () => {
    try {
      const atualizado = await api.atualizar(ticket.id, {
        status: container.querySelector("#admStatus").value,
        prioridade: container.querySelector("#admPrioridade").value,
      });
      renderDetalhe(container, api, atualizado);
      const dados = await api.listar(estado.filtros);
      estado.tickets = Array.isArray(dados) ? dados : (dados.results || []);
      renderLista(container, api);
    } catch (err) { alert(err.message); }
  });
}


function scrollChatToBottom(container) {
  const t = container.querySelector("#chatThread");
  if (t) t.scrollTop = t.scrollHeight;
}


// -----------------------------------------------------------------------------
// Eventos base (filtros + modal "novo")
// -----------------------------------------------------------------------------

function vincularEventosBase(container, api, opts) {
  let timer;
  container.querySelector("#filtroBusca")?.addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      estado.filtros.busca = e.target.value.trim();
      carregar(container, api);
    }, 350);
  });
  container.querySelector("#filtroStatus")?.addEventListener("change", (e) => {
    estado.filtros.status = e.target.value;
    carregar(container, api);
  });
  container.querySelector("#filtroPrioridade")?.addEventListener("change", (e) => {
    estado.filtros.prioridade = e.target.value;
    carregar(container, api);
  });

  const modal = container.querySelector("#suporteModalNovo");
  container.querySelector("#btnNovoTicket")?.addEventListener("click", () => {
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add("open"));
    container.querySelector("#novoTitulo")?.focus();
  });
  modal.querySelectorAll("[data-fechar]").forEach((b) =>
    b.addEventListener("click", () => fecharModal(modal)),
  );
  modal.addEventListener("click", (e) => { if (e.target === modal) fecharModal(modal); });

  container.querySelector("#suporteFormNovo")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const titulo = container.querySelector("#novoTitulo").value.trim();
    const descricao = container.querySelector("#novoDescricao").value.trim();

    // Pré-validação local: evita uma chamada que o backend recusaria com 400.
    if (titulo.length < 4) {
      alert("Informe um título com pelo menos 4 caracteres.");
      container.querySelector("#novoTitulo")?.focus();
      return;
    }
    if (descricao.length < 10) {
      alert("Descreva o problema com pelo menos 10 caracteres para que possamos atendê-lo.");
      container.querySelector("#novoDescricao")?.focus();
      return;
    }

    const payload = {
      titulo,
      descricao,
      categoria: container.querySelector("#novoCategoria").value,
      prioridade: container.querySelector("#novoPrioridade").value,
    };
    try {
      const criado = await api.criar(payload);
      fecharModal(modal);
      const dados = await api.listar(estado.filtros);
      estado.tickets = Array.isArray(dados) ? dados : (dados.results || []);
      renderLista(container, api);
      abrirDetalhe(container, api, criado.id);
    } catch (err) {
      alert(err.message);
    }
  });
}


function fecharModal(modal) {
  modal.classList.remove("open");
  setTimeout(() => (modal.hidden = true), 180);
}


function escape(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[m]);
}
