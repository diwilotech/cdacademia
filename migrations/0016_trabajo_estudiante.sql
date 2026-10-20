-- Trabajo del estudiante: archivos que sube en la clase (entregas) y examen enviado (ya no se puede cambiar).
CREATE TABLE IF NOT EXISTS ac_entregas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  inscripcion_id INTEGER NOT NULL, clase_n INTEGER NOT NULL,
  r2_key TEXT NOT NULL, nombre TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0,
  comentario TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ac_entregas_inscripcion ON ac_entregas (business_id, inscripcion_id, clase_n);
ALTER TABLE ac_examenes ADD COLUMN enviado_at INTEGER;
