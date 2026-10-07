import { json, error, readJson } from "../lib/http.js";
import { first, run, nowIso } from "../lib/db.js";

// Etapa 1: todo el estado de la academia vive en una fila por negocio (JSON) con control de versión
// optimista. Siempre filtrado por business_id. Las tablas normalizadas llegan en la etapa 2.
export function registerState(router) {
  router.get("/staff/state", async (request, env, ctx) => {
    const row = await first(env, `SELECT data, version FROM app_state WHERE business_id = ?`, ctx.businessId);
    return json(row ? { data: JSON.parse(row.data), version: row.version } : { data: null, version: 0 });
  });

  router.put("/staff/state", async (request, env, ctx) => {
    const body = await readJson(request);
    if (!body.data || typeof body.data !== "object") return error("Datos inválidos");
    const text = JSON.stringify(body.data);
    if (text.length > 1_800_000) return error("El estado supera el límite de D1 (2 MB); hay que pasar a tablas", 413);
    const base = +body.version || 0;
    if (base === 0) {
      const r = await run(env, `INSERT OR IGNORE INTO app_state (business_id, data, version, updated_at) VALUES (?,?,1,?)`, ctx.businessId, text, nowIso());
      if (r.meta.changes) return json({ version: 1 });
    } else {
      const r = await run(env, `UPDATE app_state SET data = ?, version = version + 1, updated_at = ? WHERE business_id = ? AND version = ?`,
        text, nowIso(), ctx.businessId, base);
      if (r.meta.changes) return json({ version: base + 1 });
    }
    return error("Hay cambios más recientes en otro dispositivo. Recarga la página.", 409);
  });
}
