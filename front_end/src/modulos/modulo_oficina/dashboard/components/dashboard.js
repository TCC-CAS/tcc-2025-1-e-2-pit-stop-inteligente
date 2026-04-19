=// dashboard.js - Dados mockados com todos os requisitos (KPIs, gráficos, alertas, aprovação, equipe)
let mockData = {
    os: [
        { id: 101, cliente: "João Silva", veiculo: "Gol", placa: "ABC-1234", status: "pendente", data_abertura: "2025-03-20", data_prevista: "2025-03-25", data_conclusao: null, valor_total: 450, mecanico: "Carlos", servicos: ["Troca de óleo"], retrabalho: false },
        { id: 102, cliente: "Maria", veiculo: "Civic", placa: "DEF-5678", status: "execucao", data_abertura: "2025-03-18", data_prevista: "2025-03-22", data_conclusao: null, valor_total: 1200, mecanico: "Ana", servicos: ["Revisão completa"], retrabalho: false },
        { id: 103, cliente: "Carlos", veiculo: "Fiesta", placa: "GHI-9012", status: "concluido", data_abertura: "2025-03-10", data_prevista: "2025-03-15", data_conclusao: "2025-03-14", valor_total: 850, mecanico: "Carlos", servicos: ["Freios"], retrabalho: false },
        { id: 104, cliente: "Ana", veiculo: "Compass", placa: "JKL-3456", status: "concluido", data_abertura: "2025-02-20", data_prevista: "2025-02-28", data_conclusao: "2025-02-26", valor_total: 2100, mecanico: "Ana", servicos: ["Suspensão"], retrabalho: true },
        { id: 105, cliente: "Pedro", veiculo: "Onix", placa: "MNO-7890", status: "pendente", data_abertura: "2025-03-25", data_prevista: "2025-03-30", data_conclusao: null, valor_total: 320, mecanico: "Carlos", servicos: ["Alinhamento"], retrabalho: false },
        { id: 106, cliente: "Fernanda", veiculo: "HB20", placa: "PQR-1234", status: "execucao", data_abertura: "2025-03-22", data_prevista: "2025-03-27", data_conclusao: null, valor_total: 980, mecanico: "Bruno", servicos: ["Troca de pastilhas"], retrabalho: false },
        { id: 107, cliente: "Roberto", veiculo: "Tracker", placa: "STU-5678", status: "concluido", data_abertura: "2025-03-01", data_prevista: "2025-03-05", data_conclusao: "2025-03-04", valor_total: 550, mecanico: "Bruno", servicos: ["Óleo e filtro"], retrabalho: false },
        { id: 108, cliente: "Juliana", veiculo: "Corolla", placa: "VWX-9012", status: "pendente", data_abertura: "2025-03-28", data_prevista: "2025-04-02", data_conclusao: null, valor_total: 1750, mecanico: "Ana", servicos: ["Motor"], retrabalho: false },
    ],
    aprovacoes: [
        { id: 1, status: "pendente", data_solicitacao: "2025-03-20", tempo_espera: 3 },
        { id: 2, status: "aprovado", data_solicitacao: "2025-03-15", tempo_espera: 1 },
        { id: 3, status: "reprovado", data_solicitacao: "2025-03-18", tempo_espera: 2 },
        { id: 4, status: "pendente", data_solicitacao: "2025-03-25", tempo_espera: 1 },
    ],
    servicosCatalogo: [
        { nome: "Troca de óleo", quantidade: 2, faturamento: 900 },
        { nome: "Revisão completa", quantidade: 1, faturamento: 1200 },
        { nome: "Freios", quantidade: 1, faturamento: 850 },
        { nome: "Suspensão", quantidade: 1, faturamento: 2100 },
        { nome: "Alinhamento", quantidade: 1, faturamento: 320 },
        { nome: "Troca de pastilhas", quantidade: 1, faturamento: 980 },
        { nome: "Motor", quantidade: 1, faturamento: 1750 },
    ]
};

// Variáveis globais
let currentFilters = { periodo: 30, status: "todos", mecanico: "todos", servico: "todos", dataInicio: null, dataFim: null };
let charts = {};

// Funções auxiliares
function filtrarOS() {
    let lista = [...mockData.os];
    const agora = new Date();
    if (currentFilters.periodo !== "custom" && currentFilters.periodo > 0) {
        const limite = new Date(); limite.setDate(agora.getDate() - currentFilters.periodo);
        lista = lista.filter(os => new Date(os.data_abertura) >= limite);
    } else if (currentFilters.periodo === "custom" && currentFilters.dataInicio && currentFilters.dataFim) {
        const inicio = new Date(currentFilters.dataInicio);
        const fim = new Date(currentFilters.dataFim);
        fim.setHours(23,59,59);
        lista = lista.filter(os => new Date(os.data_abertura) >= inicio && new Date(os.data_abertura) <= fim);
    }
    if (currentFilters.status !== "todos") lista = lista.filter(os => os.status === currentFilters.status);
    if (currentFilters.mecanico !== "todos") lista = lista.filter(os => os.mecanico === currentFilters.mecanico);
    if (currentFilters.servico !== "todos") lista = lista.filter(os => os.servicos.includes(currentFilters.servico));
    return lista;
}

function filtrarOSWithFilters(filters) {
    // Versão simplificada para comparação com período anterior
    return mockData.os;
}

function calcularKPIs(osList, osListAnterior) {
    const abertas = osList.filter(o => o.status === "pendente").length;
    const andamento = osList.filter(o => o.status === "execucao").length;
    const concluidas = osList.filter(o => o.status === "concluido").length;
    const faturamento = osList.filter(o => o.status === "concluido").reduce((acc, o) => acc + o.valor_total, 0);
    const ticket = concluidas ? faturamento / concluidas : 0;
    const tempos = osList.filter(o => o.status === "concluido" && o.data_conclusao).map(o => (new Date(o.data_conclusao) - new Date(o.data_abertura)) / (1000*3600*24));
    const tempoMedio = tempos.length ? Math.round(tempos.reduce((a,b)=>a+b,0)/tempos.length) : 0;
    
    // Comparação com período anterior
    function calcTrend(anterior, atual) { 
        if (anterior === 0) return atual > 0 ? "+100%" : "0%"; 
        const varp = ((atual - anterior)/anterior)*100; 
        return `${varp>0?'+':''}${varp.toFixed(1)}%`; 
    }
    const abertasAnt = osListAnterior.filter(o => o.status === "pendente").length;
    const andamentoAnt = osListAnterior.filter(o => o.status === "execucao").length;
    const concluidasAnt = osListAnterior.filter(o => o.status === "concluido").length;
    const fatAnt = osListAnterior.filter(o => o.status === "concluido").reduce((a,b)=>a+b.valor_total,0);
    const ticketAnt = concluidasAnt ? fatAnt/concluidasAnt : 0;
    const tempoAnt = (() => { 
        const t = osListAnterior.filter(o => o.status==="concluido" && o.data_conclusao)
            .map(o => (new Date(o.data_conclusao) - new Date(o.data_abertura))/(1000*3600*24)); 
        return t.length ? Math.round(t.reduce((a,b)=>a+b,0)/t.length) : 0; 
    })();

    return {
        abertas, andamento, concluidas, faturamento, ticket, tempoMedio,
        trends: {
            abertas: calcTrend(abertasAnt, abertas),
            andamento: calcTrend(andamentoAnt, andamento),
            concluidas: calcTrend(concluidasAnt, concluidas),
            faturamento: calcTrend(fatAnt, faturamento),
            ticket: calcTrend(ticketAnt, ticket),
            tempo: calcTrend(tempoAnt, tempoMedio)
        }
    };
}

function atualizarKPIs() {
    const osList = filtrarOS();
    const periodoAnterior = { ...currentFilters };
    if (periodoAnterior.periodo === "custom") { /* simplificado */ }
    else { periodoAnterior.periodo = currentFilters.periodo * 2; }
    const osAnterior = filtrarOSWithFilters(periodoAnterior);
    const kpis = calcularKPIs(osList, osAnterior);
    
    document.getElementById("kpiAbertas").innerText = kpis.abertas;
    document.getElementById("trendAbertas").innerHTML = `<i class="fas ${kpis.trends.abertas.includes('+')?'fa-arrow-up':'fa-arrow-down'}"></i> ${kpis.trends.abertas}`;
    document.getElementById("kpiAndamento").innerText = kpis.andamento;
    document.getElementById("trendAndamento").innerHTML = `<i class="fas ${kpis.trends.andamento.includes('+')?'fa-arrow-up':'fa-arrow-down'}"></i> ${kpis.trends.andamento}`;
    document.getElementById("kpiConcluidas").innerText = kpis.concluidas;
    document.getElementById("trendConcluidas").innerHTML = `<i class="fas ${kpis.trends.concluidas.includes('+')?'fa-arrow-up':'fa-arrow-down'}"></i> ${kpis.trends.concluidas}`;
    document.getElementById("kpiFaturamento").innerText = `R$ ${kpis.faturamento.toFixed(2)}`;
    document.getElementById("trendFaturamento").innerHTML = `<i class="fas ${kpis.trends.faturamento.includes('+')?'fa-arrow-up':'fa-arrow-down'}"></i> ${kpis.trends.faturamento}`;
    document.getElementById("kpiTicketMedio").innerText = `R$ ${kpis.ticket.toFixed(2)}`;
    document.getElementById("trendTicket").innerHTML = `<i class="fas ${kpis.trends.ticket.includes('+')?'fa-arrow-up':'fa-arrow-down'}"></i> ${kpis.trends.ticket}`;
    document.getElementById("kpiTempoMedio").innerText = kpis.tempoMedio;
    document.getElementById("trendTempo").innerHTML = `<i class="fas ${kpis.trends.tempo.includes('+')?'fa-arrow-up':'fa-arrow-down'}"></i> ${kpis.trends.tempo}`;
}

function atualizarGraficos() {
    const osList = filtrarOS();
    const statusCount = { pendente: 0, execucao: 0, concluido: 0 };
    osList.forEach(os => statusCount[os.status]++);
    if (charts.statusPie) charts.statusPie.destroy();
    charts.statusPie = new Chart(document.getElementById("statusPieChart"), { 
        type: 'pie', 
        data: { 
            labels: ['Pendente','Execução','Concluído'], 
            datasets: [{ 
                data: [statusCount.pendente, statusCount.execucao, statusCount.concluido], 
                backgroundColor: ['#f59e0b','#3b82f6','#10b981'] 
            }] 
        } 
    });
    
    // Evolução de O.S (agrupado por dia)
    const evolucao = {};
    osList.forEach(os => { const dia = os.data_abertura; evolucao[dia] = (evolucao[dia] || 0) + 1; });
    const labelsEvol = Object.keys(evolucao).sort();
    if (charts.evolucao) charts.evolucao.destroy();
    charts.evolucao = new Chart(document.getElementById("evolucaoOSChart"), { 
        type: 'line', 
        data: { 
            labels: labelsEvol, 
            datasets: [{ 
                label: 'O.S Abertas', 
                data: labelsEvol.map(d => evolucao[d]), 
                borderColor: '#2563eb',
                tension: 0.2
            }] 
        } 
    });
    
    // Faturamento por período (mock mensal)
    const fatMensal = [0,0,0,0,0,0,0,0,0,0,0,0];
    osList.forEach(os => { 
        if(os.status === "concluido") { 
            const mes = new Date(os.data_abertura).getMonth(); 
            fatMensal[mes] += os.valor_total; 
        } 
    });
    if (charts.faturamento) charts.faturamento.destroy();
    charts.faturamento = new Chart(document.getElementById("faturamentoBarChart"), { 
        type: 'bar', 
        data: { 
            labels: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'], 
            datasets: [{ 
                label: 'Faturamento (R$)', 
                data: fatMensal, 
                backgroundColor: '#10b981' 
            }] 
        } 
    });
    
    // Serviços mais realizados e rentáveis
    const servicosMap = new Map();
    osList.forEach(os => { os.servicos.forEach(s => { servicosMap.set(s, (servicosMap.get(s) || 0) + 1); }); });
    const servicosOrdenados = Array.from(servicosMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5);
    if (charts.servicosRealizados) charts.servicosRealizados.destroy();
    charts.servicosRealizados = new Chart(document.getElementById("servicosRealizadosChart"), { 
        type: 'bar', 
        data: { 
            labels: servicosOrdenados.map(s=>s[0]), 
            datasets: [{ 
                label: 'Quantidade', 
                data: servicosOrdenados.map(s=>s[1]), 
                backgroundColor: '#f59e0b' 
            }] 
        } 
    });
    
    const rentabilidade = mockData.servicosCatalogo.sort((a,b)=>b.faturamento - a.faturamento).slice(0,5);
    if (charts.servicosRentaveis) charts.servicosRentaveis.destroy();
    charts.servicosRentaveis = new Chart(document.getElementById("servicosRentaveisChart"), { 
        type: 'bar', 
        data: { 
            labels: rentabilidade.map(s=>s.nome), 
            datasets: [{ 
                label: 'Faturamento (R$)', 
                data: rentabilidade.map(s=>s.faturamento), 
                backgroundColor: '#8b5cf6' 
            }] 
        } 
    });
}

function atualizarCardOS() {
    const osList = filtrarOS();
    const pendente = osList.filter(o=>o.status==="pendente").length;
    const execucao = osList.filter(o=>o.status==="execucao").length;
    const concluido = osList.filter(o=>o.status==="concluido").length;
    document.getElementById("totalOSCard").innerHTML = `${osList.length} total`;
    const container = document.getElementById("osStatusStats");
    container.innerHTML = `
        <div class="status-stat-item" data-status="pendente">
            <i class="fas fa-clock"></i>
            <span class="stat-label">Pendentes</span>
            <span class="stat-number">${pendente}</span>
        </div>
        <div class="status-stat-item" data-status="execucao">
            <i class="fas fa-spinner fa-pulse"></i>
            <span class="stat-label">Em Execução</span>
            <span class="stat-number">${execucao}</span>
        </div>
        <div class="status-stat-item" data-status="concluido">
            <i class="fas fa-check-circle"></i>
            <span class="stat-label">Concluídas</span>
            <span class="stat-number">${concluido}</span>
        </div>
    `;
    document.querySelectorAll('.status-stat-item').forEach(el => {
        el.addEventListener('click', () => abrirModalPorStatus(el.dataset.status));
    });
}

function abrirModalPorStatus(status) {
    const osList = filtrarOS().filter(os => os.status === status);
    const titulo = status === "pendente" ? "Pendentes" : (status === "execucao" ? "Em Execução" : "Concluídas");
    document.getElementById("modalStatusTitle").innerText = titulo;
    const tbody = document.getElementById("modalOSTbody");
    
    if (osList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhuma OS encontrada</td></tr>';
    } else {
        tbody.innerHTML = osList.map(os => `
            <tr>
                <td>${os.id}</td>
                <td>${os.cliente}</td>
                <td>${os.veiculo}</td>
                <td>${os.placa}</td>
                <td><span class="badge badge-${os.status}">${os.status}</span></td>
            </tr>
        `).join('');
    }
    
    document.getElementById('modalOSList').open();
}

function abrirModalUltimasOS() {
    const osList = [...filtrarOS()].sort((a,b)=>new Date(b.data_abertura) - new Date(a.data_abertura)).slice(0,10);
    const tbody = document.getElementById("ultimasOSBodyModal");
    if (osList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">Nenhuma OS encontrada</td></tr>';
    } else {
        tbody.innerHTML = osList.map(os => `
            <tr>
                <td>${os.id}</td>
                <td>${os.cliente}</td>
                <td>${os.veiculo}</td>
                <td>${os.placa}</td>
                <td><span class="badge badge-${os.status}">${os.status}</span></td>
                <td>${os.data_abertura}</td>
                <td>R$ ${os.valor_total.toFixed(2)}</td>
                <td><button class="btn-sm btn-outline-primary ver-ultima-os-modal" data-id="${os.id}">Ver</button></td>
            </tr>
        `).join('');
    }
    document.querySelectorAll('.ver-ultima-os-modal').forEach(btn => {
        btn.addEventListener('click', (e) => { 
            window.location.href = `/front_end/src/modulos/modulo_oficina/ordem_servico/shared/page/os-visao-geral.html?osId=${btn.dataset.id}`; 
        });
    });
    document.getElementById('modalUltimasOS').open();
}

function atualizarAlertas() {
    const osList = filtrarOS();
    const hoje = new Date();
    const osParadas = osList.filter(o => o.status !== "concluido" && (new Date() - new Date(o.data_abertura))/(1000*3600*24) > 5);
    const osAtraso = osList.filter(o => o.status !== "concluido" && new Date(o.data_prevista) < hoje);
    const aprovPendentes = mockData.aprovacoes.filter(a => a.status === "pendente").length;
    const alertas = [];
    if(osParadas.length) alertas.push(`⚠️ ${osParadas.length} O.S paradas há mais de 5 dias`);
    if(osAtraso.length) alertas.push(`⏰ ${osAtraso.length} O.S em atraso`);
    if(aprovPendentes) alertas.push(`📄 ${aprovPendentes} orçamentos aguardando aprovação`);
    if(alertas.length===0) alertas.push("✅ Nenhum alerta no momento");
    document.getElementById("alertList").innerHTML = alertas.map(a => `<div class="alert-item"><i class="fas fa-exclamation-circle"></i> ${a}</div>`).join('');
}

function atualizarAprovacoes() {
    const aprov = mockData.aprovacoes;
    const pendentes = aprov.filter(a=>a.status==="pendente").length;
    const aprovados = aprov.filter(a=>a.status==="aprovado").length;
    const reprovados = aprov.filter(a=>a.status==="reprovado").length;
    const tempoMedio = aprov.reduce((acc,a)=>acc + a.tempo_espera,0) / aprov.length;
    document.getElementById("aprovPendentes").innerText = pendentes;
    document.getElementById("aprovAprovados").innerText = aprovados;
    document.getElementById("aprovReprovados").innerText = reprovados;
    document.getElementById("aprovTempoMedio").innerText = `${tempoMedio.toFixed(1)} dias`;
}

function atualizarDesempenhoEquipe() {
    const osList = filtrarOS();
    const mecanicos = {};
    osList.forEach(os => {
        if (!mecanicos[os.mecanico]) mecanicos[os.mecanico] = { total:0, concluidas:0, tempoTotal:0 };
        mecanicos[os.mecanico].total++;
        if (os.status === "concluido") {
            mecanicos[os.mecanico].concluidas++;
            const dias = (new Date(os.data_conclusao) - new Date(os.data_abertura))/(1000*3600*24);
            mecanicos[os.mecanico].tempoTotal += dias;
        }
    });
    
    const tbody = document.getElementById("equipeBody");
    tbody.innerHTML = Object.keys(mecanicos).map(m => {
        const eficiencia = mecanicos[m].total ? (mecanicos[m].concluidas / mecanicos[m].total) * 100 : 0;
        const tempoMedio = mecanicos[m].concluidas ? (mecanicos[m].tempoTotal / mecanicos[m].concluidas).toFixed(1) : 0;
        return `<tr>
            <td>${m}</td>
            <td>${mecanicos[m].total}</td>
            <td>${tempoMedio}</td>
            <td>${eficiencia.toFixed(0)}%</td>
        </tr>`;
    }).join('');
}

function preencherFiltros() {
    const mecanicos = [...new Set(mockData.os.map(o=>o.mecanico))];
    const servicos = [...new Set(mockData.os.flatMap(o=>o.servicos))];
    const selectMec = document.getElementById("mecanicoFiltro");
    const selectServ = document.getElementById("servicoFiltro");
    selectMec.innerHTML = '<option value="todos">Todos</option>' + mecanicos.map(m=>`<option value="${m}">${m}</option>`).join('');
    selectServ.innerHTML = '<option value="todos">Todos</option>' + servicos.map(s=>`<option value="${s}">${s}</option>`).join('');
    selectMec.addEventListener('change', (e) => { currentFilters.mecanico = e.target.value; atualizarTudo(); });
    selectServ.addEventListener('change', (e) => { currentFilters.servico = e.target.value; atualizarTudo(); });
}

function atualizarTudo() {
    atualizarKPIs();
    atualizarGraficos();
    atualizarCardOS();
    atualizarAlertas();
    atualizarAprovacoes();
    atualizarDesempenhoEquipe();
}

function initDashboard() {
    preencherFiltros();
    atualizarTudo();
    document.getElementById("periodoSelect").addEventListener('change', (e) => { 
        currentFilters.periodo = e.target.value === 'custom' ? 'custom' : parseInt(e.target.value); 
        document.getElementById("customDateRange").style.display = e.target.value === 'custom' ? 'flex' : 'none'; 
        atualizarTudo(); 
    });
    document.getElementById("btnAplicarPeriodo").addEventListener('click', () => { 
        currentFilters.dataInicio = document.getElementById("dataInicio").value; 
        currentFilters.dataFim = document.getElementById("dataFim").value; 
        atualizarTudo(); 
    });
    document.getElementById("statusFiltro").addEventListener('change', (e) => { 
        currentFilters.status = e.target.value; 
        atualizarTudo(); 
    });
    document.getElementById("btnRefreshDashboard").addEventListener('click', () => atualizarTudo());
    document.getElementById("btnVerUltimasOS").addEventListener('click', abrirModalUltimasOS);
    document.getElementById("btnExportarPDF").addEventListener('click', () => alert("Exportação PDF - a implementar com jsPDF"));
    document.getElementById("btnExportarExcel").addEventListener('click', () => alert("Exportação Excel - a implementar"));
    document.getElementById("btnExportarCSV").addEventListener('click', () => alert("Exportação CSV - a implementar"));
}

document.addEventListener("DOMContentLoaded", initDashboard);