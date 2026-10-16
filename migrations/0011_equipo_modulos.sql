-- Módulos que puede abrir cada persona del equipo. NULL = por defecto según el rol:
-- propietario y administrador ven todo; el personal ve todo menos matrículas, cuotas, finanzas y marketing.
ALTER TABLE memberships ADD COLUMN modulos TEXT;
