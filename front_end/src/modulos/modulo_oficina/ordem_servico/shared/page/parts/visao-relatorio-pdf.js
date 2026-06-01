// visao-relatorio-pdf.js
//
// Gerador de relatório PDF da Ordem de Serviço com layout profissional.
//
// Estratégia:
//   1. Monta um documento HTML offscreen com largura A4 (em pixels @ 96dpi).
//   2. Converte para canvas via html2canvas.
//   3. Recorta o canvas em fatias do tamanho de uma página A4 e adiciona
//      cada fatia em uma página do PDF — evita o bug de sobreposição que
//      acontece quando se reposiciona a mesma imagem com offset negativo.
//   4. Para impressão direta, injeta o HTML no body com classe que esconde
//      o restante da página e usa `@media print`.
//
// Fontes de dados (mesmas APIs das abas):
//   GET /os/:id/                  → header + cliente + veículo
//   GET /os/:id/checklist/        → checklist
//   GET /os/:id/itens/            → orçamento
//   GET /os/:id/historico/        → timeline
//   GET /perfil/                  → identidade da oficina (logo, endereço…)

import { API_BASE_URL, apiUrl } from "../../../../../../shared/config/api-config.js";


export async function gerarRelatorioPDF(osId) {
  if (!osId) {
    alert("Selecione uma OS antes de gerar o relatório.");
    return;
  }
  const { jsPDF } = await importarJsPdf();
  const html2canvas = await importarHtml2Canvas();

  const wrapper = await montarDocumento(osId);
  document.body.appendChild(wrapper);

  try {
    await aguardarImagens(wrapper);

    const canvas = await html2canvas(wrapper, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: wrapper.scrollWidth,
    });

    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const pageWmm = 210;
    const pageHmm = 297;
    const marginMm = 10;
    const usableWmm = pageWmm - marginMm * 2;
    const usableHmm = pageHmm - marginMm * 2;

    // Conversão px ↔ mm (canvas com escala 2x ocupa toda a largura útil)
    const pxPorMm = canvas.width / usableWmm;
    const fatiaAlturaPx = Math.floor(usableHmm * pxPorMm);

    let posicaoPx = 0;
    let primeira = true;
    while (posicaoPx < canvas.height) {
      const alturaFatia = Math.min(fatiaAlturaPx, canvas.height - posicaoPx);

      // Cria um canvas temporário recortando a fatia atual
      const fatia = document.createElement("canvas");
      fatia.width = canvas.width;
      fatia.height = alturaFatia;
      const ctx = fatia.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, fatia.width, fatia.height);
      ctx.drawImage(canvas, 0, -posicaoPx);

      const dataUrl = fatia.toDataURL("image/jpeg", 0.92);
      const alturaMm = alturaFatia / pxPorMm;

      if (!primeira) pdf.addPage();
      pdf.addImage(dataUrl, "JPEG", marginMm, marginMm, usableWmm, alturaMm);
      primeira = false;

      posicaoPx += alturaFatia;
    }

    pdf.save(`relatorio_os_${osId}.pdf`);
  } catch (err) {
    console.error(err);
    alert("Não foi possível gerar o PDF. Tente novamente.");
  } finally {
    wrapper.remove();
  }
}


export async function imprimirRelatorio(osId) {
  if (!osId) {
    alert("Selecione uma OS para imprimir.");
    return;
  }
  const wrapper = await montarDocumento(osId, { paraImpressao: true });
  document.body.appendChild(wrapper);
  await aguardarImagens(wrapper);
  await new Promise((r) => setTimeout(r, 250));
  window.print();
  setTimeout(() => {
    document.body.classList.remove("rel-imprimindo");
    wrapper.remove();
  }, 1000);
}


// -----------------------------------------------------------------------------
// Montagem do documento
// -----------------------------------------------------------------------------

async function montarDocumento(osId, { paraImpressao = false } = {}) {
  const [os, checklist, itens, historico, oficina] = await Promise.all([
    fetchJson(`/os/${osId}/`),
    fetchJson(`/os/${osId}/checklist/`).catch(() => ({ concluido: false })),
    fetchJson(`/os/${osId}/itens/`).catch(() => []),
    fetchJson(`/os/${osId}/historico/`).catch(() => []),
    fetchJson("/perfil/").catch(() => ({})),
  ]);

  const wrapper = document.createElement("div");
  wrapper.id = "relatorio-os-wrapper";
  wrapper.dataset.modo = paraImpressao ? "print" : "pdf";
  wrapper.innerHTML = `
    <link rel="stylesheet" href="${new URL("../../../../../../shared/vendor/fontawesome/css/all.min.css", import.meta.url).href}">
    ${estilosRelatorio()}
    <article class="rel-doc" lang="pt-BR">
      ${cabecalhoRelatorio(os, oficina)}
      ${sumarioRelatorio(os, itens, checklist)}
      ${secaoDadosVeiculo(os)}
      ${secaoChecklist(checklist)}
      ${secaoOrcamento(itens)}
      ${secaoHistorico(historico)}
      ${rodapeRelatorio(os, oficina)}
    </article>
  `;

  if (paraImpressao) {
    document.body.classList.add("rel-imprimindo");
  } else {
    wrapper.style.position = "absolute";
    wrapper.style.left = "0";
    wrapper.style.top = "-100000px";
    wrapper.style.width = "794px"; // A4 @ 96dpi ≈ 794px (210mm)
    wrapper.style.background = "#ffffff";
  }
  return wrapper;
}


// -----------------------------------------------------------------------------
// Seções
// -----------------------------------------------------------------------------

function cabecalhoRelatorio(os, oficina) {
  const oficNome = oficina.dadosBasicos?.nome || os.oficina_nome || "Oficina";
  const oficTel = oficina.dadosBasicos?.telefone || "";
  const oficCNPJ = oficina.dadosBasicos?.cnpj || "";
  const oficEnd = [
    oficina.endereco?.logradouro,
    oficina.endereco?.numero,
  ].filter(Boolean).join(", ");
  const oficCidade = [
    oficina.endereco?.bairro,
    oficina.endereco?.cidade,
    oficina.endereco?.estado,
  ].filter(Boolean).join(" · ");

  const logoUrl = oficina.logo_url
    ? (oficina.logo_url.startsWith("http")
       ? oficina.logo_url
       : `${API_BASE_URL}${oficina.logo_url}`)
    : null;

  const logoHtml = logoUrl
    ? `<img class="rel-logo-img" src="${logoUrl}" alt="Logo ${esc(oficNome)}" crossorigin="anonymous">`
    : `<div class="rel-logo"><i class="fas fa-wrench"></i></div>`;

  return `
    <header class="rel-header">
      <div class="rel-brand">
        ${logoHtml}
        <div class="rel-brand-text">
          <strong>${esc(oficNome)}</strong>
          ${oficCNPJ ? `<small>CNPJ ${esc(oficCNPJ)}</small>` : ""}
          ${oficEnd ? `<small><i class="fas fa-map-marker-alt"></i> ${esc(oficEnd)}</small>` : ""}
          ${oficCidade ? `<small>${esc(oficCidade)}</small>` : ""}
          ${oficTel ? `<small><i class="fas fa-phone"></i> ${esc(oficTel)}</small>` : ""}
        </div>
      </div>
      <div class="rel-os-id">
        <span>Ordem de Serviço</span>
        <strong>#${os.id ?? "—"}</strong>
        <small>Emitido em ${dataAgora()}</small>
      </div>
    </header>
    <div class="rel-divider"></div>
  `;
}


function sumarioRelatorio(os, itens, checklist) {
  const aprovados = (itens || []).filter((i) => i.status_aprovacao === "aprovado");
  const totalAprovado = aprovados.reduce(
    (acc, i) => acc + Number(i.valor_unitario || 0) * Number(i.quantidade || 0), 0,
  );
  const cliente = os.cliente_detalhes || {};
  return `
    <section class="rel-summary">
      <div>
        <span>Cliente</span>
        <strong>${esc(cliente.nome || os.cliente_nome || "—")}</strong>
      </div>
      <div>
        <span>Status</span>
        <strong class="rel-status rel-status-${esc(os.status || "pendente")}">
          ${labelStatus(os.status)}
        </strong>
      </div>
      <div>
        <span>Itens</span>
        <strong>${aprovados.length} aprov. · ${(itens || []).length} totais</strong>
      </div>
      <div>
        <span>Total</span>
        <strong>${formatMoeda(totalAprovado)}</strong>
      </div>
    </section>
  `;
}


function secaoDadosVeiculo(os) {
  const c = os.cliente_detalhes || {};
  const v = os.veiculo_detalhes || {};
  const endereco = [
    c.logradouro && `${esc(c.logradouro)}${c.numero ? `, ${esc(c.numero)}` : ""}`,
    c.bairro,
    c.cidade && `${esc(c.cidade)}/${esc(c.estado || "")}`,
    c.cep && `CEP ${esc(c.cep)}`,
  ].filter(Boolean).join(" · ");

  return `
    <section class="rel-section">
      <h2><i class="fas fa-user"></i> Cliente & Veículo</h2>
      <div class="rel-grid-2">
        <div class="rel-info-card">
          <h3>Cliente</h3>
          <dl>
            <dt>Nome</dt><dd>${esc(c.nome || os.cliente_nome || "—")}</dd>
            <dt>CPF/CNPJ</dt><dd>${esc(c.cpf_cnpj || "—")}</dd>
            <dt>Telefone</dt><dd>${esc(c.telefone || "—")}</dd>
            <dt>E-mail</dt><dd>${esc(c.email || "—")}</dd>
            ${endereco ? `<dt>Endereço</dt><dd>${endereco}</dd>` : ""}
          </dl>
        </div>
        <div class="rel-info-card">
          <h3>Veículo</h3>
          <dl>
            <dt>Placa</dt><dd>${esc(v.placa || "—")}</dd>
            <dt>Marca / Modelo</dt>
            <dd>${esc([v.marca, v.modelo].filter(Boolean).join(" ")) || "—"}</dd>
            <dt>Ano / Cor</dt>
            <dd>${esc([v.ano, v.cor].filter(Boolean).join(" / ")) || "—"}</dd>
            <dt>Chassi</dt><dd>${esc(v.chassi || "—")}</dd>
            <dt>KM Atual</dt>
            <dd>${os.km_atual ? `${esc(os.km_atual)} km` : "—"}</dd>
          </dl>
        </div>
      </div>
    </section>
  `;
}


function secaoChecklist(checklist) {
  if (!checklist || (!checklist.concluido && !checklist.data_recebimento)) {
    return `
      <section class="rel-section">
        <h2><i class="fas fa-clipboard-check"></i> Checklist de Recebimento</h2>
        <p class="rel-empty">Checklist não foi concluído até a emissão deste relatório.</p>
      </section>
    `;
  }
  return `
    <section class="rel-section">
      <h2><i class="fas fa-clipboard-check"></i> Checklist de Recebimento</h2>
      <div class="rel-grid-2">
        <div class="rel-info-card">
          <h3>Recebimento</h3>
          <dl>
            <dt>Data</dt><dd>${esc(formatarData(checklist.data_recebimento))}</dd>
            <dt>Consultor</dt><dd>${esc(checklist.consultor || "—")}</dd>
            <dt>Combustível</dt><dd>${esc(checklist.nivel_combustivel || "—")}</dd>
          </dl>
        </div>
        <div class="rel-info-card">
          <h3>Inspeção mecânica</h3>
          <dl>
            <dt>Óleo do motor</dt><dd>${esc(checklist.nivel_oleo || "—")}</dd>
            <dt>Fluido arrefecimento</dt><dd>${esc(checklist.fluido_arrefecimento || "—")}</dd>
          </dl>
        </div>
      </div>
      ${checklist.observacoes_iniciais
        ? `<div class="rel-info-card rel-info-card-full">
             <h3>Observações iniciais</h3>
             <p>${esc(checklist.observacoes_iniciais)}</p>
           </div>`
        : ""}
    </section>
  `;
}


function secaoOrcamento(itens) {
  if (!itens || itens.length === 0) {
    return `
      <section class="rel-section rel-orcamento">
        <h2><i class="fas fa-file-invoice-dollar"></i> Orçamento</h2>
        <p class="rel-empty">Nenhum item registrado no orçamento.</p>
      </section>
    `;
  }

  // Particiona itens por tipo para apresentar dois blocos claros (peças, serviços)
  // antes do total geral — facilita conferência impressa.
  const pecas = itens.filter((i) => (i.tipo || "").toLowerCase() === "peca");
  const servicos = itens.filter((i) => (i.tipo || "").toLowerCase() !== "peca");

  const calcular = (lista) => lista.reduce((acc, i) => {
    const v = Number(i.valor_unitario || 0) * Number(i.quantidade || 0);
    if (i.status_aprovacao === "aprovado") acc.aprovado += v;
    else if (i.status_aprovacao === "reprovado") acc.reprovado += v;
    else acc.pendente += v;
    return acc;
  }, { aprovado: 0, reprovado: 0, pendente: 0 });

  const linha = (i, idx) => {
    const total = Number(i.valor_unitario || 0) * Number(i.quantidade || 0);
    return `
      <tr class="status-${esc(i.status_aprovacao)}">
        <td class="rel-col-num">${idx + 1}</td>
        <td class="rel-col-desc">${esc(i.nome_descricao)}</td>
        <td class="text-center rel-col-qtd">${esc(i.quantidade ?? "")}</td>
        <td class="text-right rel-col-valor">${formatMoeda(i.valor_unitario)}</td>
        <td class="text-right rel-col-total">${formatMoeda(total)}</td>
        <td class="rel-col-status">
          <span class="rel-pill rel-pill-${esc(i.status_aprovacao)}">
            ${labelAprovacao(i.status_aprovacao)}
          </span>
        </td>
      </tr>`;
  };

  const bloco = (titulo, icone, lista) => {
    if (!lista.length) return "";
    const tot = calcular(lista);
    const subtotalLabel = tot.aprovado > 0
      ? `<strong>${formatMoeda(tot.aprovado)}</strong>`
      : `<span class="rel-muted">${formatMoeda(tot.aprovado)}</span>`;
    return `
      <div class="rel-orc-bloco">
        <div class="rel-orc-bloco-head">
          <h3><i class="fas ${icone}"></i> ${titulo} <small>(${lista.length})</small></h3>
          <span>Subtotal aprovado: ${subtotalLabel}</span>
        </div>
        <table class="rel-table rel-orc-table">
          <colgroup>
            <col style="width: 6%;">
            <col>
            <col style="width: 9%;">
            <col style="width: 16%;">
            <col style="width: 17%;">
            <col style="width: 14%;">
          </colgroup>
          <thead>
            <tr>
              <th class="rel-col-num">#</th>
              <th>Descrição</th>
              <th class="text-center">Qtd.</th>
              <th class="text-right">Valor unit.</th>
              <th class="text-right">Total</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>${lista.map(linha).join("")}</tbody>
        </table>
      </div>
    `;
  };

  const totGeral = calcular(itens);
  const totalLiquido = totGeral.aprovado;

  return `
    <section class="rel-section rel-orcamento">
      <h2><i class="fas fa-file-invoice-dollar"></i> Orçamento</h2>

      ${bloco("Peças", "fa-gears", pecas)}
      ${bloco("Serviços", "fa-screwdriver-wrench", servicos)}

      <div class="rel-orc-resumo" role="table" aria-label="Resumo financeiro">
        <div class="rel-orc-resumo-linha">
          <span>Subtotal peças (aprovado)</span>
          <strong>${formatMoeda(calcular(pecas).aprovado)}</strong>
        </div>
        <div class="rel-orc-resumo-linha">
          <span>Subtotal serviços (aprovado)</span>
          <strong>${formatMoeda(calcular(servicos).aprovado)}</strong>
        </div>
        ${totGeral.pendente > 0 ? `
          <div class="rel-orc-resumo-linha rel-orc-pendente">
            <span>Itens pendentes de aprovação</span>
            <strong>${formatMoeda(totGeral.pendente)}</strong>
          </div>` : ""}
        ${totGeral.reprovado > 0 ? `
          <div class="rel-orc-resumo-linha rel-orc-reprovado">
            <span>Itens rejeitados</span>
            <strong>${formatMoeda(totGeral.reprovado)}</strong>
          </div>` : ""}
        <div class="rel-orc-resumo-linha rel-orc-total">
          <span>Total a pagar</span>
          <strong>${formatMoeda(totalLiquido)}</strong>
        </div>
      </div>
    </section>
  `;
}


function secaoHistorico(historico) {
  if (!historico || !historico.length) {
    return `
      <section class="rel-section">
        <h2><i class="fas fa-history"></i> Histórico</h2>
        <p class="rel-empty">Sem eventos registrados.</p>
      </section>
    `;
  }
  const itens = historico.slice(0, 20).map((ev) => `
    <li>
      <strong>${esc(ev.descricao || "Evento")}</strong>
      <small>${esc(formatarDataHora(ev.data_hora))}</small>
      ${ev.detalhes ? `<p>${esc(ev.detalhes)}</p>` : ""}
    </li>
  `).join("");
  return `
    <section class="rel-section">
      <h2><i class="fas fa-history"></i> Histórico</h2>
      <ol class="rel-timeline">${itens}</ol>
    </section>
  `;
}


function rodapeRelatorio(os, oficina) {
  const nome = oficina.dadosBasicos?.nome || os.oficina_nome || "";
  const cliente = os.cliente_detalhes || {};
  return `
    <div class="rel-spacer-assinaturas" aria-hidden="true"></div>
    <footer class="rel-footer">
      <div class="rel-signs">
        <div>
          <div class="rel-sign-line"></div>
          <span>Assinatura do cliente</span>
          ${cliente.nome ? `<small>${esc(cliente.nome)}</small>` : ""}
          ${cliente.cpf_cnpj ? `<small>CPF/CNPJ: ${esc(cliente.cpf_cnpj)}</small>` : ""}
        </div>
        <div>
          <div class="rel-sign-line"></div>
          <span>Responsável técnico</span>
          ${nome ? `<small>${esc(nome)}</small>` : ""}
        </div>
      </div>
      <small>
        Documento gerado em ${dataAgora()} · OS #${os.id ?? "—"}
        ${nome ? `· ${esc(nome)}` : ""} · Pit Stop Inteligente
      </small>
    </footer>
  `;
}


// -----------------------------------------------------------------------------
// Estilos do documento (escopados a #relatorio-os-wrapper)
// -----------------------------------------------------------------------------

function estilosRelatorio() {
  return `
    <style>
      #relatorio-os-wrapper, #relatorio-os-wrapper * { box-sizing: border-box; }
      #relatorio-os-wrapper {
        font-family: "Inter", "Segoe UI", Tahoma, sans-serif;
        color: #0f172a;
        background: #fff;
        font-size: 12px;
        line-height: 1.5;
      }
      .rel-doc {
        padding: 22px 24px 28px;
        max-width: 794px;
        margin: 0 auto;
        background: #fff;
      }

      /* Header */
      .rel-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
      }
      .rel-brand { display: flex; gap: 12px; align-items: flex-start; max-width: 70%; }
      .rel-logo,
      .rel-logo-img {
        width: 56px; height: 56px;
        flex-shrink: 0;
        border-radius: 12px;
        background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
        color: #fff;
        display: flex; align-items: center; justify-content: center;
        font-size: 22px;
        object-fit: contain;
      }
      .rel-logo-img { background: #fff; border: 1px solid #e2e8f0; }
      .rel-brand-text strong {
        display: block;
        font-size: 15px;
        color: #0f172a;
        margin-bottom: 2px;
      }
      .rel-brand-text small {
        display: block;
        color: #64748b;
        font-size: 10.5px;
        line-height: 1.4;
      }
      .rel-os-id { text-align: right; min-width: 140px; }
      .rel-os-id span {
        font-size: 9.5px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #64748b;
      }
      .rel-os-id strong {
        display: block;
        font-size: 22px;
        color: #2563eb;
        font-weight: 800;
        line-height: 1.1;
      }
      .rel-os-id small { display: block; color: #94a3b8; font-size: 10px; }
      .rel-divider {
        height: 3px;
        background: linear-gradient(90deg, #2563eb 0%, #4338ca 50%, transparent 100%);
        margin: 14px 0;
        border-radius: 3px;
      }

      /* Summary */
      .rel-summary {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
        margin-bottom: 16px;
      }
      .rel-summary > div {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 9px 10px;
        min-width: 0;
      }
      .rel-summary span {
        display: block;
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        color: #64748b;
        font-weight: 700;
      }
      .rel-summary strong {
        display: block;
        font-size: 13px;
        color: #0f172a;
        font-weight: 800;
        margin-top: 2px;
        word-break: break-word;
      }
      .rel-status-pendente  { color: #ca8a04; }
      .rel-status-execucao  { color: #2563eb; }
      .rel-status-concluido { color: #16a34a; }

      /* Section */
      .rel-section {
        margin-bottom: 16px;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .rel-section h2 {
        font-size: 13px;
        color: #2563eb;
        margin: 0 0 8px;
        padding-bottom: 4px;
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .rel-section h2 i { font-size: 12px; }
      .rel-empty {
        margin: 0;
        padding: 14px;
        background: #f1f5f9;
        border-radius: 6px;
        color: #64748b;
        font-style: italic;
        font-size: 11px;
      }

      /* Cards & grid */
      .rel-grid-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-bottom: 10px;
      }
      .rel-info-card {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 10px 12px;
      }
      .rel-info-card-full { grid-column: 1 / -1; }
      .rel-info-card h3 {
        font-size: 10.5px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        color: #475569;
        margin: 0 0 8px;
      }
      .rel-info-card dl {
        margin: 0;
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 4px 12px;
        font-size: 11px;
      }
      .rel-info-card dt { color: #64748b; font-weight: 600; }
      .rel-info-card dd { margin: 0; color: #0f172a; word-break: break-word; }
      .rel-info-card p { margin: 0; font-size: 11px; color: #0f172a; }

      /* Table */
      .rel-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
        table-layout: fixed;
      }
      .rel-table th {
        background: #f1f5f9;
        color: #475569;
        text-align: left;
        font-weight: 700;
        padding: 7px 8px;
        border-bottom: 1px solid #cbd5e1;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .rel-table td {
        padding: 7px 8px;
        border-bottom: 1px solid #e2e8f0;
        vertical-align: middle;
        word-break: break-word;
      }
      .rel-table tr.status-reprovado td {
        color: #94a3b8;
        text-decoration: line-through;
      }
      .rel-table tr.status-pendente td {
        background: #fffbeb;
      }
      .rel-table tfoot td {
        background: #eff6ff;
        font-size: 12px;
        border-top: 2px solid #2563eb;
      }
      .rel-table tfoot tr.rel-tfoot-secondary td {
        background: #fef2f2;
        color: #991b1b;
        border-top: 1px solid #fecaca;
        font-size: 11px;
      }
      .text-right { text-align: right; font-variant-numeric: tabular-nums; }
      .text-center { text-align: center; }

      /* Orçamento — blocos por tipo + resumo */
      .rel-orcamento { page-break-inside: avoid; }
      .rel-orc-bloco { margin-bottom: 14px; }
      .rel-orc-bloco-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin: 6px 0 4px;
      }
      .rel-orc-bloco-head h3 {
        margin: 0;
        font-size: 11.5px;
        font-weight: 700;
        color: #1e293b;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .rel-orc-bloco-head h3 small {
        font-weight: 500;
        color: #64748b;
        text-transform: none;
        letter-spacing: 0;
        font-size: 10.5px;
      }
      .rel-orc-bloco-head span {
        font-size: 10.5px;
        color: #475569;
      }
      .rel-orc-bloco-head strong { color: #166534; font-weight: 700; }
      .rel-orc-table { border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
      .rel-orc-table th:first-child,
      .rel-orc-table td:first-child { padding-left: 10px; }
      .rel-orc-table th:last-child,
      .rel-orc-table td:last-child { padding-right: 10px; }
      .rel-col-num { color: #94a3b8; font-weight: 600; }
      .rel-col-desc { color: #0f172a; }
      .rel-col-total { font-weight: 700; color: #0f172a; }
      .rel-muted { color: #94a3b8; }

      .rel-orc-resumo {
        margin-top: 8px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        background: #f8fafc;
        overflow: hidden;
      }
      .rel-orc-resumo-linha {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 7px 12px;
        font-size: 11px;
        border-bottom: 1px solid #e2e8f0;
      }
      .rel-orc-resumo-linha:last-child { border-bottom: none; }
      .rel-orc-resumo-linha span { color: #475569; }
      .rel-orc-resumo-linha strong {
        font-variant-numeric: tabular-nums;
        color: #0f172a;
        font-weight: 700;
      }
      .rel-orc-pendente { background: #fffbeb; }
      .rel-orc-pendente strong { color: #92400e; }
      .rel-orc-reprovado { background: #fef2f2; }
      .rel-orc-reprovado strong {
        color: #991b1b;
        text-decoration: line-through;
      }
      .rel-orc-total {
        background: #eff6ff;
        border-top: 2px solid #2563eb !important;
      }
      .rel-orc-total span {
        font-size: 11.5px;
        font-weight: 700;
        color: #1e3a8a;
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }
      .rel-orc-total strong { font-size: 14px; color: #1d4ed8; }

      /* Pills */
      .rel-pill {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 9999px;
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }
      .rel-pill-aprovado  { background: #dcfce7; color: #166534; }
      .rel-pill-reprovado { background: #fee2e2; color: #991b1b; }
      .rel-pill-pendente  { background: #fef9c3; color: #854d0e; }

      /* Timeline */
      .rel-timeline {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .rel-timeline li {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-left: 3px solid #2563eb;
        border-radius: 6px;
        padding: 6px 10px;
        font-size: 11px;
      }
      .rel-timeline strong { display: block; color: #0f172a; }
      .rel-timeline small { color: #64748b; font-size: 10px; }
      .rel-timeline p {
        margin: 4px 0 0;
        color: #475569;
        font-size: 10.5px;
        white-space: pre-wrap;
      }

      /* Espaçador antes do bloco de assinaturas: garante respiro visual
         entre o histórico e a área de assinaturas, mesmo quando o histórico
         é curto. */
      .rel-spacer-assinaturas {
        height: 36px;
      }

      /* Footer + assinaturas — afastadas do histórico para evitar que
         pareçam "coladas" ao último item da timeline. */
      .rel-footer {
        margin-top: 48px;
        padding-top: 22px;
        border-top: 1px dashed #cbd5e1;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .rel-signs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 48px;
        margin: 18px 0 20px;
      }
      .rel-signs > div { text-align: center; }
      .rel-sign-line {
        border-top: 1px solid #0f172a;
        height: 56px;
        margin-bottom: 6px;
      }
      .rel-signs span {
        font-size: 10.5px;
        color: #334155;
        font-weight: 600;
      }
      .rel-signs small {
        display: block;
        font-size: 9px;
        color: #64748b;
        margin-top: 2px;
        font-weight: 400;
      }
      .rel-footer > small {
        display: block;
        text-align: center;
        color: #94a3b8;
        font-size: 9px;
        margin-top: 6px;
      }

      /* Modo impressão */
      body.rel-imprimindo > *:not(#relatorio-os-wrapper) { display: none !important; }
      @media print {
        body.rel-imprimindo > *:not(#relatorio-os-wrapper) { display: none !important; }
        #relatorio-os-wrapper {
          position: static !important;
          left: 0 !important; top: 0 !important;
          width: 100% !important;
        }
        .rel-section { page-break-inside: avoid; }
        @page { size: A4; margin: 12mm; }
      }
    </style>
  `;
}


// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function fetchJson(path) {
  const r = await fetch(apiUrl(path), { credentials: "include" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}


/** Resolve quando todas as <img> dentro do wrapper terminam de carregar/falhar. */
async function aguardarImagens(root, timeoutMs = 4000) {
  const imgs = Array.from(root.querySelectorAll("img"));
  if (!imgs.length) return;
  await Promise.race([
    Promise.all(
      imgs.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
        });
      }),
    ),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}


function labelStatus(s) {
  return {
    pendente: "Pendente",
    execucao: "Em Execução",
    concluido: "Concluído",
  }[s] || (s || "—");
}


function labelAprovacao(s) {
  return {
    aprovado: "Aprovado",
    reprovado: "Rejeitado",
    pendente: "Pendente",
  }[s] || (s || "—");
}


function formatMoeda(n) {
  return Number(n || 0).toLocaleString("pt-BR", {
    style: "currency", currency: "BRL",
  });
}


function formatarData(iso) {
  if (!iso) return "—";
  if (iso.includes("/")) return iso;
  const partes = iso.substring(0, 10).split("-");
  if (partes.length !== 3) return iso;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}


function formatarDataHora(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}


function dataAgora() {
  return new Date().toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}


function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[m]);
}


// Lazy imports
async function importarJsPdf() {
  // UMD local: import por efeito colateral popula window.jspdf ({ jsPDF, ... }).
  await import("../../../../../../shared/vendor/jspdf/jspdf.umd.min.js");
  return window.jspdf;
}
async function importarHtml2Canvas() {
  // UMD local: popula window.html2canvas (a própria função).
  await import("../../../../../../shared/vendor/html2canvas/html2canvas.min.js");
  return window.html2canvas;
}
