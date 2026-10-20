// Lo que hace el estudiante en cada clase: ve el material del día, sube su trabajo (entregas) y presenta las evaluaciones de esa clase.
// El material y el examen se abren el día de la clase (el material queda disponible después); el examen solo ese día y se envía una vez.
//   GET  /api/alumno/curso/:id/clase/:n                  la clase: material, evaluaciones y entregas
//   POST /api/alumno/curso/:id/clase/:n/entregas?nombre=  (cuerpo = archivo)  ·  DELETE /api/alumno/entregas/:eid  ·  GET /api/alumno/entregas/:eid/archivo
//   GET  /api/alumno/material/:key                       archivo de un material de una clase ya abierta
//   PUT  /api/alumno/curso/:id/evaluaciones/:ev          guarda borrador  ·  POST …/:ev/enviar  envía (y califica si todo se califica solo)
//   POST /api/alumno/curso/:id/evaluaciones/:ev/archivo?nombre=  foto o PDF del examen en papel  ·  GET /api/alumno/examen-archivo/:key
//   Equipo: GET /api/cursos/:id/entregas  ·  GET /api/cursos/entregas/:eid/archivo
import { json, readJson, HttpError } from '../lib/http.js';
import { all, one, now, today } from '../lib/crud.js';
import { audit } from '../lib/audit.js';
import { getConfig, parse } from '../lib/academia.js';
import { calificar, limpiarRespuestas } from '../lib/examen.js';
import { matriculas } from './alumno.js';

const MAX = 20 * 1024 * 1024;
const OK_ENTREGA = /^(image\/(png|jpe?g|gif|webp)|application\/(pdf|zip|msword|vnd\.openxmlformats-officedocument\.[\w.]+|vnd\.ms-(excel|powerpoint))|video\/(mp4|webm)|audio\/(mpeg|mp4|wav|ogg|webm)|text\/plain)$/;
const INLINE = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|video\/(mp4|webm)|audio\/(mpeg|mp4|wav|ogg|webm))$/;
const need = (env) => { if (!env.FILES) throw new HttpError(501, 'Esta app no tiene almacenamiento de archivos configurado'); return env.FILES; };
const limpioNombre = (n, d) => String(n || d).replace(/[^\w.\- ]+/g, '_').slice(0, 100);

async function leerArchivo(c, permitido, msg) {
  if (Number(c.req.headers.get('content-length') || 0) > MAX) throw new HttpError(413, 'El archivo supera los 20 MB');
  const body = await c.req.arrayBuffer();
  if (!body.byteLength) throw new HttpError(400, 'El archivo está vacío');
  if (body.byteLength > MAX) throw new HttpError(413, 'El archivo supera los 20 MB');
  const type = (c.req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!permitido.test(type)) throw new HttpError(400, msg);
  return { body, type };
}
const servir = async (c, key, type, nombre, forzarDescarga) => {
  const obj = await need(c.env).get(key);
  if (!obj) throw new HttpError(404, 'El archivo ya no está');
  const t = type || obj.httpMetadata?.contentType || 'application/octet-stream', inline = INLINE.test(t) && !forzarDescarga;
  return new Response(obj.body, { headers: { 'content-type': inline ? t : 'application/octet-stream', 'cache-control': 'private, max-age=300', 'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self'", 'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(nombre || key.split('/').pop())}` } });
};

// Pregunta sin la respuesta correcta (lo que ve el estudiante).
const sinRespuesta = (ex) => ({ instrucciones: ex.instrucciones || '', preguntas: (ex.preguntas || []).map((q) => ({ id: q.id, tipo: q.tipo, enunciado: q.enunciado, puntos: q.puntos, ...(q.opciones ? { opciones: q.opciones.map((o) => ({ id: o.id, texto: o.texto })) } : {}) })) });

export function routes(r) {
  const matricula = async (c) => {
    const i = (await matriculas(c, c.estudiante.id)).find((m) => m.id === Number(c.params.id));
    if (!i) throw new HttpError(404, 'No encontrado');
    return i;
  };
  const claseDe = async (c, i, n) => {
    const cl = await one(c.env, 'SELECT * FROM ac_clases WHERE business_id = ? AND curso_id = ? AND n = ?', c.businessId, i.curso_id, n);
    if (!cl) throw new HttpError(404, 'Clase no encontrada');
    return cl;
  };
  const evDe = async (c, i, evId) => {
    const ev = await one(c.env, 'SELECT id, nombre, peso, clase_n, tipo, examen FROM ac_evaluaciones WHERE id = ? AND business_id = ? AND curso_id = ?', evId, c.businessId, i.curso_id);
    if (!ev) throw new HttpError(404, 'Evaluación no encontrada');
    const cl = ev.clase_n ? await one(c.env, 'SELECT fecha FROM ac_clases WHERE business_id = ? AND curso_id = ? AND n = ?', c.businessId, i.curso_id, ev.clase_n) : null;
    const hoy = today(), abierta = ev.clase_n ? cl?.fecha === hoy : false;
    const row = await one(c.env, 'SELECT resp, archivos, enviado_at FROM ac_examenes WHERE business_id = ? AND inscripcion_id = ? AND evaluacion_id = ?', c.businessId, i.id, ev.id);
    return { ev: { ...ev, examen: parse(ev.examen, null) }, abierta, hoy, ex: { resp: parse(row?.resp, {}), archivos: parse(row?.archivos, []), enviado_at: row?.enviado_at || null } };
  };
  const guardar = (c, i, x, extra = {}) => c.env.DB.prepare(`INSERT INTO ac_examenes (business_id, inscripcion_id, evaluacion_id, resp, archivos, enviado_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(inscripcion_id, evaluacion_id) DO UPDATE SET resp = excluded.resp, archivos = excluded.archivos, enviado_at = excluded.enviado_at, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .bind(c.businessId, i.id, x.ev.id, JSON.stringify(x.ex.resp), JSON.stringify(x.ex.archivos), extra.enviado_at ?? x.ex.enviado_at, c.session.user_id, now()).run();
  const vistaEv = async (c, i, x) => {
    const cfg = await getConfig(c.env, c.businessId), nota = (await one(c.env, 'SELECT nota FROM ac_notas WHERE business_id = ? AND inscripcion_id = ? AND evaluacion_id = ?', c.businessId, i.id, x.ev.id))?.nota ?? null;
    const enviado = !!x.ex.enviado_at, cal = enviado && x.ev.examen ? calificar(x.ev.examen, { resp: x.ex.resp, manual: {} }) : null;
    return { id: x.ev.id, nombre: x.ev.nombre, peso: x.ev.peso, tipo: x.ev.tipo, enviado, abierta: x.abierta && !enviado, vencida: !x.abierta && !enviado && !!x.ev.clase_n && x.hoy > (x.fechaClase || ''),
      nota, escala: cfg.escala, resultado: cal && !cal.pendientes ? { obtenido: cal.obtenido, total: cal.total } : null, en_revision: enviado && (nota === null),
      examen: x.abierta && !enviado && x.ev.examen ? sinRespuesta(x.ev.examen) : null, resp: x.abierta && !enviado ? x.ex.resp : undefined, archivos: x.ex.archivos.map((a) => ({ key: a.key, nombre: a.nombre, tipoArchivo: a.tipoArchivo, size: a.size })) };
  };

  /* ---- la clase ---- */
  r.get('/api/alumno/curso/:id/clase/:n', 'alumno', async (c) => {
    const i = await matricula(c), cl = await claseDe(c, i, Number(c.params.n)), hoy = today();
    const base = { n: cl.n, fecha: cl.fecha, ini: cl.ini, fin: cl.fin, virtual: !!cl.virtual, hoy: cl.fecha === hoy };
    if (!cl.fecha || cl.fecha > hoy) return json({ ...base, bloqueada: true, tema: cl.tema || null });
    const mat = cl.material_id ? await one(c.env, 'SELECT titulo, descripcion, bloques FROM ac_material WHERE id = ? AND business_id = ?', cl.material_id, c.businessId) : null;
    const evs = await all(c.env, 'SELECT id FROM ac_evaluaciones WHERE business_id = ? AND curso_id = ? AND clase_n = ? ORDER BY id', c.businessId, i.curso_id, cl.n);
    const evaluaciones = [];
    for (const e of evs) { const x = await evDe(c, i, e.id); x.fechaClase = cl.fecha; evaluaciones.push(await vistaEv(c, i, x)); }
    const entregas = await all(c.env, 'SELECT id, nombre, mime, size, created_at FROM ac_entregas WHERE business_id = ? AND inscripcion_id = ? AND clase_n = ? ORDER BY id', c.businessId, i.id, cl.n);
    return json({ ...base, bloqueada: false, tema: cl.tema || mat?.titulo || null, detalle: cl.detalle || null, metodos: parse(cl.metodos, []), materiales: cl.materiales || null,
      material: mat ? { titulo: mat.titulo, descripcion: mat.descripcion, bloques: parse(mat.bloques, []) } : null, evaluaciones, entregas });
  });

  // Archivos del material: solo los de materiales de clases que el estudiante ya tiene abiertas
  r.get('/api/alumno/material/:key', 'alumno', async (c) => {
    const key = c.params.key;
    if (!key.startsWith(`${c.businessId}/material/`)) throw new HttpError(404, 'No encontrado');
    const ok = await one(c.env, `SELECT 1 FROM ac_inscripciones i JOIN ac_clases cl ON cl.curso_id = i.curso_id AND cl.business_id = i.business_id JOIN ac_material m ON m.id = cl.material_id AND m.business_id = cl.business_id
      WHERE i.business_id = ? AND i.estudiante_id = ? AND i.estado = 'activa' AND cl.fecha <= ? AND m.bloques LIKE ?`, c.businessId, c.estudiante.id, today(), `%${key.replace(/[%_]/g, '')}%`);
    if (!ok) throw new HttpError(404, 'No encontrado');
    return servir(c, key, null, null, c.url.searchParams.get('dl') === '1');
  });

  /* ---- entregas ---- */
  r.post('/api/alumno/curso/:id/clase/:n/entregas', 'alumno', async (c) => {
    const i = await matricula(c), cl = await claseDe(c, i, Number(c.params.n));
    if (!cl.fecha || cl.fecha > today()) throw new HttpError(409, 'Esta clase aún no empieza');
    if ((await one(c.env, 'SELECT COUNT(*) n FROM ac_entregas WHERE business_id = ? AND inscripcion_id = ? AND clase_n = ?', c.businessId, i.id, cl.n)).n >= 10) throw new HttpError(409, 'Máximo 10 archivos por clase');
    const { body, type } = await leerArchivo(c, OK_ENTREGA, 'Sube una foto, PDF, documento de Office, ZIP, video o audio');
    const nombre = limpioNombre(c.url.searchParams.get('nombre'), 'trabajo'), key = `${c.businessId}/entrega/${crypto.randomUUID()}-${nombre}`;
    await need(c.env).put(key, body, { httpMetadata: { contentType: type } });
    const res = await c.env.DB.prepare('INSERT INTO ac_entregas (business_id, inscripcion_id, clase_n, r2_key, nombre, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(c.businessId, i.id, cl.n, key, nombre, type, body.byteLength, now()).run();
    await audit(c, `${c.estudiante.nombre} subió «${nombre}» (${i.curso}, clase ${cl.n})`, { modulo: 'cursos' });
    return json({ id: res.meta.last_row_id, nombre, mime: type, size: body.byteLength }, 201);
  });
  const entregaPropia = async (c) => {
    const e = await one(c.env, `SELECT e.* FROM ac_entregas e JOIN ac_inscripciones i ON i.id = e.inscripcion_id AND i.business_id = e.business_id WHERE e.id = ? AND e.business_id = ? AND i.estudiante_id = ?`, Number(c.params.eid), c.businessId, c.estudiante.id);
    if (!e) throw new HttpError(404, 'No encontrado');
    return e;
  };
  r.get('/api/alumno/entregas/:eid/archivo', 'alumno', async (c) => { const e = await entregaPropia(c); return servir(c, e.r2_key, e.mime, e.nombre, c.url.searchParams.get('dl') === '1'); });
  r.delete('/api/alumno/entregas/:eid', 'alumno', async (c) => {
    const e = await entregaPropia(c);
    await c.env.DB.prepare('DELETE FROM ac_entregas WHERE id = ? AND business_id = ?').bind(e.id, c.businessId).run();
    await c.env.FILES?.delete(e.r2_key);
    return json({ ok: true });
  });

  /* ---- evaluaciones ---- */
  const abrir = async (c) => {
    const i = await matricula(c), x = await evDe(c, i, Number(c.params.ev));
    const cl = x.ev.clase_n ? await claseDe(c, i, x.ev.clase_n) : null;
    x.fechaClase = cl?.fecha;
    return { i, x };
  };
  const exigirAbierta = (x) => {
    if (x.ex.enviado_at) throw new HttpError(409, 'Ya enviaste esta evaluación');
    if (!x.abierta) throw new HttpError(409, 'Esta evaluación solo se presenta el día de su clase');
  };
  r.put('/api/alumno/curso/:id/evaluaciones/:ev', 'alumno', async (c) => {
    const { i, x } = await abrir(c); exigirAbierta(x);
    x.ex.resp = limpiarRespuestas(x.ev.examen, (await readJson(c.req)).resp, {}).resp;
    await guardar(c, i, x);
    return json({ ok: true });
  });
  r.post('/api/alumno/curso/:id/evaluaciones/:ev/enviar', 'alumno', async (c) => {
    const { i, x } = await abrir(c); exigirAbierta(x);
    const b = await readJson(c.req).catch(() => ({}));
    if (x.ev.examen) x.ex.resp = limpiarRespuestas(x.ev.examen, b.resp ?? x.ex.resp, {}).resp;
    else if (!x.ex.archivos.length) throw new HttpError(400, 'Sube la foto o el PDF de tu examen antes de enviarlo');
    await guardar(c, i, x, { enviado_at: now() });
    // Si todo se califica solo y el docente aún no puso nota, queda la nota del examen
    let nota = null;
    if (x.ev.examen) {
      const cal = calificar(x.ev.examen, { resp: x.ex.resp, manual: {} }), cfg = await getConfig(c.env, c.businessId);
      if (cal.total && !cal.pendientes) {
        nota = Math.min(cfg.escala, Math.round(cal.pct * cfg.escala * 10) / 10);
        await c.env.DB.prepare(`INSERT INTO ac_notas (business_id, inscripcion_id, evaluacion_id, nota, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(inscripcion_id, evaluacion_id) DO NOTHING`)
          .bind(c.businessId, i.id, x.ev.id, nota, c.session.user_id, now()).run();
      }
    }
    await audit(c, `${c.estudiante.nombre} envió «${x.ev.nombre}» (${i.curso})`, { modulo: 'cursos' });
    x.ex.enviado_at = 1;
    return json({ ok: true, evaluacion: await vistaEv(c, i, { ...x, abierta: false }) });
  });
  r.post('/api/alumno/curso/:id/evaluaciones/:ev/archivo', 'alumno', async (c) => {
    const { i, x } = await abrir(c); exigirAbierta(x);
    if (x.ev.examen) throw new HttpError(400, 'Esta evaluación se responde en línea');
    if (x.ex.archivos.length >= 20) throw new HttpError(400, 'Máximo 20 archivos por examen');
    const { body, type } = await leerArchivo(c, /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/, 'Solo fotos (JPG, PNG, WEBP) o PDF');
    const nombre = limpioNombre(c.url.searchParams.get('nombre'), 'examen'), key = `${c.businessId}/examen/${crypto.randomUUID()}-${nombre}`;
    await need(c.env).put(key, body, { httpMetadata: { contentType: type } });
    x.ex.archivos.push({ key, nombre, tipoArchivo: type, size: body.byteLength });
    await guardar(c, i, x);
    return json({ archivos: x.ex.archivos.map((a) => ({ key: a.key, nombre: a.nombre, tipoArchivo: a.tipoArchivo, size: a.size })) }, 201);
  });
  r.get('/api/alumno/examen-archivo/:key', 'alumno', async (c) => {
    const key = c.params.key;
    if (!key.startsWith(`${c.businessId}/examen/`)) throw new HttpError(404, 'No encontrado');
    const mio = await one(c.env, `SELECT 1 FROM ac_examenes x JOIN ac_inscripciones i ON i.id = x.inscripcion_id AND i.business_id = x.business_id WHERE x.business_id = ? AND i.estudiante_id = ? AND x.archivos LIKE ?`,
      c.businessId, c.estudiante.id, `%${key.replace(/[%_]/g, '')}%`);
    if (!mio) throw new HttpError(404, 'No encontrado');
    return servir(c, key, null, null, false);
  });

  /* ---- equipo: ver lo que subieron ---- */
  r.get('/api/cursos/:id/entregas', 'tenant:cursos', async (c) => {
    const k = await one(c.env, 'SELECT id FROM ac_cursos WHERE id = ? AND business_id = ?', Number(c.params.id), c.businessId);
    if (!k) throw new HttpError(404, 'Curso no encontrado');
    return json({ rows: await all(c.env, `SELECT e.id, e.clase_n, e.nombre, e.mime, e.size, e.created_at, s.nombre AS estudiante FROM ac_entregas e JOIN ac_inscripciones i ON i.id = e.inscripcion_id AND i.business_id = e.business_id
      JOIN ac_estudiantes s ON s.id = i.estudiante_id AND s.business_id = i.business_id WHERE e.business_id = ? AND i.curso_id = ? ORDER BY e.clase_n DESC, e.id DESC LIMIT 500`, c.businessId, k.id) });
  });
  r.get('/api/cursos/entregas/:eid/archivo', 'tenant:cursos', async (c) => {
    const e = await one(c.env, 'SELECT * FROM ac_entregas WHERE id = ? AND business_id = ?', Number(c.params.eid), c.businessId);
    if (!e) throw new HttpError(404, 'No encontrado');
    return servir(c, e.r2_key, e.mime, e.nombre, c.url.searchParams.get('dl') === '1');
  });
}
