-- =========================================================
-- GRIEGOS · ESQUEMA D1 (Cloudflare)
-- Ejecutar UNA vez en la base de datos.
-- Panel: Workers & Pages > D1 > griegos-pedidos > Console
-- CLI:   npx wrangler d1 execute griegos-pedidos --remote --file=migrations/0001_esquema.sql
-- =========================================================

CREATE TABLE IF NOT EXISTS pedidos (
  codigo         TEXT PRIMARY KEY,
  solicitud_id   TEXT UNIQUE,
  creado_en      TEXT NOT NULL,
  estado         TEXT NOT NULL DEFAULT 'nuevo',
  nombre         TEXT NOT NULL,
  telefono       TEXT NOT NULL,
  municipio      TEXT NOT NULL,
  entrega_modo   TEXT NOT NULL,
  sede_id        TEXT NOT NULL,
  sede           TEXT NOT NULL,
  zona           TEXT NOT NULL DEFAULT '',
  direccion      TEXT NOT NULL DEFAULT '',
  referencia     TEXT NOT NULL DEFAULT '',
  notas          TEXT NOT NULL DEFAULT '',
  pago_id        TEXT NOT NULL,
  pago_nombre    TEXT NOT NULL,
  items_json     TEXT NOT NULL,
  subtotal       REAL NOT NULL,
  moneda         TEXT NOT NULL DEFAULT 'USD',
  ip_hash        TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_pedidos_creado
  ON pedidos (creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_pedidos_estado
  ON pedidos (estado, creado_en DESC);

-- Secuencia diaria de códigos PED-YYYYMMDD-0001
CREATE TABLE IF NOT EXISTS secuencias (
  dia    TEXT PRIMARY KEY,
  ultimo INTEGER NOT NULL
);

-- Límite de pedidos por IP y hora
CREATE TABLE IF NOT EXISTS limites (
  clave  TEXT PRIMARY KEY,
  conteo INTEGER NOT NULL,
  expira INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_limites_expira
  ON limites (expira);
