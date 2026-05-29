/**
 * cep-service.js
 * Wrapper para a API pública ViaCEP.
 */
const VIA_CEP = "https://viacep.com.br/ws";

export async function buscarEnderecoPorCep(cep) {
    const limpo = String(cep).replace(/\D/g, "");
    if (limpo.length !== 8) {
        throw new Error("CEP inválido. Informe 8 dígitos.");
    }
    const response = await fetch(`${VIA_CEP}/${limpo}/json/`);
    const data = await response.json();
    if (data.erro) throw new Error("CEP não encontrado.");
    return data;
}
