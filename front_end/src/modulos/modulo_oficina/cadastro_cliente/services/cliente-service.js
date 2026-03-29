const API_URL = 'http://localhost:8000/api/oficina/clientes/';

export const ClienteService = {

    async buscarTodos() {
        try {
            const response = await fetch(API_URL);
            if (!response.ok) throw new Error('Erro ao buscar clientes');
            return await response.json();
        } catch (error) {
            console.error(error);
            return [];
        }
    },

    async buscarPorId(id) {
        const response = await fetch(`${API_URL}${id}/`);
        if (!response.ok) throw new Error('Cliente não encontrado');
        return await response.json();
    },

    async criar(cliente) {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cliente)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(JSON.stringify(errorData));
        }

        return await response.json();
    },

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

    async excluir(id) {
        const response = await fetch(`${API_URL}${id}/`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Erro ao excluir cliente');
        return true;
    },

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