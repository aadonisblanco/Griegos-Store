/* =========================================================
   GRIEGOS · LÓGICA COMPARTIDA DEL BACKEND
   Cloudflare Pages Functions + D1
   ========================================================= */

import { CATALOGO } from "./catalogo.js";

export const MAX_BODY = 16 * 1024;
export const MAX_POR_HORA = 30;
export const MAX_PEDIDOS_LISTA = 200;

export const MUNICIPIOS = new Set([
  "Habana del Este",
  "Guanabacoa",
  "Regla",
  "San Miguel",
  "Cotorro",
  "Arroyo Naranjo",
  "Boyeros",
  "La Lisa",
  "Playa",
  "Cerro",
  "Plaza de la Revolución",
  "Centro Habana",
  "Habana Vieja",
  "Diez de Octubre",
  "Marianao"
]);

export const PAGOS = {
  "cup-cash": "Efectivo en CUP",
  "cup-transfer": "Transferencia en CUP",
  usdt: "USDT",
  zelle: "Zelle",
  eur: "EUR"
};

export const SEDES = {
  oeste: "Sede Oeste",
  este: "Sede Este"
};

/* Deben coincidir con scripts/config.js (delivery.shipping.tariffs). */
export const ZONAS = {
  oeste: new Set([
    "Jaimanitas",
    "Miramar",
    "Buena Vista",
    "Santa Fe, Playa",
    "Marianao",
    "La Lisa",
    "Vedado",
    "Nuevo Vedado",
    "Centro Habana",
    "Plaza de la Revolución",
    "Cerro",
    "Santo Suárez",
    "Luyanó, Lawton y Víbora",
    "Habana Vieja",
    "Arroyo Naranjo",
    "Boyeros",
    "Calabazar",
    "Santiago de las Vegas"
  ]),
  este: new Set([
    "Guanabo",
    "Peñas Altas",
    "Alturas de Marbella",
    "Juzti",
    "Campo Florido",
    "Alamar",
    "Cojímar",
    "Bahía",
    "Guanabacoa",
    "Regla",
    "Virgen del Camino, San Miguel y Cotorro"
  ])
};

const RE_CONTROL = /[\u0000-\u001f\u007f]/g;
const RE_ESPACIOS = /\s+/g;

/* UTILIDADES */

export function texto(valor, maximo) {
  if (typeof valor !== "string") return "";
  return valor
    .replace(RE_CONTROL, " ")
    .replace(RE_ESPACIOS, " ")
    .trim()
    .slice(0, maximo);
}

export function numero(valor) {
  if (typeof valor === "boolean" || valor === null || valor === undefined || valor === "") {
    return null;
  }
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

export function respuestaJson(datos, status = 200) {
  return new Response(JSON.stringify(datos), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

function fallo(status, mensaje) {
  return { ok: false, status, error: mensaje };
}

export async function leerJson(request) {
  const tipo = request.headers.get("content-type") || "";
  if (!/^application\/json\b/i.test(tipo)) {
    return fallo(415, "Envía el pedido como JSON.");
  }

  const declarado = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declarado) && declarado > MAX_BODY) {
    return fallo(413, "El pedido es demasiado grande.");
  }

  let crudo;
  try {
    crudo = await request.text();
  } catch {
    return fallo(400, "No se pudo leer el pedido.");
  }

  if (crudo.length > MAX_BODY) {
    return fallo(413, "El pedido es demasiado grande.");
  }

  try {
    return { ok: true, valor: JSON.parse(crudo) };
  } catch {
    return fallo(400, "El JSON no es válido.");
  }
}

/* VALIDACIÓN: el servidor nunca confía en el navegador */

export function validarPedido(entrada) {
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) {
    return fallo(400, "Pedido inválido.");
  }

  // Trampa anti-bots: un humano nunca rellena este campo.
  if (texto(entrada.website, 100)) {
    return fallo(400, "Pedido inválido.");
  }

  const cliente = entrada.customer || {};
  const entrega = entrada.delivery || {};
  const pago = entrada.payment || {};

  if (
    typeof cliente !== "object" || Array.isArray(cliente) ||
    typeof entrega !== "object" || Array.isArray(entrega) ||
    typeof pago !== "object" || Array.isArray(pago)
  ) {
    return fallo(400, "Pedido inválido.");
  }

  const nombre = texto(cliente.name, 80);
  if (!/\S+\s+\S/.test(nombre)) {
    return fallo(400, "Escribe tu nombre y apellidos.");
  }

  const telefono = texto(cliente.phone, 30);
  const digitos = telefono.replace(/\D/g, "");
  if (!/^[+\d\s().-]+$/.test(telefono) || digitos.length < 8 || digitos.length > 15) {
    return fallo(400, "Escribe un número de teléfono válido.");
  }

  const municipio = texto(cliente.municipality, 60);
  if (!MUNICIPIOS.has(municipio)) {
    return fallo(400, "Selecciona un municipio válido.");
  }

  let modo = texto(entrega.mode, 20);
  if (modo === "recogida") modo = "pickup";
  if (modo !== "pickup" && modo !== "delivery") {
    return fallo(400, "La modalidad de entrega no es válida.");
  }

  const sedeId = texto(entrega.branchId, 20);
  if (!SEDES[sedeId]) {
    return fallo(400, "La sede seleccionada no es válida.");
  }

  const direccion = texto(entrega.address, 200);
  const zona = texto(entrega.zone, 80);

  if (modo === "delivery") {
    if (direccion.length < 5) {
      return fallo(400, "Escribe una dirección de entrega completa.");
    }
    if (!zona) {
      return fallo(400, "Selecciona tu zona de mensajería.");
    }
    if (!ZONAS[sedeId] || !ZONAS[sedeId].has(zona)) {
      return fallo(400, "La zona de mensajería no corresponde a la sede.");
    }
  }

  const pagoId = texto(pago.id, 20);
  if (!PAGOS[pagoId]) {
    return fallo(400, "Selecciona un método de pago válido.");
  }

  const itemsEntrada = entrada.items;
  if (!Array.isArray(itemsEntrada) || itemsEntrada.length < 1 || itemsEntrada.length > 30) {
    return fallo(400, "El carrito debe tener entre 1 y 30 productos.");
  }

  const items = [];
  const vistos = new Set();

  for (const item of itemsEntrada) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return fallo(400, "Hay un producto no válido.");
    }

    const itemId = texto(item.id, 40);
    if (!itemId) {
      return fallo(400, "Hay un producto sin identificador.");
    }
    if (vistos.has(itemId)) {
      return fallo(400, "Hay un producto repetido en el carrito.");
    }
    vistos.add(itemId);

    const producto = CATALOGO[itemId];
    if (!producto || producto.disponible === false || producto.precio === null) {
      return fallo(400, "Hay un producto que no está disponible.");
    }

    const cantidad = numero(item.quantity);
    if (cantidad === null || !Number.isInteger(cantidad) || cantidad < 1) {
      return fallo(400, "Hay un producto con una cantidad no válida.");
    }
    if (cantidad > Number(producto.stock || 0)) {
      return fallo(400, "La cantidad solicitada supera la existencia disponible.");
    }

    // Nombre y precio salen del catálogo del servidor, nunca del navegador.
    items.push({
      id: itemId,
      name: producto.nombre,
      price: producto.precio,
      quantity: cantidad
    });
  }

  const subtotal = Math.round(items.reduce(
    (suma, item) => suma + item.price * item.quantity,
    0
  ) * 100) / 100;

  return {
    ok: true,
    pedido: {
      solicitudId: texto(entrada.requestId, 64),
      customer: { name: nombre, phone: telefono, municipality: municipio },
      delivery: {
        mode: modo,
        branchId: sedeId,
        branch: SEDES[sedeId],
        zone: modo === "delivery" ? zona : "",
        address: modo === "delivery" ? direccion : "",
        reference: texto(entrega.reference, 200),
        notes: texto(entrega.notes, 300)
      },
      payment: { id: pagoId, name: PAGOS[pagoId] },
      items,
      totals: { subtotal, currency: "USD", shippingPending: true }
    }
  };
}

/* FECHAS Y SEGURIDAD */

export function diaHavana() {
  // Fecha de La Habana para el código PED-YYYYMMDD.
  try {
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Havana",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());

    const mapa = {};
    for (const parte of partes) mapa[parte.type] = parte.value;

    if (mapa.year && mapa.month && mapa.day) {
      return `${mapa.year}${mapa.month}${mapa.day}`;
    }
  } catch {
    // Si el entorno no tuviera datos de zona horaria, se usa UTC.
  }

  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

export async function hashIp(ip, sal) {
  const datos = new TextEncoder().encode(`${sal || "griegos"}:${ip || "0.0.0.0"}`);
  const huella = await crypto.subtle.digest("SHA-256", datos);
  return Array.from(new Uint8Array(huella))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function tokenValido(enviado, esperado) {
  if (!esperado || typeof enviado !== "string" || !enviado) return false;

  const codificador = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", codificador.encode(enviado)),
    crypto.subtle.digest("SHA-256", codificador.encode(esperado))
  ]);

  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  if (aa.length !== bb.length) return false;

  let diferencia = 0;
  for (let i = 0; i < aa.length; i += 1) {
    diferencia |= aa[i] ^ bb[i];
  }
  return diferencia === 0;
}

/* LÍMITE DE PEDIDOS POR IP (30 por hora) */

export async function permitirPedido(env, clave) {
  const ahora = Math.floor(Date.now() / 1000);

  // Limpieza ocasional de ventanas vencidas.
  if (Math.random() < 0.02) {
    await env.DB.prepare("DELETE FROM limites WHERE expira < ?").bind(ahora).run();
  }

  const fila = await env.DB.prepare(
    "SELECT conteo, expira FROM limites WHERE clave = ?"
  ).bind(clave).first();

  if (!fila || Number(fila.expira) < ahora) {
    await env.DB.prepare(
      `INSERT INTO limites (clave, conteo, expira) VALUES (?, 1, ?)
       ON CONFLICT(clave) DO UPDATE SET conteo = 1, expira = excluded.expira`
    ).bind(clave, ahora + 3600).run();
    return true;
  }

  if (Number(fila.conteo) >= MAX_POR_HORA) {
    return false;
  }

  await env.DB.prepare(
    "UPDATE limites SET conteo = conteo + 1 WHERE clave = ?"
  ).bind(clave).run();

  return true;
}

/* CREACIÓN DEL PEDIDO */

export async function crearPedido(env, pedido, ipHash = "") {
  const solicitudId = pedido.solicitudId || crypto.randomUUID();

  const previo = await env.DB.prepare(
    "SELECT codigo, creado_en, subtotal FROM pedidos WHERE solicitud_id = ?"
  ).bind(solicitudId).first();

  if (previo) {
    return {
      codigo: previo.codigo,
      creado_en: previo.creado_en,
      subtotal: Number(previo.subtotal),
      duplicado: true
    };
  }

  const dia = diaHavana();

  // D1 ejecuta los lotes en una transacción: la secuencia es atómica.
  const lote = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO secuencias (dia, ultimo) VALUES (?, 1)
       ON CONFLICT(dia) DO UPDATE SET ultimo = ultimo + 1`
    ).bind(dia),
    env.DB.prepare("SELECT ultimo FROM secuencias WHERE dia = ?").bind(dia)
  ]);

  const seleccion = lote[1] && lote[1].results && lote[1].results[0];
  if (!seleccion) {
    throw new Error("No se pudo generar la secuencia del pedido.");
  }

  const codigo = `PED-${dia}-${String(Number(seleccion.ultimo)).padStart(4, "0")}`;
  const creadoEn = new Date().toISOString();
  const subtotal = pedido.totals.subtotal;

  try {
    await env.DB.prepare(
      `INSERT INTO pedidos (
         codigo, solicitud_id, creado_en, estado,
         nombre, telefono, municipio,
         entrega_modo, sede_id, sede, zona, direccion, referencia, notas,
         pago_id, pago_nombre, items_json, subtotal, moneda, ip_hash
       ) VALUES (?, ?, ?, 'nuevo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?)`
    ).bind(
      codigo,
      solicitudId,
      creadoEn,
      pedido.customer.name,
      pedido.customer.phone,
      pedido.customer.municipality,
      pedido.delivery.mode,
      pedido.delivery.branchId,
      pedido.delivery.branch,
      pedido.delivery.zone,
      pedido.delivery.address,
      pedido.delivery.reference,
      pedido.delivery.notes,
      pedido.payment.id,
      pedido.payment.name,
      JSON.stringify(pedido.items),
      subtotal,
      ipHash
    ).run();
  } catch (fallo) {
    // Doble clic o reintento: devolvemos el pedido ya guardado.
    if (/UNIQUE/i.test(String(fallo && fallo.message))) {
      const existente = await env.DB.prepare(
        "SELECT codigo, creado_en, subtotal FROM pedidos WHERE solicitud_id = ?"
      ).bind(solicitudId).first();
      if (existente) {
        return {
          codigo: existente.codigo,
          creado_en: existente.creado_en,
          subtotal: Number(existente.subtotal),
          duplicado: true
        };
      }
    }
    throw fallo;
  }

  return { codigo, creado_en: creadoEn, subtotal, duplicado: false };
}

/* CONSULTA ADMINISTRATIVA */

function filaAPedido(fila) {
  let items = [];
  try {
    items = JSON.parse(fila.items_json);
  } catch {
    items = [];
  }

  return {
    codigo: fila.codigo,
    creado_en: fila.creado_en,
    estado: fila.estado,
    customer: {
      name: fila.nombre,
      phone: fila.telefono,
      municipality: fila.municipio
    },
    delivery: {
      mode: fila.entrega_modo,
      branchId: fila.sede_id,
      branch: fila.sede,
      zone: fila.zona,
      address: fila.direccion,
      reference: fila.referencia,
      notes: fila.notas
    },
    payment: { id: fila.pago_id, name: fila.pago_nombre },
    items,
    subtotal: Number(fila.subtotal),
    currency: fila.moneda
  };
}

export async function listarPedidos(env, opciones = {}) {
  const estado = texto(opciones.estado || "", 30);
  const limite = Math.min(Math.max(Number(opciones.limite) || MAX_PEDIDOS_LISTA, 1), 500);
  const filtro = estado ? "WHERE estado = ?" : "";

  const consultaResumen = env.DB.prepare(
    `SELECT estado AS estado, COUNT(*) AS total, COALESCE(SUM(subtotal), 0) AS suma
     FROM pedidos ${filtro} GROUP BY estado`
  );
  const consultaLista = env.DB.prepare(
    `SELECT * FROM pedidos ${filtro} ORDER BY creado_en DESC LIMIT ?`
  );

  const resumenStmt = estado ? consultaResumen.bind(estado) : consultaResumen;
  const listaStmt = estado ? consultaLista.bind(estado, limite) : consultaLista.bind(limite);

  const [resumen, lista] = await env.DB.batch([resumenStmt, listaStmt]);

  const porEstado = {};
  let total = 0;
  let subtotalUSD = 0;

  for (const fila of resumen.results || []) {
    const clave = String(fila.estado || "");
    porEstado[clave] = Number(fila.total) || 0;
    total += Number(fila.total) || 0;
    subtotalUSD += Number(fila.suma) || 0;
  }

  return {
    resumen: {
      total,
      porEstado,
      subtotalUSD: Math.round(subtotalUSD * 100) / 100
    },
    pedidos: (lista.results || []).map(filaAPedido)
  };
}
