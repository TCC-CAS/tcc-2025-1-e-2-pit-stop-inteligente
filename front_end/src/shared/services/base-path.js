// base-path.js
//
// Resolve uma rota relativa à raiz de `front_end/src/` para uma URL absoluta,
// INDEPENDENTE de onde o site está montado:
//   - Live Server servindo a raiz do projeto → .../front_end/src/...
//   - nginx servindo `front_end/src` como raiz do domínio → /...
//   - qualquer subpasta
//
// A âncora é a própria localização deste módulo (`import.meta.url`). Como este
// arquivo vive em `front_end/src/shared/services/base-path.js`, subir dois
// níveis ("../../") sempre aponta para a raiz de `src/`. Assim eliminamos a
// dependência do trecho literal "/front_end/src/" no pathname.

const SRC_BASE = new URL("../../", import.meta.url);

/**
 * Converte uma rota relativa a `src/` (ex.: "app/login/pages/login-page.html",
 * podendo conter querystring/hash) numa URL absoluta navegável.
 */
export function urlInterna(rotaEmSrc) {
  const limpa = String(rotaEmSrc || "").replace(/^\/+/, "");
  return new URL(limpa, SRC_BASE).href;
}
