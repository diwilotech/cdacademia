-- Clases grabadas para reponer: el video de una clase (curso + n.º de clase) vive en R2 (<negocio>/videos/<id>.<ext>) y se comparte con
-- el estudiante de una reposición mediante un enlace PERSONAL, con vencimiento, sesión única, marca de agua y sin descarga.
-- Al verlo completo (90 % del tiempo real) la reposición queda hecha.
CREATE TABLE IF NOT EXISTS ac_videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  curso_id INTEGER NOT NULL, clase_n INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  r2_key TEXT, mime TEXT, bytes INTEGER NOT NULL DEFAULT 0,
  duracion_s INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'subiendo',       -- subiendo | listo
  upload_id TEXT,                                -- subida por partes a R2
  subido_por TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ac_videos_business ON ac_videos (business_id, curso_id, clase_n);

CREATE TABLE IF NOT EXISTS ac_video_partes (
  video_id INTEGER NOT NULL, n INTEGER NOT NULL, etag TEXT NOT NULL, bytes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (video_id, n)
);

-- Un acceso = un enlace para una reposición. Solo se guarda la huella del enlace; la sesión activa es una sola a la vez.
CREATE TABLE IF NOT EXISTS ac_video_accesos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  video_id INTEGER NOT NULL, reposicion_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE, prefijo TEXT NOT NULL,
  expira INTEGER NOT NULL, revocado INTEGER NOT NULL DEFAULT 0,
  creado_por TEXT, created_at INTEGER NOT NULL,
  sesion TEXT, sesion_ip TEXT, sesion_inicio INTEGER, ultima_hb INTEGER,
  visto_s REAL NOT NULL DEFAULT 0, max_t REAL NOT NULL DEFAULT 0, vistas INTEGER NOT NULL DEFAULT 0,
  completado_at INTEGER
);
CREATE INDEX IF NOT EXISTS ac_video_accesos_repo ON ac_video_accesos (business_id, reposicion_id);
