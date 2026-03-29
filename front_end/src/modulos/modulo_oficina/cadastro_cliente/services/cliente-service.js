const API_URL = 'http://localhost:8000/api/clientes/'; // Usar a porta padrão do Django (8000)

export const ClienteService = {
    // Buscar todos os clientes
    async buscarTodos() {
        try {
            const response = await fetch(API_URL);
            if (!response.ok) throw new Error('Erro ao buscar clientes');
            return await response.json();
        } catch (error) {
            console.error(error);
            return []; // Retorna lista vazia para não quebrar a tela
        }
    },

    // Buscar cliente por ID
    async buscarPorId(id) {
        const response = await fetch(`${API_URL}${id}/`);
        if (!response.ok) throw new Error('Cliente não encontrado');
        return await response.json();
    },

    // Criar novo cliente
    async criar(cliente) {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cliente)
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(JSON.stringify(errorData)); // Retorna os erros de validação do DRF
        }
        return await response.json();
    },

    // Atualizar cliente existente
    async atualizar(id, cliente) {
        const response = await fetch(`${API_URL}${id}/`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cliente)
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(JSON.stringify(errorData));
        }
        return await response.json();
    },

    // Excluir cliente
    async excluir(id) {
        const response = await fetch(`${API_URL}${id}/`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Erro ao excluir cliente');
        return true;
    },

    // Buscar endereço por CEP (API Externa)
    async buscarEnderecoPorCep(cep) {
        const cleanCep = cep.replace(/\D/g, '');
        if (cleanCep.length !== 8) return null;
        
        try {
            const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
            const data = await response.json();
            return data.erro ? null : data;
        } catch (error) {
            console.error('Erro na consulta do CEP', error);
            return null;
        }
    }
};