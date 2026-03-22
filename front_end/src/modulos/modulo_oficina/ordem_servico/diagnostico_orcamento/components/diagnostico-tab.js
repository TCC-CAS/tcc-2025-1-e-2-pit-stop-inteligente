// diagnostico-tab.js
import { DiagnosticoService } from '../services/diagnostico-service.js';

let currentOsId = null;
let editandoItemId = null;
let todosItens = [];
let filtroAtual = 'todos';

// Variáveis para autocomplete de serviços
let servicosCadastrados = [];
let categoriasCadastradas = [];
let valorHoraAtivo = 0;
let servicoSelecionadoTempo = 0;

export async function initDiagnostico(osId) {
    currentOsId = osId;
    if (!currentOsId) {
        console.warn('Nenhuma OS selecionada para diagnóstico.');
        return;
    }

    document.getElementById('btnNovoItem')?.addEventListener('click', () => abrirModalItem());
    document.getElementById('btnEnviarAprovacao')?.addEventListener('click', enviarParaAprovacao);
    document.getElementById('btnGerarPDF')?.addEventListener('click', gerarPDF);

    initFiltros();
    
    // Carrega dados para autocomplete
    await carregarDadosAutocomplete();
    
    recarregarTabela();
}

async function carregarDadosAutocomplete() {
    try {
        const [servicos, categorias, config] = await Promise.all([
            DiagnosticoService.getServicos(),
            DiagnosticoService.getCategorias(),
            DiagnosticoService.getConfiguracao()
        ]);
        servicosCadastrados = servicos;
        categoriasCadastradas = categorias;
        // Ajuste conforme a estrutura da sua API: pode ser config.valor_hora ou config.valor_hora_ativo, etc.
        valorHoraAtivo = config.valor_hora || 0;
    } catch (error) {
        console.error('Erro ao carregar dados para autocomplete:', error);
    }
}

function initFiltros() {
    const tabs = document.querySelectorAll('.filter-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            filtroAtual = tab.dataset.filter;
            aplicarFiltroERenderizar();
        });
    });
}

async function recarregarTabela() {
    const tabelaBody = document.getElementById('listaItensBody');
    if (!tabelaBody) return;
    tabelaBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Carregando...</td></tr>';

    try {
        const itens = await DiagnosticoService.getItensOrcamento(currentOsId);
        todosItens = itens;
        aplicarFiltroERenderizar();
    } catch (error) {
        console.error('Erro ao carregar itens:', error);
        tabelaBody.innerHTML = '<tr><td colspan="6" style="color:red;">Erro ao carregar itens. Verifique o console.</td></tr>';
    }
}

function aplicarFiltroERenderizar() {
    let itensFiltrados = todosItens;
    if (filtroAtual !== 'todos') {
        itensFiltrados = todosItens.filter(item => item.tipo === filtroAtual);
    }
    renderizarTabela(itensFiltrados);
}

function renderizarTabela(itens) {
    const tabelaBody = document.getElementById('listaItensBody');
    if (!tabelaBody) return;
    tabelaBody.innerHTML = '';
    let totalExibido = 0;

    if (itens.length === 0) {
        tabelaBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum item encontrado.</td></tr>';
        document.getElementById('totalGeralOrcamento').innerText = 'R$ 0,00';
        return;
    }

    itens.forEach(item => {
        const valorUnit = parseFloat(item.valor_unitario) || 0;
        const quantidade = item.tipo === 'peca' ? parseInt(item.quantidade) || 1 : 1;
        const totalItem = valorUnit * quantidade;
        totalExibido += totalItem;

        const tipoBadge = item.tipo === 'peca' ? '<span class="badge badge-info">Peça</span>' : '<span class="badge badge-warning">Serviço</span>';
        const qtdDetalhe = item.tipo === 'peca' ? `${quantidade}x` : (item.dificuldade || '-');

        const tr = document.createElement('tr');
        tr.dataset.itemId = item.id;
        tr.innerHTML = `
            <td>${tipoBadge}</td>
            <td>${item.nome_descricao}</td>
            <td>${qtdDetalhe}</td>
            <td>R$ ${valorUnit.toFixed(2)}</td>
            <td><strong>R$ ${totalItem.toFixed(2)}</strong></td>
            <td class="actions-cell">
                <button class="btn-icon btn-edit" data-id="${item.id}" title="Editar item">
                    <i class="fas fa-pencil-alt"></i>
                    <span class="btn-text">Editar</span>
                </button>
                <button class="btn-icon btn-delete" data-id="${item.id}" title="Remover item">
                    <i class="fas fa-trash"></i>
                    <span class="btn-text">Excluir</span>
                </button>
            </td>
        `;
        tabelaBody.appendChild(tr);
    });

    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = e.currentTarget.dataset.id;
            editarItem(id);
        });
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = e.currentTarget.dataset.id;
            deletarItem(id);
        });
    });

    document.getElementById('totalGeralOrcamento').innerText = `R$ ${totalExibido.toFixed(2)}`;
}

function abrirModalItem(itemData = null) {
    const modal = document.getElementById('modalNovoItem');
    if (!modal) {
        console.error('Modal de novo item não encontrada.');
        return;
    }

    const temp = document.getElementById('tmplModalItem');
    const bodySlot = modal.querySelector('[slot="body"]');
    if (temp && bodySlot) {
        bodySlot.innerHTML = '';
        bodySlot.appendChild(temp.content.cloneNode(true));
    } else {
        console.error('Template ou slot não encontrado.');
        return;
    }

    aplicarMascaras();

    const tabs = modal.querySelectorAll('.modal-tab');
    const camposPeca = document.getElementById('camposPeca');
    const camposServico = document.getElementById('camposServico');
    const itemTipo = document.getElementById('itemTipo');

    const toggleCampos = (tipo) => {
        itemTipo.value = tipo;
        if (tipo === 'peca') {
            camposPeca.classList.remove('hidden');
            camposServico.classList.add('hidden');
        } else {
            camposPeca.classList.add('hidden');
            camposServico.classList.remove('hidden');
        }
    };

    tabs.forEach(tab => {
        tab.removeEventListener('click', tab._handler);
        const handler = (e) => {
            const tipo = e.currentTarget.dataset.type;
            tabs.forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            toggleCampos(tipo);
        };
        tab._handler = handler;
        tab.addEventListener('click', handler);
    });

    if (itemData) {
        editandoItemId = itemData.id;
        const tipo = itemData.tipo;
        const tabToActivate = Array.from(tabs).find(tab => tab.dataset.type === tipo);
        if (tabToActivate) {
            tabToActivate.click();
        } else {
            toggleCampos(tipo);
        }

        if (tipo === 'peca') {
            let nomeCompleto = itemData.nome_descricao;
            let nome = nomeCompleto;
            let descricao = '';
            if (nomeCompleto.includes(' - ')) {
                const partes = nomeCompleto.split(' - ');
                nome = partes[0];
                descricao = partes.slice(1).join(' - ');
            }
            document.getElementById('pecaNome').value = nome;
            document.getElementById('pecaDescricao').value = descricao;
            document.getElementById('pecaQtd').value = itemData.quantidade;
            const valor = parseFloat(itemData.valor_unitario) || 0;
            document.getElementById('pecaValor').value = valor.toFixed(2).replace('.', ',');
        } else {
            document.getElementById('servicoDescricao').value = itemData.nome_descricao;
            document.getElementById('servicoDificuldade').value = itemData.dificuldade || 'Carros Populares';
            const valor = parseFloat(itemData.valor_unitario) || 0;
            document.getElementById('servicoPreco').value = valor.toFixed(2).replace('.', ',');
            
            // Se for edição de serviço e existir na lista de serviços cadastrados, seta o tempo correspondente
            const servicoExistente = servicosCadastrados.find(s => s.nome === itemData.nome_descricao);
            if (servicoExistente) {
                servicoSelecionadoTempo = parseFloat(servicoExistente.tempo) || 0;
            }
        }
        modal.querySelector('[slot="title"]').innerText = 'Editar Item';
    } else {
        editandoItemId = null;
        modal.querySelector('[slot="title"]').innerText = 'Adicionar Item ao Orçamento';
        document.getElementById('pecaNome').value = '';
        document.getElementById('pecaDescricao').value = '';
        document.getElementById('pecaQtd').value = '1';
        document.getElementById('pecaValor').value = '';
        document.getElementById('servicoDescricao').value = '';
        document.getElementById('servicoDificuldade').value = 'Carros Populares';
        document.getElementById('servicoPreco').value = '';
        const tabPeca = Array.from(tabs).find(tab => tab.dataset.type === 'peca');
        if (tabPeca) tabPeca.click();
    }

    // Configura o autocomplete APÓS os campos estarem no DOM
    configurarAutocompleteServico();

    const btnSalvar = document.getElementById('btnSalvarItemModal');
    btnSalvar.replaceWith(btnSalvar.cloneNode(true));
    const novoBtnSalvar = document.getElementById('btnSalvarItemModal');
    novoBtnSalvar.addEventListener('click', salvarItem);

    modal.open();
}

function aplicarMascaras() {
    const monetarios = document.querySelectorAll('.monetario');
    monetarios.forEach(input => {
        input.removeEventListener('input', input._maskMonetarioHandler);
        const handler = (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value === '') value = '0';
            let num = (parseInt(value) / 100).toFixed(2);
            e.target.value = num.replace('.', ',');
        };
        input._maskMonetarioHandler = handler;
        input.addEventListener('input', handler);
    });

    const inteiros = document.querySelectorAll('.numero-inteiro');
    inteiros.forEach(input => {
        input.removeEventListener('input', input._maskInteiroHandler);
        const handler = (e) => {
            e.target.value = e.target.value.replace(/\D/g, '');
        };
        input._maskInteiroHandler = handler;
        input.addEventListener('input', handler);
    });
}

async function salvarItem() {
    const tipo = document.getElementById('itemTipo').value;
    let itemData = {};

    if (tipo === 'peca') {
        let valorStr = document.getElementById('pecaValor').value;
        valorStr = valorStr.replace(/\./g, '').replace(',', '.');
        const valor = parseFloat(valorStr) || 0;

        const nome = document.getElementById('pecaNome').value.trim();
        const descricao = document.getElementById('pecaDescricao').value.trim();
        const nomeCompleto = descricao ? `${nome} - ${descricao}` : nome;

        itemData = {
            tipo: 'peca',
            nome_descricao: nomeCompleto,
            quantidade: parseInt(document.getElementById('pecaQtd').value, 10) || 1,
            valor_unitario: valor,
            status_aprovacao: 'pendente'
        };
    } else {
        let valorStr = document.getElementById('servicoPreco').value;
        valorStr = valorStr.replace(/\./g, '').replace(',', '.');
        const valor = parseFloat(valorStr) || 0;

        itemData = {
            tipo: 'servico',
            nome_descricao: document.getElementById('servicoDescricao').value.trim(),
            quantidade: 1,
            valor_unitario: valor,
            dificuldade: document.getElementById('servicoDificuldade').value,
            status_aprovacao: 'pendente'
        };
    }

    if (!itemData.nome_descricao) {
        alert('Preencha a descrição do item.');
        return;
    }
    if (tipo === 'peca' && itemData.valor_unitario <= 0) {
        alert('Informe um valor unitário válido para a peça.');
        return;
    }
    if (tipo === 'servico' && itemData.valor_unitario <= 0) {
        alert('Informe um valor válido para o serviço.');
        return;
    }

    try {
        const btnSalvar = document.getElementById('btnSalvarItemModal');
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = 'Salvando...';

        if (editandoItemId) {
            await DiagnosticoService.atualizarItem(itemData, currentOsId, editandoItemId);
            alert('Item atualizado com sucesso!');
        } else {
            await DiagnosticoService.salvarItem(itemData, currentOsId);
            alert('Item adicionado com sucesso!');
        }

        document.getElementById('modalNovoItem').close();
        await recarregarTabela();
    } catch (error) {
        console.error('Erro ao salvar item:', error);
        alert(`Erro ao salvar item: ${error.message}`);
    } finally {
        const btnSalvar = document.getElementById('btnSalvarItemModal');
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = 'Salvar';
        }
    }
}

async function editarItem(itemId) {
    try {
        const item = await DiagnosticoService.getItem(currentOsId, itemId);
        abrirModalItem(item);
    } catch (error) {
        console.error('Erro ao carregar item para edição:', error);
        alert(`Erro ao carregar item: ${error.message}`);
    }
}

async function deletarItem(itemId) {
    if (!confirm('Tem certeza que deseja remover este item?')) return;
    try {
        await DiagnosticoService.deletarItem(currentOsId, itemId);
        await recarregarTabela();
        alert('Item removido com sucesso!');
    } catch (error) {
        console.error('Erro ao deletar item:', error);
        alert(`Erro ao deletar item: ${error.message}`);
    }
}

function enviarParaAprovacao() {
    alert('Funcionalidade de envio para aprovação será implementada em breve.');
}

function gerarPDF() {
    alert('Funcionalidade de geração de PDF será implementada em breve.');
}

// --- LÓGICA DE AUTOCOMPLETE E CÁLCULO DE PREÇO ---

function configurarAutocompleteServico() {
    const inputDesc = document.getElementById('servicoDescricao');
    const selectCat = document.getElementById('servicoDificuldade');

    if (!inputDesc || !selectCat) return;

    // 1. Popula dinamicamente as categorias reais que vieram do banco
    if (categoriasCadastradas.length > 0) {
        selectCat.innerHTML = categoriasCadastradas.map(c => `<option value="${c.nome}">${c.nome}</option>`).join('');
    }

    // 2. Cria a lista visual (dropdown) de sugestões, se não existir
    let ulSugestoes = document.getElementById('sugestoesServico');
    if (!ulSugestoes) {
        ulSugestoes = document.createElement('ul');
        ulSugestoes.id = 'sugestoesServico';
        ulSugestoes.style.cssText = `
            position: absolute; background: #fff; border: 1px solid #ccc;
            border-radius: 4px; width: 100%; max-height: 150px; overflow-y: auto;
            list-style: none; padding: 0; margin: 0; z-index: 1000;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1); display: none;
        `;
        inputDesc.parentNode.style.position = 'relative';
        inputDesc.parentNode.appendChild(ulSugestoes);
        inputDesc.setAttribute('autocomplete', 'off');
    }

    // 3. Evento ao digitar no campo
    inputDesc.addEventListener('input', (e) => {
        const termo = e.target.value.toLowerCase();
        ulSugestoes.innerHTML = '';
        servicoSelecionadoTempo = 0; // Zera o tempo caso ele digite algo novo que não existe

        if (termo.length < 2) {
            ulSugestoes.style.display = 'none';
            return;
        }
        
        // Filtra os serviços que contêm o termo digitado
        const filtrados = servicosCadastrados.filter(s => s.nome.toLowerCase().includes(termo));
        
        if (filtrados.length > 0) {
            ulSugestoes.style.display = 'block';
            filtrados.forEach(s => {
                const li = document.createElement('li');
                li.style.cssText = "padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #eee;";
                li.innerHTML = `<strong>${s.nome}</strong> <small style="color: #666; float:right;">${s.tempo}h</small>`;
                
                li.addEventListener('mouseenter', () => li.style.backgroundColor = '#f3f4f6');
                li.addEventListener('mouseleave', () => li.style.backgroundColor = 'transparent');
                
                // 4. Ao clicar na sugestão da lista:
                li.addEventListener('click', () => {
                    inputDesc.value = s.nome;
                    servicoSelecionadoTempo = parseFloat(s.tempo) || 0; // Salva o tempo para o cálculo
                    ulSugestoes.style.display = 'none';
                    calcularPrecoServico(); // Atualiza o preço imediatamente
                });
                
                ulSugestoes.appendChild(li);
            });
        } else {
            ulSugestoes.style.display = 'none';
        }
    });

    // Fecha a lista se o usuário clicar em qualquer outro lugar da tela
    document.addEventListener('click', (e) => {
        if (e.target !== inputDesc && !ulSugestoes.contains(e.target)) {
            ulSugestoes.style.display = 'none';
        }
    });

    // 5. Se ele trocar a Dificuldade/Categoria, recalcula o preço na hora
    selectCat.addEventListener('change', calcularPrecoServico);
}

function calcularPrecoServico() {
    // Só calcula se ele selecionou um serviço da lista (que tem tempo > 0)
    if (servicoSelecionadoTempo > 0 && valorHoraAtivo > 0) {
        const selectCat = document.getElementById('servicoDificuldade');
        const inputPreco = document.getElementById('servicoPreco');
        
        // Acha o percentual da categoria selecionada
        const catNome = selectCat.value;
        const categoria = categoriasCadastradas.find(c => c.nome === catNome);
        const percentual = categoria ? parseFloat(categoria.percentual) : 0;
        
        // Cálculo Mágico: (Tempo * Valor Hora) + % da Categoria
        const precoBase = servicoSelecionadoTempo * valorHoraAtivo;
        const precoFinal = precoBase + (precoBase * (percentual / 100));
        
        // Escreve no input (Ex: 150.5 vira "150,50")
        inputPreco.value = precoFinal.toFixed(2).replace('.', ',');
    }
}