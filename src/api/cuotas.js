// Cuotas y pagos: cartera (vencidas, de hoy, por vencer), registrar pagos (se reparten solos entre las cuotas en orden),
// consecutivo de recibos y recibo imprimible (ticket o carta). Ver: propietario y administrador.
//   GET  /api/cuotas/cartera?estado=vencida|hoy|pendiente|todas
//   GET  /api/cuotas/pagos?desde=&hasta=&q=      ·   POST /api/cuotas/pagos { inscripcion_id, valor, metodo, concepto?, fecha?, tipo? }
//   POST /api/cuotas/pagos/:id/anular (manager)   ·   GET /api/cuotas/pagos/:id/recibo (HTML para imprimir)
//   GET  /api/cuotas/resumen                     widget: vencido y por cobrar este mes
import { json, readJson, HttpError } from '../lib/http.js';
import { all, one, now, today, cast, DATE } from '../lib/crud.js';
import { audit } from '../lib/audit.js';
import { getConfig, estadoCuotas } from '../lib/academia.js';
import { movimientoFinanzas } from '../lib/central.js';
import { cuentaDeMatricula } from './matriculas.js';

const MOD = 'cuotas';
const METODOS = ['Efectivo', 'Transferencia', 'Nequi', 'Daviplata', 'Tarjeta', 'Bre-B', 'Otro'];
const pesos = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export async function cartera(c) {
  const ins = await all(c.env, `SELECT i.id, i.estudiante_id, i.valor, i.descuento, e.nombre AS estudiante, e.telefono, k.nombre AS curso FROM ac_inscripciones i
    JOIN ac_estudiantes e ON e.id = i.estudiante_id AND e.business_id = i.business_id JOIN ac_cursos k ON k.id = i.curso_id AND k.business_id = i.business_id
    WHERE i.business_id = ? AND i.estado <> 'retirada'`, c.businessId);
  const [cuotas, pagos] = await Promise.all([
    all(c.env, 'SELECT inscripcion_id, n, etiqueta, vence, valor FROM ac_cuotas WHERE business_id = ?', c.businessId),
    all(c.env, "SELECT inscripcion_id, SUM(valor) s FROM ac_pagos WHERE business_id = ? AND tipo = 'cuota' AND anulado = 0 GROUP BY inscripcion_id", c.businessId),
  ]);
  return ins.flatMap((i) => estadoCuotas(cuotas.filter((q) => q.inscripcion_id === i.id), pagos.find((p) => p.inscripcion_id === i.id)?.s || 0)
    .map((q) => ({ ...q, inscripcion_id: i.id, estudiante_id: i.estudiante_id, estudiante: i.estudiante, telefono: i.telefono, curso: i.curso })))
    .sort((a, b) => a.vence.localeCompare(b.vence));
}

export async function registrarPago(c, b) {
  const ins = await one(c.env, `SELECT i.id, i.valor, i.descuento, e.nombre, k.nombre AS curso FROM ac_inscripciones i JOIN ac_estudiantes e ON e.id = i.estudiante_id AND e.business_id = i.business_id
    JOIN ac_cursos k ON k.id = i.curso_id AND k.business_id = i.business_id WHERE i.id = ? AND i.business_id = ?`, cast('matrícula', 'int!', b.inscripcion_id), c.businessId);
  if (!ins) throw new HttpError(400, 'Matrícula no válida');
  const valor = cast('valor', 'money!', b.valor);
  if (valor <= 0) throw new HttpError(400, 'El valor debe ser mayor que cero');
  const tipo = b.tipo === 'reposicion' ? 'reposicion' : 'cuota';
  if (tipo === 'cuota') {
    const pagado = (await one(c.env, "SELECT COALESCE(SUM(valor), 0) s FROM ac_pagos WHERE business_id = ? AND inscripcion_id = ? AND tipo = 'cuota' AND anulado = 0", c.businessId, ins.id)).s;
    if (pagado + valor > ins.valor - ins.descuento) throw new HttpError(400, `El pago supera el saldo (${pesos(ins.valor - ins.descuento - pagado)})`);
  }
  const metodo = METODOS.includes(b.metodo) ? b.metodo : 'Efectivo';
  const fecha = cast('fecha', 'date', b.fecha) || today();
  // Consecutivo del recibo: el mayor entre el configurado y el último usado
  const cfg = await getConfig(c.env, c.businessId);
  const ult = (await one(c.env, 'SELECT MAX(num) n FROM ac_pagos WHERE business_id = ?', c.businessId)).n || 0;
  const num = Math.max(cfg.consecutivo || 1, ult + 1), t = now();
  const res = await c.env.DB.prepare('INSERT INTO ac_pagos (business_id, num, inscripcion_id, valor, metodo, concepto, fecha, tipo, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(c.businessId, num, ins.id, valor, metodo, cast('concepto', 'text', b.concepto) || (tipo === 'reposicion' ? 'Reposición de clase' : 'Abono a cuotas'), fecha, tipo, c.session.user_id, t, t).run();
  await audit(c, `Registró el pago N.º ${num} de ${ins.nombre} por ${pesos(valor)} (${ins.curso})`, { modulo: MOD });
  if (tipo === 'cuota') await cuentaDeMatricula(c, ins.id);   // asegura la cuenta de cobro a la que se abona
  // Si el pago viene de un comprobante que subió el estudiante, ese archivo viaja con el recibo (se abre desde Finanzas)
  const files = b.comprobante_id ? [{ nombre: 'Comprobante de pago', url: `/api/cuotas/comprobantes/${Number(b.comprobante_id)}/archivo` }] : [];
  const fin = await movimientoFinanzas(c, { num, valor, fecha, tipo, metodo, estudiante: ins.nombre, curso: ins.curso, inscripcion_id: cfg.cuentaCobro ? ins.id : null, files });
  return { id: res.meta.last_row_id, num, finanzas: fin.enviado };
}

export function recibo(p, cfg, negocio) {
  const carta = cfg.recibo === 'carta';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recibo N.º ${p.num}</title>
<style>body{font:14px/1.45 system-ui,sans-serif;color:#111;margin:0;background:#f4f4f4}.r{background:#fff;margin:16px auto;padding:${carta ? '40px' : '18px'};width:${carta ? '680px' : '300px'};max-width:calc(100% - 32px)}
h1{font-size:${carta ? '22px' : '17px'};margin:0}.m{color:#555;font-size:12px}.t{display:flex;justify-content:space-between;border-top:1px dashed #999;padding-top:8px;margin-top:8px}
.big{font-size:${carta ? '28px' : '22px'};font-weight:700}.bar{text-align:center;padding:10px}button{font:inherit;padding:8px 16px;border-radius:999px;border:0;background:#111;color:#fff;cursor:pointer}
@media print{.bar{display:none}body{background:#fff}.r{margin:0;width:auto}}</style></head><body>
<div class="bar"><button onclick="print()">Imprimir</button></div>
<div class="r"><h1>${esc(negocio)}</h1><div class="m">${[cfg.nit && `NIT ${esc(cfg.nit)}`, esc(cfg.dir), esc(cfg.tel)].filter(Boolean).join(' · ')}</div>
<div class="t"><b>Recibo de pago N.º ${p.num}</b><span>${esc(p.fecha)}</span></div>
<p>Recibimos de <b>${esc(p.estudiante)}</b>${p.documento ? ` (doc. ${esc(p.documento)})` : ''}</p>
<div class="big">${pesos(p.valor)}</div>
<p>Por concepto de: ${esc(p.concepto)}<br>Curso: ${esc(p.curso)}<br>Medio de pago: ${esc(p.metodo)}</p>
${p.saldo != null ? `<div class="t"><span>Saldo pendiente del curso</span><b>${pesos(p.saldo)}</b></div>` : ''}
${p.anulado ? '<p style="color:#b00;font-weight:700">ANULADO</p>' : ''}
<p class="m">${esc(cfg.pie || '')}</p></div>
<script>if(location.search.includes('imprimir'))addEventListener('load',()=>setTimeout(print,300))</script></body></html>`;
}

export function routes(r) {
  r.get('/api/cuotas/cartera', `tenant:${MOD}`, async (c) => {
    const est = c.url.searchParams.get('estado') || 'pendientes';
    const all_ = await cartera(c);
    const rows = est === 'todas' ? all_ : est === 'pendientes' ? all_.filter((q) => q.falta > 0) : all_.filter((q) => q.estado === est);
    const sum = (f) => all_.filter(f).reduce((s, q) => s + q.falta, 0);
    const mes = today().slice(0, 7);
    return json({ rows, totales: { vencido: sum((q) => q.estado === 'vencida'), hoy: sum((q) => q.estado === 'hoy'), mes: sum((q) => q.falta > 0 && q.vence.startsWith(mes)), pendiente: sum((q) => q.falta > 0) } });
  });

  r.get('/api/cuotas/pagos', `tenant:${MOD}`, async (c) => {
    const q = c.url.searchParams, where = ['p.business_id = ?'], args = [c.businessId];
    if (DATE.test(q.get('desde') || '')) { where.push('p.fecha >= ?'); args.push(q.get('desde')); }
    if (DATE.test(q.get('hasta') || '')) { where.push('p.fecha <= ?'); args.push(q.get('hasta')); }
    if (q.get('inscripcion_id')) { where.push('p.inscripcion_id = ?'); args.push(q.get('inscripcion_id')); }
    if (q.get('q')) { where.push('(e.nombre LIKE ? OR k.nombre LIKE ? OR CAST(p.num AS TEXT) = ?)'); args.push(`%${q.get('q')}%`, `%${q.get('q')}%`, q.get('q')); }
    return json({ rows: await all(c.env, `SELECT p.*, e.nombre AS estudiante, k.nombre AS curso FROM ac_pagos p JOIN ac_inscripciones i ON i.id = p.inscripcion_id AND i.business_id = p.business_id
      JOIN ac_estudiantes e ON e.id = i.estudiante_id AND e.business_id = i.business_id JOIN ac_cursos k ON k.id = i.curso_id AND k.business_id = i.business_id
      WHERE ${where.join(' AND ')} ORDER BY p.num DESC LIMIT 1000`, ...args), metodos: METODOS });
  });

  r.post('/api/cuotas/pagos', `tenant:${MOD}`, async (c) => json(await registrarPago(c, await readJson(c.req)), 201));

  r.post('/api/cuotas/pagos/:id/anular', `manager:${MOD}`, async (c) => {
    const p = await one(c.env, `SELECT p.num, p.valor, p.fecha, p.tipo, p.metodo, p.inscripcion_id, e.nombre AS estudiante, k.nombre AS curso FROM ac_pagos p
      JOIN ac_inscripciones i ON i.id = p.inscripcion_id AND i.business_id = p.business_id JOIN ac_estudiantes e ON e.id = i.estudiante_id AND e.business_id = i.business_id
      JOIN ac_cursos k ON k.id = i.curso_id AND k.business_id = i.business_id WHERE p.id = ? AND p.business_id = ? AND p.anulado = 0`, Number(c.params.id), c.businessId);
    if (!p) throw new HttpError(404, 'Pago no encontrado o ya anulado');
    await c.env.DB.prepare('UPDATE ac_pagos SET anulado = 1, updated_at = ? WHERE id = ? AND business_id = ?').bind(now(), Number(c.params.id), c.businessId).run();
    await c.env.DB.prepare('UPDATE ac_reposiciones SET pago_id = NULL WHERE pago_id = ? AND business_id = ?').bind(Number(c.params.id), c.businessId).run();
    await audit(c, `Anuló el pago N.º ${p.num} por ${pesos(p.valor)}`, { modulo: MOD });
    await movimientoFinanzas(c, { ...p, anulado: true, hoy: today() });
    return json({ ok: true });
  });

  // Manda a Finanzas los pagos de antes (no duplica los que ya están). Hasta 500 por vez.
  r.post('/api/cuotas/sync-finanzas', `manager:${MOD}`, async (c) => {
    // Primero las cuentas de cobro de las matrículas que tienen pagos; luego los pagos ligados a ellas.
    const cfgSync = await getConfig(c.env, c.businessId);
    const conPagos = !cfgSync.cuentaCobro ? [] : await all(c.env, "SELECT DISTINCT inscripcion_id AS id FROM ac_pagos WHERE business_id = ? AND anulado = 0 AND tipo = 'cuota' LIMIT 500", c.businessId);
    for (const m of conPagos) await cuentaDeMatricula(c, m.id);
    const pagos = await all(c.env, `SELECT p.num, p.valor, p.fecha, p.tipo, p.metodo, p.inscripcion_id, e.nombre AS estudiante, k.nombre AS curso FROM ac_pagos p
      JOIN ac_inscripciones i ON i.id = p.inscripcion_id AND i.business_id = p.business_id JOIN ac_estudiantes e ON e.id = i.estudiante_id AND e.business_id = i.business_id
      JOIN ac_cursos k ON k.id = i.curso_id AND k.business_id = i.business_id WHERE p.business_id = ? AND p.anulado = 0 ORDER BY p.num LIMIT 500`, c.businessId);
    let nuevos = 0, enviados = 0;
    for (const p of pagos) { const r = await movimientoFinanzas(c, cfgSync.cuentaCobro ? p : { ...p, inscripcion_id: null }); if (r.enviado) enviados++; if (r.nuevo) nuevos++; }
    if (pagos.length && !enviados) throw new HttpError(409, 'Finanzas no está activo para este negocio o no respondió');
    await audit(c, `Envió ${nuevos} pagos nuevos a Finanzas`, { modulo: MOD });
    return json({ revisados: pagos.length, nuevos });
  });

  r.get('/api/cuotas/pagos/:id/recibo', `tenant:${MOD}`, async (c) => {
    const p = await one(c.env, `SELECT p.*, e.nombre AS estudiante, e.documento, k.nombre AS curso, i.valor AS ivalor, i.descuento FROM ac_pagos p
      JOIN ac_inscripciones i ON i.id = p.inscripcion_id AND i.business_id = p.business_id JOIN ac_estudiantes e ON e.id = i.estudiante_id AND e.business_id = i.business_id
      JOIN ac_cursos k ON k.id = i.curso_id AND k.business_id = i.business_id WHERE p.id = ? AND p.business_id = ?`, Number(c.params.id), c.businessId);
    if (!p) throw new HttpError(404, 'Pago no encontrado');
    const hasta = (await one(c.env, "SELECT COALESCE(SUM(valor), 0) s FROM ac_pagos WHERE business_id = ? AND inscripcion_id = ? AND tipo = 'cuota' AND anulado = 0 AND num <= ?", c.businessId, p.inscripcion_id, p.num)).s;
    const negocio = (await one(c.env, 'SELECT name FROM businesses WHERE id = ?', c.businessId)).name;
    return new Response(recibo({ ...p, saldo: p.tipo === 'cuota' ? Math.max(0, p.ivalor - p.descuento - hasta) : null }, await getConfig(c.env, c.businessId), negocio),
      { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  });

  r.get('/api/cuotas/resumen', `tenant:${MOD}`, async (c) => {
    const rows = await cartera(c), mes = today().slice(0, 7);
    const venc = rows.filter((q) => q.estado === 'vencida'), deMes = rows.filter((q) => q.falta > 0 && q.vence.startsWith(mes));
    return json({ titulo: 'Cuotas vencidas', valor: pesos(venc.reduce((s, q) => s + q.falta, 0)), detalle: `${venc.length} cuotas · por cobrar este mes ${pesos(deMes.reduce((s, q) => s + q.falta, 0))}`, icono: 'bi-calendar-check', ruta: '/staff/cuotas.html' });
  });
}
