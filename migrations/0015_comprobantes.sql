-- Comprobantes de pago que sube el estudiante (imagen o PDF en R2). El equipo los revisa: al aprobar se registra el pago con su recibo.
CREATE TABLE IF NOT EXISTS ac_comprobantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  inscripcion_id INTEGER NOT NULL,
  valor INTEGER NOT NULL, metodo TEXT, fecha TEXT NOT NULL, nota TEXT,
  r2_key TEXT NOT NULL, mime TEXT NOT NULL, nombre TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente',      -- pendiente | aprobado | rechazado
  pago_num INTEGER, motivo TEXT, revisado_por TEXT, user_id TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ac_comprobantes_business ON ac_comprobantes (business_id, estado);
CREATE INDEX IF NOT EXISTS ac_comprobantes_inscripcion ON ac_comprobantes (inscripcion_id);
