// os-deep-link.js — utilitário para abrir uma OS específica diretamente
// na tela "Operações e Serviços" via parâmetro `?os_id=`.
// Também opcionalmente expõe `window.openOS(id, options)` para uso inline
// (legado em alguns templates), e o atalho `abrirNovaOS(veiculoPreSelecionado)`.

import { urlInterna } from "./base-path.js";


const ROTA_OS = "modulos/modulo_oficina/ordem_servico/shared/page/os-visao-geral.html";


/**
 * Abre a tela de visão geral da OS com a OS indicada já carregada.
 * `options.aba` (opcional) ativa uma aba específica.
 * `options.novaAba` (opcional) abre em nova janela.
 */
export function abrirOS(osId, { aba = "", novaAba = false } = {}) {
    if (!osId) return;
    const params = new URLSearchParams({ os_id: String(osId) });
    if (aba) params.set("aba", aba);
    const url = urlInterna(`${ROTA_OS}?${params.toString()}`);
    if (novaAba) {
        window.open(url, "_blank", "noopener");
    } else {
        window.location.href = url;
    }
}


/**
 * Abre a tela com o modal "Nova O.S." e (se houver) pré-seleção do veículo.
 * O parâmetro `?nova=1&veiculo_id=N` é lido pelo `visao-nova-os.js`.
 */
export function abrirNovaOS({ veiculoId = null, clienteId = null } = {}) {
    const params = new URLSearchParams({ nova: "1" });
    if (veiculoId) params.set("veiculo_id", String(veiculoId));
    if (clienteId) params.set("cliente_id", String(clienteId));
    const url = urlInterna(`${ROTA_OS}?${params.toString()}`);
    window.location.href = url;
}


// Expõe globalmente para handlers inline pré-existentes
if (typeof window !== "undefined") {
    window.openOS = (id, opts) => abrirOS(id, opts || {});
    window.abrirNovaOS = abrirNovaOS;
}
