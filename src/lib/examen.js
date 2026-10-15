// Exámenes en línea: validar y limpiar las preguntas de una evaluación y calificar lo que respondió un estudiante.
//   pregunta = { id, tipo: unica|multiple|vf|corta|abierta, enunciado, puntos, opciones: [{ id, texto, ok }], vf, respuesta }
//   respuestas = { <id de pregunta>: valor }   manual = { <id de abierta>: puntos }
import { HttpError } from './http.js';

export const TIPOS_PREGUNTA = ['unica', 'multiple', 'vf', 'corta', 'abierta'];
export const norm = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const rid = (p) => p + crypto.randomUUID().slice(0, 8);

export function limpiarExamen(ex) {
  if (!ex || !Array.isArray(ex.preguntas)) throw new HttpError(400, 'El examen necesita una lista de preguntas');
  const vistos = new Set();
  const preguntas = ex.preguntas.slice(0, 200).map((q, k) => {
    const n = `Pregunta ${k + 1}`;
    if (!TIPOS_PREGUNTA.includes(q?.tipo)) throw new HttpError(400, `${n}: tipo no válido`);
    const enunciado = String(q.enunciado ?? '').trim().slice(0, 2000);
    if (!enunciado) throw new HttpError(400, `${n}: falta el enunciado`);
    let id = String(q.id || '').replace(/[^\w-]/g, '').slice(0, 40) || rid('q');
    if (vistos.has(id)) id = rid('q');
    vistos.add(id);
    const out = { id, tipo: q.tipo, enunciado, puntos: Math.min(100, Math.max(0, Math.round((Number(q.puntos ?? 1) || 0) * 100) / 100)) };
    if (q.tipo === 'unica' || q.tipo === 'multiple') {
      const ids = new Set();
      out.opciones = (Array.isArray(q.opciones) ? q.opciones : []).slice(0, 12).map((o) => {
        let oid = String(o?.id || '').replace(/[^\w-]/g, '').slice(0, 40) || rid('o');
        if (ids.has(oid)) oid = rid('o');
        ids.add(oid);
        return { id: oid, texto: String(o?.texto ?? '').trim().slice(0, 500), ok: !!o?.ok };
      }).filter((o) => o.texto);
      if (out.opciones.length < 2) throw new HttpError(400, `${n}: necesita al menos 2 opciones`);
      const ok = out.opciones.filter((o) => o.ok).length;
      if (!ok) throw new HttpError(400, `${n}: marca la respuesta correcta`);
      if (q.tipo === 'unica' && ok > 1) throw new HttpError(400, `${n}: es de selección única y tiene ${ok} respuestas correctas`);
    }
    if (q.tipo === 'vf') out.vf = q.vf === true || q.vf === 'true';
    if (q.tipo === 'corta') {
      out.respuesta = String(q.respuesta ?? '').trim().slice(0, 500);
      if (!out.respuesta) throw new HttpError(400, `${n}: escribe la respuesta aceptada`);
    }
    return out;
  });
  return { instrucciones: String(ex.instrucciones ?? '').trim().slice(0, 1000), preguntas };
}

// Respuesta de un estudiante -> puntos por pregunta. estado: ok | parcial | mal | vacia | pend (abierta sin calificar)
export function calificar(examen, ex) {
  const pre = examen?.preguntas || [], resp = ex?.resp || {}, manual = ex?.manual || {};
  const det = {}; let obtenido = 0, total = 0, pendientes = 0;
  for (const q of pre) {
    const max = Number(q.puntos) || 0, r = resp[q.id]; total += max;
    let pts = 0, estado = 'mal';
    if (q.tipo === 'unica') {
      const ok = q.opciones.find((o) => o.ok);
      if (r === undefined || r === '' || r === null) estado = 'vacia'; else if (ok && r === ok.id) { pts = max; estado = 'ok'; }
    } else if (q.tipo === 'multiple') {
      const correctas = q.opciones.filter((o) => o.ok).map((o) => o.id), sel = Array.isArray(r) ? r : [];
      if (!sel.length) estado = 'vacia';
      else {
        const f = Math.max(0, (sel.filter((x) => correctas.includes(x)).length - sel.filter((x) => !correctas.includes(x)).length) / (correctas.length || 1));
        pts = Math.round(max * f * 100) / 100; estado = f >= 1 ? 'ok' : f > 0 ? 'parcial' : 'mal';
      }
    } else if (q.tipo === 'vf') {
      if (r === undefined || r === null || r === '') estado = 'vacia'; else if (r === q.vf) { pts = max; estado = 'ok'; }
    } else if (q.tipo === 'corta') {
      if (!String(r ?? '').trim()) estado = 'vacia'; else if (String(q.respuesta || '').split(',').map(norm).includes(norm(r))) { pts = max; estado = 'ok'; }
    } else {
      const m = manual[q.id];
      if (m === undefined || m === '' || m === null) { estado = String(r ?? '').trim() ? 'pend' : 'vacia'; if (estado === 'pend') pendientes++; }
      else { pts = Math.min(max, Math.max(0, Number(m) || 0)); estado = pts >= max ? 'ok' : pts > 0 ? 'parcial' : 'mal'; }
    }
    det[q.id] = { pts, max, estado }; obtenido += pts;
  }
  obtenido = Math.round(obtenido * 100) / 100;
  return { obtenido, total, pendientes, det, pct: total ? obtenido / total : null };
}

// Respuestas válidas según el examen (descarta lo que no corresponde a ninguna pregunta).
export function limpiarRespuestas(examen, resp, manual) {
  const out = {}, man = {};
  for (const q of examen?.preguntas || []) {
    const r = resp?.[q.id];
    if (r === undefined || r === null) continue;
    if (q.tipo === 'unica') { if (q.opciones.some((o) => o.id === r)) out[q.id] = r; }
    else if (q.tipo === 'multiple') out[q.id] = (Array.isArray(r) ? r : []).filter((x) => q.opciones.some((o) => o.id === x));
    else if (q.tipo === 'vf') { if (typeof r === 'boolean') out[q.id] = r; }
    else out[q.id] = String(r).slice(0, 4000);
    if (q.tipo === 'abierta' && manual?.[q.id] !== undefined && manual[q.id] !== '' && manual[q.id] !== null) man[q.id] = Math.min(q.puntos, Math.max(0, Number(manual[q.id]) || 0));
  }
  return { resp: out, manual: man };
}
