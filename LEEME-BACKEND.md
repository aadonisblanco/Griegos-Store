# GRIEGOS · Backend para Cloudflare (Workers + D1)

Esta guía explica cómo está montado el backend, cómo publicarlo y cómo abrir y
consultar la base de datos.

> **¿Primera vez y prefieres el paso a paso con el ratón?** Lee
> [`SUBIR-A-CLOUDFLARE-PASO-A-PASO.md`](SUBIR-A-CLOUDFLARE-PASO-A-PASO.md):
> mismo procedimiento, explicado pantalla por pantalla, con GitHub Desktop,
> comprobaciones y problemas frecuentes.

## Respuesta corta: ¿hay que instalar algo?

**No, nada de Cloudflare.** El sitio se publica con **GitHub Desktop** (o Git) y
Cloudflare construye en la nube. La base **D1** se crea y se consulta desde el
**panel web**, en su consola SQL. Variables, secretos y dominio, también en el
panel.

Solo necesitarías **Node.js** si algún día quieres probar el Worker en tu PC con
`wrangler dev` o desplegar por línea de comandos.

Para probar el backend en local **ya tienes Python** y `server.py` sigue
funcionando sin instalar nada.

---

## 1. Qué se ha añadido

| Archivo / carpeta | Para qué sirve |
|---|---|
| `wrangler.jsonc` | Configuración del Worker: nombre, assets y binding D1 |
| `src/index.js` | Entrada del Worker: enruta `/api/*` y sirve el sitio |
| `functions/api/pedido.js` | `POST /api/pedido` · registra un pedido |
| `functions/api/pedidos.js` | `GET /api/pedidos?token=...` · lista administrativa |
| `functions/api/salud.js` | `GET /api/salud` · comprueba backend y base de datos |
| `functions/_lib/pedidos.js` | Validación, precios, límites, secuencias, consultas |
| `functions/_lib/catalogo.js` | Catálogo de precios/nombres/stock del servidor (generado) |
| `functions/_lib/bloqueados.js` | Rutas que nunca se sirven (código, datos, documentos) |
| `functions/_middleware.js` | Solo si algún día se publica como Pages |
| `migrations/0001_esquema.sql` | Crea las tablas `pedidos`, `secuencias`, `limites` |
| `.assetsignore` | Archivos que no se publican como parte del sitio |
| `_headers` | Cabeceras de seguridad (CSP, HSTS, etc.) |
| `_dev/generar-catalogo.py` | Regenera el catálogo del servidor desde `data/products.js` |
| `_dev/mejorar-seo.py` | Regenera canonical, Open Graph y Twitter Card |
| `_dev/verificar-referencias.py` | Comprueba enlaces internos y mayúsculas |
| `server.py` | Backend local de Python, alineado con el de Cloudflare |

El frontend no cambió de aspecto. El botón del checkout sigue preparando el
pedido para WhatsApp; además, si hay backend disponible, lo registra y muestra
un código `PED-AAAAMMDD-0001`.

---

## 2. Cómo funciona un pedido

1. La persona llena el checkout y pulsa **Preparar pedido por WhatsApp**.
2. Se abre WhatsApp con el texto del pedido (como antes).
3. En paralelo, el navegador envía `POST /api/pedido` con los productos.
4. El servidor **ignora nombres y precios del navegador**: los toma de
   `functions/_lib/catalogo.js` y recalcula el subtotal.
5. Guarda el pedido en D1 y devuelve un código.
6. El checkout muestra: «Solicitud registrada con el código …».

Si el sitio se abre con doble clic (`file://`), sin internet o sin backend, el
paso 3 se salta sin errores y **WhatsApp sigue funcionando exactamente igual**.

### Qué valida el servidor

- Nombre con al menos nombre y apellido.
- Teléfono de 8 a 15 dígitos.
- Municipio dentro de los 15 de La Habana.
- Entrega `delivery` o `pickup`; sede `oeste` o `este`.
- Dirección obligatoria solo si es entrega a domicilio.
- Zona de mensajería **coherente con la sede**.
- Método de pago dentro de los 5 de `scripts/config.js`.
- Entre 1 y 30 productos distintos.
- Cada producto existe, está disponible y la cantidad no supera el stock.
- Cuerpo máximo de 16 KB y solo `application/json`.
- Campo trampa `website` para bots.
- Máximo 30 pedidos por hora e IP (IP guardada solo como hash SHA-256).
- Idempotencia: el mismo `requestId` no duplica el pedido.

---

## 3. Publicar en Cloudflare (Workers + GitHub Desktop)

El paso a paso detallado, con comprobaciones y problemas frecuentes, está en
`SUBIR-A-CLOUDFLARE-PASO-A-PASO.md`. Aquí va el resumen técnico.

### Paso 1 · Subir el proyecto con GitHub Desktop

1. Instala <https://desktop.github.com> y entra con la cuenta del repositorio.
2. **File → Clone repository → URL**:
   `https://github.com/aadonisblanco/Griegos-Store`
   Destino: `C:\Users\tuane\Documents\Griegos-Store` (fuera de OneDrive).
3. Copia dentro todo el contenido de esta carpeta del proyecto.
4. En GitHub Desktop: **Summary** → **Commit to main** → **Push origin**.

> `_local/`, `.env`, `.dev.vars` y `.wrangler/` están en `.gitignore`: no se
> suben. `functions/`, `src/`, `_dev/`, `migrations/` y los `.md` se suben al
> repositorio pero **no se publican** como parte del sitio (`.assetsignore`).

### Paso 2 · Crear la base de datos D1

En el panel de Cloudflare:

1. **Storage & Databases** → **D1 SQL Database** → **Create database**.
2. Nombre: `griegos-pedidos`.
3. Ubicación: la más cercana a tu público (por ejemplo, *Eastern Europe*).
4. **Create**.

Copia el **Database ID**: lo pegarás en `wrangler.jsonc`.

### Paso 3 · Crear las tablas

1. Entra en la base `griegos-pedidos`.
2. Pestaña **Console**.
3. Abre `migrations/0001_esquema.sql` y ejecuta **una sentencia por vez** (pegar
   + **Execute**): `pedidos`, sus dos índices, `secuencias`, `limites` y su índice.

> La consola del panel no ejecuta bien el archivo entero de una vez: si pegas
> todo junto verás `no such table: main.pedidos` o `main.limites`.

Comprobación:

```sql
SELECT type, name FROM sqlite_schema WHERE type IN ('table','index') ORDER BY type, name;
```

Deben aparecer las tres tablas:

- `pedidos` — un registro por pedido.
- `secuencias` — contador diario para los códigos.
- `limites` — control de 30 pedidos por hora e IP.

Se puede ejecutar dos veces: usa `CREATE TABLE IF NOT EXISTS`.

### Paso 4 · Pegar el Database ID en `wrangler.jsonc`

1. Abre `wrangler.jsonc` con el Bloc de notas.
2. Sustituye:

```jsonc
"database_id": "00000000-0000-0000-0000-000000000000"
```

por tu ID real (conserva las comillas).
3. Guarda, y en GitHub Desktop: commit + push.

Sin este paso el despliegue falla con `database not found`.

### Paso 5 · Crear el Worker conectado al repositorio

1. **Workers & Pages** → **Create application** → **GitHub**.
2. Autoriza y elige el repositorio `Griegos-Store`.
3. Configuración:

| Campo | Valor |
|---|---|
| **Worker name** | `oficial` (de aquí sale `oficial.griegosshop.workers.dev`) |
| **Git branch** | `main` |
| **Root directory** | *(vacío)* |
| **Build command** | *(vacío o `exit 0`)* |
| **Deploy command** | `npx wrangler deploy` (por defecto) |

4. **Save and Deploy**.

> El **Worker name** del panel debe coincidir **exactamente** con el `name` de
> `wrangler.jsonc`, o el build falla.
>
> El binding D1 (`DB`) y los archivos estáticos salen de `wrangler.jsonc`: **no**
> hay que añadirlos a mano en el panel.

### Paso 6 · Crear el token de administración y la sal de IP

En el Worker → **Settings** → **Variables and Secrets** → **Add**:

| Variable | Tipo | Valor |
|---|---|---|
| `PEDIDOS_TOKEN` | **Secret** (Encrypt) | frase larga y aleatoria |
| `IP_SALT` | **Secret** (Encrypt) | otra frase larga y aleatoria |

Puedes generar valores con PowerShell:

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
```

`PEDIDOS_TOKEN` es la contraseña para leer pedidos. **No la compartas** y no la
pongas en el código. `IP_SALT` solo sirve para que los hashes de IP no se puedan
comparar con listas externas.

> En Workers los secretos se aplican al instante: no hace falta redesplegar.

### Paso 7 · Comprobar que funciona

Abre en el navegador:

```
https://oficial.griegosshop.workers.dev/api/salud
```

Debe responder algo como:

```json
{"ok":true,"servicio":"griegos-backend","hora":"...","baseDatos":"conectada"}
```

- `baseDatos: "conectada"` → todo listo.
- `"sin-configurar"` → falta el binding `DB` en `wrangler.jsonc`.
- `"error"` → las tablas no existen: repite el paso 3.

Luego haz un pedido de prueba desde `/store/` y comprueba que aparece el código.

---

## 4. Abrir y consultar la base de datos

**No hace falta instalar ningún programa.** Todo se hace en el panel:

**Storage & Databases → D1 SQL Database → griegos-pedidos → Console**
(en paneles antiguos: **Workers & Pages → D1**)

Consultas útiles (pégalas y pulsa **Execute**):

```sql
-- Últimos 50 pedidos
SELECT codigo, creado_en, estado, nombre, telefono, municipio, subtotal
FROM pedidos
ORDER BY creado_en DESC
LIMIT 50;

-- Un pedido completo
SELECT * FROM pedidos WHERE codigo = 'PED-20261115-0001';

-- Totales por estado
SELECT estado, COUNT(*) AS total, SUM(subtotal) AS usd
FROM pedidos
GROUP BY estado;

-- Cambiar el estado de un pedido
UPDATE pedidos SET estado = 'confirmado'
WHERE codigo = 'PED-20261115-0001';

-- Borrar un pedido concreto
DELETE FROM pedidos WHERE codigo = 'PED-20261115-0001';
```

La pestaña **Tables** del panel también permite ver y editar filas sin escribir
SQL.

### Consultarlo como JSON (sin SQL)

Con el token configurado:

```
https://oficial.griegosshop.workers.dev/api/pedidos?token=TU_TOKEN
```

Filtros y opciones:

```
?token=...&estado=nuevo
```

También acepta la cabecera `Authorization: Bearer TU_TOKEN`, que es más segura
porque no deja el token en el historial ni en los registros.

La respuesta incluye un resumen (`total`, `porEstado`, `subtotalUSD`) y la lista
de pedidos con sus datos y productos.

> El token va en la URL solo como comodidad. Para uso diario, usa la cabecera.

---

## 5. Cambiar productos, precios o stock

La única fuente de verdad es `data/products.js` (la usa el frontend). El
servidor tiene su copia generada en `functions/_lib/catalogo.js`.

Cada vez que cambies productos o precios:

```powershell
python _dev/generar-catalogo.py
```

Luego, en GitHub Desktop: commit + **Push origin** (incluirá
`data/products.js` y `functions/_lib/catalogo.js`).

Cloudflare vuelve a desplegar solo. Si no regeneras el catálogo, el frontend
mostrará el precio nuevo pero el servidor rechazará el pedido por precio o
disponibilidad distintos. **Es el único paso fácil de olvidar.**

Reglas:

- `price` debe ser un número (no `0` como marcador, no `null` si se vende).
- `stock` debe ser un entero.
- `available: false` oculta la venta y el servidor la rechaza.
- No cambies los `id` de productos ya vendidos: los pedidos guardados los usan.

---

## 6. Probar en tu PC (sin Cloudflare)

Ya funciona con Python, sin instalar nada:

```powershell
python server.py
```

Abre `http://127.0.0.1:8787/store/`. Guarda los pedidos en
`_local/pedidos.jsonl` y usa la misma validación, el mismo catálogo y los mismos
códigos que Cloudflare.

Diferencias con Cloudflare: el límite por IP y el token se manejan en memoria y
el almacenamiento es un archivo, no D1. Para probar el comportamiento exacto de
D1 hace falta Wrangler (opcional, requiere Node.js).

---

## 7. Opcional: Wrangler (solo si instalas Node.js)

`wrangler.jsonc` ya es la configuración real del proyecto: no hay que renombrar
ni copiar nada.

```powershell
npx wrangler login
npx wrangler d1 execute griegos-pedidos --remote --file=migrations/0001_esquema.sql
npx wrangler deploy
```

Para probar en local con D1 simulado:

```powershell
npx wrangler dev
```

> El panel de Cloudflare y `wrangler deploy` usan el **mismo** `wrangler.jsonc`,
> así que no hay dos configuraciones que mantener en sincronía.

---

## 8. Seguridad y límites

- Los precios y nombres **nunca** se aceptan del navegador.
- El subtotal se recalcula en el servidor.
- No se guardan tarjetas, contraseñas ni documentos.
- La IP se guarda como hash SHA-256 con `IP_SALT`.
- Máximo 30 pedidos por hora e IP; máximo 16 KB por petición.
- El listado administrativo exige token y compara en tiempo constante.
- Los archivos de desarrollo (`server.py`, `_dev/`, `migrations/`, `src/`,
  `functions/`, los `.md`) **no se suben al sitio**: los excluye `.assetsignore`,
  y `functions/_lib/bloqueados.js` los bloquea como segunda barrera.
- `robots.txt` excluye `/api/`, `/_dev/` y `/migrations/`.
- Cabeceras CSP, HSTS, `X-Frame-Options: DENY` y `nosniff` en `_headers`; las de
  `/api/*` (`no-store`, `noindex`) las pone el Worker en el código.

### Plan gratuito

Para este volumen, Workers y D1 gratuitos son más que suficientes:

- **Workers**: 100 000 peticiones al día. Los archivos estáticos se sirven sin
  ejecutar el Worker, así que solo cuentan las llamadas a `/api/*`.
- **D1**: 5 GB de almacenamiento y millones de lecturas al día.

Si algún día superas el límite de pedidos por hora de forma legítima, cambia
`MAX_POR_HORA` en `functions/_lib/pedidos.js`.

---

## 9. Cambiar el dominio canónico

Ahora mismo canonical, Open Graph, `robots.txt` y `sitemap.xml` apuntan a
`https://oficial.griegosshop.workers.dev`. Si usas dominio propio:

1. Edita `DOMINIO` en `_dev/mejorar-seo.py` y ejecuta:

   ```powershell
   python _dev/mejorar-seo.py
   ```

2. Actualiza la línea `Sitemap:` de `robots.txt` y las URLs de `sitemap.xml`.
3. Revisa que `_headers` no necesite cambios (no contiene el dominio).
4. Commit + push en GitHub Desktop.

El dominio propio se añade en **Worker → Settings → Domains & Routes →
Custom domain**. Después de añadirlo, actualiza también las URLs canónicas.

---

## 10. Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| El build falla con `database not found` | `database_id` en ceros | Pegar el ID real en `wrangler.jsonc` y push |
| El build falla con `Worker name` distinto | Panel y `wrangler.jsonc` no coinciden | Los dos deben ser `oficial` |
| `/api/salud` dice `sin-configurar` | Falta el binding `DB` | Revisar `wrangler.jsonc` y volver a desplegar |
| `/api/salud` dice `error` | Tablas no creadas | Ejecutar `migrations/0001_esquema.sql` en la consola D1 |
| Al pegar el esquema: `no such table: main.limites` | El `CREATE TABLE limites` no se ejecutó (pegado cortado) | Ejecutar el SQL por tandas y verificar con `sqlite_schema` |
| `POST /api/pedido` responde 503 | Falta el binding `DB` | Revisar `wrangler.jsonc` y volver a desplegar |
| `GET /api/pedidos` responde 401 | Token incorrecto | Copiar el valor exacto de `PEDIDOS_TOKEN` |
| `GET /api/pedidos` responde 503 «Falta configurar PEDIDOS_TOKEN» | Secreto no creado | Settings → Variables and Secrets |
| El pedido se registra pero el precio no coincide | Catálogo sin regenerar | `python _dev/generar-catalogo.py` y volver a subir |
| «La cantidad solicitada supera la existencia» | `stock` menor que la cantidad | Ajustar `stock` en `data/products.js` |
| El checkout no muestra código | `file://`, sin red o backend caído | Es el comportamiento previsto; WhatsApp sigue funcionando |
| Cambio una variable y no se aplica | Se editó la copia de OneDrive | Trabajar en la carpeta clonada con GitHub Desktop |
| `/server.py` o `/_dev/...` dan 404 | Bloqueo de seguridad | Correcto, es intencionado |

---

## 11. Verificación hecha antes de entregar

- 79 pruebas automáticas del backend sobre SQLite real: validación, precios,
  idempotencia, secuencias, límite por IP, listado y endpoints. **0 fallos**.
- Worker probado en local con Wrangler 4.162 (`wrangler dev`):
  - `POST /api/pedido` → **201** con código `PED-20261115-0001`.
  - El mismo `requestId` repetido → **200** con `duplicado: true`.
  - `/api/salud` → `"baseDatos":"conectada"`.
  - `GET /api/pedido` → **405**.
  - `/`, `/store/`, `/academy/calculadoras/` → **200** con CSP y HSTS.
  - `/server.py`, `/_dev/*`, `/migrations/*`, `/src/*`, `/wrangler.jsonc`,
    `/.gitignore` → **404**.
  - `.assetsignore` comprobado: un archivo añadido a la lista deja de servirse.
  - Cabeceras de `/api/*`: `Cache-Control: no-store` y `X-Robots-Tag: noindex`.
- `wrangler deploy --dry-run`: empaqueta sin errores y reconoce los bindings
  `env.DB` y `env.ASSETS`.
- Checkout probado en navegador contra el backend: pedido creado con código
  `PED-…`, precio y subtotal tomados del servidor, mensaje de éxito visible.
- 19 páginas HTML: 389 referencias internas, **0 problemas** de existencia o
  mayúsculas.
- 23 archivos JavaScript: sintaxis válida.
- Catálogo regenerado: 64 productos, todos con precio y stock.
- 0 referencias a `griegos.pages.dev`: todo apunta ya a
  `https://oficial.griegosshop.workers.dev`.
