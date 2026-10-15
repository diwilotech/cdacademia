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
import { json, readJson, HttpError } from '../lib/http.js';
import { crud, all, one, now, today, cast, addDays, DATE } from '../lib/crud.js';
import { audit } from '../lib/audit.js';
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
    fields: { nombre: 'text!', area_id: 'int', nivel: 'text', precio: 'money', descripcion: 'long', activo: 'bool+', profesional_id: 'int', jornada: 'text',
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
    fields: { curso_id: 'int!', nombre: 'text!', peso: 'int', clase_n: 'int', examen: 'text' },
    refs: { curso_id: 'ac_cursos' },
    beforeCreate(c, row) { validarEval(row); }, beforeUpdate(c, row) { validarEval(row); },
    async afterDelete(c, before) { await c.env.DB.prepare('DELETE FROM ac_notas WHERE business_id = ? AND evaluacion_id = ?').bind(c.businessId, before.id).run(); } },
  cupones: { table: 'ac_cupones', label: 'el cupón', title: 'codigo', search: ['codigo'], order: 'curso_id, codigo', crear: 'manager',
    fields: { curso_id: 'int!', codigo: 'text!', tipo: ['valor', 'pct'], valor: 'money', hasta: 'date', max: 'int' },
    refs: { curso_id: 'ac_cursos' },
    beforeCreate(c, row) { validarCupon(row); }, beforeUpdate(c, row) { validarCupon(row); } },
};
function validarEval(row) {
  if ('peso' in row && row.peso != null && (row.peso < 0 || row.peso > 100)) throw new HttpError(400, 'El peso va de 0 a 100');
  if ('examen' in row && row.examen) {
    let ex; try { ex = JSON.parse(row.examen); } catch { throw new HttpError(400, 'El examen no es un JSON válido'); }
    if (!ex || !Array.isArray(ex.preguntas)) throw new HttpError(400, 'El examen necesita una lista de preguntas');
    if (row.examen.length > 60000) throw new HttpError(400, 'El examen es demasiado grande');
  }
}
function validarCupon(row) {
  if ('codigo' in row && row.codigo) row.codigo = row.codigo.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30);
  if (row.tipo === 'pct' && row.valor > 100) throw new HttpError(400, 'Un porcentaje no puede pasar de 100');
}

// Inscritos de un curso con su asistencia, notas y estado académico.
export async function inscritosCurso(c, cursoId, cfg) {
  const [ins, asis, notas, evs, repos] = await Promise.all([
    all(c.env, `SELECT i.id, i.estudiante_id, i.estado, e.nombre, e.telefono FROM ac_inscripciones i JOIN ac_estudiantes e ON e.id = i.estudiante_id AND e.business_id = i.business_id
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
      resumen_asistencia: ra, resumen_notas: rn, academico: estadoAcad(ra, rn, cfg) };
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

  r.get('/api/cursos/lista', 'tenant', async (c) => json({ cursos: await all(c.env, 'SELECT id, nombre, nivel, precio, area_id, activo, inicio, num_clases FROM ac_cursos WHERE business_id = ? ORDER BY activo DESC, nombre', c.businessId) }));

  r.get('/api/cursos/:id/detalle', `tenant:${MOD}`, async (c) => {
    const k = await cursoDe(c, Number(c.params.id));
    const cfg = await getConfig(c.env, c.businessId);
    const [clases, evs, cupones, inscritos, area, prof] = await Promise.all([
      all(c.env, 'SELECT n, fecha, ini, fin, movida, tema, detalle, metodos, materiales, virtual, material_id FROM ac_clases WHERE business_id = ? AND curso_id = ? ORDER BY n', c.businessId, k.id),
      all(c.env, 'SELECT id, nombre, peso, clase_n, examen FROM ac_evaluaciones WHERE business_id = ? AND curso_id = ? ORDER BY COALESCE(clase_n, 999), id', c.businessId, k.id),
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
      clases: clases.map((x) => ({ ...x, metodos: parse(x.metodos, []) })), evaluaciones: evs.map((e) => ({ ...e, examen: parse(e.examen, null) })), cupones, inscritos, config: { escala: cfg.escala, notaMin: cfg.notaMin, asisMin: cfg.asisMin } });
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
      if (mid && !(await one(c.env, 'SELECT 1 FROM ac_material WHERE id = ? AND business_id = ?', mid, c.businessId))) throw new HttpError(400, 'Material no válido');
      set.material_id = mid;
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
    return json({ desde, hasta, clases, espacios });
  });

  r.get('/api/cursos/resumen', `tenant:${MOD}`, async (c) => {
    const h = await all(c.env, `SELECT cl.ini, k.nombre FROM ac_clases cl JOIN ac_cursos k ON k.id = cl.curso_id AND k.business_id = cl.business_id
      WHERE cl.business_id = ? AND cl.fecha = ? AND k.activo = 1 ORDER BY cl.ini`, c.businessId, today());
    const act = await one(c.env, 'SELECT COUNT(*) n FROM ac_cursos WHERE business_id = ? AND activo = 1', c.businessId);
    return json({ titulo: 'Clases de hoy', valor: h.length, detalle: h.length ? h.slice(0, 3).map((x) => `${x.ini || ''} ${x.nombre}`.trim()).join(' · ') : `${act.n} cursos activos`, icono: 'bi-journal-bookmark', ruta: '/staff/cursos.html' });
  });
}
