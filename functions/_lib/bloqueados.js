/* =========================================================
   GRIEGOS · RUTAS QUE NUNCA SE SIRVEN
   ---------------------------------------------------------
   Una sola lista para los dos mundos:
   - src/index.js (Worker, despliegue actual)
   - functions/_middleware.js (si algún día se usa Pages)

   `.assetsignore` ya las deja fuera del despliegue; esto es
   la segunda barrera por si algún archivo se colara.
   ========================================================= */

export const BLOQUEADOS = [
  "/server.py",
  "/wrangler.jsonc",
  "/wrangler.toml",
  "/wrangler.toml.example",
  "/_routes.json",
  "/package.json",
  "/package-lock.json",
  "/.gitignore",
  "/.assetsignore",
  "/LEEME-BACKEND.md",
  "/SUBIR-A-CLOUDFLARE-PASO-A-PASO.md"
];

const CARPETAS = [
  "/_dev/",
  "/migrations/",
  "/functions/",
  "/src/",
  "/_local/"
];

export function esRutaBloqueada(ruta) {
  if (BLOQUEADOS.includes(ruta)) return true;
  return CARPETAS.some((carpeta) => ruta.startsWith(carpeta));
}
