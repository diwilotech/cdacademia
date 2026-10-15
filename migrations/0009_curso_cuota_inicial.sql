-- Cuota inicial sugerida por curso: se propone al matricular (puede ser 0).
ALTER TABLE ac_cursos ADD COLUMN inicial INTEGER NOT NULL DEFAULT 0;
