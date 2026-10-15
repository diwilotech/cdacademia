-- Exámenes: tipo de evaluación (examen en foto/PDF o selección múltiple con preguntas) y lo que respondió/subió cada estudiante.
ALTER TABLE ac_evaluaciones ADD COLUMN tipo TEXT NOT NULL DEFAULT 'examen';        -- examen | multiple
UPDATE ac_evaluaciones SET tipo = 'multiple' WHERE examen IS NOT NULL AND examen <> '';

CREATE TABLE IF NOT EXISTS ac_examenes (
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  inscripcion_id INTEGER NOT NULL, evaluacion_id INTEGER NOT NULL,
  resp TEXT,       -- JSON { <pregunta>: respuesta }  (unica: id de opción · multiple: [ids] · vf: true|false · corta/abierta: texto)
  manual TEXT,     -- JSON { <pregunta abierta>: puntos que puso el docente }
  archivos TEXT,   -- JSON [{ key, nombre, tipoArchivo, size }]  (foto o PDF del examen, en R2: <business_id>/examen/…)
  updated_by TEXT, updated_at INTEGER NOT NULL,
  PRIMARY KEY (inscripcion_id, evaluacion_id)
);
CREATE INDEX IF NOT EXISTS ac_examenes_business ON ac_examenes (business_id, evaluacion_id);
