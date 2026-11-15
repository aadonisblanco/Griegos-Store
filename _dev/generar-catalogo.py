# =========================================================
# GRIEGOS · GENERADOR DEL CATÁLOGO DEL SERVIDOR
# Uso:  python _dev/generar-catalogo.py
#
# Lee data/products.js (la única fuente de verdad de precios,
# nombres y stock) y escribe functions/_lib/catalogo.js.
# Vuelve a ejecutarlo cada vez que cambien productos o precios.
# =========================================================

import io
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGEN = os.path.join(ROOT, "data", "products.js")
DESTINO = os.path.join(ROOT, "functions", "_lib", "catalogo.js")

CABECERA = """/* =========================================================
   GRIEGOS · CATÁLOGO DE PRECIOS DEL SERVIDOR
   Generado desde data/products.js. No editar a mano:
   ejecuta _dev/generar-catalogo.py y vuelve a desplegar.
   El servidor usa estos precios, nombres y stock; nunca
   confía en los que envía el navegador.
   ========================================================= */

export const CATALOGO = """

PIE = ";\n\nexport default CATALOGO;\n"


def cargar_catalogo():
    texto = io.open(ORIGEN, encoding="utf-8").read()
    bloques = re.findall(r'\{\s*"id":\s*"([^"]+)"(.*?)\n  \}', texto, re.S)
    catalogo = {}
    for producto_id, resto in bloques:
        nombre = re.search(r'"name":\s*"((?:[^"\\]|\\.)*)"', resto)
        precio = re.search(r'"price":\s*(null|-?\d+(?:\.\d+)?)', resto)
        stock = re.search(r'"stock":\s*(\d+)', resto)
        disponible = re.search(r'"available":\s*(true|false)', resto)
        if not nombre:
            raise SystemExit("Producto sin nombre: " + producto_id)
        catalogo[producto_id] = {
            "nombre": json.loads('"' + nombre.group(1) + '"'),
            "precio": None if (not precio or precio.group(1) == "null") else float(precio.group(1)),
            "stock": int(stock.group(1)) if stock else 0,
            "disponible": (disponible.group(1) == "true") if disponible else True,
        }
    if not catalogo:
        raise SystemExit("No se encontró ningún producto en data/products.js")
    return catalogo


def main():
    catalogo = cargar_catalogo()
    salida = CABECERA + json.dumps(catalogo, ensure_ascii=False, indent=2) + PIE
    os.makedirs(os.path.dirname(DESTINO), exist_ok=True)
    io.open(DESTINO, "w", encoding="utf-8", newline="\n").write(salida)
    print("Productos exportados:", len(catalogo))
    print("Destino:", DESTINO)


if __name__ == "__main__":
    main()
