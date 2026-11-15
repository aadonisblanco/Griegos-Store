/* =========================================================
   GRIEGOS · MIDDLEWARE (solo para el modo Pages)
   ---------------------------------------------------------
   En el despliegue actual (Worker) esta lógica vive en
   src/index.js. Este archivo se mantiene para que el mismo
   sitio pueda publicarse como Pages sin cambios, y para que
   las pruebas automáticas validen la lista de bloqueos.
   ========================================================= */

import { esRutaBloqueada } from "./_lib/bloqueados.js";

export async function onRequest(context) {
  const ruta = new URL(context.request.url).pathname;

  if (esRutaBloqueada(ruta)) {
    return new Response("No encontrado.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }

  return context.next();
}
