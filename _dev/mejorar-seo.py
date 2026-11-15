# =========================================================
# GRIEGOS · SEO BÁSICO
# Uso:  python _dev/mejorar-seo.py
#
# - Quita <meta name="robots" content="noindex,nofollow">
# - Elimina og:*/twitter:* antiguos para no duplicar
# - Añade canonical + Open Graph + Twitter Card
# Es idempotente: se puede ejecutar varias veces.
# =========================================================

import io
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOMINIO = "https://oficial.griegosshop.workers.dev"
IMAGEN = DOMINIO + "/assets/brand/griegos-og.png"

# Páginas duplicadas de ODYSSEY: consolidan su SEO en Academy.
CANONICAL_ESPECIAL = {
    "pages/odyssey/index.html": "/academy/",
    "pages/odyssey/academy.html": "/academy/",
    "pages/odyssey/calculadoras.html": "/academy/calculadoras/",
    "pages/odyssey/entrenamientos.html": "/academy/training/",
    "pages/odyssey/nutricion.html": "/academy/nutrition/",
}

RETIRAR = re.compile(
    r'<meta\b[^>]*(?:name|property)\s*=\s*"(?:robots|og:[^"]+|twitter:[^"]+)"[^>]*>\s*',
    re.IGNORECASE,
)
CANONICAL_VIEJO = re.compile(r'<link\b[^>]*rel\s*=\s*"canonical"[^>]*>\s*', re.IGNORECASE)
TITULO = re.compile(r"<title>(.*?)</title>", re.IGNORECASE | re.DOTALL)
DESCRIPCION = re.compile(
    r'<meta\b[^>]*name\s*=\s*"description"[^>]*content\s*=\s*"([^"]*)"[^>]*>',
    re.IGNORECASE,
)


def ruta_canonica(relativo):
    if relativo in CANONICAL_ESPECIAL:
        return CANONICAL_ESPECIAL[relativo]
    partes = relativo.replace("\\", "/").split("/")
    if partes[-1] == "index.html":
        partes = partes[:-1]
        return "/" + "/".join(partes) + ("/" if partes else "")
    return "/" + "/".join(partes[:-1] + [partes[-1][:-5]])


def escapar(valor):
    return (
        valor.replace("&", "&amp;")
        .replace('"', "&quot;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def main():
    paginas = []
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in (".git", "node_modules", "__pycache__", "_dev", "functions", "migrations")]
        for nombre in sorted(fn):
            if nombre.endswith(".html"):
                paginas.append(os.path.join(dp, nombre))

    for ruta in sorted(paginas):
        relativo = os.path.relpath(ruta, ROOT).replace("\\", "/")
        html = io.open(ruta, encoding="utf-8").read()

        titulo = TITULO.search(html)
        titulo = re.sub(r"\s+", " ", titulo.group(1)).strip() if titulo else "GRIEGOS"
        descripcion = DESCRIPCION.search(html)
        descripcion = re.sub(r"\s+", " ", descripcion.group(1)).strip() if descripcion else ""
        if not descripcion:
            descripcion = "Fuerza, cultura y legado. Ecosistema deportivo GRIEGOS."

        url = DOMINIO + ruta_canonica(relativo)

        html = RETIRAR.sub("", html)
        html = CANONICAL_VIEJO.sub("", html)

        bloque = "\n".join([
            '  <link rel="canonical" href="' + escapar(url) + '">',
            '  <meta property="og:type" content="website">',
            '  <meta property="og:site_name" content="GRIEGOS">',
            '  <meta property="og:locale" content="es_CU">',
            '  <meta property="og:title" content="' + escapar(titulo) + '">',
            '  <meta property="og:description" content="' + escapar(descripcion) + '">',
            '  <meta property="og:url" content="' + escapar(url) + '">',
            '  <meta property="og:image" content="' + IMAGEN + '">',
            '  <meta property="og:image:width" content="1200">',
            '  <meta property="og:image:height" content="630">',
            '  <meta property="og:image:alt" content="GRIEGOS FITNESS SHOP">',
            '  <meta name="twitter:card" content="summary_large_image">',
            '  <meta name="twitter:title" content="' + escapar(titulo) + '">',
            '  <meta name="twitter:description" content="' + escapar(descripcion) + '">',
            '  <meta name="twitter:image" content="' + IMAGEN + '">',
            "",
        ])

        html = re.sub(r"</head>", bloque + "</head>", html, count=1)
        io.open(ruta, "w", encoding="utf-8", newline="\n").write(html)
        print("{:45} {}".format(relativo, ruta_canonica(relativo)))

    print("\nPáginas actualizadas:", len(paginas))


if __name__ == "__main__":
    main()
