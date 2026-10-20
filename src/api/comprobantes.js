// Comprobantes de pago. El estudiante sube la foto o el PDF de su transferencia; el equipo lo revisa y, al aprobarlo, se registra el pago
// (con su recibo en Finanzas). Quien paga no escribe en la contabilidad: solo deja el comprobante.
//   Estudiante:  POST /api/alumno/curso/:id/comprobantes?valor=&metodo=&fecha=&nota=&nombre=  (cuerpo = el archivo)
//                GET  /api/alumno/curso/:id/comprobantes  ·  GET /api/alumno/comprobantes/:cid/archivo
//   Equipo:      GET  /api/cuotas/comprobantes?estado=  ·  GET /api/cuotas/comprobantes/:id/archivo
//                POST /api/cuotas/comprobantes/:id/aprobar { valor?, metodo?, fecha? }  ·  POST …/:id/rechazar { motivo }
import { json, readJson, HttpError } from '../lib/http.js';
import { all, one, now, today, cast, DATE } from '../lib/crud.js';
import { audit } from '../lib/audit.js';
import { registrarPago } from './cuotas.js';

const MOD = 'cuotas';
const MAX = 5 * 1024 * 1024;
const METODOS = ['Transferencia', 'Nequi', 'Daviplata', 'Bre-B', 'Consignación', 'Tarjeta', 'Otro'];
const pesos = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO');
const need = (env) => { if (!env.FILES) throw new HttpError(501, 'Esta app no tiene almacenamiento de archivos (R2) configurado'); return env.FILES; };

// Tipo real del archivo por sus primeros bytes (no se confía en lo que diga el navegador).
function tipoDe(b) {
  const u = new Uint8Array(b.slice(0, 12)), ascii = (i, n) => String.fromCharCode(...u.slice(i, i + n));
  if (u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) return ['image/jpeg', 'jpg'];
  if (u[0] === 0x89 && ascii(1, 3) === 'PNG') return ['image/png', 'png'];
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return ['image/webp', 'webp'];
  if (ascii(0, 4) === '%PDF') return ['application/pdf', 'pdf'];
  return null;
}

const archivo = async (c, row) => {
  const obj = await need(c.env).get(row.r2_key);
  if (!obj) throw new HttpError(404, 'El archivo ya no está');
  return new Response(obj.body, { headers: { 'content-type': row.mime, 'cache-control': 'private, max-age=300', 'x-content-type-options': 'nosniff',
    'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.nombre || 'comprobante')}`, 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:" } });
};

export const comprobantesDe = (c, inscripcionId) => all(c.env,
  'SELECT id, valor, metodo, fecha, nota, nombre, mime, estado, pago_num, motivo, created_at FROM ac_comprobantes WHERE business_id = ? AND inscripcion_id = ? ORDER BY id DESC LIMIT 50', c.businessId, inscripcionId);

export function routes(r) {
  /* ---- estudiante ---- */
  r.post('/api/alumno/curso/:id/comprobantes', 'alumno', async (c) => {
    const ins = await one(c.env, `SELECT i.id, i.valor, i.descuento, k.nombre AS curso FROM ac_inscripciones i JOIN ac_cursos k ON k.id = i.curso_id AND k.business_id = i.business_id
      WHERE i.id = ? AND i.business_id = ? AND i.estudiante_id = ? AND i.estado = 'activa'`, Number(c.params.id), c.businessId, c.estudiante.id);
    if (!ins) throw new HttpError(404, 'No encontrado');
    const q = c.url.searchParams;
    const valor = cast('valor', 'money!', q.get('valor'));
    if (!(valor > 0)) throw new HttpError(400, 'Escribe el valor que pagaste');
    const pagado = (await one(c.env, "SELECT COALESCE(SUM(valor), 0) s FROM ac_pagos WHERE business_id = ? AND inscripcion_id = ? AND tipo = 'cuota' AND anulado = 0", c.businessId, ins.id)).s;
    const saldo = ins.valor - ins.descuento - pagado;
    if (valor > saldo) throw new HttpError(400, saldo > 0 ? `El valor supera tu saldo (${pesos(saldo)})` : 'Este curso ya está pagado');
    if ((await one(c.env, "SELECT COUNT(*) n FROM ac_comprobantes WHERE business_id = ? AND inscripcion_id = ? AND estado = 'pendiente'", c.businessId, ins.id)).n >= 5) throw new HttpError(409, 'Ya tienes 5 comprobantes en revisión; espera a que los revisemos');
    if (Number(c.req.headers.get('content-length') || 0) > MAX) throw new HttpError(413, 'El archivo pesa más de 5 MB');
    const body = await c.req.arrayBuffer();
    if (!body.byteLength) throw new HttpError(400, 'Adjunta la foto o el PDF del comprobante');
    if (body.byteLength > MAX) throw new HttpError(413, 'El archivo pesa más de 5 MB');
    const tipo = tipoDe(body);
    if (!tipo) throw new HttpError(400, 'Sube una imagen (JPG, PNG, WebP) o un PDF');
    const metodo = METODOS.includes(q.get('metodo')) ? q.get('metodo') : 'Transferencia';
    const fecha = DATE.test(q.get('fecha') || '') && q.get('fecha') <= today() ? q.get('fecha') : today();
    const nota = (q.get('nota') || '').slice(0, 300) || null;
    const nombre = ((q.get('nombre') || 'comprobante').replace(/[^\w.\- ]+/g, '').slice(0, 80) || 'comprobante').replace(/\.[a-z0-9]{2,4}$/i, '') + '.' + tipo[1];
    const key = `comprobantes/${c.businessId}/${ins.id}-${crypto.randomUUID()}.${tipo[1]}`;
    await need(c.env).put(key, body, { httpMetadata: { contentType: tipo[0] } });
    const t = now();
    const res = await c.env.DB.prepare('INSERT INTO ac_comprobantes (business_id, inscripcion_id, valor, metodo, fecha, nota, r2_key, mime, nombre, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(c.businessId, ins.id, valor, metodo, fecha, nota, key, tipo[0], nombre, c.session.user_id, t, t).run();
    await audit(c, `${c.estudiante.nombre} subió un comprobante de ${pesos(valor)} (${ins.curso})`, { modulo: MOD });
    return json({ id: res.meta.last_row_id, estado: 'pendiente' }, 201);
  });
  r.get('/api/alumno/curso/:id/comprobantes', 'alumno', async (c) => {
    const ins = await one(c.env, 'SELECT id FROM ac_inscripciones WHERE id = ? AND business_id = ? AND estudiante_id = ?', Number(c.params.id), c.businessId, c.estudiante.id);
    if (!ins) throw new HttpError(404, 'No encontrado');
    return json({ comprobantes: await comprobantesDe(c, ins.id) });
  });
  r.get('/api/alumno/comprobantes/:cid/archivo', 'alumno', async (c) => {
    const row = await one(c.env, `SELECT m.* FROM ac_comprobantes m JOIN ac_inscripciones i ON i.id = m.inscripcion_id AND i.business_id = m.business_id
      WHERE m.id = ? AND m.business_id = ? AND i.estudiante_id = ?`, Number(c.params.cid), c.businessId, c.estudiante.id);
    if (!row) throw new HttpError(404, 'No encontrado');
    return archivo(c, row);
  });

  /* ---- equipo ---- */
  r.get('/api/cuotas/comprobantes', `tenant:${MOD}`, async (c) => {
    const est = ['pendiente', 'aprobado', 'rechazado'].includes(c.url.searchParams.get('estado')) ? c.url.searchParams.get('estado') : null;
    const rows = await all(c.env, `SELECT m.id, m.inscripcion_id, m.valor, m.metodo, m.fecha, m.nota, m.nombre, m.mime, m.estado, m.pago_num, m.motivo, m.created_at, e.nombre AS estudiante, k.nombre AS curso
      FROM ac_comprobantes m JOIN ac_inscripciones i ON i.id = m.inscripcion_id AND i.business_id = m.business_id JOIN ac_estudiantes e ON e.id = i.estudiante_id AND e.business_id = i.business_id
      JOIN ac_cursos k ON k.id = i.curso_id AND k.business_id = i.business_id WHERE m.business_id = ? ${est ? 'AND m.estado = ?' : ''} ORDER BY (m.estado = 'pendiente') DESC, m.id DESC LIMIT 200`, c.businessId, ...(est ? [est] : []));
    return json({ rows, pendientes: (await one(c.env, "SELECT COUNT(*) n FROM ac_comprobantes WHERE business_id = ? AND estado = 'pendiente'", c.businessId)).n });
  });
  r.get('/api/cuotas/comprobantes/:id/archivo', `tenant:${MOD}`, async (c) => {
    const row = await one(c.env, 'SELECT * FROM ac_comprobantes WHERE id = ? AND business_id = ?', Number(c.params.id), c.businessId);
    if (!row) throw new HttpError(404, 'No encontrado');
    return archivo(c, row);
  });
  r.post('/api/cuotas/comprobantes/:id/aprobar', `tenant:${MOD}`, async (c) => {
    const id = Number(c.params.id), b = await readJson(c.req).catch(() => ({}));
    const row = await one(c.env, 'SELECT * FROM ac_comprobantes WHERE id = ? AND business_id = ?', id, c.businessId);
    if (!row) throw new HttpError(404, 'No encontrado');
    // Se reserva primero (dos personas no lo aprueban a la vez); si el pago falla, vuelve a quedar pendiente.
    const claim = await c.env.DB.prepare("UPDATE ac_comprobantes SET estado = 'aprobado', revisado_por = ?, updated_at = ? WHERE id = ? AND business_id = ? AND estado = 'pendiente'").bind(c.session.user_id, now(), id, c.businessId).run();
    if (!claim.meta.changes) throw new HttpError(409, 'Este comprobante ya fue revisado');
    try {
      const p = await registrarPago(c, { inscripcion_id: row.inscripcion_id, valor: b.valor ?? row.valor, metodo: b.metodo || (['Transferencia', 'Nequi', 'Daviplata', 'Bre-B', 'Tarjeta'].includes(row.metodo) ? row.metodo : 'Transferencia'),
        fecha: b.fecha || row.fecha, concepto: `Abono a cuotas (comprobante N.º ${id})` });
      await c.env.DB.prepare('UPDATE ac_comprobantes SET pago_num = ? WHERE id = ? AND business_id = ?').bind(p.num, id, c.businessId).run();
      return json({ ok: true, pago: p.num, finanzas: p.finanzas });
    } catch (e) {
      await c.env.DB.prepare("UPDATE ac_comprobantes SET estado = 'pendiente', revisado_por = NULL WHERE id = ? AND business_id = ?").bind(id, c.businessId).run();
      throw e;
    }
  });
  r.post('/api/cuotas/comprobantes/:id/rechazar', `tenant:${MOD}`, async (c) => {
    const id = Number(c.params.id), b = await readJson(c.req).catch(() => ({}));
    const motivo = String(b.motivo || '').trim().slice(0, 300);
    if (!motivo) throw new HttpError(400, 'Escribe el motivo para que el estudiante sepa qué corregir');
    const res = await c.env.DB.prepare("UPDATE ac_comprobantes SET estado = 'rechazado', motivo = ?, revisado_por = ?, updated_at = ? WHERE id = ? AND business_id = ? AND estado = 'pendiente'").bind(motivo, c.session.user_id, now(), id, c.businessId).run();
    if (!res.meta.changes) throw new HttpError(409, 'Este comprobante ya fue revisado o no existe');
    await audit(c, `Rechazó el comprobante N.º ${id}`, { modulo: MOD, detalle: motivo });
    return json({ ok: true });
  });
}
