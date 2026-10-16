// Estudiantes (o alumnas, aprendices… según el rubro). Ver: todo el equipo; borrar: propietario y administrador.
//   CRUD /api/estudiantes/estudiantes   ·   GET /api/estudiantes/:id/ficha   ·   GET /api/estudiantes/resumen (widget)
import { json, HttpError } from '../lib/http.js';
import { crud, all, one } from '../lib/crud.js';
import { cartera } from './cuotas.js';
import { moraDe } from './cursos.js';
import { getConfig, resumenAsis, resumenNotas, estadoAcad, estadoCuotas } from '../lib/academia.js';

const MOD = 'estudiantes';
export const ENTITIES = {
  estudiantes: { table: 'ac_estudiantes', label: 'el estudiante', title: 'nombre', search: ['nombre', 'documento', 'telefono', 'email'], order: 'activo DESC, nombre',
    fields: { nombre: 'text!', documento: 'text', telefono: 'text', email: 'email', origen: 'text', notas: 'long', activo: 'bool+' },
    async beforeCreate(c, row) {
      if (row.documento && await one(c.env, 'SELECT 1 FROM ac_estudiantes WHERE business_id = ? AND documento = ?', c.businessId, row.documento)) throw new HttpError(409, 'Ya hay alguien con ese documento');
    },
    // En la lista: si está en mora (cuota vencida) o con baja asistencia.
    async decorate(c, rows) {
      if (!rows.length) return rows;
      const manager = ['owner', 'admin'].includes(c.role);
      const [car, cfg, marcas] = await Promise.all([cartera(c), getConfig(c.env, c.businessId),
        all(c.env, `SELECT i.estudiante_id, a.clase_n, a.estado FROM ac_asistencia a JOIN ac_inscripciones i ON i.id = a.inscripcion_id AND i.business_id = a.business_id
          WHERE a.business_id = ? AND i.estado <> 'retirada' AND i.estudiante_id IN (${rows.map(() => '?').join(',')})`, c.businessId, ...rows.map((r) => r.id))]);
      const venc = car.filter((q) => q.estado === 'vencida');
      return rows.map((r) => {
        const ra = resumenAsis(marcas.filter((m) => m.estudiante_id === r.id));
        return { ...r, ...moraDe(venc.filter((q) => q.estudiante_id === r.id), manager), asistencia_pct: ra.pct, baja_asistencia: ra.pct != null && ra.pct < cfg.asisMin };
      });
    },
    async afterDelete(c, before) {
      // Sus matrículas, cuotas, asistencia y notas se van con él (los pagos registrados se conservan en la bitácora).
      const ins = await all(c.env, 'SELECT id FROM ac_inscripciones WHERE business_id = ? AND estudiante_id = ?', c.businessId, before.id);
      for (const i of ins) {
        await c.env.DB.batch(['ac_cuotas', 'ac_asistencia', 'ac_notas', 'ac_reposiciones', 'ac_pagos', 'ac_examenes'].map((t) => c.env.DB.prepare(`DELETE FROM ${t} WHERE business_id = ? AND inscripcion_id = ?`).bind(c.businessId, i.id)));
      }
      await c.env.DB.prepare('DELETE FROM ac_inscripciones WHERE business_id = ? AND estudiante_id = ?').bind(c.businessId, before.id).run();
    } },
};

// Matrículas de un estudiante con su avance académico y su saldo (lo usan la ficha y la IA).
export async function fichaEstudiante(c, id) {
  const e = await one(c.env, 'SELECT * FROM ac_estudiantes WHERE id = ? AND business_id = ?', id, c.businessId);
  if (!e) throw new HttpError(404, 'No encontrado');
  const cfg = await getConfig(c.env, c.businessId);
  const ins = await all(c.env, `SELECT i.*, k.nombre AS curso, k.nivel FROM ac_inscripciones i JOIN ac_cursos k ON k.id = i.curso_id AND k.business_id = i.business_id
    WHERE i.business_id = ? AND i.estudiante_id = ? ORDER BY i.fecha DESC`, c.businessId, id);
  const out = [];
  for (const i of ins) {
    const [cuotas, pag, asis, notas, evs, repos] = await Promise.all([
      all(c.env, 'SELECT n, etiqueta, vence, valor FROM ac_cuotas WHERE business_id = ? AND inscripcion_id = ?', c.businessId, i.id),
      one(c.env, "SELECT COALESCE(SUM(valor), 0) s FROM ac_pagos WHERE business_id = ? AND inscripcion_id = ? AND tipo = 'cuota' AND anulado = 0", c.businessId, i.id),
      all(c.env, 'SELECT clase_n, estado FROM ac_asistencia WHERE business_id = ? AND inscripcion_id = ?', c.businessId, i.id),
      all(c.env, 'SELECT evaluacion_id, nota FROM ac_notas WHERE business_id = ? AND inscripcion_id = ?', c.businessId, i.id),
      all(c.env, 'SELECT id, nombre, peso FROM ac_evaluaciones WHERE business_id = ? AND curso_id = ?', c.businessId, i.curso_id),
      all(c.env, "SELECT clase_n FROM ac_reposiciones WHERE business_id = ? AND inscripcion_id = ? AND estado = 'hecha'", c.businessId, i.id),
    ]);
    const a = resumenAsis(asis, new Set(repos.map((x) => x.clase_n))), n = resumenNotas(notas, evs);
    const total = i.valor - i.descuento, cu = estadoCuotas(cuotas, pag.s);
    out.push({ id: i.id, curso_id: i.curso_id, curso: i.curso, nivel: i.nivel, fecha: i.fecha, estado: i.estado, total, pagado: pag.s, saldo: Math.max(0, total - pag.s),
      vencido: cu.filter((x) => x.estado === 'vencida').reduce((s, x) => s + x.falta, 0), asistencia: a, notas: n, academico: estadoAcad(a, n, cfg) });
  }
  const pagos = await all(c.env, `SELECT p.num, p.fecha, p.valor, p.metodo, p.concepto, p.tipo, p.anulado, k.nombre AS curso FROM ac_pagos p
    JOIN ac_inscripciones i ON i.id = p.inscripcion_id AND i.business_id = p.business_id JOIN ac_cursos k ON k.id = i.curso_id AND k.business_id = i.business_id
    WHERE p.business_id = ? AND i.estudiante_id = ? ORDER BY p.fecha DESC, p.num DESC`, c.businessId, id);
  return { estudiante: e, matriculas: out, pagos };
}

export function routes(r) {
  crud(r, { base: '/api/estudiantes', modulo: MOD, entities: ENTITIES });
  r.get('/api/estudiantes/:id/ficha', `tenant:${MOD}`, async (c) => json(await fichaEstudiante(c, Number(c.params.id))));
  r.get('/api/estudiantes/lista', 'tenant', async (c) => json({ estudiantes: await all(c.env, 'SELECT id, nombre, documento, telefono FROM ac_estudiantes WHERE business_id = ? AND activo = 1 ORDER BY nombre LIMIT 2000', c.businessId) }));
  r.get('/api/estudiantes/resumen', `tenant:${MOD}`, async (c) => {
    const cfg = await getConfig(c.env, c.businessId);
    const s = await one(c.env, 'SELECT COUNT(*) n, SUM(created_at >= ?) nuevos FROM ac_estudiantes WHERE business_id = ? AND activo = 1', Date.now() - 30 * 86400000, c.businessId);
    const t = cfg.termP.charAt(0).toUpperCase() + cfg.termP.slice(1);
    return json({ titulo: t, valor: s.n, detalle: `${s.nuevos || 0} nuevos en 30 días`, icono: 'bi-people', ruta: '/staff/estudiantes.html' });
  });
}
