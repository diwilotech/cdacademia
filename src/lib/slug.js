// Cada negocio tiene su dirección: https://<dominio>/<slug> (ingreso) y /<slug>/admin (panel).
// Estas palabras son rutas de la app y no pueden ser un slug.
export const RESERVADOS = new Set(["admin", "login", "api", "staff", "assets", "index", "favicon"]);
export const slugValido = (s) => /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(String(s || "")) && !RESERVADOS.has(s);
