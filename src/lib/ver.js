// Ver una clase grabada (reposición): /ver/<enlace>, público pero personal. Sin sesión de la app: el enlace es la llave.
//   GET  /ver/<enlace>            la página del reproductor (public/ver.html)
//   POST /ver/<enlace>/iniciar    abre una sesión (una sola a la vez: la anterior se cierra) → datos y marca de agua; fija la cookie de sesión
//   GET  /ver/<enlace>/video      el video por partes (Range), solo con esa sesión y desde la misma conexión; nunca como descarga
//   POST /ver/<enlace>/progreso   { delta, t } cada ~10 s: suma el tiempo realmente visto; al 90 % la reposición queda hecha
// Ningún sitio web puede impedir que alguien grabe o capture la pantalla: aquí se disuade (enlace personal que vence, sesión única, marca de agua con el
// nombre de quien mira, sin descarga, pausa al salir de la pestaña) y se deja rastro.
import { HttpError, getCookie } from './http.js';
import { sha256 } from '../api/videos.js';

const TOKEN = /^[a-f0-9]{64}$/;
const MIN_VISTO = 0.9;
const HDR = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" };
const jres = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...HDR, ...extra } });
const ip = (req) => req.headers.get('cf-connecting-ip') || '';

async function cargar(env, token) {
  return env.DB.prepare(`SELECT a.*, v.r2_key, v.mime, v.bytes, v.duracion_s, v.titulo, v.estado AS video_estado, e.nombre AS estudiante, e.documento, r.estado AS rep_estado, r.clase_n, k.nombre AS curso
    FROM ac_video_accesos a JOIN ac_videos v ON v.id = a.video_id AND v.business_id = a.business_id JOIN ac_reposiciones r ON r.id = a.reposicion_id AND r.business_id = a.business_id
    JOIN ac_inscripciones i ON i.id = r.inscripcion_id AND i.business_id = r.business_id JOIN ac_estudiantes e ON e.id = i.estudiante_id AND e.business_id = i.business_id
    LEFT JOIN ac_cursos k ON k.id = i.curso_id AND k.business_id = i.business_id JOIN businesses b ON b.id = a.business_id AND b.status = 'active' AND b.archived_at IS NULL
    WHERE a.token_hash = ?`).bind(await sha256(token)).first();
}
function valido(a) {
  if (!a) throw new HttpError(404, 'Este enlace no existe.');
  if (a.revocado) throw new HttpError(410, 'Este enlace ya no está disponible. Pide uno nuevo a tu academia.');
  if (a.expira < Date.now()) throw new HttpError(410, 'Este enlace venció. Pide uno nuevo a tu academia.');
  if (a.video_estado !== 'listo') throw new HttpError(409, 'La clase grabada aún no está lista.');
}
// La sesión es de esta pestaña: cookie secreta + la misma conexión. Si se abrió en otro lugar, esta deja de funcionar.
function sesionOk(a, req) {
  const ck = getCookie(req, 'dwv');
  if (!a.sesion || !ck || ck !== a.sesion) throw new HttpError(409, 'Esta clase se abrió en otra ventana o dispositivo. Recarga la página para verla aquí.', 'OTRA_SESION');
  if ((a.sesion_ip || '') !== ip(req)) throw new HttpError(409, 'Tu conexión cambió. Recarga la página para continuar.', 'OTRA_SESION');
}
const maskDoc = (d) => { const s = String(d || '').replace(/\s+/g, ''); return s.length > 4 ? `${'•'.repeat(Math.min(6, s.length - 4))}${s.slice(-4)}` : s; };

export async function ver(req, env, url) {
  const m = /^\/ver\/([a-f0-9]{64})(?:\/(iniciar|video|progreso))?\/?$/.exec(url.pathname);
  if (!m || !TOKEN.test(m[1])) return new Response('Este enlace no existe.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', ...HDR } });
  const [, token, sub] = m;
  try {
    if (!sub && req.method === 'GET') {
      const res = await env.ASSETS.fetch(new Request(new URL('/ver.html', url), { headers: req.headers }));
      return new Response(res.body, { status: res.status, headers: { 'content-type': 'text/html; charset=utf-8', ...HDR } });
    }
    const a = await cargar(env, token);
    valido(a);

    if (sub === 'iniciar' && req.method === 'POST') {
      const sesion = [...crypto.getRandomValues(new Uint8Array(24))].map((x) => x.toString(16).padStart(2, '0')).join(''), t = Date.now();
      await env.DB.prepare('UPDATE ac_video_accesos SET sesion = ?, sesion_ip = ?, sesion_inicio = ?, ultima_hb = ?, vistas = vistas + 1 WHERE id = ?').bind(sesion, ip(req), t, t, a.id).run();
      const pct = a.duracion_s ? Math.min(100, Math.round((a.visto_s / a.duracion_s) * 100)) : 0;
      return jres({ titulo: a.titulo, curso: a.curso, clase: a.clase_n, duracion_s: a.duracion_s, pct, completado: !!a.completado_at, vence: a.expira, minimo: Math.round(MIN_VISTO * 100),
        marca: { nombre: a.estudiante, doc: maskDoc(a.documento), ref: a.prefijo } }, 200,
      { 'set-cookie': `dwv=${sesion}; Path=/ver/${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=21600` });
    }

    if (sub === 'video' && req.method === 'GET') {
      sesionOk(a, req);
      if (!env.FILES) throw new HttpError(501, 'Sin almacenamiento de archivos');
      // Siempre por partes: sin «Range» se entrega solo el primer tramo, para que no sea una descarga directa
      const total = a.bytes, rg = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
      let ini = rg && rg[1] !== '' ? Number(rg[1]) : 0, fin = rg && rg[2] !== '' ? Number(rg[2]) : Math.min(total - 1, ini + 4 * 1024 * 1024 - 1);
      if (rg && rg[1] === '' && rg[2] !== '') { ini = Math.max(0, total - Number(rg[2])); fin = total - 1; }
      fin = Math.min(fin, total - 1, ini + 8 * 1024 * 1024 - 1);
      if (!(ini >= 0 && ini <= fin)) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${total}`, ...HDR } });
      const obj = await env.FILES.get(a.r2_key, { range: { offset: ini, length: fin - ini + 1 } });
      if (!obj) throw new HttpError(404, 'El video no está disponible');
      return new Response(obj.body, { status: 206, headers: { 'content-type': a.mime || 'video/mp4', 'content-length': String(fin - ini + 1), 'content-range': `bytes ${ini}-${fin}/${total}`, 'accept-ranges': 'bytes', 'content-disposition': 'inline', ...HDR } });
    }

    if (sub === 'progreso' && req.method === 'POST') {
      sesionOk(a, req);
      const b = await req.json().catch(() => ({})), t = Date.now();
      // Solo cuenta el tiempo real de reproducción: lo que dice el navegador, sin pasar del tiempo que de verdad transcurrió
      const pared = Math.max(0, (t - (a.ultima_hb || t)) / 1000);
      const delta = Math.max(0, Math.min(Number(b.delta) || 0, pared + 2, 30));
      const visto = a.visto_s + delta, maxT = Math.min(Math.max(a.max_t, Number(b.t) || 0), (a.duracion_s || 0) + 1);
      const completo = a.duracion_s > 0 && visto >= a.duracion_s * MIN_VISTO;
      const nuevoCompleto = completo && !a.completado_at;
      await env.DB.prepare('UPDATE ac_video_accesos SET visto_s = ?, max_t = ?, ultima_hb = ?, completado_at = COALESCE(completado_at, ?) WHERE id = ?').bind(visto, maxT, t, completo ? t : null, a.id).run();
      if (nuevoCompleto) {
        await env.DB.prepare("UPDATE ac_reposiciones SET estado = 'hecha', updated_at = ? WHERE id = ? AND business_id = ? AND estado <> 'hecha'").bind(t, a.reposicion_id, a.business_id).run();
        await env.DB.prepare("INSERT INTO audit_log (business_id, user_id, origen, modulo, accion, detalle) VALUES (?, NULL, 'app', 'reposiciones', ?, ?)")
          .bind(a.business_id, `${a.estudiante} vio la clase grabada de la clase ${a.clase_n} (${a.curso || ''}): reposición hecha`.slice(0, 200), JSON.stringify({ visto_s: Math.round(visto), duracion_s: a.duracion_s })).run().catch(() => {});
      }
      return jres({ pct: a.duracion_s ? Math.min(100, Math.round((visto / a.duracion_s) * 100)) : 0, completado: completo });
    }
    return jres({ error: 'Método no permitido' }, 405);
  } catch (e) {
    if (e instanceof HttpError) return jres({ error: e.message, code: e.code }, e.status);
    console.error('ver', e);
    return jres({ error: 'Error interno' }, 500);
  }
}
