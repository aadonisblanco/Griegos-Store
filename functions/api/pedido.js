/* =========================================================
   POST /api/pedido
   Registra una solicitud de pedido en D1.
   ========================================================= */

import {
  leerJson,
  respuestaJson,
  validarPedido,
  crearPedido,
  permitirPedido,
  hashIp
} from "../_lib/pedidos.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.DB) {
      return respuestaJson(
        { ok: false, error: "La base de datos no está configurada." },
        503
      );
    }

    const cuerpo = await leerJson(request);
    if (!cuerpo.ok) {
      return respuestaJson({ ok: false, error: cuerpo.error }, cuerpo.status);
    }

    const validacion = validarPedido(cuerpo.valor);
    if (!validacion.ok) {
      return respuestaJson(
        { ok: false, error: validacion.error },
        validacion.status
      );
    }

    const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
    const clave = await hashIp(ip, env.IP_SALT);

    if (!(await permitirPedido(env, clave))) {
      return respuestaJson(
        { ok: false, error: "Demasiados pedidos. Inténtalo más tarde." },
        429
      );
    }

    const registro = await crearPedido(env, validacion.pedido, clave);

    return respuestaJson(
      {
        ok: true,
        codigo: registro.codigo,
        creado_en: registro.creado_en,
        subtotalUSD: registro.subtotal,
        duplicado: Boolean(registro.duplicado)
      },
      registro.duplicado ? 200 : 201
    );
  } catch (fallo) {
    console.error("GRIEGOS /api/pedido:", fallo);
    return respuestaJson({ ok: false, error: "Error interno." }, 500);
  }
}

export function onRequest() {
  return respuestaJson({ ok: false, error: "Método no permitido." }, 405);
}
