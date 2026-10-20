-- Datos de la persona del equipo: tipo de documento (cédula, NIT…) y celular. Con `documento` salen en Equipo y en Finanzas (nómina y documentos de pago).
ALTER TABLE ac_nomina ADD COLUMN tipo_documento TEXT;
ALTER TABLE ac_nomina ADD COLUMN celular TEXT;
