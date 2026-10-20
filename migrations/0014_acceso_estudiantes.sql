-- Acceso del estudiante a la app: su ficha se enlaza con un usuario (membresía con rol 'estudiante').
ALTER TABLE ac_estudiantes ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS ac_estudiantes_user ON ac_estudiantes (business_id, user_id);
