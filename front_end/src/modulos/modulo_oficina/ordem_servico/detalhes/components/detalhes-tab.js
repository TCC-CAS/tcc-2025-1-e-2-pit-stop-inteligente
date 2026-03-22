// detalhes-tab.js
export function initDetalhes(osId) {
    if (!osId) {
        console.warn('Nenhuma OS selecionada para detalhes.');
        return;
    }
    carregarDetalhes(osId);
}

function formatarCPFouCNPJ(valor) {
    const numeros = valor.replace(/\D/g, '');
    if (numeros.length === 11) {
        return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else if (numeros.length === 14) {
        return numeros.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return valor;
}

async function carregarDetalhes(osId) {
    try {
        const response = await fetch(`http://127.0.0.1:8000/api/oficina/os/${osId}/`);
        if (!response.ok) throw new Error('Erro ao carregar detalhes da OS');
        const os = await response.json();

        // Log para depuração
        console.log('Dados da OS recebidos:', os);

        // Preenche campos de cliente e veículo
        document.getElementById('detalhe-cliente-nome').textContent = os.veiculo?.cliente?.nome || '--';
        
        const doc = os.veiculo?.cliente?.cpf_cnpj || '--';
        document.getElementById('detalhe-cliente-doc').textContent = doc !== '--' ? formatarCPFouCNPJ(doc) : '--';
        
        document.getElementById('detalhe-veiculo-modelo').textContent = os.veiculo?.modelo || '--';
        document.getElementById('detalhe-veiculo-placa').textContent = os.veiculo?.placa || '--';

        // KM Atual
        const km = os.km_atual !== undefined && os.km_atual !== null ? `${os.km_atual} km` : '--';
        document.getElementById('detalhe-veiculo-km').textContent = km;

        // Ano / Cor
        const ano = os.veiculo?.ano || '--';
        const cor = os.veiculo?.cor || '--';
        document.getElementById('detalhe-veiculo-ano-cor').textContent = `${ano} / ${cor}`;

        carregarChecklistResumo(osId);
    } catch (error) {
        console.error('Erro ao carregar detalhes:', error);
    }
}

async function carregarChecklistResumo(osId) {
    const tbody = document.getElementById('checklist-body');
    if (!tbody) return;

    try {
        const response = await fetch(`http://127.0.0.1:8000/api/oficina/os/${osId}/checklist/`);
        if (response.status === 404) {
            tbody.innerHTML = '<tr><td colspan="3">Checklist não preenchido.</td></tr>';
            return;
        }
        if (!response.ok) throw new Error('Erro ao buscar checklist');
        const checklist = await response.json();

        // Exemplo de itens – ajuste conforme sua necessidade
        const itens = [
            { nome: 'Lataria', observacao: 'OK', status: checklist.concluido ? 'Concluído' : 'Pendente' },
            { nome: 'Vidros', observacao: 'Sem trincas', status: checklist.concluido ? 'Concluído' : 'Pendente' },
        ];
        tbody.innerHTML = itens.map(item => `
            <tr>
                <td>${item.nome}</td>
                <td>${item.status}</td>
                <td>${item.observacao}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="3">Erro ao carregar checklist.</td></tr>';
    }
}