-- Interfaz común, módulos por negocio, bitácora, seguridad del login, consentimiento (Ley 1581) y tokens MCP.
-- Igual en todas las apps de Diwilo. Solo agrega: no borra ni cambia columnas existentes.

-- Apariencia del negocio: tema de la paleta cerrada y modo claro/oscuro. El logo va en R2 (<business_id>/marca/logo.*).
CREATE TABLE IF NOT EXISTS business_settings (
  business_id  TEXT PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  tema         TEXT NOT NULL DEFAULT 'violeta',   -- azul | indigo | violeta | rosa | rojo | naranja | verde | turquesa | grafito
  modo         TEXT NOT NULL DEFAULT 'light',     -- light | dark
  logo_key     TEXT,                              -- llave en R2 o NULL
  updated_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Copia local de los módulos efectivos que asigna Diwilo (plan + excepciones). La fuente de verdad es Diwilo.
-- Si un negocio no tiene filas, tiene activos todos los módulos de la app (comportamiento de antes).
CREATE TABLE IF NOT EXISTS business_modules (
  business_id  TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  modulo       TEXT NOT NULL,
  activo       INTEGER NOT NULL DEFAULT 1,
  desde        TEXT,                              -- 'YYYY-MM-DD' hora Colombia, inclusive
  hasta        TEXT,                              -- 'YYYY-MM-DD' hora Colombia, inclusive
  synced_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (business_id, modulo)
);

-- Bitácora: quién hizo qué. Las herramientas de IA que escriben también quedan aquí.
CREATE TABLE IF NOT EXISTS audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id  TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id      TEXT,
  origen       TEXT NOT NULL DEFAULT 'app',       -- app | mcp | diwilo
  modulo       TEXT,
  accion       TEXT NOT NULL,
  detalle      TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS audit_log_business ON audit_log (business_id, created_at);

-- Bloqueo de intentos por correo y por IP, con espera creciente (5 min, 15 min, 1 h, 24 h).
CREATE TABLE IF NOT EXISTS auth_throttle (
  key           TEXT PRIMARY KEY,                 -- 'mail:<correo>' | 'ip:<ip>'
  fails         INTEGER NOT NULL DEFAULT 0,
  strikes       INTEGER NOT NULL DEFAULT 0,       -- cuántas veces se ha bloqueado
  locked_until  TEXT,
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Autorización de tratamiento de datos (Ley 1581) y mayoría de edad, al aceptar la invitación.
ALTER TABLE users ADD COLUMN consent_at TEXT;
ALTER TABLE users ADD COLUMN consent_version TEXT;
ALTER TABLE users ADD COLUMN adult_confirmed_at TEXT;

-- Conexiones MCP: el usuario genera un token en Configuración → IA → Conexiones. Se guarda solo el SHA-256.
CREATE TABLE IF NOT EXISTS mcp_tokens (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at  TEXT,
  revoked_at    TEXT
);
CREATE INDEX IF NOT EXISTS mcp_tokens_business ON mcp_tokens (business_id);
