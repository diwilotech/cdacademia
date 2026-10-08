-- Integración con Diwilo Web: contraseña (mín. 8) en vez de PIN, links de invitación (solo su SHA-256),
-- membresía por negocio (el mismo correo puede estar en varios) y suscripción (paid_until).
-- users y sessions estaban vacías (solo existía el puente /api/setup), por eso se recrean.
DROP TABLE sessions;
DROP TABLE users;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',          -- owner | admin | staff
  password_hash TEXT,                          -- NULL = aún no crea su contraseña
  password_salt TEXT,
  invite_hash TEXT,                            -- SHA-256 del token de invitación
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (business_id, email)
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_invite ON users(invite_hash);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                         -- SHA-256 del token de la cookie
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- 'YYYY-MM-DD' inclusive; NULL = sin límite. La fija Diwilo Web.
ALTER TABLE businesses ADD COLUMN paid_until TEXT;
