// Mi academia: datos de la academia (rubro y términos, escala de notas, mínimos, valores de reposición, datos del
// recibo) y áreas. Todos los módulos leen la configuración y las áreas; solo propietario y administrador las cambian.
//   GET /api/academia/config   ·  PUT /api/academia/config
//   GET /api/academia/areas-lista  (para los selectores de los demás módulos)
//   CRUD /api/academia/areas
import { json, readJson, HttpError } from '../lib/http.js';
import { crud, all, now } from '../lib/crud.js';
import { audit } from '../lib/audit.js';
import { getConfig, CONFIG_DEFAULT, RUBROS } from '../lib/academia.js';

const MOD = 'academia';
export const ENTITIES = {
  areas: { table: 'ac_areas', label: 'el área', title: 'nombre', search: ['nombre'], order: 'nombre', crear: 'manager',
    fields: { nombre: 'text!', color: 'text' } },
};

export function routes(r) {
  crud(r, { base: '/api/academia', modulo: MOD, entities: ENTITIES });
  r.get('/api/academia/config', 'tenant', async (c) => json({ ...(await getConfig(c.env, c.businessId)), rubros: RUBROS }));
  r.get('/api/academia/areas-lista', 'tenant', async (c) => json({ areas: await all(c.env, 'SELECT id, nombre, color FROM ac_areas WHERE business_id = ? ORDER BY nombre', c.businessId) }));
  r.put('/api/academia/config', `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req), cur = await getConfig(c.env, c.businessId), out = { ...cur };
    const numIn = (k, min, max) => { if (b[k] === undefined) return; const n = Number(b[k]); if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `Valor no válido en ${k}`); out[k] = n; };
    if (b.rubro !== undefined) { if (!RUBROS[b.rubro]) throw new HttpError(400, 'Rubro no válido'); out.rubro = b.rubro; }
    for (const k of ['termS', 'termP', 'recibo', 'pie', 'nit', 'tel', 'dir', 'ig', 'web']) if (b[k] !== undefined) out[k] = String(b[k] ?? '').trim().slice(0, k === 'pie' ? 300 : 80);
    if (out.recibo && !['ticket', 'carta'].includes(out.recibo)) out.recibo = 'ticket';
    numIn('escala', 5, 10); numIn('notaMin', 0, 10); numIn('asisMin', 0, 100); numIn('valorRepo', 0, 1e9); numIn('valorRepoVirtual', 0, 1e9); numIn('horasVirtual', 1, 720); numIn('consecutivo', 1, 1e9);
    if (!out.termS) out.termS = CONFIG_DEFAULT.termS; if (!out.termP) out.termP = CONFIG_DEFAULT.termP;
    if (out.notaMin > out.escala) throw new HttpError(400, 'La nota mínima no puede ser mayor que la escala');
    await c.env.DB.prepare('INSERT INTO ac_config (business_id, data, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(business_id) DO UPDATE SET data = excluded.data, updated_by = excluded.updated_by, updated_at = excluded.updated_at')
      .bind(c.businessId, JSON.stringify(out), c.session.user_id, now()).run();
    await audit(c, 'Actualizó los datos de la academia', { modulo: MOD });
    return json(out);
  });
}
