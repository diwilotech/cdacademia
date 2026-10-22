// Mi academia: datos de la academia (rubro y términos, escala de notas, mínimos, valores de reposición, datos del
// recibo) y áreas. Todos los módulos leen la configuración y las áreas; solo propietario y administrador las cambian.
//   GET /api/academia/config   ·  PUT /api/academia/config
//   GET /api/academia/areas-lista  (para los selectores de los demás módulos)
//   CRUD /api/academia/areas
//   GET /api/academia/metricas  (Inicio) indicadores propios de la academia, según los módulos activos y el rol
import { json, readJson, HttpError } from '../lib/http.js';
import { crud, all, one, now, today } from '../lib/crud.js';
import { activeModuleIds } from '../lib/modules.js';
import { cartera } from './cuotas.js';
import { fallas } from './reposiciones.js';
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
  // Indicadores de Inicio: solo de los módulos propios de la academia (los módulos compartidos traen sus propios widgets).
  // Lo de dinero solo lo ve propietario/administrador y solo si Cuotas está activo.
  r.get('/api/academia/metricas', 'tenant', async (c) => {
    const act = new Set(await activeModuleIds(c.env, c.businessId)), money = ['owner', 'admin'].includes(c.role);
    const hoy = today(), mes = hoy.slice(0, 7), ini30 = new Date(Date.parse(`${hoy}T12:00:00Z`) - 30 * 864e5).toISOString().slice(0, 10);
    const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const lunes = d.toISOString().slice(0, 10), domingo = new Date(d.getTime() + 6 * 864e5).toISOString().slice(0, 10);
    const mesMs = Date.parse(`${mes}-01T05:00:00Z`), B = c.businessId, tiles = [];
    const tile = (id, titulo, valor, extra = {}) => tiles.push({ id, titulo, valor, ...extra });
    if (act.has('estudiantes')) {
      const e = await one(c.env, 'SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS nuevos FROM ac_estudiantes WHERE business_id = ? AND activo = 1', mesMs, B);
      tile('estudiantes', 'Estudiantes activos', e.n, { fmt: 'num', detalle: `${e.nuevos} nuevos este mes`, icono: 'bi-people', ruta: '/staff/estudiantes.html' });
    }
    if (act.has('matriculas') && money) {
      const m = await one(c.env, "SELECT COALESCE(SUM(CASE WHEN estado = 'activa' THEN 1 ELSE 0 END), 0) AS activas, COALESCE(SUM(CASE WHEN fecha >= ? THEN 1 ELSE 0 END), 0) AS mes FROM ac_inscripciones WHERE business_id = ?", `${mes}-01`, B);
      tile('matriculas', 'Matrículas activas', m.activas, { fmt: 'num', detalle: `${m.mes} nuevas este mes`, icono: 'bi-person-plus', ruta: '/staff/estudiantes.html#matriculas' });
    }
    if (act.has('cursos')) {
      const k = await one(c.env, `SELECT COALESCE(SUM(CASE WHEN k.inicio <= ? AND f.fin >= ? THEN 1 ELSE 0 END), 0) AS en_curso, COALESCE(SUM(CASE WHEN k.inicio > ? THEN 1 ELSE 0 END), 0) AS por_iniciar
        FROM ac_cursos k LEFT JOIN (SELECT curso_id, MAX(fecha) AS fin FROM ac_clases WHERE business_id = ? GROUP BY curso_id) f ON f.curso_id = k.id WHERE k.business_id = ? AND k.activo = 1`, hoy, hoy, hoy, B, B);
      tile('cursos', 'Cursos en curso', k.en_curso, { fmt: 'num', detalle: `${k.por_iniciar} por iniciar`, icono: 'bi-mortarboard', ruta: '/staff/cursos.html' });
      const cl = await one(c.env, `SELECT COALESCE(SUM(CASE WHEN cl.fecha = ? THEN 1 ELSE 0 END), 0) AS hoy, COUNT(*) AS semana FROM ac_clases cl JOIN ac_cursos k ON k.id = cl.curso_id AND k.business_id = cl.business_id
        WHERE cl.business_id = ? AND cl.fecha BETWEEN ? AND ? AND k.activo = 1`, hoy, B, lunes, domingo);
      tile('clases_hoy', 'Clases de hoy', cl.hoy, { fmt: 'num', detalle: `${cl.semana} esta semana`, icono: 'bi-journal-bookmark', ruta: '/staff/cursos.html#calendario' });
      const a = await all(c.env, `SELECT a.estado, COUNT(*) AS n FROM ac_asistencia a JOIN ac_inscripciones i ON i.id = a.inscripcion_id AND i.business_id = a.business_id
        JOIN ac_clases cl ON cl.curso_id = i.curso_id AND cl.n = a.clase_n AND cl.business_id = a.business_id WHERE a.business_id = ? AND cl.fecha BETWEEN ? AND ? AND a.estado <> '' GROUP BY a.estado`, B, ini30, hoy);
      const tot = a.reduce((s, x) => s + x.n, 0), pres = a.filter((x) => ['P', 'T'].includes(x.estado)).reduce((s, x) => s + x.n, 0);
      tile('asistencia', 'Asistencia (30 días)', tot ? Math.round(pres / tot * 100) : null, { fmt: 'pct', detalle: tot ? `${tot} registros` : 'Sin registros todavía', icono: 'bi-check2-square', ruta: '/staff/cursos.html' });
      const riesgo = await one(c.env, `SELECT COUNT(*) AS n FROM (SELECT a.inscripcion_id FROM ac_asistencia a JOIN ac_inscripciones i ON i.id = a.inscripcion_id AND i.business_id = a.business_id AND i.estado = 'activa'
        JOIN ac_clases cl ON cl.curso_id = i.curso_id AND cl.n = a.clase_n AND cl.business_id = a.business_id WHERE a.business_id = ? AND a.estado = 'A' AND cl.fecha BETWEEN ? AND ? GROUP BY a.inscripcion_id HAVING COUNT(*) >= 2)`, B, ini30, hoy);
      tile('riesgo', 'Con 2 o más ausencias', riesgo.n, { fmt: 'num', detalle: 'En los últimos 30 días', icono: 'bi-person-exclamation', tono: riesgo.n ? 'warn' : '', ruta: '/staff/cursos.html' });
      const nt = await one(c.env, 'SELECT AVG(nota) AS prom, COUNT(*) AS n FROM ac_notas WHERE business_id = ? AND nota IS NOT NULL', B);
      tile('notas', 'Promedio de notas', nt.n ? Math.round(nt.prom * 10) / 10 : null, { fmt: 'nota', detalle: nt.n ? `${nt.n} notas puestas` : 'Aún sin notas', icono: 'bi-star', ruta: '/staff/cursos.html' });
    }
    if (act.has('reposiciones')) {
      const f = await fallas(c);
      tile('reposiciones', 'Reposiciones por agendar', f.filter((x) => x.estado === 'pendiente').length, { fmt: 'num', detalle: `${f.filter((x) => x.estado === 'agendada').length} ya agendadas`, icono: 'bi-arrow-repeat', ruta: '/staff/cursos.html#reposiciones' });
    }
    let serie = [];
    if (act.has('cuotas') && money) {
      const rows = await cartera(c);
      const venc = rows.filter((q) => q.estado === 'vencida'), deMes = rows.filter((q) => q.falta > 0 && q.vence.startsWith(mes));
      const rec = await one(c.env, 'SELECT COALESCE(SUM(valor), 0) AS v, COUNT(*) AS n FROM ac_pagos WHERE business_id = ? AND anulado = 0 AND fecha >= ? AND fecha <= ?', B, `${mes}-01`, hoy);
      tile('recaudo', 'Recaudado este mes', rec.v, { fmt: 'money', detalle: `${rec.n} ${rec.n === 1 ? 'pago' : 'pagos'}`, icono: 'bi-cash-stack', ruta: '/staff/estudiantes.html#matriculas#pagos' });
      tile('por_cobrar', 'Por cobrar este mes', deMes.reduce((s, q) => s + q.falta, 0), { fmt: 'money', detalle: `${deMes.length} cuotas`, icono: 'bi-calendar-month', ruta: '/staff/estudiantes.html#matriculas#cartera' });
      tile('vencido', 'Cartera vencida', venc.reduce((s, q) => s + q.falta, 0), { fmt: 'money', detalle: `${venc.length} cuotas vencidas`, icono: 'bi-exclamation-circle', tono: venc.length ? 'bad' : '', ruta: '/staff/estudiantes.html#matriculas#cartera' });
      // últimos 6 meses: matrículas nuevas y recaudo
      const meses = Array.from({ length: 6 }, (_, i) => { const x = new Date(`${mes}-01T12:00:00Z`); x.setUTCMonth(x.getUTCMonth() - (5 - i)); return x.toISOString().slice(0, 7); });
      const [mm, pp] = await Promise.all([
        all(c.env, "SELECT substr(fecha, 1, 7) AS mes, COUNT(*) AS n FROM ac_inscripciones WHERE business_id = ? AND fecha >= ? GROUP BY 1", B, `${meses[0]}-01`),
        all(c.env, 'SELECT substr(fecha, 1, 7) AS mes, SUM(valor) AS v FROM ac_pagos WHERE business_id = ? AND anulado = 0 AND fecha >= ? GROUP BY 1', B, `${meses[0]}-01`),
      ]);
      serie = meses.map((m) => ({ mes: m, matriculas: mm.find((x) => x.mes === m)?.n || 0, recaudo: pp.find((x) => x.mes === m)?.v || 0 }));
    }
    return json({ tiles, serie });
  });
  r.get('/api/academia/areas-lista', 'tenant', async (c) => json({ areas: await all(c.env, 'SELECT id, nombre, color FROM ac_areas WHERE business_id = ? ORDER BY nombre', c.businessId) }));
  r.put('/api/academia/config', `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req), cur = await getConfig(c.env, c.businessId), out = { ...cur };
    const numIn = (k, min, max) => { if (b[k] === undefined) return; const n = Number(b[k]); if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `Valor no válido en ${k}`); out[k] = n; };
    if (b.rubro !== undefined) { if (!RUBROS[b.rubro]) throw new HttpError(400, 'Rubro no válido'); out.rubro = b.rubro; }
    for (const k of ['termS', 'termP', 'recibo', 'pie', 'nit', 'tel', 'dir', 'ig', 'web']) if (b[k] !== undefined) out[k] = String(b[k] ?? '').trim().slice(0, k === 'pie' ? 300 : 80);
    if (out.recibo && !['ticket', 'carta'].includes(out.recibo)) out.recibo = 'ticket';
    if (b.cuentaCobro !== undefined) out.cuentaCobro = b.cuentaCobro === true || b.cuentaCobro === 'true' || b.cuentaCobro === 1 || b.cuentaCobro === '1' || b.cuentaCobro === 'on';
    numIn('escala', 5, 10); numIn('notaMin', 0, 10); numIn('asisMin', 0, 100); numIn('valorRepo', 0, 1e9); numIn('valorRepoVirtual', 0, 1e9); numIn('horasVirtual', 1, 720); numIn('consecutivo', 1, 1e9);
    if (!out.termS) out.termS = CONFIG_DEFAULT.termS; if (!out.termP) out.termP = CONFIG_DEFAULT.termP;
    if (out.notaMin > out.escala) throw new HttpError(400, 'La nota mínima no puede ser mayor que la escala');
    await c.env.DB.prepare('INSERT INTO ac_config (business_id, data, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(business_id) DO UPDATE SET data = excluded.data, updated_by = excluded.updated_by, updated_at = excluded.updated_at')
      .bind(c.businessId, JSON.stringify(out), c.session.user_id, now()).run();
    await audit(c, 'Actualizó los datos de la academia', { modulo: MOD });
    return json(out);
  });
}
