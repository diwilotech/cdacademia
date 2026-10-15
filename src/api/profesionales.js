// Profesionales (docentes): áreas con niveles y si reponen, y horario semanal de disponibilidad.
// Ver: propietario y administrador. El acceso al panel de un profesional se da en Equipo (mismo correo).
//   CRUD /api/profesionales/profesionales   ·   GET /api/profesionales/lista (selectores de cursos y reposiciones)
import { json, HttpError } from '../lib/http.js';
import { crud, all } from '../lib/crud.js';
import { NIVELES, parse } from '../lib/academia.js';

const MOD = 'profesionales';
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
async function validar(c, row) {
  if ('areas' in row && row.areas) {
    const ids = new Set((await all(c.env, 'SELECT id FROM ac_areas WHERE business_id = ?', c.businessId)).map((x) => x.id));
    row.areas = JSON.stringify(row.areas.slice(0, 30).map((a) => {
      if (!ids.has(Number(a.area_id))) throw new HttpError(400, 'Área no válida');
      return { area_id: Number(a.area_id), niveles: (Array.isArray(a.niveles) ? a.niveles : []).filter((n) => NIVELES.includes(n)), reponer: !!a.reponer };
    }));
  }
  if ('horario' in row && row.horario) {
    row.horario = JSON.stringify(row.horario.slice(0, 40).map((h) => {
      const dia = Number(h.dia);
      if (!(dia >= 0 && dia <= 6) || !HORA.test(h.ini) || !HORA.test(h.fin) || h.fin <= h.ini) throw new HttpError(400, 'Horario no válido (día y horas de inicio y fin)');
      return { dia, ini: h.ini, fin: h.fin };
    }));
  }
}
export const ENTITIES = {
  profesionales: { table: 'ac_profesionales', label: 'el profesional', title: 'nombre', search: ['nombre', 'email', 'telefono'], order: 'activo DESC, nombre', crear: 'manager',
    fields: { nombre: 'text!', telefono: 'text', email: 'email', activo: 'bool+', areas: 'json', horario: 'json', notas: 'long' },
    beforeCreate: validar, beforeUpdate: validar,
    decorate(c, rows) { return rows.map((p) => ({ ...p, areas: parse(p.areas, []), horario: parse(p.horario, []) })); } },
};

export function routes(r) {
  crud(r, { base: '/api/profesionales', modulo: MOD, entities: ENTITIES });
  r.get('/api/profesionales/lista', 'tenant', async (c) => json({ profesionales: (await all(c.env, 'SELECT id, nombre, activo, areas, horario FROM ac_profesionales WHERE business_id = ? ORDER BY activo DESC, nombre', c.businessId))
    .map((p) => ({ ...p, areas: parse(p.areas, []), horario: parse(p.horario, []) })) }));
}
