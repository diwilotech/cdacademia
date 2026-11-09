-- Cupo máximo por curso (0 = sin tope): alimenta el tablero de cupos de Cursos
ALTER TABLE ac_cursos ADD COLUMN cupo INTEGER NOT NULL DEFAULT 0;
