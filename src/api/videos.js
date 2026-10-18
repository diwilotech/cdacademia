// Clases grabadas (videos) para las reposiciones. Ver: todo el equipo; subir y borrar videos: propietario y administrador.
//   GET    /api/videos?curso_id=&clase_n=              videos listos (con cuántos enlaces y vistas tienen)
//   POST   /api/videos                                 { titulo, curso_id, clase_n, mime, bytes, duracion_s } → empieza la subida por partes
//   PUT    /api/videos/:id/partes/:n                   cuerpo binario de la parte n (8 MB) → { etag }
//   POST   /api/videos/:id/completar                   junta las partes y deja el video listo
//   DELETE /api/videos/:id                             borra el video, sus enlaces y el archivo
//   POST   /api/reposiciones/:id/video-link            { video_id, dias? } → { url, expira }  enlace personal del estudiante
//   GET    /api/reposiciones/:id/video-links           enlaces de esa reposición con lo que ha visto
//   DELETE /api/video-accesos/:id                      revoca un enlace
// El estudiante lo ve en /ver/<enlace> (src/lib/ver.js): sin sesión de la app, con marca de agua y sin descarga.
import { json, readJson, HttpError } from '../lib/http.js';
import { all, one, now, cast } from '../lib/crud.js';
import { audit } from '../lib/audit.js';

const MOD = 'reposiciones';
export const PARTE = 8 * 1024 * 1024, MAX_BYTES = 3 * 1024 ** 3;
const MIMES = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
export const sha256 = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const need = (env) => { if (!env.FILES) throw new HttpError(501, 'Esta app no tiene almacenamiento de archivos (R2) configurado'); return env.FILES; };

async function video(c, id) {
  const v = await one(c.env, 'SELECT * FROM ac_videos WHERE id = ? AND business_id = ?', Number(id), c.businessId);
  if (!v) throw new HttpError(404, 'Video no encontrado');
  return v;
}
async function reposicion(c, id) {
  const r = await one(c.env, `SELECT r.*, i.curso_id, e.nombre AS estudiante FROM ac_reposiciones r JOIN ac_inscripciones i ON i.id = r.inscripcion_id AND i.business_id = r.business_id
    JOIN ac_estudiantes e ON e.id = i.estudiante_id AND e.business_id = i.business_id WHERE r.id = ? AND r.business_id = ?`, Number(id), c.businessId);
  if (!r) throw new HttpError(404, 'Reposición no encontrada');
  return r;
}

export function routes(r) {
  r.get('/api/videos', `tenant:${MOD}`, async (c) => {
    const curso = Number(c.url.searchParams.get('curso_id')) || null, clase = Number(c.url.searchParams.get('clase_n')) || null;
    const rows = await all(c.env, `SELECT v.id, v.curso_id, v.clase_n, v.titulo, v.mime, v.bytes, v.duracion_s, v.created_at, k.nombre AS curso,
        (SELECT COUNT(*) FROM ac_video_accesos a WHERE a.video_id = v.id AND a.business_id = v.business_id) AS enlaces,
        (SELECT COALESCE(SUM(a.vistas), 0) FROM ac_video_accesos a WHERE a.video_id = v.id AND a.business_id = v.business_id) AS vistas
      FROM ac_videos v LEFT JOIN ac_cursos k ON k.id = v.curso_id AND k.business_id = v.business_id WHERE v.business_id = ? AND v.estado = 'listo'${curso ? ' AND v.curso_id = ?' : ''}${clase ? ' AND v.clase_n = ?' : ''}
      ORDER BY v.created_at DESC LIMIT 500`, c.businessId, ...(curso ? [curso] : []), ...(clase ? [clase] : []));
    return json({ rows });
  });

  r.post('/api/videos', `manager:${MOD}`, async (c) => {
    need(c.env);
    const b = await readJson(c.req);
    const titulo = cast('título', 'text!', b.titulo), cursoId = cast('curso', 'int!', b.curso_id), claseN = cast('clase', 'int!', b.clase_n);
    const mime = String(b.mime || '').toLowerCase(), bytes = Number(b.bytes) || 0, dur = Math.max(0, Math.round(Number(b.duracion_s) || 0));
    if (!MIMES[mime]) throw new HttpError(400, 'El video debe ser MP4, WEBM o MOV');
    if (bytes < 1 || bytes > MAX_BYTES) throw new HttpError(400, 'El video pesa más de 3 GB (o está vacío)');
    if (!(claseN >= 1 && claseN <= 500)) throw new HttpError(400, 'Clase no válida');
    if (!(await one(c.env, 'SELECT 1 FROM ac_cursos WHERE id = ? AND business_id = ?', cursoId, c.businessId))) throw new HttpError(400, 'Curso no válido');
    const t = now();
    const id = (await c.env.DB.prepare("INSERT INTO ac_videos (business_id, curso_id, clase_n, titulo, mime, bytes, duracion_s, estado, subido_por, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'subiendo', ?, ?, ?)")
      .bind(c.businessId, cursoId, claseN, titulo.slice(0, 120), mime, bytes, dur, c.session.email || null, t, t).run()).meta.last_row_id;
    const key = `${c.businessId}/videos/${id}.${MIMES[mime]}`;
    const up = await c.env.FILES.createMultipartUpload(key, { httpMetadata: { contentType: mime } });
    await c.env.DB.prepare('UPDATE ac_videos SET r2_key = ?, upload_id = ? WHERE id = ?').bind(key, up.uploadId, id).run();
    return json({ id, parte: PARTE }, 201);
  });

  r.put('/api/videos/:id/partes/:n', `manager:${MOD}`, async (c) => {
    need(c.env);
    const v = await video(c, c.params.id), n = Number(c.params.n);
    if (v.estado !== 'subiendo') throw new HttpError(409, 'Este video ya está listo');
    if (!Number.isInteger(n) || n < 1 || n > 10000) throw new HttpError(400, 'Parte no válida');
    if (Number(c.req.headers.get('content-length') || 0) > PARTE * 2) throw new HttpError(413, 'La parte es muy grande');
    const body = await c.req.arrayBuffer();
    if (!body.byteLength) throw new HttpError(400, 'La parte está vacía');
    const part = await c.env.FILES.resumeMultipartUpload(v.r2_key, v.upload_id).uploadPart(n, body);
    await c.env.DB.prepare('INSERT INTO ac_video_partes (video_id, n, etag, bytes) VALUES (?, ?, ?, ?) ON CONFLICT(video_id, n) DO UPDATE SET etag = excluded.etag, bytes = excluded.bytes').bind(v.id, n, part.etag, body.byteLength).run();
    return json({ n, etag: part.etag });
  });

  r.post('/api/videos/:id/completar', `manager:${MOD}`, async (c) => {
    need(c.env);
    const v = await video(c, c.params.id);
    if (v.estado === 'listo') return json({ ok: true });
    const partes = await all(c.env, 'SELECT n, etag FROM ac_video_partes WHERE video_id = ? ORDER BY n', v.id);
    if (!partes.length) throw new HttpError(400, 'No se subió ninguna parte');
    await c.env.FILES.resumeMultipartUpload(v.r2_key, v.upload_id).complete(partes.map((p) => ({ partNumber: p.n, etag: p.etag })));
    const head = await c.env.FILES.head(v.r2_key);
    await c.env.DB.batch([c.env.DB.prepare("UPDATE ac_videos SET estado = 'listo', upload_id = NULL, bytes = ?, updated_at = ? WHERE id = ?").bind(head?.size || v.bytes, now(), v.id), c.env.DB.prepare('DELETE FROM ac_video_partes WHERE video_id = ?').bind(v.id)]);
    await audit(c, `Subió la clase grabada «${v.titulo}» (clase ${v.clase_n})`, { modulo: MOD });
    return json({ ok: true });
  });

  r.delete('/api/videos/:id', `manager:${MOD}`, async (c) => {
    const v = await video(c, c.params.id);
    try { if (v.estado === 'subiendo' && v.upload_id) await c.env.FILES?.resumeMultipartUpload(v.r2_key, v.upload_id).abort(); else if (v.r2_key) await c.env.FILES?.delete(v.r2_key); } catch (e) { console.error('borrar video', e.message); }
    await c.env.DB.batch([c.env.DB.prepare('DELETE FROM ac_video_accesos WHERE video_id = ? AND business_id = ?').bind(v.id, c.businessId), c.env.DB.prepare('DELETE FROM ac_video_partes WHERE video_id = ?').bind(v.id),
      c.env.DB.prepare('DELETE FROM ac_videos WHERE id = ? AND business_id = ?').bind(v.id, c.businessId)]);
    await audit(c, `Borró la clase grabada «${v.titulo}»`, { modulo: MOD });
    return json({ ok: true });
  });

  // Enlace personal: solo se muestra aquí, una vez; en la base queda su huella.
  r.post('/api/reposiciones/:id/video-link', `tenant:${MOD}`, async (c) => {
    const rep = await reposicion(c, c.params.id), b = await readJson(c.req);
    const v = await video(c, b.video_id);
    if (v.estado !== 'listo') throw new HttpError(409, 'El video aún se está subiendo');
    if (v.curso_id !== rep.curso_id || v.clase_n !== rep.clase_n) throw new HttpError(400, 'Ese video no es de la clase que se perdió');
    const dias = Math.min(60, Math.max(1, Math.round(Number(b.dias) || 7)));
    const token = [...crypto.getRandomValues(new Uint8Array(32))].map((x) => x.toString(16).padStart(2, '0')).join('');
    const expira = now() + dias * 86400000;
    await c.env.DB.prepare('INSERT INTO ac_video_accesos (business_id, video_id, reposicion_id, token_hash, prefijo, expira, creado_por, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(c.businessId, v.id, rep.id, await sha256(token), token.slice(0, 6), expira, c.session.email || null, now()).run();
    if (rep.estado === 'pendiente') await c.env.DB.prepare("UPDATE ac_reposiciones SET estado = 'agendada', modo = 'virtual', updated_at = ? WHERE id = ? AND business_id = ?").bind(now(), rep.id, c.businessId).run();
    await audit(c, `Envió la clase grabada de la clase ${rep.clase_n} a ${rep.estudiante} (vence en ${dias} días)`, { modulo: MOD });
    return json({ url: `${c.url.origin}/ver/${token}`, expira, dias }, 201);
  });

  r.get('/api/reposiciones/:id/video-links', `tenant:${MOD}`, async (c) => {
    const rep = await reposicion(c, c.params.id);
    const rows = await all(c.env, `SELECT a.id, a.prefijo, a.expira, a.revocado, a.created_at, a.vistas, a.visto_s, a.completado_at, v.duracion_s, v.titulo FROM ac_video_accesos a JOIN ac_videos v ON v.id = a.video_id
      WHERE a.business_id = ? AND a.reposicion_id = ? ORDER BY a.id DESC`, c.businessId, rep.id);
    return json({ rows: rows.map((a) => ({ ...a, pct: a.duracion_s ? Math.min(100, Math.round((a.visto_s / a.duracion_s) * 100)) : 0 })) });
  });

  r.delete('/api/video-accesos/:id', `tenant:${MOD}`, async (c) => {
    const a = await one(c.env, 'SELECT id FROM ac_video_accesos WHERE id = ? AND business_id = ?', Number(c.params.id), c.businessId);
    if (!a) throw new HttpError(404, 'Enlace no encontrado');
    await c.env.DB.prepare('UPDATE ac_video_accesos SET revocado = 1, sesion = NULL WHERE id = ? AND business_id = ?').bind(a.id, c.businessId).run();
    await audit(c, 'Revocó un enlace de clase grabada', { modulo: MOD });
    return json({ ok: true });
  });
}
