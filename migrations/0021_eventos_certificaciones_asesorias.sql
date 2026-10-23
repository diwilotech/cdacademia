-- Eventos, Certificaciones (exámenes oficiales externos) y Asesorías (procesos con pasos), más los cobros que comparten.

-- ───── Cobros compartidos (evento · certificacion · asesoria) ─────
-- El cobro sale por Finanzas (recibo de caja con ref academia:cobro:<id>). «ya_pagado» = se pagó por fuera: queda con nota/comprobante y no genera recibo.
CREATE TABLE IF NOT EXISTS ac_cobros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  origen TEXT NOT NULL,                 -- evento | certificacion | asesoria
  origen_id INTEGER NOT NULL,           -- asistente / candidato / asesoría
  valor INTEGER NOT NULL, metodo TEXT, fecha TEXT NOT NULL, nota TEXT,
  ya_pagado INTEGER NOT NULL DEFAULT 0,
  recibo TEXT,                          -- número del recibo en Finanzas (si se envió)
  r2_key TEXT, mime TEXT, nombre TEXT,  -- comprobante (foto/PDF) opcional
  anulado INTEGER NOT NULL DEFAULT 0,
  created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ac_cobros_origen ON ac_cobros (business_id, origen, origen_id);

-- ───── Eventos ─────
CREATE TABLE IF NOT EXISTS ac_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'General',
  fecha TEXT NOT NULL, hora_ini TEXT, hora_fin TEXT,
  lugar TEXT, enlace TEXT, descripcion TEXT,
  cupo INTEGER NOT NULL DEFAULT 0,      -- 0 = sin límite
  precio INTEGER NOT NULL DEFAULT 0,    -- 0 = gratis
  publico INTEGER NOT NULL DEFAULT 1,   -- aparece en /<negocio>/eventos
  curso_id INTEGER,                     -- si es de un curso en particular
  estado TEXT NOT NULL DEFAULT 'abierto',   -- abierto | cancelado
  serie TEXT,                           -- eventos creados juntos al repetir cada semana
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ac_eventos_business ON ac_eventos (business_id, fecha);

CREATE TABLE IF NOT EXISTS ac_evento_asistentes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  evento_id INTEGER NOT NULL, estudiante_id INTEGER,
  nombre TEXT NOT NULL, telefono TEXT, email TEXT,
  estado TEXT NOT NULL DEFAULT 'inscrito',  -- inscrito | espera | asistio | no_asistio
  origen TEXT, nota TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ac_evento_asistentes_evento ON ac_evento_asistentes (business_id, evento_id);

-- ───── Certificaciones ─────
-- Tipo de examen oficial (entidad + nivel) con sus reglas configurables y el curso que prepara para él.
CREATE TABLE IF NOT EXISTS ac_cert_examenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  entidad TEXT NOT NULL, nombre TEXT NOT NULL, nivel TEXT,
  curso_id INTEGER,                     -- curso que prepara para este examen
  precio INTEGER NOT NULL DEFAULT 0,
  partes TEXT,                          -- JSON [{ n, max, g }]  g = grupo para el mínimo (p. ej. escrita | oral)
  minimos TEXT,                         -- JSON { grupo: puntos mínimos }
  reglas TEXT,                          -- texto libre: reglas de la entidad
  activo INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ac_cert_examenes_business ON ac_cert_examenes (business_id, activo);

CREATE TABLE IF NOT EXISTS ac_cert_convocatorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  examen_id INTEGER NOT NULL, fecha TEXT NOT NULL, cierre TEXT,
  cupo INTEGER NOT NULL DEFAULT 0, precio INTEGER,   -- precio null = el del examen
  modalidad TEXT NOT NULL DEFAULT 'Papel',           -- Papel | Digital | Ambas
  lugar TEXT, nota TEXT,
  estado TEXT NOT NULL DEFAULT 'abierta',            -- abierta | cerrada | realizada | cancelada
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ac_cert_convocatorias_business ON ac_cert_convocatorias (business_id, fecha);

CREATE TABLE IF NOT EXISTS ac_cert_candidatos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  convocatoria_id INTEGER NOT NULL, estudiante_id INTEGER,
  nombre TEXT NOT NULL, documento TEXT, telefono TEXT, email TEXT,
  modalidad TEXT NOT NULL DEFAULT 'Papel',
  doc_foto INTEGER NOT NULL DEFAULT 0,   -- documento con foto recibido
  acepta INTEGER NOT NULL DEFAULT 0,     -- aceptó condiciones y política de datos
  hoja_key TEXT, hoja_mime TEXT, hoja_nombre TEXT,   -- hoja escaneada (R2, privada)
  eval1 TEXT, eval2 TEXT, tercero TEXT,  -- JSON { parte: puntos } de cada evaluador
  puntos TEXT,                           -- JSON { parte: puntos } finales
  resultado TEXT NOT NULL DEFAULT 'pendiente',   -- pendiente | aprobado | no_aprobado
  detalle TEXT,                          -- resumen del cálculo
  certificado_fecha TEXT, notas TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ac_cert_candidatos_conv ON ac_cert_candidatos (business_id, convocatoria_id);

-- ───── Asesorías ─────
CREATE TABLE IF NOT EXISTS ac_asesoria_tipos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL, descripcion TEXT,
  pasos TEXT,                            -- JSON [{ nombre, docs: [texto] }]
  precio INTEGER NOT NULL DEFAULT 0, activo INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ac_asesoria_tipos_business ON ac_asesoria_tipos (business_id, activo);

CREATE TABLE IF NOT EXISTS ac_asesorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  tipo_id INTEGER NOT NULL, estudiante_id INTEGER, asesor_id INTEGER,
  nombre TEXT NOT NULL, telefono TEXT, email TEXT,
  paso INTEGER NOT NULL DEFAULT 0,       -- posición del paso actual en la plantilla (0 = primero)
  pasos TEXT,                            -- copia de los pasos al crear (cambiar la plantilla no mueve procesos en curso)
  estado TEXT NOT NULL DEFAULT 'activo', -- activo | pausado | terminado | cancelado
  precio INTEGER NOT NULL DEFAULT 0,
  prox_fecha TEXT, prox_texto TEXT, notas TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ac_asesorias_business ON ac_asesorias (business_id, estado);

CREATE TABLE IF NOT EXISTS ac_asesoria_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  asesoria_id INTEGER NOT NULL, paso INTEGER NOT NULL,
  nombre TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'pendiente',   -- pendiente | recibido | aprobado
  r2_key TEXT, mime TEXT, archivo TEXT, nota TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ac_asesoria_docs_asesoria ON ac_asesoria_docs (business_id, asesoria_id);

CREATE TABLE IF NOT EXISTS ac_asesoria_avances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  asesoria_id INTEGER NOT NULL, paso INTEGER, texto TEXT NOT NULL, usuario TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ac_asesoria_avances_asesoria ON ac_asesoria_avances (business_id, asesoria_id);
