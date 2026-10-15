-- Reconstrucción de CD Academia sobre la Plantilla App Diwilo (2026-10-14).
-- La versión anterior guardaba todo en un JSON por negocio (app_state) y solo tenía datos de prueba: se borra todo
-- y se crea la base común de las apps de Diwilo. Los módulos de la academia van en las migraciones siguientes.
DROP TABLE IF EXISTS app_state;
DROP TABLE IF EXISTS business_slug_aliases;
DROP TABLE IF EXISTS sso_tickets;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS businesses;

-- Base común de las apps de Diwilo: negocios (tenants), usuarios, membresías y sesiones.
-- Un correo es una sola cuenta y puede pertenecer a varios negocios (memberships).

CREATE TABLE businesses (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,              -- dirección corta del negocio
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',    -- active | disabled
  paid_until  TEXT,                              -- 'YYYY-MM-DD' inclusive (hora Colombia). NULL = sin límite. Lo fija Diwilo.
  archived_at TEXT,                              -- archivado desde Diwilo: nadie entra; a los 20 días se borra por lotes
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,           -- siempre en minúsculas
  name           TEXT,
  password_hash  TEXT,                           -- PBKDF2-SHA256; NULL = invitado que aún no crea su contraseña
  password_salt  TEXT,
  invite_hash    TEXT,                           -- SHA-256 del token del link de invitación / restablecer
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX users_invite ON users (invite_hash);

CREATE TABLE memberships (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id  TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'staff',    -- owner (uno por negocio) | admin | staff
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, business_id)
);
CREATE INDEX memberships_business ON memberships (business_id);

-- La cookie lleva el token; aquí solo se guarda su SHA-256.
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id  TEXT REFERENCES businesses(id) ON DELETE CASCADE,  -- negocio activo (NULL = aún no elige)
  expires_at   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX sessions_user ON sessions (user_id);

-- 5 intentos fallidos del mismo correo bloquean 15 minutos (también para correos que no existen).
CREATE TABLE login_attempts (
  email         TEXT PRIMARY KEY,
  fails         INTEGER NOT NULL DEFAULT 0,
  locked_until  TEXT
);

-- Pases de un solo uso (2 minutos) para que Diwilo abra la app como el propietario. Solo se guarda el SHA-256.
CREATE TABLE sso_tickets (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  expires_at   TEXT NOT NULL
);
