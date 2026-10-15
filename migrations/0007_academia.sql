-- Módulos propios de CD Academia. Todas las tablas llevan business_id. Montos en pesos (enteros).
-- Fechas 'YYYY-MM-DD' y horas 'HH:MM' en hora de Colombia. created_at/updated_at en milisegundos.

-- Datos de la academia: rubro y términos, escala de notas, mínimos, valores de reposición, datos del recibo (JSON).
CREATE TABLE IF NOT EXISTS ac_config (
  business_id TEXT PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_by TEXT, updated_at INTEGER NOT NULL
);

-- Áreas (maquillaje, cejas y pestañas, barbería…): cada curso, profesional y espacio de reposición pertenece a una.
CREATE TABLE IF NOT EXISTS ac_areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL, color TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ac_areas_business ON ac_areas (business_id);

-- Profesionales (docentes): áreas que dictan con sus niveles y si reponen; horario semanal de disponibilidad.
CREATE TABLE IF NOT EXISTS ac_profesionales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL, telefono TEXT, email TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  areas TEXT,                 -- JSON [{ area_id, niveles: [...], reponer: bool }]
  horario TEXT,               -- JSON [{ dia: 0-6, ini: 'HH:MM', fin: 'HH:MM' }]
  notas TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ac_profesionales_business ON ac_profesionales (business_id, activo);

-- Material de estudio (biblioteca): bloques de texto, enlaces, videos y archivos (R2: <business_id>/material/…).
CREATE TABLE IF NOT EXISTS ac_material (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL, area_id INTEGER, nivel TEXT, descripcion TEXT,
  bloques TEXT,               -- JSON [{ tipo: texto|enlace|video|archivo, titulo?, texto?, url?, key?, nombre?, tipoArchivo? }]
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ac_material_business ON ac_material (business_id, area_id);

-- Cursos: datos, horario semanal y plan. Las clases (con su fecha) se generan del horario, saltando festivos.
CREATE TABLE IF NOT EXISTS ac_cursos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL, area_id INTEGER, nivel TEXT,
  precio INTEGER NOT NULL DEFAULT 0, descripcion TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  profesional_id INTEGER, jornada TEXT,
  inicio TEXT, num_clases INTEGER NOT NULL DEFAULT 0,
  festivos INTEGER NOT NULL DEFAULT 1,       -- 1 = no hay clase los festivos de Colombia
  horario TEXT,               -- JSON [{ dia, ini, fin }]
  plan TEXT,                  -- JSON [{ titulo, horas, temas: [...] }]
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ac_cursos_business ON ac_cursos (business_id, activo);

CREATE TABLE IF NOT EXISTS ac_clases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  curso_id INTEGER NOT NULL,
  n INTEGER NOT NULL,
  fecha TEXT, ini TEXT, fin TEXT,
  movida INTEGER NOT NULL DEFAULT 0,         -- 1 = fecha u hora cambiada a mano (se respeta al recalcular)
  tema TEXT, detalle TEXT, metodos TEXT, materiales TEXT,
  virtual INTEGER NOT NULL DEFAULT 0, material_id INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE (curso_id, n)
);
CREATE INDEX IF NOT EXISTS ac_clases_business ON ac_clases (business_id, fecha);

CREATE TABLE IF NOT EXISTS ac_evaluaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  curso_id INTEGER NOT NULL,
  nombre TEXT NOT NULL, peso INTEGER NOT NULL DEFAULT 0, clase_n INTEGER,
  examen TEXT,                -- JSON { instrucciones, preguntas: [...] } (opcional)
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ac_evaluaciones_curso ON ac_evaluaciones (business_id, curso_id);

CREATE TABLE IF NOT EXISTS ac_cupones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  curso_id INTEGER NOT NULL,
  codigo TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'valor',   -- valor | pct
  valor INTEGER NOT NULL DEFAULT 0, hasta TEXT, max INTEGER NOT NULL DEFAULT 0, usos INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE (business_id, curso_id, codigo)
);

-- Estudiantes y matrículas
CREATE TABLE IF NOT EXISTS ac_estudiantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL, documento TEXT, telefono TEXT, email TEXT,
  origen TEXT, notas TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ac_estudiantes_business ON ac_estudiantes (business_id, nombre);

CREATE TABLE IF NOT EXISTS ac_inscripciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  estudiante_id INTEGER NOT NULL, curso_id INTEGER NOT NULL,
  fecha TEXT NOT NULL,
  valor INTEGER NOT NULL DEFAULT 0, descuento INTEGER NOT NULL DEFAULT 0, cupon TEXT,
  estado TEXT NOT NULL DEFAULT 'activa',      -- activa | terminada | retirada
  plan TEXT,                  -- JSON { inicial, n, frecuencia: mensual|quincenal|semanal, primera }
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE (business_id, estudiante_id, curso_id)
);
CREATE INDEX IF NOT EXISTS ac_inscripciones_business ON ac_inscripciones (business_id, curso_id);

CREATE TABLE IF NOT EXISTS ac_cuotas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  inscripcion_id INTEGER NOT NULL,
  n INTEGER NOT NULL,                          -- 0 = inicial
  etiqueta TEXT, vence TEXT NOT NULL, valor INTEGER NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ac_cuotas_business ON ac_cuotas (business_id, vence);
CREATE INDEX IF NOT EXISTS ac_cuotas_inscripcion ON ac_cuotas (inscripcion_id);

-- Pagos (recibos con consecutivo). Lo pagado se reparte solo, en orden, entre las cuotas de la matrícula.
CREATE TABLE IF NOT EXISTS ac_pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  num INTEGER NOT NULL,
  inscripcion_id INTEGER NOT NULL,
  valor INTEGER NOT NULL, metodo TEXT, concepto TEXT, fecha TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'cuota',          -- cuota | reposicion
  anulado INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE (business_id, num)
);
CREATE INDEX IF NOT EXISTS ac_pagos_inscripcion ON ac_pagos (business_id, inscripcion_id);

-- Asistencia (P presente · A ausente · T tarde · J excusa) y notas por evaluación
CREATE TABLE IF NOT EXISTS ac_asistencia (
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  inscripcion_id INTEGER NOT NULL, clase_n INTEGER NOT NULL,
  estado TEXT NOT NULL,
  updated_by TEXT, updated_at INTEGER NOT NULL,
  PRIMARY KEY (inscripcion_id, clase_n)
);
CREATE INDEX IF NOT EXISTS ac_asistencia_business ON ac_asistencia (business_id);

CREATE TABLE IF NOT EXISTS ac_notas (
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  inscripcion_id INTEGER NOT NULL, evaluacion_id INTEGER NOT NULL,
  nota REAL,
  updated_by TEXT, updated_at INTEGER NOT NULL,
  PRIMARY KEY (inscripcion_id, evaluacion_id)
);
CREATE INDEX IF NOT EXISTS ac_notas_business ON ac_notas (business_id);

-- Reposiciones: espacios de disponibilidad y la reposición de cada falla
CREATE TABLE IF NOT EXISTS ac_espacios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL, ini TEXT NOT NULL, fin TEXT NOT NULL,
  profesional_id INTEGER, area_id INTEGER, curso_id INTEGER, clase_n INTEGER,
  cupos INTEGER NOT NULL DEFAULT 4, notas TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ac_espacios_business ON ac_espacios (business_id, fecha);

CREATE TABLE IF NOT EXISTS ac_reposiciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  inscripcion_id INTEGER NOT NULL, clase_n INTEGER NOT NULL,
  espacio_id INTEGER,
  modo TEXT NOT NULL DEFAULT 'presencial',     -- presencial | virtual
  estado TEXT NOT NULL DEFAULT 'pendiente',    -- pendiente | agendada | hecha
  exonerada INTEGER NOT NULL DEFAULT 0,
  pago_id INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE (inscripcion_id, clase_n)
);
CREATE INDEX IF NOT EXISTS ac_reposiciones_business ON ac_reposiciones (business_id, estado);
