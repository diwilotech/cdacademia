-- Nómina del equipo: cuánto se le paga a cada persona (usuario o profesional). persona = 'u:<id de usuario>' | 'p:<id de profesional>'.
CREATE TABLE IF NOT EXISTS ac_nomina (
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  persona TEXT NOT NULL,
  valor INTEGER NOT NULL DEFAULT 0,
  periodicidad TEXT NOT NULL DEFAULT 'mensual',      -- mensual | quincenal | semanal | clase | hora
  centro_costo TEXT, notas TEXT,
  updated_by TEXT, updated_at INTEGER NOT NULL,
  PRIMARY KEY (business_id, persona)
);
