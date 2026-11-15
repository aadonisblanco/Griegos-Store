/* =========================================================
   GRIEGOS · WORKER (entrada única)
   ---------------------------------------------------------
   Un solo Worker hace dos cosas:

   1. /api/*  → ejecuta el backend (pedidos, listado, salud).
   2. el resto → sirve los archivos del sitio (index.html,
      CSS, imágenes...) desde el binding ASSETS.

   Los handlers de /api viven en functions/api/*.js y la
   lógica en functions/_lib/*.js: el mismo código que se
   probó con las 79 pruebas. Aquí solo se enrutan.
   ========================================================= */

import { onRequestPost as pedidoPost, onRequest as pedidoMetodo } from "../functions/api/pedido.js";
import { onRequestGet as pedidosGet, onRequest as pedidosMetodo } from "../functions/api/pedidos.js";
import { onRequestGet as saludGet, onRequest as saludMetodo } from "../functions/api/salud.js";
import { esRutaBloqueada } from "../functions/_lib/bloqueados.js";

const API = {
  "/api/pedido": { POST: pedidoPost, otro: pedidoMetodo },
  "/api/pedidos": { GET: pedidosGet, otro: pedidosMetodo },
  "/api/salud": { GET: saludGet, otro: saludMetodo }
};

/* /api/pedido/ y /api/pedido deben comportarse igual. */
function normalizar(ruta) {
  if (ruta.length > 1 && ruta.endsWith("/")) return ruta.replace(/\/+$/, "");
  return ruta;
}

function respuesta404(esApi) {
  if (esApi) {
    return new Response(JSON.stringify({ ok: false, error: "No encontrado." }), {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
  return new Response("No encontrado.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" }
  });
}

/* Cloudflare no aplica `_headers` a lo que genera el Worker,
   así que las cabeceras de /api se ponen aquí. */
function conCabeceras(respuesta, esApi) {
  const cabeceras = new Headers(respuesta.headers);

  cabeceras.set("X-Content-Type-Options", "nosniff");
  cabeceras.set("Referrer-Policy", "strict-origin-when-cross-origin");

  if (esApi) {
    cabeceras.set("Cache-Control", "no-store");
    cabeceras.set("X-Robots-Tag", "noindex");
    cabeceras.set("Access-Control-Allow-Origin", "same-origin");
  }

  return new Response(respuesta.body, {
    status: respuesta.status,
    statusText: respuesta.statusText,
    headers: cabeceras
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const ruta = normalizar(url.pathname);
    const esApi = ruta.startsWith("/api/");

    if (esApi && !API[ruta]) {
      return conCabeceras(respuesta404(true), true);
    }

    const handler = API[ruta];
    if (handler) {
      const funcion = handler[request.method] || handler.otro;
      const respuesta = await funcion({
        request,
        env,
        params: {},
        data: {},
        waitUntil: (p) => ctx.waitUntil(p),
        next: () => env.ASSETS.fetch(request)
      });
      return conCabeceras(respuesta, true);
    }

    if (esRutaBloqueada(ruta)) {
      return conCabeceras(respuesta404(false), false);
    }

    if (!env.ASSETS) {
      return conCabeceras(respuesta404(false), false);
    }

    return conCabeceras(await env.ASSETS.fetch(request), false);
  }
};
