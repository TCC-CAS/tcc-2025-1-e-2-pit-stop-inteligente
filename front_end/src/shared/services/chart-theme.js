/**
 * chart-theme.js
 *
 * Fonte única de verdade das cores que os gráficos (Chart.js) devem usar
 * conforme o tema da aplicação (claro/escuro).
 *
 * Como usar nos gráficos:
 *   import {
 *     aplicarTemaPadraoChart, coresChart, observarMudancaTema,
 *   } from "../../../../shared/services/chart-theme.js";
 *
 *   aplicarTemaPadraoChart();                  // chama 1x no bootstrap
 *   observarMudancaTema(() => redesenhar());   // recria gráficos ao trocar
 *
 *   const c = coresChart();
 *   new Chart(canvas, {
 *     data: { datasets: [{ borderColor: c.accent }] },
 *     options: { scales: { y: { ticks: { color: c.text }, grid: { color: c.grid } } } },
 *   });
 *
 * O `oficina-header` dispara o evento `pitstop:tema-mudou` ao alternar o
 * tema; este módulo escuta esse evento e expõe `observarMudancaTema()`
 * para que telas individuais (ex.: dashboard) repintem seus gráficos.
 */

export const EVENTO_TEMA = "pitstop:tema-mudou";


/** True se o documento está em modo escuro. */
export function temaEscuroAtivo() {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark-mode") ||
           document.body.classList.contains("dark-mode");
}


/**
 * Devolve a paleta corrente. Sempre derivada do tema ativo no momento
 * da chamada — não cacheia, pois `oficina-header.toggleTheme()` pode
 * trocar a classe a qualquer instante.
 */
export function coresChart() {
    const escuro = temaEscuroAtivo();
    if (escuro) {
        return {
            text: "#f1f5f9",        // text-primary
            textMuted: "#cbd5e1",   // text-secondary
            grid: "rgba(148, 163, 184, 0.18)",
            border: "#334155",      // border-light no dark
            card: "#1e293b",        // bg-card no dark (para "buracos" do pie)
            accent: "#60a5fa",      // primary visível em fundo escuro
            success: "#34d399",
            warning: "#fbbf24",
            danger: "#f87171",
            info: "#22d3ee",
            // Paleta para múltiplas séries (legível em fundo escuro)
            paleta: ["#60a5fa", "#34d399", "#fbbf24", "#a78bfa", "#f87171", "#22d3ee"],
        };
    }
    return {
        text: "#0f172a",
        textMuted: "#475569",
        grid: "rgba(15, 23, 42, 0.08)",
        border: "#e2e8f0",
        card: "#ffffff",
        accent: "#2563eb",
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        info: "#06b6d4",
        paleta: ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"],
    };
}


/**
 * Aplica os defaults globais do Chart.js para refletir o tema atual.
 * Idempotente — pode ser chamada várias vezes (e é, quando o tema muda).
 */
export function aplicarTemaPadraoChart() {
    if (typeof window === "undefined" || !window.Chart) return;
    const c = coresChart();
    const Chart = window.Chart;
    Chart.defaults.color = c.text;
    Chart.defaults.borderColor = c.grid;
    if (Chart.defaults.scale) {
        // Chart 3+: scales/grid/ticks têm defaults aninhados
        Chart.defaults.scale.grid = Chart.defaults.scale.grid || {};
        Chart.defaults.scale.grid.color = c.grid;
        Chart.defaults.scale.ticks = Chart.defaults.scale.ticks || {};
        Chart.defaults.scale.ticks.color = c.textMuted;
    }
    // Tooltip mais legível
    Chart.defaults.plugins = Chart.defaults.plugins || {};
    Chart.defaults.plugins.tooltip = Chart.defaults.plugins.tooltip || {};
    Object.assign(Chart.defaults.plugins.tooltip, {
        backgroundColor: temaEscuroAtivo() ? "rgba(15, 23, 42, 0.95)" : "rgba(15, 23, 42, 0.9)",
        titleColor: "#fff",
        bodyColor: "#fff",
        borderColor: c.border,
        borderWidth: 1,
        padding: 10,
    });
}


/**
 * Registra `callback` para rodar quando o tema mudar. Devolve uma função
 * que remove o listener (útil em SPAs/cleanup).
 */
export function observarMudancaTema(callback) {
    if (typeof document === "undefined" || typeof callback !== "function") {
        return () => {};
    }
    const handler = () => {
        aplicarTemaPadraoChart();
        try { callback(); } catch (err) { console.error("[chart-theme]", err); }
    };
    document.addEventListener(EVENTO_TEMA, handler);
    return () => document.removeEventListener(EVENTO_TEMA, handler);
}


/**
 * Dispara o evento global `pitstop:tema-mudou`. Chamado pelo
 * oficina-header logo após alternar a classe `.dark-mode`.
 */
export function notificarMudancaTema() {
    if (typeof document === "undefined") return;
    document.dispatchEvent(new CustomEvent(EVENTO_TEMA, {
        detail: { dark: temaEscuroAtivo() },
    }));
}
