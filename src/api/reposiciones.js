// Reposiciones: las fallas (ausente o con excusa) de cada estudiante, los espacios disponibles para reponer
// (fecha, hora, profesional, cupos), agendar, marcar hecha, exonerar del cobro y cobrar (queda como pago tipo reposición).
// Ver: todo el equipo; crear o borrar espacios y exonerar: propietario y administrador.
//   GET  /api/reposiciones?estado=pendiente|agendada|hecha|todas    fallas con su reposición
//   CRUD /api/reposiciones/espacios
//   POST /api/reposiciones                { inscripcion_id, clase_n, espacio_id?, modo? }   agenda (o reagenda)
//   PATCH /api/reposiciones/:id           { estado?: pendiente|agendada|hecha, exonerada? }
//   POST /api/reposiciones/:id/cobrar     { metodo, valor? }   registra el pago con el valor configurado
//   GET  /api/reposiciones/resumen        widget
import { json, readJson, HttpError } from '../lib/http.js';
import { crud, all, one, now, today, cast } from '../lib/crud.js';
import { audit } from '../lib/audit.js';
import { getConfig } from '../lib/academia.js';
import { registrarPago } from './cuotas.js';

const MOD = 'reposiciones';
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function validarEspacio(row) {
  for (const k of ['ini', 'fin']) if (k in row && row[k] != null && !HORA.test(row[k])) throw new HttpError(400, 'Hora no válida (HH:MM)');
  if (row.ini && row.fin && row.fin <= row.ini) throw new HttpError(400, 'La hora de fin debe ser después de la de inicio');
  if ('cupos' in row && row.cupos != null && (row.cupos < 1 || row.cupos > 200)) throw new HttpError(400, 'Cupos no válidos (1 a 200)');
}

export const ENTITIES = {
  espacios: { table: 'ac_espacios', label: 'el espacio de reposición', title: 'fecha', order: 'fecha DESC, ini', crear: 'manager',
    fields: { fecha: 'date!', ini: 'text!', fin: 'text!', profesional_id: 'int', area_id: 'int', curso_id: 'int', clase_n: 'int', cupos: 'int', notas: 'text' },
    refs: { profesional_id: 'ac_profesionales', area_id: 'ac_areas', curso_id: 'ac_cursos' },
    beforeCreate(c, row) { validarEspacio(row); },
    beforeUpdate(c, row, before) { validarEspacio({ ini: before.ini, fin: before.fin, ...row }); },
    async afterDelete(c, before) { await c.env.DB.prepare("UPDATE ac_reposiciones SET espacio_id = NULL, estado = 'pendiente', updated_at = ? WHERE business_id = ? AND espacio_id = ? AND estado = 'agendada'").bind(now(), c.businessId, before.id).run(); },
    async decorate(c, rows) {
      if (!rows.length) return rows;
      const occ = await all(c.env, `SELECT espacio_id, COUNT(*) n FROM ac_reposiciones WHERE business_id = ? AND espacio_id IN (${rows.map(() => '?').join(',')}) GROUP BY espacio_id`, c.businessId, ...rows.map((x) => x.id));
      return rows.map((x) => ({ ...x, ocupados: occ.find((o) => o.espacio_id === x.id)?.n || 0 }));
    } },
};

// Una falla = asistencia A o J de una matrícula no retirada. Se junta con su reposición si ya existe.
export async function fallas(c, { inscripcionId } = {}) {
  const extra = inscripcionId ? ' AND i.id = ?' : '', args = inscripcionId ? [c.businessId, inscripcionId] : [c.businessId];
  const rows = await all(c.env, `SELECT a.inscripcion_id, a.clase_n, a.estado AS marca, i.curso_id, e.nombre AS estudiante, e.telefono, k.nombre AS curso, cl.fecha AS clase_fecha, cl.tema,
      r.id, r.espacio_id, r.modo, COALESCE(r.estado, 'pendiente') AS estado, COALESCE(r.exonerada, 0) AS exonerada, r.pago_id, s.fecha AS espacio_fecha, s.ini AS espacio_ini, s.fin AS espacio_fin
    FROM ac_asistencia a JOIN ac_inscripciones i ON i.id = a.inscripcion_id AND i.business_id = a.business_id
    JOIN ac_estudiantes e ON e.id = i.estudiante_id AND e.business_id = i.business_id JOIN ac_cursos k ON k.id = i.curso_id AND k.business_id = i.business_id
    LEFT JOIN ac_clases cl ON cl.curso_id = i.curso_id AND cl.n = a.clase_n AND cl.business_id = a.business_id
    LEFT JOIN ac_reposiciones r ON r.inscripcion_id = a.inscripcion_id AND r.clase_n = a.clase_n AND r.business_id = a.business_id
    LEFT JOIN ac_espacios s ON s.id = r.espacio_id AND s.business_id = a.business_id
    WHERE a.business_id = ? AND a.estado IN ('A', 'J') AND i.estado <> 'retirada'${extra} ORDER BY cl.fecha DESC, e.nombre LIMIT 2000`, ...args);
  return rows;
}

async function inscripcion(c, id) {
  const ins = await one(c.env, 'SELECT i.id, e.nombre FROM ac_inscripciones i JOIN ac_estudiantes e ON e.id = i.estudiante_id AND e.business_id = i.business_id WHERE i.id = ? AND i.business_id = ?', id, c.businessId);
  if (!ins) throw new HttpError(400, 'Matrícula no válida');
  return ins;
}
async function reposicion(c, id) {
  const r = await one(c.env, 'SELECT r.*, e.nombre FROM ac_reposiciones r JOIN ac_inscripciones i ON i.id = r.inscripcion_id AND i.business_id = r.business_id JOIN ac_estudiantes e ON e.id = i.estudiante_id AND e.business_id = i.business_id WHERE r.id = ? AND r.business_id = ?', Number(c.params.id), c.businessId);
  if (!r) throw new HttpError(404, 'Reposición no encontrada');
  return r;
}

export function routes(r) {
  crud(r, { base: '/api/reposiciones', modulo: MOD, entities: ENTITIES });

  r.get('/api/reposiciones', `tenant:${MOD}`, async (c) => {
    const est = c.url.searchParams.get('estado') || 'pendientes';
    const cursoId = Number(c.url.searchParams.get('curso_id')) || 0;
    const rows = (await fallas(c)).filter((x) => !cursoId || x.curso_id === cursoId);
    const filtradas = est === 'todas' ? rows : est === 'pendientes' ? rows.filter((x) => x.estado !== 'hecha') : rows.filter((x) => x.estado === est);
    const cfg = await getConfig(c.env, c.businessId);
    return json({ rows: filtradas, valor: cfg.valorRepo, valorVirtual: cfg.valorRepoVirtual,
      totales: { pendiente: rows.filter((x) => x.estado === 'pendiente').length, agendada: rows.filter((x) => x.estado === 'agendada').length, hecha: rows.filter((x) => x.estado === 'hecha').length } });
  });

  r.post('/api/reposiciones', `tenant:${MOD}`, async (c) => {
    const b = await readJson(c.req);
    const ins = await inscripcion(c, cast('matrícula', 'int!', b.inscripcion_id));
    const n = cast('clase', 'int!', b.clase_n);
    if (!(await one(c.env, "SELECT 1 FROM ac_asistencia WHERE business_id = ? AND inscripcion_id = ? AND clase_n = ? AND estado IN ('A', 'J')", c.businessId, ins.id, n))) throw new HttpError(400, 'Esa clase no figura como falla');
    const modo = b.modo === 'virtual' ? 'virtual' : 'presencial';
    let espacio = null;
    if (b.espacio_id) {
      espacio = await one(c.env, 'SELECT * FROM ac_espacios WHERE id = ? AND business_id = ?', cast('espacio', 'int', b.espacio_id), c.businessId);
      if (!espacio) throw new HttpError(400, 'Espacio no válido');
      const ocup = (await one(c.env, 'SELECT COUNT(*) n FROM ac_reposiciones WHERE business_id = ? AND espacio_id = ? AND NOT (inscripcion_id = ? AND clase_n = ?)', c.businessId, espacio.id, ins.id, n)).n;
      if (ocup >= espacio.cupos) throw new HttpError(409, 'Ese espacio ya no tiene cupos');
    }
    const t = now(), estado = espacio || modo === 'virtual' ? 'agendada' : 'pendiente';
    await c.env.DB.prepare(`INSERT INTO ac_reposiciones (business_id, inscripcion_id, clase_n, espacio_id, modo, estado, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (inscripcion_id, clase_n) DO UPDATE SET espacio_id = excluded.espacio_id, modo = excluded.modo, estado = CASE WHEN ac_reposiciones.estado = 'hecha' THEN 'hecha' ELSE excluded.estado END, updated_at = excluded.updated_at`)
      .bind(c.businessId, ins.id, n, espacio?.id || null, modo, estado, t, t).run();
    const row = await one(c.env, 'SELECT id FROM ac_reposiciones WHERE business_id = ? AND inscripcion_id = ? AND clase_n = ?', c.businessId, ins.id, n);
    await audit(c, `Agendó la reposición de la clase ${n} de ${ins.nombre}${espacio ? ` para el ${espacio.fecha} ${espacio.ini}` : modo === 'virtual' ? ' (virtual)' : ''}`, { modulo: MOD });
    return json({ id: row.id, estado }, 201);
  });

  r.patch('/api/reposiciones/:id', `tenant:${MOD}`, async (c) => {
    const rep = await reposicion(c, c.params.id), b = await readJson(c.req), set = {};
    if (b.estado !== undefined) { set.estado = cast('estado', ['pendiente', 'agendada', 'hecha'], b.estado); if (set.estado === 'pendiente') set.espacio_id = null; }
    if (b.exonerada !== undefined) {
      if (!['owner', 'admin'].includes(c.session.role)) throw new HttpError(403, 'Solo el propietario o un administrador puede exonerar');
      set.exonerada = cast('exonerada', 'bool', b.exonerada);
    }
    const cols = Object.keys(set);
    if (!cols.length) return json({ ok: true });
    await c.env.DB.prepare(`UPDATE ac_reposiciones SET ${cols.map((x) => `${x} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND business_id = ?`).bind(...cols.map((x) => set[x]), now(), rep.id, c.businessId).run();
    await audit(c, `Reposición de la clase ${rep.clase_n} de ${rep.nombre}: ${[set.estado, set.exonerada === 1 && 'exonerada del cobro', set.exonerada === 0 && 'se quitó la exoneración'].filter(Boolean).join(', ')}`, { modulo: MOD });
    return json({ ok: true });
  });

  r.post('/api/reposiciones/:id/cobrar', `tenant:${MOD}`, async (c) => {
    const rep = await reposicion(c, c.params.id), b = await readJson(c.req);
    if (rep.exonerada) throw new HttpError(400, 'Esta reposición está exonerada del cobro');
    if (rep.pago_id && await one(c.env, 'SELECT 1 FROM ac_pagos WHERE id = ? AND business_id = ? AND anulado = 0', rep.pago_id, c.businessId)) throw new HttpError(409, 'Esta reposición ya está cobrada');
    const cfg = await getConfig(c.env, c.businessId);
    const valor = b.valor !== undefined && b.valor !== '' ? b.valor : rep.modo === 'virtual' ? cfg.valorRepoVirtual : cfg.valorRepo;
    if (!(Number(valor) > 0)) throw new HttpError(400, 'Configura el valor de la reposición en Academia o escribe el valor');
    const pago = await registrarPago(c, { inscripcion_id: rep.inscripcion_id, valor, metodo: b.metodo, tipo: 'reposicion', concepto: `Reposición clase ${rep.clase_n}${rep.modo === 'virtual' ? ' (virtual)' : ''}`, fecha: today() });
    await c.env.DB.prepare('UPDATE ac_reposiciones SET pago_id = ?, updated_at = ? WHERE id = ? AND business_id = ?').bind(pago.id, now(), rep.id, c.businessId).run();
    return json(pago, 201);
  });

  r.get('/api/reposiciones/resumen', `tenant:${MOD}`, async (c) => {
    const rows = await fallas(c), pend = rows.filter((x) => x.estado === 'pendiente').length, ag = rows.filter((x) => x.estado === 'agendada').length;
    return json({ titulo: 'Reposiciones', valor: String(pend), detalle: `pendientes por agendar · ${ag} agendadas`, icono: 'bi-arrow-repeat', ruta: '/staff/reposiciones.html' });
  });
}
