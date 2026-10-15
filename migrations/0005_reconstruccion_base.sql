-- Reconstrucción de CD Academia sobre la Plantilla App Diwilo (2026-10-15).
-- Se CONSERVAN los negocios (con su id, dirección, suscripción y archivo), sus usuarios y sus roles: pasan al modelo
-- de la plantilla (un correo = una cuenta, membresías por negocio). Lo demás de la versión anterior (app_state, un JSON
-- por negocio con datos de prueba, sesiones, intentos, pases) se borra. Las contraseñas de antes usaban otro formato:
-- cada persona crea una nueva con su link (Diwilo → Negocios → Link de registro). Los módulos van en las migraciones siguientes.
PRAGMA defer_foreign_keys = true;
DROP TABLE IF EXISTS app_state;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS sso_tickets;
DROP TABLE IF EXISTS business_slug_aliases;
ALTER TABLE users RENAME TO old_users;
ALTER TABLE businesses RENAME TO old_businesses;

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

-- ---- Datos que se conservan ----
INSERT INTO businesses (id, slug, name, status, paid_until, archived_at, created_at, updated_at)
  SELECT id, slug, name, 'active', paid_until, archived_at,
         COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', created_at), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM old_businesses;
-- Un correo = una cuenta (si estaba en varios negocios, queda una sola con todas sus membresías)
INSERT INTO users (id, email, name, created_at)
  SELECT MIN(id), lower(trim(email)), MAX(name), COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', MIN(created_at)), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    FROM old_users GROUP BY lower(trim(email));
INSERT OR IGNORE INTO memberships (user_id, business_id, role, created_at)
  SELECT u.id, o.business_id, CASE WHEN o.role IN ('owner', 'admin', 'staff') THEN o.role ELSE 'staff' END,
         COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', o.created_at), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    FROM old_users o JOIN users u ON u.email = lower(trim(o.email))
   WHERE o.active = 1 AND o.business_id IN (SELECT id FROM businesses);
DROP TABLE old_users;
DROP TABLE old_businesses;
