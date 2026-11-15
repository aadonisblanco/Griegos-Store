# Verifica referencias internas de los HTML y mayúsculas/minúsculas exactas.
import io
import os
import re
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IGNORAR_DIRS = (".git", "node_modules", "__pycache__", "_dev", "functions", "migrations")

RE_ATTR = re.compile(
    r'(?:href|src|data-src|poster)\s*=\s*"([^"]*)"', re.IGNORECASE
)

problemas = []
revisadas = 0
total_refs = 0


def existe_exacto(ruta):
    """Comprueba que la ruta existe respetando mayúsculas (Windows no lo hace)."""
    actual = ROOT
    partes = ruta.replace("\\", "/").strip("/").split("/")
    for parte in partes:
        if parte in ("", "."):
            continue
        try:
            entradas = os.listdir(actual)
        except OSError:
            return False
        if parte not in entradas:
            return False
        actual = os.path.join(actual, parte)
    return os.path.exists(actual)


for base, dirs, archivos in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in IGNORAR_DIRS]
    for nombre in sorted(archivos):
        if not nombre.endswith(".html"):
            continue
        ruta = os.path.join(base, nombre)
        relativo = os.path.relpath(ruta, ROOT).replace("\\", "/")
        html = io.open(ruta, encoding="utf-8").read()
        revisadas += 1

        for valor in RE_ATTR.findall(html):
            valor = valor.strip()
            if not valor or valor.startswith("#"):
                continue
            if re.match(r"^(?:[a-z]+:|//)", valor, re.IGNORECASE):
                continue
            if valor.startswith("/"):
                problemas.append((relativo, valor, "ruta absoluta"))
                continue

            limpio = valor.split("#")[0].split("?")[0]
            if not limpio:
                continue
            limpio = urllib.parse.unquote(limpio)
            total_refs += 1
            destino = os.path.normpath(os.path.join(base, limpio))
            if not os.path.exists(destino):
                problemas.append((relativo, valor, "no existe"))
            elif not existe_exacto(os.path.relpath(destino, ROOT)):
                problemas.append((relativo, valor, "mayúsculas distintas"))

print("HTML revisados:", revisadas)
print("Referencias internas:", total_refs)
print("Problemas:", len(problemas))
for p in problemas:
    print("   ", p[0], "->", p[1], "|", p[2])
