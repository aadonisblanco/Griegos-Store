/* =========================================================
   GET /api/salud
   Comprueba que el backend y la base de datos responden.
   ========================================================= */

import { respuestaJson } from "../_lib/pedidos.js";

export async function onRequestGet(context) {
  const { env } = context;

  let baseDatos = "sin-configurar";
  if (env.DB) {
    try {
      await env.DB.prepare("SELECT 1 AS ok").first();
      baseDatos = "conectada";
    } catch {
      baseDatos = "error";
    }
  }

  return respuestaJson({
    ok: true,
    servicio: "griegos-backend",
    hora: new Date().toISOString(),
    baseDatos
  });
}

export function onRequest() {
  return respuestaJson({ ok: false, error: "Método no permitido." }, 405);
}
