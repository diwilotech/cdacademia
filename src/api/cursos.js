// Cursos: datos, horario semanal y clases con fecha (saltando festivos de Colombia), plan, evaluaciones con pesos,
// exámenes, cupones de descuento, asistencia y notas de cada inscrito, y calendario.
// Ver: todo el equipo (el personal toma asistencia y pone notas); configurar el curso: propietario y administrador.
//   CRUD /api/cursos/{cursos|evaluaciones|cupones}
//   GET  /api/cursos/:id/detalle                 curso + clases + evaluaciones + cupones + inscritos con asistencia y notas
//   PATCH /api/cursos/:id/clases/:n               tema, contenido, métodos, materiales, virtual, material; fecha/hora (manager)
//   POST /api/cursos/:id/asistencia               { clase_n, marcas: [{ inscripcion_id, estado: P|A|T|J|'' }] }
//   POST /api/cursos/:id/notas                    { evaluacion_id, notas: [{ inscripcion_id, nota|null }] }
//   GET  /api/cursos/calendario?desde=&hasta=     clases y espacios de reposición del rango
//   GET  /api/cursos/resumen                      widget: clases de hoy
//   GET|PUT /api/cursos/:id/examenes/:ev/:insc    examen de un estudiante: respuestas, archivos y calificación (PUT guarda y califica)
//   POST /api/cursos/:id/examenes/:ev/:insc/aplicar  pone la nota sugerida del examen en Notas
//   POST|DELETE /api/cursos/:id/examenes/:ev/:insc/archivo  foto o PDF del examen (R2)
import { json, readJson, HttpError } from '../lib/http.js';
import { crud, all, one, now, today, cast, addDays, DATE } from '../lib/crud.js';
import { audit } from '../lib/audit.js';
import { limpiarExamen, calificar, limpiarRespuestas } from '../lib/examen.js';
import { cartera } from './cuotas.js';
import { sesiones, getConfig, resumenAsis, resumenNotas, estadoAcad, NIVELES, METODOS, parse } from '../lib/academia.js';

const MOD = 'cursos';
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function validarCurso(row) {
  if ('nivel' in row && row.nivel && !NIVELES.includes(row.nivel)) throw new HttpError(400, 'Nivel no válido');
  if ('num_clases' in row && row.num_clases != null && (row.num_clases < 0 || row.num_clases > 300)) throw new HttpError(400, 'Número de clases no válido (0 a 300)');
  if ('horario' in row && row.horario) {
    row.horario = JSON.stringify(row.horario.slice(0, 40).map((h) => {
      const dia = Number(h.dia);
      if (!(dia >= 0 && dia <= 6) || !HORA.test(h.ini) || !HORA.test(h.fin) || h.fin <= h.ini) throw new HttpError(400, 'Horario no válido (día, hora de inicio y de fin)');
      return { dia, ini: h.ini, fin: h.fin };
    }));
  }
  if ('plan' in row && row.plan) {
    row.plan = JSON.stringify(row.plan.slice(0, 60).map((m) => ({ titulo: String(m.titulo || '').slice(0, 200), horas: Math.max(0, Number(m.horas) || 0), temas: (Array.isArray(m.temas) ? m.temas : []).map((t) => String(t).slice(0, 200)).slice(0, 40) })));
  }
}

// Crea o ajusta las clases 1..N con las fechas del horario. Conserva tema y contenido; respeta las movidas a mano.
export async function regenerarClases(c, cursoId) {
  const k = await one(c.env, 'SELECT * FROM ac_cursos WHERE id = ? AND business_id = ?', cursoId, c.businessId);
  if (!k) return;
  const ses = sesiones({ inicio: k.inicio, num_clases: k.num_clases, horario: parse(k.horario, []), festivos: !!k.festivos });
  const prev = await all(c.env, 'SELECT n, movida FROM ac_clases WHERE business_id = ? AND curso_id = ?', c.businessId, cursoId);
  const movida = new Set(prev.filter((x) => x.movida).map((x) => x.n)), t = now();
  const stmts = ses.map((s, i) => movida.has(i + 1)
    ? c.env.DB.prepare('INSERT OR IGNORE INTO ac_clases (business_id, curso_id, n, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(c.businessId, cursoId, i + 1, t, t)
    : c.env.DB.prepare(`INSERT INTO ac_clases (business_id, curso_id, n, fecha, ini, fin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(curso_id, n) DO UPDATE SET fecha = excluded.fecha, ini = excluded.ini, fin = excluded.fin, updated_at = excluded.updated_at`).bind(c.businessId, cursoId, i + 1, s.fecha, s.ini, s.fin, t, t));
  stmts.push(c.env.DB.prepare('DELETE FROM ac_clases WHERE business_id = ? AND curso_id = ? AND n > ?').bind(c.businessId, cursoId, ses.length));
  for (let i = 0; i < stmts.length; i += 50) await c.env.DB.batch(stmts.slice(i, i + 50));
}

export const ENTITIES = {
  cursos: { table: 'ac_cursos', label: 'el curso', title: 'nombre', search: ['nombre', 'descripcion'], order: "activo DESC, COALESCE(inicio, '9999') DESC, nombre", crear: 'manager',
    fields: { nombre: 'text!', area_id: 'int', nivel: 'text', precio: 'money', inicial: 'money', descripcion: 'long', activo: 'bool+', profesional_id: 'int', jornada: 'text',
      inicio: 'date', num_clases: 'int', festivos: 'bool+', horario: 'json', plan: 'json' },
    refs: { area_id: 'ac_areas', profesional_id: 'ac_profesionales' },
    beforeCreate(c, row) { validarCurso(row); },
    beforeUpdate(c, row) { validarCurso(row); },
    async afterCreate(c, id) { await regenerarClases(c, id); },
    async afterUpdate(c, id, row) { if (['inicio', 'num_clases', 'horario', 'festivos'].some((k) => k in row)) await regenerarClases(c, id); },
    async beforeDelete(c, before) {
      if (await one(c.env, 'SELECT 1 FROM ac_inscripciones WHERE business_id = ? AND curso_id = ?', c.businessId, before.id)) throw new HttpError(409, 'El curso tiene matrículas: márcalo como inactivo en vez de borrarlo');
    },
    async afterDelete(c, before) {
      await c.env.DB.batch(['ac_clases', 'ac_evaluaciones', 'ac_cupones'].map((t) => c.env.DB.prepare(`DELETE FROM ${t} WHERE business_id = ? AND curso_id = ?`).bind(c.businessId, before.id)));
    },
    decorate(c, rows) { return rows.map((k) => ({ ...k, horario: parse(k.horario, []), plan: parse(k.plan, []) })); } },
  evaluaciones: { table: 'ac_evaluaciones', label: 'la evaluación', title: 'nombre', search: ['nombre'], order: 'curso_id, COALESCE(clase_n, 999), id', crear: 'manager',
    fields: { curso_id: 'int!', nombre: 'text!', peso: 'int', clase_n: 'int', tipo: ['examen', 'multiple'], examen: 'doc', materiales: 'json' },
    refs: { curso_id: 'ac_cursos' },
    beforeCreate(c, row) { return validarEval(c, row); }, beforeUpdate(c, row) { return validarEval(c, row); },
    async afterDelete(c, before) {
      for (const f of await all(c.env, 'SELECT archivos FROM ac_examenes WHERE business_id = ? AND evaluacion_id = ?', c.businessId, before.id)) for (const a of parse(f.archivos, [])) await c.env.FILES?.delete(a.key);
      await c.env.DB.batch(['ac_notas', 'ac_examenes'].map((t) => c.env.DB.prepare(`DELETE FROM ${t} WHERE business_id = ? AND evaluacion_id = ?`).bind(c.businessId, before.id)));
    } },
  cupones: { table: 'ac_cupones', label: 'el cupón', title: 'codigo', search: ['codigo'], order: 'curso_id, codigo', crear: 'manager',
    fields: { curso_id: 'int!', codigo: 'text!', tipo: ['valor', 'pct'], valor: 'money', hasta: 'date', max: 'int' },
    refs: { curso_id: 'ac_cursos' },
    beforeCreate(c, row) { validarCupon(row); }, beforeUpdate(c, row) { validarCupon(row); } },
};
async function validarEval(c, row) {
  if ('materiales' in row && row.materiales) {   // solo materiales de este negocio, sin repetir
    const ids = [...new Set(row.materiales.map(Number).filter(Number.isInteger))].slice(0, 30);
    const ok = ids.length ? new Set((await all(c.env, `SELECT id FROM ac_material WHERE business_id = ? AND id IN (${ids.map(() => '?').join(',')})`, c.businessId, ...ids)).map((x) => x.id)) : new Set();
    row.materiales = JSON.stringify(ids.filter((id) => ok.has(id)));
  }
  if ('peso' in row && row.peso != null && (row.peso < 0 || row.peso > 100)) throw new HttpError(400, 'El peso va de 0 a 100');
  if ('examen' in row && row.examen) {
    let ex; try { ex = JSON.parse(row.examen); } catch { throw new HttpError(400, 'El examen no es un JSON válido'); }
    row.examen = JSON.stringify(limpiarExamen(ex));
    if (row.examen.length > 120000) throw new HttpError(400, 'El examen es demasiado grande');
  }
}
function validarCupon(row) {
  if ('codigo' in row && row.codigo) row.codigo = row.codigo.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30);
  if (row.tipo === 'pct' && row.valor > 100) throw new HttpError(400, 'Un porcentaje no puede pasar de 100');
}

// Inscritos de un curso con su asistencia, notas y estado académico.
// Alerta de mora: si está vencida y cuántos días; el valor solo lo ve quien administra.
export const moraDe = (vencidas, manager) => ({ en_mora: vencidas.length > 0, mora_cuotas: vencidas.length, mora_dias: vencidas.reduce((m, q) => Math.max(m, q.dias_mora || 0), 0), mora_valor: manager ? vencidas.reduce((s, q) => s + q.falta, 0) : null });
export async function inscritosCurso(c, cursoId, cfg) {
  const manager = ['owner', 'admin'].includes(c.role);
  const car = (await cartera(c)).filter((q) => q.estado === 'vencida');
  const [ins, asis, notas, evs, repos] = await Promise.all([
    all(c.env, `SELECT i.id, i.estudiante_id, i.estado, e.nombre, e.documento, e.telefono FROM ac_inscripciones i JOIN ac_estudiantes e ON e.id = i.estudiante_id AND e.business_id = i.business_id
      WHERE i.business_id = ? AND i.curso_id = ? AND i.estado <> 'retirada' ORDER BY e.nombre`, c.businessId, cursoId),
    all(c.env, 'SELECT a.inscripcion_id, a.clase_n, a.estado FROM ac_asistencia a JOIN ac_inscripciones i ON i.id = a.inscripcion_id WHERE a.business_id = ? AND i.curso_id = ?', c.businessId, cursoId),
    all(c.env, 'SELECT n.inscripcion_id, n.evaluacion_id, n.nota FROM ac_notas n JOIN ac_inscripciones i ON i.id = n.inscripcion_id WHERE n.business_id = ? AND i.curso_id = ?', c.businessId, cursoId),
    all(c.env, 'SELECT id, nombre, peso, clase_n FROM ac_evaluaciones WHERE business_id = ? AND curso_id = ? ORDER BY COALESCE(clase_n, 999), id', c.businessId, cursoId),
    all(c.env, "SELECT r.inscripcion_id, r.clase_n FROM ac_reposiciones r JOIN ac_inscripciones i ON i.id = r.inscripcion_id WHERE r.business_id = ? AND i.curso_id = ? AND r.estado = 'hecha'", c.businessId, cursoId),
  ]);
  return ins.map((i) => {
    const a = asis.filter((x) => x.inscripcion_id === i.id), n = notas.filter((x) => x.inscripcion_id === i.id);
    const ra = resumenAsis(a, new Set(repos.filter((x) => x.inscripcion_id === i.id).map((x) => x.clase_n))), rn = resumenNotas(n, evs);
    return { ...i, asistencia: Object.fromEntries(a.map((x) => [x.clase_n, x.estado])), notas: Object.fromEntries(n.map((x) => [x.evaluacion_id, x.nota])),
      resumen_asistencia: ra, resumen_notas: rn, academico: estadoAcad(ra, rn, cfg),
      ...moraDe(car.filter((q) => q.inscripcion_id === i.id), manager), baja_asistencia: ra.pct != null && ra.pct < cfg.asisMin };
  });
}

async function cursoDe(c, id) {
  const k = await one(c.env, 'SELECT * FROM ac_cursos WHERE id = ? AND business_id = ?', id, c.businessId);
  if (!k) throw new HttpError(404, 'Curso no encontrado');
  return k;
}
async function inscripcionesDe(c, cursoId, ids) {
  const ok = new Set((await all(c.env, 'SELECT id FROM ac_inscripciones WHERE business_id = ? AND curso_id = ?', c.businessId, cursoId)).map((x) => x.id));
  for (const id of ids) if (!ok.has(Number(id))) throw new HttpError(400, 'Hay una matrícula que no es de este curso');
}

export function routes(r) {
  crud(r, { base: '/api/cursos', modulo: MOD, entities: ENTITIES });

  r.get('/api/cursos/lista', 'tenant', async (c) => json({ cursos: await all(c.env, 'SELECT id, nombre, nivel, precio, inicial, area_id, activo, inicio, num_clases FROM ac_cursos WHERE business_id = ? ORDER BY activo DESC, nombre', c.businessId) }));

  // Tarjetas de la lista: el curso con docente, área, matriculados y avance (clases dictadas de N).
  r.get('/api/cursos/tarjetas', `tenant:${MOD}`, async (c) => {
    const hoy = today(), q = (c.url.searchParams.get('q') || '').trim().toLowerCase(), act = c.url.searchParams.get('activo');
    const [cursos, fechas, ins] = await Promise.all([
      all(c.env, `SELECT k.*, a.nombre AS area, a.color AS area_color, p.nombre AS profesional FROM ac_cursos k LEFT JOIN ac_areas a ON a.id = k.area_id AND a.business_id = k.business_id
        LEFT JOIN ac_profesionales p ON p.id = k.profesional_id AND p.business_id = k.business_id WHERE k.business_id = ? ORDER BY k.activo DESC, COALESCE(k.inicio, '9999') DESC, k.nombre`, c.businessId),
      all(c.env, 'SELECT curso_id, MIN(fecha) AS ini, MAX(fecha) AS fin, SUM(CASE WHEN fecha < ? THEN 1 ELSE 0 END) AS dictadas FROM ac_clases WHERE business_id = ? AND fecha IS NOT NULL GROUP BY curso_id', hoy, c.businessId),
      all(c.env, "SELECT curso_id, COUNT(*) AS n FROM ac_inscripciones WHERE business_id = ? AND estado <> 'retirada' GROUP BY curso_id", c.businessId),
    ]);
    const rows = cursos.filter((k) => (act === null || act === '' || String(k.activo) === act) && (!q || `${k.nombre} ${k.descripcion || ''}`.toLowerCase().includes(q))).map((k) => {
      const f = fechas.find((x) => x.curso_id === k.id), fin = f?.fin || null;
      const estado = !k.inicio ? 'Sin programar' : hoy < k.inicio ? 'Por iniciar' : fin && hoy > fin ? 'Finalizado' : 'En curso';
      return { ...k, horario: parse(k.horario, []), plan: parse(k.plan, []), fin, dictadas: f?.dictadas || 0, estado, inscritos: ins.find((x) => x.curso_id === k.id)?.n || 0 };
    });
    return json({ rows });
  });

  // «Calcular clases y revisar choques»: fechas de las N clases con el horario dado y, para cada una, con qué otras clases del
  // mismo profesional o del mismo área se cruza, y si cae fuera de la disponibilidad del profesional.
  r.post('/api/cursos/calcular', `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req), row = { horario: Array.isArray(b.horario) ? b.horario : [] };
    validarCurso(row);
    const horario = parse(row.horario, []), N = Math.min(300, Math.max(0, Number(b.num_clases) || 0));
    const inicio = b.inicio && DATE.test(b.inicio) ? b.inicio : null;
    // Con `clases` se revisan las fechas ya editadas a mano; sin ellas se calculan del horario.
    const ses = Array.isArray(b.clases) && b.clases.length
      ? b.clases.slice(0, 300).map((x) => ({ fecha: x.fecha && DATE.test(x.fecha) ? x.fecha : null, ini: HORA.test(x.ini) ? x.ini : null, fin: HORA.test(x.fin) ? x.fin : null }))
      : sesiones({ inicio, num_clases: N, horario, festivos: !!b.festivos });
    const cursoId = Number(b.curso_id) || 0, prof = Number(b.profesional_id) || 0, area = Number(b.area_id) || 0;
    const fechas = ses.map((x) => x.fecha).filter(Boolean).sort();
    const otros = fechas.length && (prof || area) ? await all(c.env, `SELECT cl.fecha, cl.ini, cl.fin, cl.n, k.nombre, k.profesional_id FROM ac_clases cl JOIN ac_cursos k ON k.id = cl.curso_id AND k.business_id = cl.business_id
        WHERE cl.business_id = ? AND k.activo = 1 AND k.id <> ? AND cl.fecha BETWEEN ? AND ? AND (k.profesional_id = ? OR k.area_id = ?)`, c.businessId, cursoId, fechas[0], fechas.at(-1), prof || -1, area || -1) : [];
    const disp = prof ? parse((await one(c.env, 'SELECT horario FROM ac_profesionales WHERE id = ? AND business_id = ?', prof, c.businessId))?.horario, []) : [];
    const solapa = (x, y) => x.ini && x.fin && y.ini && y.fin && x.ini < y.fin && y.ini < x.fin;
    const clases = ses.map((x, i) => {
      const dia = x.fecha ? new Date(`${x.fecha}T12:00:00Z`).getUTCDay() : null;
      return { n: i + 1, ...x,
        choques: x.fecha ? otros.filter((o) => o.fecha === x.fecha && solapa(x, o)).map((o) => ({ curso: o.nombre, n: o.n, motivo: prof && o.profesional_id === prof ? 'profesional' : 'área' })) : [],
        fuera: !!(x.fecha && disp.length && !disp.some((d) => d.dia === dia && d.ini <= x.ini && d.fin >= x.fin)) };
    });
    return json({ clases, inicio: fechas[0] || null, fin: fechas.at(-1) || null });
  });

  r.get('/api/cursos/:id/detalle', `tenant:${MOD}`, async (c) => {
    const k = await cursoDe(c, Number(c.params.id));
    const cfg = await getConfig(c.env, c.businessId);
    const [clases, evs, cupones, inscritos, area, prof] = await Promise.all([
      all(c.env, 'SELECT n, fecha, ini, fin, movida, tema, detalle, metodos, materiales, virtual, material_id, material2_id FROM ac_clases WHERE business_id = ? AND curso_id = ? ORDER BY n', c.businessId, k.id),
      all(c.env, 'SELECT id, nombre, peso, clase_n, tipo, examen, materiales FROM ac_evaluaciones WHERE business_id = ? AND curso_id = ? ORDER BY COALESCE(clase_n, 999), id', c.businessId, k.id),
      all(c.env, 'SELECT id, codigo, tipo, valor, hasta, max, usos FROM ac_cupones WHERE business_id = ? AND curso_id = ? ORDER BY codigo', c.businessId, k.id),
      inscritosCurso(c, k.id, cfg),
      k.area_id ? one(c.env, 'SELECT nombre, color FROM ac_areas WHERE id = ? AND business_id = ?', k.area_id, c.businessId) : null,
      k.profesional_id ? one(c.env, 'SELECT nombre FROM ac_profesionales WHERE id = ? AND business_id = ?', k.profesional_id, c.businessId) : null,
    ]);
    const hoy = today(), fechas = clases.map((x) => x.fecha).filter(Boolean);
    const fin = fechas.length ? fechas[fechas.length - 1] : null;
    const estado = !k.inicio ? 'Sin programar' : hoy < k.inicio ? 'Por iniciar' : fin && hoy > fin ? 'Finalizado' : 'En curso';
    return json({ curso: { ...k, horario: parse(k.horario, []), plan: parse(k.plan, []), area: area?.nombre || null, profesional: prof?.nombre || null, estado, fin,
      dictadas: fechas.filter((f) => f < hoy).length },
      clases: clases.map((x) => ({ ...x, metodos: parse(x.metodos, []) })), evaluaciones: evs.map((e) => ({ ...e, examen: parse(e.examen, null), materiales: parse(e.materiales, []) })), cupones, inscritos, config: { escala: cfg.escala, notaMin: cfg.notaMin, asisMin: cfg.asisMin } });
  });

  r.patch('/api/cursos/:id/clases/:n', `tenant:${MOD}`, async (c) => {
    const k = await cursoDe(c, Number(c.params.id)), n = Number(c.params.n);
    const cl = await one(c.env, 'SELECT * FROM ac_clases WHERE business_id = ? AND curso_id = ? AND n = ?', c.businessId, k.id, n);
    if (!cl) throw new HttpError(404, 'Clase no encontrada');
    const b = await readJson(c.req), set = {};
    for (const [key, type] of [['tema', 'text'], ['detalle', 'long'], ['materiales', 'long']]) if (key in b) set[key] = cast(key, type, b[key]);
    if ('metodos' in b) set.metodos = JSON.stringify((Array.isArray(b.metodos) ? b.metodos : []).filter((m) => METODOS.includes(m)));
    if ('virtual' in b) set.virtual = b.virtual ? 1 : 0;
    if ('material_id' in b) {
      const mid = cast('material', 'int', b.material_id);
      const mat = mid && await one(c.env, 'SELECT titulo, descripcion FROM ac_material WHERE id = ? AND business_id = ?', mid, c.businessId);
      if (mid && !mat) throw new HttpError(400, 'Material no válido');
      set.material_id = mid;
      // El tema y el concepto de la clase los da el material.
      Object.assign(set, { tema: mat ? mat.titulo : '', detalle: mat ? (mat.descripcion || '') : '' });
    }
    if ('material2_id' in b) {   // segundo material de la clase (no cambia el tema)
      const mid = cast('material', 'int', b.material2_id);
      if (mid && !await one(c.env, 'SELECT 1 FROM ac_material WHERE id = ? AND business_id = ?', mid, c.businessId)) throw new HttpError(400, 'Material no válido');
      set.material2_id = mid;
    }
    if (['fecha', 'ini', 'fin'].some((x) => x in b)) {
      if (!['owner', 'admin'].includes(c.role)) throw new HttpError(403, 'Solo el propietario o un administrador mueve una clase');
      const fecha = 'fecha' in b ? cast('fecha', 'date', b.fecha) : cl.fecha, ini = b.ini ?? cl.ini, fin = b.fin ?? cl.fin;
      if ((ini && !HORA.test(ini)) || (fin && !HORA.test(fin)) || (ini && fin && fin <= ini)) throw new HttpError(400, 'Hora no válida');
      Object.assign(set, { fecha, ini, fin, movida: 1 });
    }
    const cols = Object.keys(set);
    if (cols.length) await c.env.DB.prepare(`UPDATE ac_clases SET ${cols.map((x) => `${x} = ?`).join(', ')}, updated_at = ? WHERE business_id = ? AND curso_id = ? AND n = ?`).bind(...cols.map((x) => set[x]), now(), c.businessId, k.id, n).run();
    await audit(c, `Editó la clase ${n} de «${k.nombre}»`, { modulo: MOD });
    return json({ ok: true });
  });

  r.post('/api/cursos/:id/asistencia', `tenant:${MOD}`, async (c) => {
    const k = await cursoDe(c, Number(c.params.id)), b = await readJson(c.req);
    const n = cast('clase', 'int!', b.clase_n);
    if (n < 1 || n > k.num_clases) throw new HttpError(400, 'Clase fuera del curso');
    const marcas = Array.isArray(b.marcas) ? b.marcas.slice(0, 500) : [];
    await inscripcionesDe(c, k.id, marcas.map((m) => m.inscripcion_id));
    const t = now(), stmts = marcas.map((m) => (['P', 'A', 'T', 'J'].includes(m.estado)
      ? c.env.DB.prepare(`INSERT INTO ac_asistencia (business_id, inscripcion_id, clase_n, estado, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(inscripcion_id, clase_n) DO UPDATE SET estado = excluded.estado, updated_by = excluded.updated_by, updated_at = excluded.updated_at`).bind(c.businessId, Number(m.inscripcion_id), n, m.estado, c.session.user_id, t)
      : c.env.DB.prepare('DELETE FROM ac_asistencia WHERE business_id = ? AND inscripcion_id = ? AND clase_n = ?').bind(c.businessId, Number(m.inscripcion_id), n)));
    for (let i = 0; i < stmts.length; i += 50) await c.env.DB.batch(stmts.slice(i, i + 50));
    await audit(c, `Tomó asistencia de la clase ${n} de «${k.nombre}» (${marcas.length})`, { modulo: MOD });
    return json({ ok: true });
  });

  r.post('/api/cursos/:id/notas', `tenant:${MOD}`, async (c) => {
    const k = await cursoDe(c, Number(c.params.id)), b = await readJson(c.req);
    const ev = await one(c.env, 'SELECT id, nombre FROM ac_evaluaciones WHERE id = ? AND business_id = ? AND curso_id = ?', cast('evaluación', 'int!', b.evaluacion_id), c.businessId, k.id);
    if (!ev) throw new HttpError(400, 'Evaluación no válida');
    const cfg = await getConfig(c.env, c.businessId);
    const notas = Array.isArray(b.notas) ? b.notas.slice(0, 500) : [];
    await inscripcionesDe(c, k.id, notas.map((x) => x.inscripcion_id));
    const t = now(), stmts = notas.map((x) => {
      if (x.nota === null || x.nota === '' || x.nota === undefined) return c.env.DB.prepare('DELETE FROM ac_notas WHERE business_id = ? AND inscripcion_id = ? AND evaluacion_id = ?').bind(c.businessId, Number(x.inscripcion_id), ev.id);
      const v = Math.round(Number(String(x.nota).replace(',', '.')) * 100) / 100;
      if (!Number.isFinite(v) || v < 0 || v > cfg.escala) throw new HttpError(400, `Las notas van de 0 a ${cfg.escala}`);
      return c.env.DB.prepare(`INSERT INTO ac_notas (business_id, inscripcion_id, evaluacion_id, nota, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(inscripcion_id, evaluacion_id) DO UPDATE SET nota = excluded.nota, updated_by = excluded.updated_by, updated_at = excluded.updated_at`).bind(c.businessId, Number(x.inscripcion_id), ev.id, v, c.session.user_id, t);
    });
    for (let i = 0; i < stmts.length; i += 50) await c.env.DB.batch(stmts.slice(i, i + 50));
    await audit(c, `Puso notas de «${ev.nombre}» en «${k.nombre}» (${notas.length})`, { modulo: MOD });
    return json({ ok: true });
  });


  /* ---------- exámenes de cada estudiante ---------- */
  const MAX_EXAMEN = 20 * 1024 * 1024;
  async function examenCtx(c) {
    const k = await cursoDe(c, Number(c.params.id)), evId = Number(c.params.ev), insId = Number(c.params.insc);
    const ev = await one(c.env, 'SELECT id, nombre, tipo, examen FROM ac_evaluaciones WHERE id = ? AND business_id = ? AND curso_id = ?', evId, c.businessId, k.id);
    if (!ev) throw new HttpError(404, 'Evaluación no encontrada');
    await inscripcionesDe(c, k.id, [insId]);
    const ins = await one(c.env, 'SELECT e.nombre FROM ac_inscripciones i JOIN ac_estudiantes e ON e.id = i.estudiante_id AND e.business_id = i.business_id WHERE i.id = ? AND i.business_id = ?', insId, c.businessId);
    const row = await one(c.env, 'SELECT resp, manual, archivos FROM ac_examenes WHERE business_id = ? AND inscripcion_id = ? AND evaluacion_id = ?', c.businessId, insId, ev.id);
    return { k, ev: { ...ev, examen: parse(ev.examen, null) }, insId, estudiante: ins?.nombre, ex: { resp: parse(row?.resp, {}), manual: parse(row?.manual, {}), archivos: parse(row?.archivos, []) } };
  }
  const guardarExamen = (c, x) => c.env.DB.prepare(`INSERT INTO ac_examenes (business_id, inscripcion_id, evaluacion_id, resp, manual, archivos, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(inscripcion_id, evaluacion_id) DO UPDATE SET resp = excluded.resp, manual = excluded.manual, archivos = excluded.archivos, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .bind(c.businessId, x.insId, x.ev.id, JSON.stringify(x.ex.resp), JSON.stringify(x.ex.manual), JSON.stringify(x.ex.archivos), c.session.user_id, now()).run();
  const vistaExamen = async (c, x) => {
    const cfg = await getConfig(c.env, c.businessId), cal = calificar(x.ev.examen, x.ex);
    return { evaluacion: x.ev, estudiante: x.estudiante, ...x.ex, calificacion: cal, escala: cfg.escala, nota: cal.total ? Math.round(cal.pct * cfg.escala * 10) / 10 : null };
  };

  // Qué exámenes tienen respuestas o archivos (para los iconos de la pestaña Notas).
  r.get('/api/cursos/:id/examenes', `tenant:${MOD}`, async (c) => {
    const k = await cursoDe(c, Number(c.params.id));
    const rows = await all(c.env, `SELECT x.inscripcion_id, x.evaluacion_id, x.resp, x.archivos FROM ac_examenes x JOIN ac_evaluaciones e ON e.id = x.evaluacion_id AND e.business_id = x.business_id WHERE x.business_id = ? AND e.curso_id = ?`, c.businessId, k.id);
    return json({ rows: rows.map((x) => ({ inscripcion_id: x.inscripcion_id, evaluacion_id: x.evaluacion_id, archivos: parse(x.archivos, []).length, respondidas: Object.keys(parse(x.resp, {})).length })) });
  });
  r.get('/api/cursos/:id/examenes/:ev/:insc', `tenant:${MOD}`, async (c) => json(await vistaExamen(c, await examenCtx(c))));
  r.put('/api/cursos/:id/examenes/:ev/:insc', `tenant:${MOD}`, async (c) => {
    const x = await examenCtx(c), b = await readJson(c.req);
    const limpio = limpiarRespuestas(x.ev.examen, b.resp, b.manual);
    x.ex.resp = limpio.resp; x.ex.manual = limpio.manual;
    await guardarExamen(c, x);
    return json(await vistaExamen(c, x));
  });
  r.post('/api/cursos/:id/examenes/:ev/:insc/aplicar', `tenant:${MOD}`, async (c) => {
    const x = await examenCtx(c), v = await vistaExamen(c, x);
    if (v.nota === null) throw new HttpError(400, 'Este examen no tiene preguntas para calificar');
    await c.env.DB.prepare(`INSERT INTO ac_notas (business_id, inscripcion_id, evaluacion_id, nota, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(inscripcion_id, evaluacion_id) DO UPDATE SET nota = excluded.nota, updated_by = excluded.updated_by, updated_at = excluded.updated_at`).bind(c.businessId, x.insId, x.ev.id, Math.min(v.escala, v.nota), c.session.user_id, now()).run();
    await audit(c, `Aplicó la nota ${v.nota} del examen «${x.ev.nombre}» a ${x.estudiante}`, { modulo: MOD });
    return json({ nota: v.nota });
  });
  r.post('/api/cursos/:id/examenes/:ev/:insc/archivo', `tenant:${MOD}`, async (c) => {
    if (!c.env.FILES) throw new HttpError(501, 'Esta app no tiene almacenamiento de archivos configurado');
    const x = await examenCtx(c);
    if (Number(c.req.headers.get('content-length') || 0) > MAX_EXAMEN) throw new HttpError(413, 'El archivo supera los 20 MB');
    const body = await c.req.arrayBuffer();
    if (!body.byteLength) throw new HttpError(400, 'El archivo está vacío');
    if (body.byteLength > MAX_EXAMEN) throw new HttpError(413, 'El archivo supera los 20 MB');
    const type = (c.req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!/^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/.test(type)) throw new HttpError(400, 'Solo fotos (JPG, PNG, WEBP) o PDF');
    const nombre = String(c.url.searchParams.get('nombre') || 'examen').replace(/[^\w.\- ]+/g, '_').slice(0, 100);
    const key = `${c.businessId}/examen/${crypto.randomUUID()}-${nombre}`;
    await c.env.FILES.put(key, body, { httpMetadata: { contentType: type } });
    x.ex.archivos.push({ key, nombre, tipoArchivo: type, size: body.byteLength });
    if (x.ex.archivos.length > 20) throw new HttpError(400, 'Máximo 20 archivos por examen');
    await guardarExamen(c, x);
    await audit(c, `Subió el examen «${x.ev.nombre}» de ${x.estudiante}`, { modulo: MOD });
    return json({ archivos: x.ex.archivos }, 201);
  });
  r.delete('/api/cursos/:id/examenes/:ev/:insc/archivo/:key', `tenant:${MOD}`, async (c) => {
    const x = await examenCtx(c), key = c.params.key;
    if (!key.startsWith(`${c.businessId}/examen/`)) throw new HttpError(404, 'No encontrado');
    if (!x.ex.archivos.some((a) => a.key === key)) throw new HttpError(404, 'Archivo no encontrado');
    x.ex.archivos = x.ex.archivos.filter((a) => a.key !== key);
    await guardarExamen(c, x);
    await c.env.FILES?.delete(key);
    return json({ archivos: x.ex.archivos });
  });
  r.get('/api/cursos/examen-archivo/:key', `tenant:${MOD}`, async (c) => {
    const key = c.params.key;
    if (!key.startsWith(`${c.businessId}/examen/`)) throw new HttpError(404, 'No encontrado');
    const obj = c.env.FILES && await c.env.FILES.get(key);
    if (!obj) throw new HttpError(404, 'No encontrado');
    return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || 'application/octet-stream', 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff',
      'content-disposition': c.url.searchParams.get('dl') === '1' ? `attachment; filename*=UTF-8''${encodeURIComponent(key.split('/').pop().replace(/^[0-9a-f-]{36}-/, ''))}` : 'inline' } });
  });

  r.get('/api/cursos/calendario', `tenant:${MOD}`, async (c) => {
    const q = c.url.searchParams;
    const desde = DATE.test(q.get('desde') || '') ? q.get('desde') : today(), hasta = DATE.test(q.get('hasta') || '') ? q.get('hasta') : addDays(desde, 6);
    const [clases, espacios] = await Promise.all([
      all(c.env, `SELECT cl.curso_id, cl.n, cl.fecha, cl.ini, cl.fin, cl.tema, cl.virtual, k.nombre AS curso, k.num_clases, a.color, p.nombre AS profesional FROM ac_clases cl
        JOIN ac_cursos k ON k.id = cl.curso_id AND k.business_id = cl.business_id LEFT JOIN ac_areas a ON a.id = k.area_id AND a.business_id = k.business_id
        LEFT JOIN ac_profesionales p ON p.id = k.profesional_id AND p.business_id = k.business_id
        WHERE cl.business_id = ? AND cl.fecha BETWEEN ? AND ? AND k.activo = 1 ORDER BY cl.fecha, cl.ini`, c.businessId, desde, hasta),
      all(c.env, `SELECT s.id, s.fecha, s.ini, s.fin, s.cupos, s.notas, p.nombre AS profesional, (SELECT COUNT(*) FROM ac_reposiciones r WHERE r.espacio_id = s.id AND r.business_id = s.business_id) AS ocupados
        FROM ac_espacios s LEFT JOIN ac_profesionales p ON p.id = s.profesional_id AND p.business_id = s.business_id WHERE s.business_id = ? AND s.fecha BETWEEN ? AND ? ORDER BY s.fecha, s.ini`, c.businessId, desde, hasta).catch(() => []),
    ]);
    // Las evaluaciones se ponen en Notas, en una clase: el calendario marca esa clase con su parcial
    if (clases.length) {
      const evs = await all(c.env, `SELECT curso_id, clase_n, nombre, tipo, peso FROM ac_evaluaciones WHERE business_id = ? AND clase_n IS NOT NULL AND curso_id IN (${[...new Set(clases.map((x) => x.curso_id))].map(() => '?').join(',')})`, c.businessId, ...new Set(clases.map((x) => x.curso_id)));
      for (const cl of clases) cl.evaluaciones = evs.filter((e) => e.curso_id === cl.curso_id && e.clase_n === cl.n).map((e) => ({ nombre: e.nombre, tipo: e.tipo, peso: e.peso }));
    }
    return json({ desde, hasta, clases, espacios });
  });

  r.get('/api/cursos/resumen', `tenant:${MOD}`, async (c) => {
    const h = await all(c.env, `SELECT cl.ini, k.nombre FROM ac_clases cl JOIN ac_cursos k ON k.id = cl.curso_id AND k.business_id = cl.business_id
      WHERE cl.business_id = ? AND cl.fecha = ? AND k.activo = 1 ORDER BY cl.ini`, c.businessId, today());
    const act = await one(c.env, 'SELECT COUNT(*) n FROM ac_cursos WHERE business_id = ? AND activo = 1', c.businessId);
    return json({ titulo: 'Clases de hoy', valor: h.length, detalle: h.length ? h.slice(0, 3).map((x) => `${x.ini || ''} ${x.nombre}`.trim()).join(' · ') : `${act.n} cursos activos`, icono: 'bi-journal-bookmark', ruta: '/staff/cursos.html' });
  });
}
