# =========================================================
# GRIEGOS · BACKEND LOCAL
# Un archivo, sin dependencias: python server.py
# Sitio: http://127.0.0.1:8787
# API:   POST /api/pedido · GET /api/pedidos?token=...
# =========================================================

import hmac
import json
import math
import os
import re
import secrets
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

ROOT = os.path.dirname(os.path.abspath(__file__))
MAX_BODY = 16 * 1024
MAX_POR_HORA = 30

MUNICIPIOS = {
    "Habana del Este", "Guanabacoa", "Regla", "San Miguel", "Cotorro",
    "Arroyo Naranjo", "Boyeros", "La Lisa", "Playa", "Cerro",
    "Plaza de la Revolución", "Centro Habana", "Habana Vieja",
    "Diez de Octubre", "Marianao",
}

PAGOS = {
    "cup-cash": "Efectivo en CUP",
    "cup-transfer": "Transferencia en CUP",
    "usdt": "USDT",
    "zelle": "Zelle",
    "eur": "EUR",
}

SEDES = {"oeste": "Sede Oeste", "este": "Sede Este"}

ZONAS = {
    "oeste": {
        "Jaimanitas", "Miramar", "Buena Vista", "Santa Fe, Playa",
        "Marianao", "La Lisa", "Vedado", "Nuevo Vedado", "Centro Habana",
        "Plaza de la Revolución", "Cerro", "Santo Suárez",
        "Luyanó, Lawton y Víbora", "Habana Vieja", "Arroyo Naranjo",
        "Boyeros", "Calabazar", "Santiago de las Vegas",
    },
    "este": {
        "Guanabo", "Peñas Altas", "Alturas de Marbella", "Juzti",
        "Campo Florido", "Alamar", "Cojímar", "Bahía", "Guanabacoa",
        "Regla", "Virgen del Camino, San Miguel y Cotorro",
    },
}


def cargar_catalogo():
    """Lee precios, nombres y stock desde data/products.js."""
    archivo = os.path.join(ROOT, "data", "products.js")
    try:
        with open(archivo, encoding="utf-8") as f:
            contenido = f.read()
    except OSError:
        return {}
    catalogo = {}
    for producto_id, resto in re.findall(
            r'\{\s*"id":\s*"([^"]+)"(.*?)\n  \}', contenido, re.S):
        nombre = re.search(r'"name":\s*"((?:[^"\\]|\\.)*)"', resto)
        precio = re.search(r'"price":\s*(null|-?\d+(?:\.\d+)?)', resto)
        stock = re.search(r'"stock":\s*(\d+)', resto)
        disponible = re.search(r'"available":\s*(true|false)', resto)
        if not nombre:
            continue
        catalogo[producto_id] = {
            "nombre": json.loads('"' + nombre.group(1) + '"'),
            "precio": (None if (not precio or precio.group(1) == "null")
                       else float(precio.group(1))),
            "stock": int(stock.group(1)) if stock else 0,
            "disponible": ((disponible.group(1) == "true")
                           if disponible else True),
        }
    return catalogo


CATALOGO = cargar_catalogo()

EXTENSIONES = {
    ".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".webp",
    ".gif", ".svg", ".ico", ".woff", ".woff2", ".mp4",
}


# UTILIDADES

def texto(valor, maximo):
    if not isinstance(valor, str):
        return ""
    limpio = re.sub(r"[\x00-\x1f\x7f]", " ", valor)
    return re.sub(r"\s+", " ", limpio).strip()[:maximo]


def numero(valor):
    if isinstance(valor, bool) or valor is None or valor == "":
        return None
    try:
        n = float(valor)
    except (TypeError, ValueError):
        return None
    return n if math.isfinite(n) else None


def error(status, mensaje):
    return {"ok": False, "status": status, "error": mensaje}


def fecha_local():
    return datetime.now().strftime("%Y%m%d")


def ahora_utc():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


# VALIDACIÓN (el servidor nunca confía en el navegador)

def validar(entrada):
    if not isinstance(entrada, dict):
        return error(400, "Pedido inválido.")
    if texto(entrada.get("website"), 100):  # trampa anti-bots
        return error(400, "Pedido inválido.")

    cliente = entrada.get("customer") or {}
    entrega = entrada.get("delivery") or {}
    pago = entrada.get("payment") or {}
    if not all(isinstance(x, dict) for x in (cliente, entrega, pago)):
        return error(400, "Pedido inválido.")

    nombre = texto(cliente.get("name"), 80)
    if not re.search(r"\S+\s+\S", nombre):
        return error(400, "Escribe tu nombre y apellidos.")

    telefono = texto(cliente.get("phone"), 30)
    digitos = re.sub(r"\D", "", telefono)
    if not re.fullmatch(r"[+\d\s().-]+", telefono) or not 8 <= len(digitos) <= 15:
        return error(400, "Escribe un número de teléfono válido.")

    municipio = texto(cliente.get("municipality"), 60)
    if municipio not in MUNICIPIOS:
        return error(400, "Selecciona un municipio válido.")

    modo = entrega.get("mode")
    modo = "pickup" if modo in ("pickup", "recogida") else "delivery" if modo == "delivery" else ""
    if not modo:
        return error(400, "La modalidad de entrega no es válida.")

    sede = texto(entrega.get("branchId"), 20)
    if sede not in SEDES:
        return error(400, "La sede seleccionada no es válida.")

    direccion = texto(entrega.get("address"), 200)
    zona = texto(entrega.get("zone"), 80)
    if modo == "delivery":
        if len(direccion) < 5:
            return error(400, "Escribe una dirección de entrega completa.")
        if not zona:
            return error(400, "Selecciona tu zona de mensajería.")
        if zona not in ZONAS.get(sede, set()):
            return error(400, "La zona de mensajería no corresponde a la sede.")

    pago_id = texto(pago.get("id"), 20)
    if pago_id not in PAGOS:
        return error(400, "Selecciona un método de pago válido.")

    items_entrada = entrada.get("items")
    if not isinstance(items_entrada, list) or not 1 <= len(items_entrada) <= 30:
        return error(400, "El carrito debe tener entre 1 y 30 productos.")

    items = []
    vistos = set()
    for item in items_entrada:
        if not isinstance(item, dict):
            return error(400, "Hay un producto no válido.")
        item_id = texto(item.get("id"), 40)
        if not item_id:
            return error(400, "Hay un producto sin identificador.")
        if item_id in vistos:
            return error(400, "Hay un producto repetido en el carrito.")
        vistos.add(item_id)

        producto = CATALOGO.get(item_id)
        if (not producto or not producto["disponible"]
                or producto["precio"] is None):
            return error(400, "Hay un producto que no está disponible.")

        cantidad = numero(item.get("quantity"))
        if (cantidad is None or not cantidad.is_integer()
                or not 1 <= cantidad <= producto["stock"]):
            return error(400, "Hay un producto con una cantidad no válida.")

        # Nombre y precio salen del catálogo, nunca del navegador.
        items.append({
            "id": item_id,
            "name": producto["nombre"],
            "price": producto["precio"],
            "quantity": int(cantidad),
        })

    # El subtotal se calcula aquí, nunca se copia del navegador.
    subtotal = round(sum(i["price"] * i["quantity"] for i in items) * 100) / 100

    return {"ok": True, "pedido": {
        "solicitudId": texto(entrada.get("requestId"), 64),
        "customer": {"name": nombre, "phone": telefono, "municipality": municipio},
        "delivery": {
            "mode": modo,
            "branchId": sede,
            "branch": SEDES[sede],
            "zone": zona if modo == "delivery" else "",
            "address": direccion if modo == "delivery" else "",
            "reference": texto(entrega.get("reference"), 200),
            "notes": texto(entrega.get("notes"), 300),
        },
        "payment": {"id": pago_id, "name": PAGOS[pago_id]},
        "items": items,
        "totals": {"subtotal": subtotal, "currency": "USD", "shippingPending": True},
    }}


# ALMACENAMIENTO: un pedido por línea (JSON Lines)

def leer_pedidos(archivo):
    try:
        with open(archivo, encoding="utf-8") as f:
            lineas = f.read().splitlines()
    except FileNotFoundError:
        return []
    pedidos = []
    for linea in lineas:
        try:
            registro = json.loads(linea)
        except json.JSONDecodeError:
            continue
        if isinstance(registro, dict):
            pedidos.append(registro)
    return pedidos


def guardar_pedido(archivo, pedido, bloqueo):
    with bloqueo:
        os.makedirs(os.path.dirname(archivo), exist_ok=True)
        pedidos = leer_pedidos(archivo)
        solicitud = pedido.get("solicitudId") or ""

        # Reintento o doble clic: devolver el pedido ya guardado.
        if solicitud:
            for registro in pedidos:
                if registro.get("solicitud_id") == solicitud:
                    return registro, True

        prefijo = "PED-" + fecha_local() + "-"
        ultimo = 0
        for registro in pedidos:
            codigo = str(registro.get("codigo", ""))
            secuencia = codigo[len(prefijo):]
            if codigo.startswith(prefijo) and secuencia.isdigit():
                ultimo = max(ultimo, int(secuencia))

        registro = {
            "codigo": "{}{:04d}".format(prefijo, ultimo + 1),
            "solicitud_id": solicitud,
            "creado_en": ahora_utc(),
            "estado": "nuevo",
            **{clave: pedido[clave] for clave in
               ("customer", "delivery", "payment", "items")},
            "subtotal": pedido["totals"]["subtotal"],
            "currency": pedido["totals"]["currency"],
        }
        with open(archivo, "a", encoding="utf-8") as f:
            f.write(json.dumps(registro, ensure_ascii=False, separators=(",", ":")) + "\n")
    return registro, False


# SERVIDOR

def crear_handler(data_dir, token_admin, limite):
    archivo_pedidos = os.path.join(data_dir, "pedidos.jsonl")
    bloqueo = threading.Lock()
    intentos = {}

    class Handler(SimpleHTTPRequestHandler):
        extensions_map = {
            ".html": "text/html; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".svg": "image/svg+xml",
        }

        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=ROOT, **kwargs)

        def log_message(self, *args):
            pass

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def list_directory(self, ruta):
            self.send_error(404)
            return None

        def translate_path(self, ruta):
            archivo = super().translate_path(ruta)
            real = os.path.realpath(archivo)
            raiz = os.path.realpath(ROOT)
            if real == raiz:
                return archivo
            relativo = os.path.relpath(real, raiz)
            partes = relativo.split(os.sep)
            if (relativo.startswith("..")
                    or any(parte.startswith(".") for parte in partes)
                    or partes[0] == "_local"):
                return os.path.join(raiz, "__no_existe__")
            if os.path.isdir(real):
                return archivo
            if os.path.splitext(real)[1].lower() not in EXTENSIONES:
                return os.path.join(raiz, "__no_existe__")
            return archivo

        def _json(self, status, datos):
            cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(cuerpo)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(cuerpo)

        def _autorizado(self, enviado):
            a, b = enviado.encode(), token_admin.encode()
            return len(a) == len(b) and hmac.compare_digest(a, b)

        def _permitido(self, ip):
            ahora = time.time()
            with bloqueo:
                registro = intentos.get(ip)
                if not registro or ahora > registro[1]:
                    intentos[ip] = [1, ahora + 3600]
                    return True
                if registro[0] >= limite:
                    return False
                registro[0] += 1
                return True

        def _pedidos(self, url):
            consulta = parse_qs(url.query)
            enviado = consulta.get("token", [""])[0]
            cabecera = self.headers.get("Authorization", "")
            if cabecera.startswith("Bearer "):
                enviado = cabecera[7:]
            if not self._autorizado(enviado):
                return self._json(401, {"ok": False, "error": "Token no válido."})

            estado = consulta.get("estado", [""])[0]
            pedidos = [p for p in leer_pedidos(archivo_pedidos)
                       if not estado or p.get("estado") == estado]
            por_estado = {}
            subtotal = 0.0
            for pedido in pedidos:
                clave = str(pedido.get("estado", ""))
                por_estado[clave] = por_estado.get(clave, 0) + 1
                subtotal += float(pedido.get("subtotal") or 0)

            return self._json(200, {
                "ok": True,
                "resumen": {
                    "total": len(pedidos),
                    "porEstado": por_estado,
                    "subtotalUSD": round(subtotal * 100) / 100,
                },
                "pedidos": list(reversed(pedidos[-200:])),
            })

        def do_GET(self):
            try:
                url = urlsplit(self.path)
                if url.path == "/api/salud":
                    return self._json(200, {
                        "ok": True, "servicio": "griegos-backend", "hora": ahora_utc(),
                    })
                if url.path == "/api/pedidos":
                    return self._pedidos(url)
                return super().do_GET()
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception as fallo:  # noqa: BLE001
                print("GRIEGOS backend:", fallo, file=sys.stderr)
                self._json(500, {"ok": False, "error": "Error interno."})

        def do_HEAD(self):
            if self.path.startswith("/api/"):
                return self.do_GET()
            return super().do_HEAD()

        def do_POST(self):
            try:
                if urlsplit(self.path).path != "/api/pedido":
                    return self._json(404, {"ok": False, "error": "No encontrado."})

                if not re.match(r"^application/json\b",
                                self.headers.get("Content-Type", ""), re.IGNORECASE):
                    return self._json(415, {"ok": False, "error": "Envía el pedido como JSON."})

                if not self._permitido(self.client_address[0]):
                    return self._json(429, {
                        "ok": False, "error": "Demasiados pedidos. Inténtalo más tarde.",
                    })

                largo = self.headers.get("Content-Length", "")
                if not largo.isdigit():
                    return self._json(411, {"ok": False, "error": "Falta el tamaño del contenido."})
                largo = int(largo)
                if largo > MAX_BODY:
                    return self._json(413, {"ok": False, "error": "El pedido es demasiado grande."})

                crudo = self.rfile.read(largo).decode("utf-8", errors="replace")
                try:
                    entrada = json.loads(crudo) if crudo else None
                except json.JSONDecodeError:
                    return self._json(400, {"ok": False, "error": "El JSON no es válido."})

                validacion = validar(entrada)
                if not validacion["ok"]:
                    return self._json(validacion["status"], {
                        "ok": False, "error": validacion["error"],
                    })

                registro, duplicado = guardar_pedido(
                    archivo_pedidos, validacion["pedido"], bloqueo)
                return self._json(200 if duplicado else 201, {
                    "ok": True,
                    "codigo": registro["codigo"],
                    "creado_en": registro["creado_en"],
                    "subtotalUSD": registro["subtotal"],
                    "duplicado": duplicado,
                })
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception as fallo:  # noqa: BLE001
                print("GRIEGOS backend:", fallo, file=sys.stderr)
                self._json(500, {"ok": False, "error": "Error interno."})

    return Handler


def crear_servidor(puerto=8787, data_dir=None, token_admin=None, limite=MAX_POR_HORA):
    data_dir = data_dir or os.path.join(ROOT, "_local")
    token_admin = token_admin or secrets.token_hex(12)
    servidor = ThreadingHTTPServer(
        ("127.0.0.1", puerto), crear_handler(data_dir, token_admin, limite))
    servidor.daemon_threads = True
    servidor.token_admin = token_admin
    servidor.archivo_pedidos = os.path.join(data_dir, "pedidos.jsonl")
    return servidor


def main():
    puerto = int(os.environ.get("PORT", "8787"))
    token = os.environ.get("GRIEGOS_ADMIN_TOKEN") or secrets.token_hex(12)
    try:
        servidor = crear_servidor(puerto, token_admin=token)
    except OSError:
        print("El puerto {} está ocupado. Prueba: set PORT=8788 && python server.py".format(puerto))
        return

    base = "http://127.0.0.1:{}".format(puerto)
    print("\nGRIEGOS · backend local")
    print("  Sitio:    {}/store/".format(base))
    print("  Pedidos:  {}/api/pedidos?token={}".format(base, token))
    print("  Archivo:  {}\n  Detener:  Ctrl + C\n".format(servidor.archivo_pedidos))
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        servidor.server_close()


if __name__ == "__main__":
    main()
