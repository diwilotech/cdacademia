-- Sincronización de módulos con Diwilo: huella del último envío por negocio.
-- Con fila aquí, el negocio lo gestiona Diwilo y business_modules es la lista exacta (vacía = ningún módulo).
-- Sin fila (negocios de antes), el negocio tiene todos los módulos activos.
CREATE TABLE IF NOT EXISTS business_modules_sync (
  business_id TEXT PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
