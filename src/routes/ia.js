import { json } from "../lib/http.js";

// Punto de entrada de la IA de la plataforma. Aún no está conectada: responde 501 y la pantalla lo avisa.
// Cuando se conecte (ver docs/IA.md):
//   1. Tomar `prompt` del cuerpo (ya trae el formato y el contexto del curso) o armarlo en el servidor.
//   2. Llamar al modelo (Workers AI con `env.AI`, o un proveedor con su clave como secreto) pidiendo JSON.
//   3. Validar la respuesta con el esquema de ESQUEMA_PREGUNTAS (public/admin-modulos.js) y devolver `{ instrucciones, preguntas }`.
//      El panel reutiliza el mismo importador que el JSON manual, así que lo que no cumpla el formato se rechaza con un mensaje claro.
//   4. Limitar el uso por negocio (cuota mensual) antes de llamar al modelo.
export function registerIA(router) {
  router.post("/staff/ia/preguntas", async () =>
    json({ error: "La IA de la plataforma aún no está conectada. Por ahora copia el prompt y pégalo en tu IA, luego importa el JSON." }, { status: 501 }));
}
