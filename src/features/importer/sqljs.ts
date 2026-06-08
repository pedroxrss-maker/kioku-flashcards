import type { SqlJsStatic } from 'sql.js';

/**
 * sql.js (SQLite compiled to WASM), loaded from a CDN at runtime via a classic
 * <script> that exposes the global `initSqlJs`. This deliberately avoids
 * bundling sql.js: its UMD build broke ESM interop ("does not provide an export
 * named 'default'") and the local .wasm path didn't resolve in the deployed
 * build. The CDN form works identically in dev and in production (Cloudflare).
 * Pinned to the installed version.
 */
const SQLJS_CDN = 'https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/';

let sqlReady: Promise<SqlJsStatic> | null = null;

export function loadSqlJs(): Promise<SqlJsStatic> {
  if (sqlReady) return sqlReady;
  sqlReady = new Promise<SqlJsStatic>((resolve, reject) => {
    const g = window as unknown as {
      initSqlJs?: (config: { locateFile: (f: string) => string }) => Promise<SqlJsStatic>;
    };
    const init = () => {
      if (!g.initSqlJs) {
        reject(new Error('Motor SQLite (sql.js) indisponível após o carregamento.'));
        return;
      }
      g.initSqlJs({ locateFile: (f) => SQLJS_CDN + f }).then(resolve, reject);
    };
    if (g.initSqlJs) {
      init();
      return;
    }
    const script = document.createElement('script');
    script.src = `${SQLJS_CDN}sql-wasm.js`;
    script.async = true;
    script.onload = init;
    script.onerror = () =>
      reject(
        new Error('Não foi possível carregar o motor SQLite (sql.js). Verifique sua conexão.'),
      );
    document.head.appendChild(script);
  });
  return sqlReady;
}
