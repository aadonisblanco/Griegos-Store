/* =========================================================
   GET /api/pedidos?token=...&estado=nuevo
   Lista administrativa. Requiere PEDIDOS_TOKEN.
   También acepta: Authorization: Bearer <token>
   ========================================================= */

import {
  respuestaJson,
  tokenValido,
  listarPedidos,
  texto
} from "../_lib/pedidos.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return respuestaJson(
        { ok: false, error: "La base de datos no está configurada." },
        503
      );
    }

    if (!env.PEDIDOS_TOKEN) {
      return respuestaJson(
        { ok: false, error: "Falta configurar PEDIDOS_TOKEN." },
        503
      );
    }

    const url = new URL(request.url);
    const cabecera = request.headers.get("authorization") || "";
    let enviado = url.searchParams.get("token") || "";

    if (/^Bearer\s+/i.test(cabecera)) {
      enviado = cabecera.replace(/^Bearer\s+/i, "").trim();
    }

    if (!(await tokenValido(enviado, env.PEDIDOS_TOKEN))) {
      return respuestaJson({ ok: false, error: "Token no válido." }, 401);
    }

    const estado = texto(url.searchParams.get("estado") || "", 30);
    const datos = await listarPedidos(env, { estado });

    return respuestaJson({
      ok: true,
      resumen: datos.resumen,
      pedidos: datos.pedidos
    });
  } catch (fallo) {
    console.error("GRIEGOS /api/pedidos:", fallo);
    return respuestaJson({ ok: false, error: "Error interno." }, 500);
  }
}

export function onRequest() {
  return respuestaJson({ ok: false, error: "Método no permitido." }, 405);
}
