import { test, expect } from "@playwright/test";
import { ROTAS } from "../helpers/rotas";

// Smoke dos assets de terceiros servidos localmente (shared/vendor).
// Garante que os builds UMD carregam e expõem os globais esperados — sem
// depender de nenhum CDN externo. Protege contra quebra de caminho.
// Não exige backend (só o servidor estático do front).

test.describe("Vendor self-hosted (sem CDN)", () => {
  test("Chart.js, html2pdf, jsPDF e html2canvas carregam localmente", async ({ page }) => {
    await page.goto(ROTAS.login);

    const r = await page.evaluate(async () => {
      const base = "/shared/vendor";
      const out: Record<string, boolean> = {};
      await import(`${base}/jspdf/jspdf.umd.min.js`);
      out.jspdf = typeof (window as any).jspdf?.jsPDF === "function";
      await import(`${base}/html2canvas/html2canvas.min.js`);
      out.html2canvas = typeof (window as any).html2canvas === "function";
      await import(`${base}/chartjs/chart.umd.min.js`);
      out.chart = typeof (window as any).Chart === "function";
      await import(`${base}/html2pdf/html2pdf.bundle.min.js`);
      out.html2pdf = typeof (window as any).html2pdf === "function";
      return out;
    });

    expect(r.jspdf, "window.jspdf.jsPDF").toBe(true);
    expect(r.html2canvas, "window.html2canvas").toBe(true);
    expect(r.chart, "window.Chart").toBe(true);
    expect(r.html2pdf, "window.html2pdf").toBe(true);
  });
});
