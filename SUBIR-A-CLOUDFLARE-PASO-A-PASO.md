# GRIEGOS · Publicar en Cloudflare Workers, paso a paso

Guía para el despliegue real de este proyecto:

- Repositorio: `https://github.com/aadonisblanco/Griegos-Store`
- Dirección final: `https://oficial.griegosshop.workers.dev`
- Método: **GitHub Desktop** (sin comandos de Git) + panel de Cloudflare

---

## Estado actual (lo que comprobé antes de escribir esto)

| Cosa | Estado |
|---|---|
| Repositorio en GitHub | Existe, público, pero **vacío**: solo tiene un `README.md` |
| `oficial.griegosshop.workers.dev` | **Todavía no existe** (el DNS no resuelve: el Worker no está creado) |
| Sitio + backend en tu PC | Listos y probados (79 pruebas, pedido real contra D1) |
| Configuración para Cloudflare | Ya está en el proyecto: `wrangler.jsonc`, `src/index.js`, `.assetsignore` |

**Por qué `workers.dev` y no `pages.dev`:** esa dirección la da **Workers**, que
es el producto actual de Cloudflare para sitios con backend. El proyecto ya está
adaptado a Workers, así que la dirección que quieres es la que vas a tener.

---

## Antes de empezar: 4 ideas claras

1. **No se instala nada de Cloudflare.** Ni Node, ni Wrangler, ni la consola.
   Solo **GitHub Desktop** (que tú pediste) y el navegador.
2. **No subas archivos arrastrándolos al panel.** El backend (carpeta
   `functions/`) y el Worker (`src/index.js`) solo se compilan si Cloudflare
   construye desde GitHub.
3. **El Worker se llama `oficial`.** Ese nombre está en `wrangler.jsonc` y debe
   coincidir con el del panel; de ahí sale `oficial.griegosshop.workers.dev`.
4. **La base de datos se llama `griegos-pedidos`.** También está ya escrita en
   `wrangler.jsonc`.

Tiempo: unos 30 minutos la primera vez, casi todo esperando compilaciones.

---

## Paso 1 · Crear la base de datos D1

1. Entra en <https://dash.cloudflare.com>.
2. Menú lateral → **Storage & Databases** → **D1 SQL Database**
   (en paneles antiguos: **Workers & Pages → D1**).
3. **Create database**.
4. **Name:** `griegos-pedidos` — exacto, en minúsculas y con guion.
5. **Location:** la más cercana a tu público (por ejemplo *Eastern Europe*).
   No afecta al funcionamiento, solo a la latencia.
6. **Create**.

Se abre la página de la base. **Copia el `Database ID`** (una cadena tipo
`a1b2c3d4-5e6f-7890-abcd-1234567890ef`). Lo necesitas en el paso 2.

### 1.1 Crear las tablas

En la misma página de la base → pestaña **Console**.

> **⚠ Importante:** la consola del panel no ejecuta bien un archivo con varias
> sentencias. Pega **una sentencia y pulsa Execute**, y repite. Es más lento pero
> es lo que funciona siempre.
>
> Si ves `no such table: main.pedidos` o `main.limites`, es justo eso: el bloque
> se lanzó como una sola consulta y las tablas no llegaron a crearse.

Ejecuta, en este orden y **de una en una**:

1. El `CREATE TABLE pedidos` completo (está en `migrations\0001_esquema.sql`).
2. Comprueba: `SELECT name FROM sqlite_schema WHERE type = 'table';` → debe salir `pedidos`.
3. Los dos `CREATE INDEX` de `pedidos`.
4. El `CREATE TABLE secuencias`.
5. El `CREATE TABLE limites`.
6. El `CREATE INDEX` de `limites`.

Los índices son **opcionales** (solo aceleran consultas); las tres tablas son
obligatorias.

Comprobación final:

```sql
SELECT type, name FROM sqlite_schema WHERE type IN ('table','index') ORDER BY type, name;
```

Deben aparecer `limites`, `pedidos` y `secuencias`.

---

## Paso 2 · Pegar el Database ID en el proyecto

Esto es **lo único** que hay que editar a mano.

1. Abre `C:\Users\tuane\OneDrive\Documentos\Proyecto Griegos\GRIEGOS\GRIEGOS - WEB 2\wrangler.jsonc`
   con el Bloc de notas (clic derecho → *Abrir con* → *Notepad*).
2. Busca esta línea:

```jsonc
"database_id": "00000000-0000-0000-0000-000000000000"
```

3. Sustituye los ceros por tu ID real, **conservando las comillas**:

```jsonc
"database_id": "a1b2c3d4-5e6f-7890-abcd-1234567890ef"
```

4. Guarda (`Ctrl+S`).

> **⚠ Ojo:** si dejas los ceros, el primer despliegue fallará con
> `database not found`. Es la señal de que falta este paso.
>
> El archivo lleva comentarios (`//`). Es normal: el formato `.jsonc` los
> permite, y Cloudflare los ignora.

---

## Paso 3 · Subir el proyecto con GitHub Desktop

### 3.1 Instalar y entrar

1. Descarga <https://desktop.github.com> e instálalo.
2. Ábrelo → **Sign in to GitHub.com** → entra con la cuenta
   **aadonisblanco** (la dueña del repositorio).

### 3.2 Clonar el repositorio vacío

Como el repositorio ya existe en GitHub, lo correcto es **clonarlo** y llenarlo.
Así no hay conflictos y el historial queda limpio.

1. `File` → **Clone repository** → pestaña **URL**.
2. Pega:

```
https://github.com/aadonisblanco/Griegos-Store
```

3. **Local path:** `C:\Users\tuane\Documents\Griegos-Store`
   (fuera de OneDrive: se evitan bloqueos de sincronización).
4. **Clone**.

Se crea esa carpeta con el `README.md`.

### 3.3 Copiar el proyecto dentro

1. Abre el Explorador en la carpeta clonada: `C:\Users\tuane\Documents\Griegos-Store`.
2. En **otra** ventana del Explorador abre el proyecto:
   `C:\Users\tuane\OneDrive\Documentos\Proyecto Griegos\GRIEGOS\GRIEGOS - WEB 2`
3. Dentro del proyecto: `Ctrl+A` (seleccionar todo) → `Ctrl+C`.
4. En la carpeta clonada: `Ctrl+V` → si pregunta, **reemplazar** los archivos.

> No copies nada de `.git` porque el proyecto no tiene: no hay riesgo de
> pisar el historial del repositorio.

### 3.4 Primer commit y subida

1. Vuelve a GitHub Desktop. En **Changes** aparecerán ~160 archivos
   (tarda unos segundos en contarlos).
2. Abajo a la izquierda, en **Summary**, escribe:

```
Sitio + backend Cloudflare (Worker + D1)
```

3. Pulsa **Commit to main**.
4. Arriba, pulsa **Push origin**.

Espera: son ~100 MB de imágenes, puede tardar varios minutos.

**✅ Punto de control:** abre `https://github.com/aadonisblanco/Griegos-Store` y
debes ver `index.html`, `wrangler.jsonc`, `src/`, `functions/`, `assets/`…

> **A partir de ahora trabaja en `C:\Users\tuane\Documents\Griegos-Store`.**
> La carpeta de OneDrive queda como copia antigua. Si cambias algo allí, no se
> publica.

---

## Paso 4 · Crear el Worker conectado al repositorio

1. Panel de Cloudflare → **Workers & Pages** → **Create application**.
2. Elige **GitHub** (conectar un repositorio) → autoriza a Cloudflare si lo pide.
   Marca solo el repositorio `Griegos-Store`.
3. Selecciona `Griegos-Store` → **Begin setup** / **Next**.
4. Configura **exactamente** así:

| Campo | Valor |
|---|---|
| **Worker name** | `oficial` |
| **Git branch** | `main` |
| **Root directory** | *(vacío)* |
| **Build command** | *(vacío, o `exit 0`)* |
| **Deploy command** | `npx wrangler deploy` (el valor por defecto) |
| **Preview command** | *(déjalo como está)* |

5. **Save and Deploy** / **Deploy**.

Cloudflare instala Wrangler, lee `wrangler.jsonc`, empaqueta `src/index.js` y
sube el sitio. Tarda **2–5 minutos** la primera vez.

**✅ Punto de control:**
- El build termina en **Success**.
- La dirección `https://oficial.griegosshop.workers.dev/` abre la tienda.

> **Si el nombre del Worker ya está ocupado** (o ya habías creado uno), entra en
> ese Worker → **Settings → Builds → Connect** y conecta el repositorio; solo
> asegúrate de que se llama `oficial`.
>
> **Si tu subdominio de workers.dev no es `griegosshop`**, la dirección será
> `oficial.TU-SUBDOMINIO.workers.dev`. Se ve en **Workers & Pages** (arriba, en
> *Your subdomain*) o en la propia página del Worker.

### Qué hace Cloudflare con cada archivo

- `wrangler.jsonc` → dice el nombre, el código, la carpeta de assets y la base D1.
- `src/index.js` → el Worker: enruta `/api/*` y sirve el sitio.
- `functions/` → el backend (se importa desde `src/index.js`).
- `.assetsignore` → deja fuera del sitio público `functions/`, `src/`, `_dev/`,
  `migrations/`, `server.py`, los `.md` y la configuración.
- `_headers` → CSP y cabeceras de seguridad de las páginas.
- `migrations/` → **no** se publica; es solo para pegar el SQL en el panel.

---

## Paso 5 · Crear los dos secretos

`PEDIDOS_TOKEN` protege el listado de pedidos. `IP_SALT` anonimiza las IP.

1. En el Worker `oficial` → **Settings** → **Variables and Secrets** → **Add**.
2. Crea:

| Nombre | Valor | Tipo |
|---|---|---|
| `PEDIDOS_TOKEN` | frase larga y aleatoria | **Secret** (Encrypt) |
| `IP_SALT` | otra frase larga y aleatoria | **Secret** (Encrypt) |

3. **Save** / **Deploy**.

Para generar las frases, en PowerShell:

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
```

Ejecútalo dos veces. **Guarda `PEDIDOS_TOKEN`** en un lugar seguro: es la
contraseña para ver pedidos y no se puede volver a leer desde el panel.

> En Workers los secretos se aplican **al instante**: no hace falta volver a
> desplegar (a diferencia de Pages).

---

## Paso 6 · Comprobar que todo funciona

### 6.1 Salud del backend

Abre: `https://oficial.griegosshop.workers.dev/api/salud`

Debe responder:

```json
{"ok":true,"servicio":"griegos-backend","hora":"...","baseDatos":"conectada"}
```

| Si dice… | Significa | Solución |
|---|---|---|
| `"conectada"` | todo bien | sigue |
| `"error"` | las tablas no existen | repetir paso 1.1 |
| `"sin-configurar"` | falta el binding D1 | revisar `wrangler.jsonc` y volver a desplegar |
| 404 | el Worker no arrancó | ver los *build logs* en Cloudflare |

### 6.2 Pedido real desde la tienda

1. Abre `https://oficial.griegosshop.workers.dev/store/`.
2. Añade un producto, rellena el checkout con **datos tuyos** (será una prueba).
3. Pulsa **Preparar pedido por WhatsApp**.

Se abre WhatsApp **y** aparece en pantalla:

> Solicitud registrada con el código **PED-20261115-0001**

### 6.3 Verlo en la base de datos

D1 → `griegos-pedidos` → **Console**:

```sql
SELECT codigo, creado_en, estado, nombre, telefono, municipio, subtotal
FROM pedidos
ORDER BY creado_en DESC
LIMIT 10;
```

### 6.4 Listado por API

```
https://oficial.griegosshop.workers.dev/api/pedidos?token=TU_TOKEN
```

Devuelve un JSON con el resumen y los pedidos. Si da `401`, el token está mal
copiado; si da `503`, falta el secreto.

### 6.5 Archivos privados bloqueados

Estas direcciones **deben** dar 404:

```
/api/../server.py          →  404
/_dev/generar-catalogo.py  →  404
/migrations/0001_esquema.sql → 404
/wrangler.jsonc            →  404
/src/index.js              →  404
/LEEME-BACKEND.md          →  404
```

Ya lo comprobé en local con Wrangler: todas dan 404, y el sitio y la API dan
200.

### 6.6 Limpieza

```sql
DELETE FROM pedidos WHERE codigo = 'PED-20261115-0001';
```

---

## Paso 7 · Dónde consultar la base de datos

**Cloudflare → Storage & Databases → D1 SQL Database → `griegos-pedidos`**

### Pestaña *Tables* (sin SQL)

Elige `pedidos` y verás las filas como una hoja de cálculo; puedes editar celdas.

### Pestaña *Console* (SQL)

```sql
-- Últimos 50 pedidos
SELECT codigo, creado_en, estado, nombre, telefono, municipio, subtotal
FROM pedidos ORDER BY creado_en DESC LIMIT 50;

-- Un pedido completo (incluye la columna items en JSON)
SELECT * FROM pedidos WHERE codigo = 'PED-20261115-0001';

-- Resumen por estado
SELECT estado, COUNT(*) AS total, ROUND(SUM(subtotal), 2) AS usd
FROM pedidos GROUP BY estado;

-- Total vendido
SELECT COUNT(*) AS pedidos, ROUND(SUM(subtotal), 2) AS usd FROM pedidos;

-- Cambiar estado: nuevo · contactado · confirmado · entregado · cancelado
UPDATE pedidos SET estado = 'confirmado' WHERE codigo = 'PED-20261115-0001';

-- Borrar un pedido
DELETE FROM pedidos WHERE codigo = 'PED-20261115-0001';
```

### Copia de seguridad

D1 → base → menú `...` → **Export**. Descarga un `.sql` con tablas y datos.

---

## Paso 8 · Actualizar el sitio a partir de ahora

Todo desde **GitHub Desktop**, en `C:\Users\tuane\Documents\Griegos-Store`:

1. Abre GitHub Desktop y pulsa **Fetch origin** (arriba).
2. Si dice **Pull origin**, púlsalo (por si cambiaste algo desde la web).
3. Edita lo que quieras en la carpeta.
4. En **Changes** revisa la lista, escribe un **Summary** y pulsa
   **Commit to main**.
5. Pulsa **Push origin**.

Cloudflare lo detecta y redespliega solo (2–5 min).

### Si cambias productos, precios o stock

Hay un paso extra obligatorio: el servidor tiene su propia copia del catálogo.

1. Edita `data/products.js`.
2. Ejecuta en PowerShell:

```powershell
cd "C:\Users\tuane\Documents\Griegos-Store"
python _dev/generar-catalogo.py
```

3. En GitHub Desktop: commit y push (incluirá `functions/_lib/catalogo.js`).

Si te lo saltas, la web mostrará el precio nuevo y el servidor rechazará el
pedido por «precio no coincide» o «sin existencia».

### Si cambias el token

Settings → Variables and Secrets → editar → **Save**. Se aplica al instante.

---

## Paso 9 · Dominio propio (opcional, más adelante)

1. Compra el dominio y añádelo a Cloudflare (o usa Cloudflare Registrar).
2. Worker `oficial` → **Settings** → **Domains & Routes** → **Add** →
   **Custom domain** → escribe `griegosshop.com` (o el que sea).
3. Cloudflare crea el DNS solo.
4. **Importante:** actualiza el dominio canónico del sitio (paso siguiente).

> Un dominio propio es recomendable: `workers.dev` funciona, pero algunos
> proveedores y redes lo bloquean, y para una tienda da más confianza.

---

## Paso 10 · Cambiar el dominio del SEO

Ahora canonical, Open Graph, `robots.txt` y `sitemap.xml` apuntan a
`https://oficial.griegosshop.workers.dev`.

Si cambias de dirección:

1. Edita `_dev/mejorar-seo.py`:

```python
DOMINIO = "https://oficial.griegosshop.workers.dev"
```

2. Ejecuta:

```powershell
python _dev/mejorar-seo.py
```

3. Actualiza la línea `Sitemap:` de `robots.txt` y las URLs de `sitemap.xml`
   (Bloc de notas: buscar y reemplazar).
4. Comprueba los enlaces internos:

```powershell
python _dev/verificar-referencias.py
```

5. Commit y push en GitHub Desktop.

---

## Cómo está montado (para que no te sorprenda nada)

```
wrangler.jsonc      nombre "oficial", assets en la raíz, binding DB
src/index.js        Worker: /api/* al backend, resto a los archivos
functions/api/*.js  los tres endpoints
functions/_lib/     validación, catálogo, D1, límites
.assetsignore       qué NO se publica
_headers            CSP y cabeceras de las páginas
```

Un pedido funciona así:

1. La persona pulsa **Preparar pedido por WhatsApp** → se abre WhatsApp.
2. En paralelo el navegador llama a `POST /api/pedido`.
3. El servidor **ignora los precios del navegador** y los recalcula con
   `functions/_lib/catalogo.js`.
4. Guarda el pedido en D1 y devuelve `PED-AAAAMMDD-0001`.
5. La página muestra el código.

Si el sitio se abre con doble clic (`file://`), sin internet o sin backend, el
paso 2 se salta sin errores y **WhatsApp sigue funcionando**.

Límites activos: 30 pedidos por hora e IP, 16 KB por petición, 1–30 productos,
solo JSON, IP guardada como hash SHA-256.

---

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| El build falla: `database not found` | El `database_id` sigue en ceros | Paso 2 y push |
| El build falla: `Worker name does not match` | El nombre del panel ≠ `wrangler.jsonc` | Los dos deben ser `oficial` |
| El build falla y no reconoce `wrangler.jsonc` | El archivo no se subió | Revisar que esté en GitHub |
| `/api/salud` → `"sin-configurar"` | Falta el binding D1 | Revisar `wrangler.jsonc`, redesplegar |
| `/api/salud` → `"error"` | Tablas no creadas | Paso 1.1 |
| Pedido responde 503 | Faltan secretos | Paso 5 |
| El checkout no muestra código | `file://`, sin red o error del Worker | Ver *Logs* del Worker en el panel |
| `401` en `/api/pedidos` | Token mal copiado | Copiar exacto, sin espacios |
| La web carga pero sin estilos/imágenes | Se copiaron mal las carpetas | Revisar `assets/`, `styles/`, `scripts/` en GitHub |
| Cambio en GitHub y no se publica | Se editó en la carpeta de OneDrive | Trabajar en `Documents\Griegos-Store` |
| «Precio no coincide» | Catálogo sin regenerar | `python _dev/generar-catalogo.py` + push |
| «Supera la existencia» | `stock` menor que la cantidad | Ajustar `data/products.js` y regenerar |
| GitHub Desktop dice que hay cambios en 160 archivos y tarda | Son 100 MB de imágenes | Esperar; solo la primera vez |
| La URL `oficial.griegosshop.workers.dev` no abre | Worker no desplegado o subdominio distinto | Ver la URL real en la página del Worker |

---

## Lista de verificación

- [ ] D1 `griegos-pedidos` creada
- [ ] Tablas `pedidos`, `secuencias`, `limites`
- [ ] `database_id` pegado en `wrangler.jsonc`
- [ ] Repositorio con el proyecto subido (GitHub Desktop)
- [ ] Worker `oficial` creado y build en **Success**
- [ ] `PEDIDOS_TOKEN` e `IP_SALT` como secretos
- [ ] `/api/salud` → `"conectada"`
- [ ] Pedido de prueba con código `PED-...`
- [ ] Pedido visible en D1 y en `/api/pedidos?token=...`
- [ ] `_dev/`, `migrations/`, `server.py`, `src/` dan 404
- [ ] Pedido de prueba borrado
- [ ] Token guardado en un lugar seguro
- [ ] OneDrive reactivado (ya no se usa para publicar)

---

## Glosario

| Palabra | Qué es |
|---|---|
| **Worker** | El programa de Cloudflare que atiende tu web y tu API. |
| **workers.dev** | Subdominio gratuito de Workers (`oficial.griegosshop.workers.dev`). |
| **D1** | Base de datos SQL de Cloudflare. |
| **Binding** | El cable entre el Worker y un recurso (`DB` → D1, `ASSETS` → archivos). |
| **Assets** | Los archivos estáticos (HTML, CSS, imágenes) que sube Cloudflare. |
| **Secret** | Variable cifrada, no legible desde el panel. |
| **Build** | La compilación automática al hacer push. |
| **Commit / Push** | Guardar cambios en local / subirlos a GitHub. |
| **GitHub Desktop** | Programa con botones para hacer commit y push sin comandos. |
