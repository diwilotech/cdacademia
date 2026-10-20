// Matrículas: inscribir un estudiante a un curso con su plan de cuotas (inicial, número de cuotas, frecuencia),
// cupón de descuento o descuento a mano. Ver: propietario y administrador.
//   GET    /api/matriculas?curso_id=&estudiante_id=&estado=     lista con total, pagado, saldo y vencido
//   POST   /api/matriculas            { estudiante_id, curso_id, fecha?, cupon?, descuento?, plan: { inicial, n, frecuencia, primera } }
//   PATCH  /api/matriculas/:id        { estado?, plan?, descuento? }  (cambiar el plan rehace las cuotas; lo pagado se respeta)
//   DELETE /api/matriculas/:id        solo si no tiene pagos
//   GET    /api/matriculas/:id/cuotas  estado de cada cuota
import { json, readJson, HttpError } from '../lib/http.js';
import { all, one, now, today, cast, DATE } from '../lib/crud.js';
import { audit } from '../lib/audit.js';
import { generarCuotas, estadoCuotas, parse, getConfig } from '../lib/academia.js';
import { finanzasLeer, finanzasPagina, cuentaDeCobro } from '../lib/central.js';

const MOD = 'matriculas';
const FREQ = ['mensual', 'quincenal', 'semanal'];

function planDe(p, fecha) {
  const plan = { inicial: Math.max(0, Math.round(Number(p?.inicial) || 0)), n: Math.max(1, Math.min(48, Math.round(Number(p?.n) || 1))), frecuencia: FREQ.includes(p?.frecuencia) ? p.frecuencia : 'mensual', primera: p?.primera || fecha };
  if (!DATE.test(plan.primera)) throw new HttpError(400, 'Fecha de la primera cuota no válida');
  return plan;
}
async function guardarCuotas(c, ins, plan) {
  const cuotas = generarCuotas(ins.valor - ins.descuento, plan, ins.fecha), t = now();
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM ac_cuotas WHERE business_id = ? AND inscripcion_id = ?').bind(c.businessId, ins.id),
    ...cuotas.map((q) => c.env.DB.prepare('INSERT INTO ac_cuotas (business_id, inscripcion_id, n, etiqueta, vence, valor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(c.businessId, ins.id, q.n, q.etiqueta, q.vence, q.valor, t, t)),
  ]);
  return cuotas;
}
export async function pagadoDe(c, inscripcionId) {
  return (await one(c.env, "SELECT COALESCE(SUM(valor), 0) s FROM ac_pagos WHERE business_id = ? AND inscripcion_id = ? AND tipo = 'cuota' AND anulado = 0", c.businessId, inscripcionId)).s;
}
// Precio con cupón: valida vigencia y usos.
async function aplicarCupon(c, cursoId, codigo, precio) {
  if (!codigo) return { descuento: 0, cupon: null };
  const q = await one(c.env, 'SELECT * FROM ac_cupones WHERE business_id = ? AND curso_id = ? AND codigo = ?', c.businessId, cursoId, String(codigo).toUpperCase().trim());
  if (!q) throw new HttpError(400, 'El cupón no existe para este curso');
  if (q.hasta && q.hasta < today()) throw new HttpError(400, 'El cupón ya venció');
  if (q.max && q.usos >= q.max) throw new HttpError(400, 'El cupón ya se usó todas las veces permitidas');
  return { descuento: Math.min(precio, q.tipo === 'pct' ? Math.round(precio * q.valor / 100) : q.valor), cupon: q };
}

// Los pagos de una matrícula tal como están en Finanzas: un recibo de caja por pago («academia:pago:<N.º>»). El libro es Finanzas; lo local solo dice
// qué números de pago son de esta matrícula. `faltan` = pagos que aún no se enviaron a Finanzas.
export async function pagosDeFinanzas(c, id) {
  const ins = await one(c.env, `SELECT i.id, i.valor, i.descuento, e.nombre AS estudiante, e.documento, k.nombre AS curso FROM ac_inscripciones i
    JOIN ac_estudiantes e ON e.id = i.estudiante_id AND e.business_id = i.business_id JOIN ac_cursos k ON k.id = i.curso_id AND k.business_id = i.business_id
    WHERE i.id = ? AND i.business_id = ?`, id, c.businessId);
  if (!ins) throw new HttpError(404, 'Matrícula no encontrada');
  const locales = await all(c.env, 'SELECT num, valor, fecha, tipo, metodo, concepto, anulado FROM ac_pagos WHERE business_id = ? AND inscripcion_id = ? ORDER BY num DESC', c.businessId, id);
  const { rows = [] } = locales.length ? await finanzasLeer(c, `/api/finanzas/receipts?q=${encodeURIComponent(ins.estudiante)}&limit=1000`) : {};
  const porRef = new Map(rows.filter((m) => m.ref).map((m) => [m.ref, m]));
  const pagos = locales.map((p) => {
    const rc = porRef.get(`academia:pago:${p.num}`);
    return { num: p.num, fecha: rc?.date || p.fecha, valor: rc?.amount ?? p.valor, tipo: p.tipo, metodo: rc?.method || p.metodo, concepto: rc?.concept || p.concepto,
      recibo: rc?.number || null, recibo_id: rc?.id || null, anulado: !!rc?.voided || !!p.anulado, en_finanzas: !!rc };
  });
  return { ins, pagos, faltan: pagos.filter((p) => !p.en_finanzas && !p.anulado).length };
}

// La cuenta de cobro de la matrícula en Finanzas: se emite al matricular (con una línea por cuota) y después queda igual aunque cambien las cuotas;
// los pagos se abonan sobre ella. Devuelve {id, number} o null.
export async function cuentaDeMatricula(c, id) {
  if (!(await getConfig(c.env, c.businessId)).cuentaCobro) return null;   // este negocio trabaja solo con recibos de caja
  const ins = await one(c.env, `SELECT i.id, i.fecha, i.valor, i.descuento, e.nombre AS estudiante, e.documento, e.email, k.nombre AS curso FROM ac_inscripciones i
    JOIN ac_estudiantes e ON e.id = i.estudiante_id AND e.business_id = i.business_id JOIN ac_cursos k ON k.id = i.curso_id AND k.business_id = i.business_id
    WHERE i.id = ? AND i.business_id = ?`, id, c.businessId);
  if (!ins) return null;
  const vence = (await one(c.env, 'SELECT MAX(vence) v FROM ac_cuotas WHERE business_id = ? AND inscripcion_id = ?', c.businessId, id))?.v || null;
  // Una línea por cuota (inicial incluida) para que la cuenta de cobro muestre el plan de pagos.
  const cuotas = await all(c.env, 'SELECT n, etiqueta, vence, valor FROM ac_cuotas WHERE business_id = ? AND inscripcion_id = ? ORDER BY n', c.businessId, id);
  const fmt = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const items = cuotas.map((q) => ({ concepto: `${q.etiqueta || (q.n === 0 ? 'Cuota inicial' : `Cuota ${q.n}`)} · ${ins.curso}`, detalle: `Vence el ${fmt(q.vence)}`, valor: q.valor }));
  const concepto = `Matrícula · ${ins.curso}${cuotas.length > 1 ? ` · plan de ${cuotas.length} pagos` : ''}`;
  return cuentaDeCobro(c, { ...ins, total: ins.valor - ins.descuento, vence, concepto, items });
}

export function routes(r) {
  // La cuenta de cobro de la matrícula (la crea en Finanzas si todavía no existe) lista para imprimir.
  r.get('/api/matriculas/:id/cuenta-de-cobro', 'tenant:cuotas', async (c) => {
    const cuenta = await cuentaDeMatricula(c, Number(c.params.id));
    if (!cuenta) throw new HttpError(409, 'No se pudo preparar la cuenta de cobro: revisa que Finanzas esté activo y que la matrícula tenga valor.');
    return finanzasPagina(c, `/api/finanzas/invoices/${cuenta.id}/pdf`);
  });

  r.get('/api/matriculas/:id/pagos', 'tenant:cuotas', async (c) => {
    const { ins, pagos, faltan } = await pagosDeFinanzas(c, Number(c.params.id));
    return json({ cuenta_cobro: !!(await getConfig(c.env, c.businessId)).cuentaCobro, estudiante: ins.estudiante, curso: ins.curso, pagos, faltan, total: pagos.filter((p) => !p.anulado).reduce((s, p) => s + p.valor, 0) });
  });

  // El recibo de caja de un pago: es el de Finanzas.
  r.get('/api/matriculas/:id/pagos/:num/recibo', 'tenant:cuotas', async (c) => {
    const { pagos } = await pagosDeFinanzas(c, Number(c.params.id));
    const p = pagos.find((x) => x.num === Number(c.params.num));
    if (!p) throw new HttpError(404, 'Pago no encontrado');
    if (!p.en_finanzas) throw new HttpError(409, 'Este pago aún no está en Finanzas: pulsa «Enviar pagos a Finanzas» en Matrículas.');
    return finanzasPagina(c, `/api/finanzas/receipts/${p.recibo_id}/pdf`);
  });

  r.get('/api/matriculas', `tenant:${MOD}`, async (c) => {
    const q = c.url.searchParams, where = ['i.business_id = ?'], args = [c.businessId];
    for (const [k, col] of [['curso_id', 'i.curso_id'], ['estudiante_id', 'i.estudiante_id'], ['estado', 'i.estado']]) if (q.get(k)) { where.push(`${col} = ?`); args.push(q.get(k)); }
    if (q.get('q')) { where.push('(e.nombre LIKE ? OR k.nombre LIKE ? OR e.documento LIKE ?)'); args.push(...Array(3).fill(`%${q.get('q')}%`)); }
    const rows = await all(c.env, `SELECT i.*, e.nombre AS estudiante, e.telefono, k.nombre AS curso FROM ac_inscripciones i
      JOIN ac_estudiantes e ON e.id = i.estudiante_id AND e.business_id = i.business_id JOIN ac_cursos k ON k.id = i.curso_id AND k.business_id = i.business_id
      WHERE ${where.join(' AND ')} ORDER BY i.fecha DESC, i.id DESC LIMIT 1000`, ...args);
    const ids = rows.map((x) => x.id);
    const [cuotas, pagos] = ids.length ? await Promise.all([
      all(c.env, `SELECT inscripcion_id, n, etiqueta, vence, valor FROM ac_cuotas WHERE business_id = ? AND inscripcion_id IN (${ids.map(() => '?').join(',')})`, c.businessId, ...ids),
      all(c.env, `SELECT inscripcion_id, SUM(valor) s FROM ac_pagos WHERE business_id = ? AND tipo = 'cuota' AND anulado = 0 AND inscripcion_id IN (${ids.map(() => '?').join(',')}) GROUP BY inscripcion_id`, c.businessId, ...ids),
    ]) : [[], []];
    return json({ rows: rows.map((x) => {
      const pagado = pagos.find((p) => p.inscripcion_id === x.id)?.s || 0, total = x.valor - x.descuento;
      const est = estadoCuotas(cuotas.filter((q) => q.inscripcion_id === x.id), pagado);
      return { ...x, plan: parse(x.plan, null), total, pagado, saldo: Math.max(0, total - pagado), vencido: est.filter((q) => q.estado === 'vencida').reduce((s, q) => s + q.falta, 0),
        proxima: est.find((q) => q.falta > 0) || null };
    }) });
  });

  r.post('/api/matriculas', `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req);
    const est = await one(c.env, 'SELECT id, nombre FROM ac_estudiantes WHERE id = ? AND business_id = ?', cast('estudiante', 'int!', b.estudiante_id), c.businessId);
    const k = await one(c.env, 'SELECT id, nombre, precio FROM ac_cursos WHERE id = ? AND business_id = ?', cast('curso', 'int!', b.curso_id), c.businessId);
    if (!est || !k) throw new HttpError(400, 'Estudiante o curso no válido');
    if (await one(c.env, 'SELECT 1 FROM ac_inscripciones WHERE business_id = ? AND estudiante_id = ? AND curso_id = ?', c.businessId, est.id, k.id)) throw new HttpError(409, `${est.nombre} ya está matriculado en ${k.nombre}`);
    const fecha = cast('fecha', 'date', b.fecha) || today();
    const valor = b.valor !== undefined && b.valor !== '' ? cast('valor', 'money', b.valor) : k.precio;
    const { descuento: dCupon, cupon } = await aplicarCupon(c, k.id, b.cupon, valor);
    const descuento = Math.min(valor, dCupon + (cast('descuento', 'money', b.descuento) || 0));
    const plan = planDe(b.plan, fecha), t = now();
    const res = await c.env.DB.prepare('INSERT INTO ac_inscripciones (business_id, estudiante_id, curso_id, fecha, valor, descuento, cupon, estado, plan, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(c.businessId, est.id, k.id, fecha, valor, descuento, cupon?.codigo || null, 'activa', JSON.stringify(plan), t, t).run();
    const ins = { id: res.meta.last_row_id, valor, descuento, fecha };
    const cuotas = await guardarCuotas(c, ins, plan);
    if (cupon) await c.env.DB.prepare('UPDATE ac_cupones SET usos = usos + 1, updated_at = ? WHERE id = ? AND business_id = ?').bind(t, cupon.id, c.businessId).run();
    await audit(c, `Matriculó a ${est.nombre} en «${k.nombre}» por $${(valor - descuento).toLocaleString('es-CO')}${cupon ? ` (cupón ${cupon.codigo})` : ''}`, { modulo: MOD });
    const cuenta = await cuentaDeMatricula(c, ins.id);   // cuenta de cobro automática en Finanzas
    return json({ id: ins.id, total: valor - descuento, cuotas, cuenta_de_cobro: cuenta?.number || null }, 201);
  });

  r.patch('/api/matriculas/:id', `manager:${MOD}`, async (c) => {
    const ins = await one(c.env, 'SELECT * FROM ac_inscripciones WHERE id = ? AND business_id = ?', Number(c.params.id), c.businessId);
    if (!ins) throw new HttpError(404, 'Matrícula no encontrada');
    const b = await readJson(c.req), set = {};
    if (b.estado !== undefined) { if (!['activa', 'terminada', 'retirada'].includes(b.estado)) throw new HttpError(400, 'Estado no válido'); set.estado = b.estado; }
    if (b.descuento !== undefined) set.descuento = Math.min(ins.valor, cast('descuento', 'money', b.descuento) || 0);
    let plan = null;
    if (b.plan !== undefined || set.descuento !== undefined) { plan = planDe(b.plan || parse(ins.plan, {}), ins.fecha); set.plan = JSON.stringify(plan); }
    const cols = Object.keys(set);
    if (cols.length) await c.env.DB.prepare(`UPDATE ac_inscripciones SET ${cols.map((x) => `${x} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND business_id = ?`).bind(...cols.map((x) => set[x]), now(), ins.id, c.businessId).run();
    if (plan) await guardarCuotas(c, { ...ins, ...set }, plan);
    await audit(c, `Editó una matrícula${set.estado ? ` (${set.estado})` : ''}${plan ? ' y rehízo sus cuotas' : ''}`, { modulo: MOD });
    if (plan) await cuentaDeMatricula(c, ins.id);   // solo la crea si faltaba: la cuenta ya emitida no cambia
    return json({ ok: true });
  });

  r.delete('/api/matriculas/:id', `manager:${MOD}`, async (c) => {
    const ins = await one(c.env, 'SELECT i.id, e.nombre, k.nombre AS curso FROM ac_inscripciones i JOIN ac_estudiantes e ON e.id = i.estudiante_id JOIN ac_cursos k ON k.id = i.curso_id WHERE i.id = ? AND i.business_id = ?', Number(c.params.id), c.businessId);
    if (!ins) throw new HttpError(404, 'Matrícula no encontrada');
    if (await one(c.env, 'SELECT 1 FROM ac_pagos WHERE business_id = ? AND inscripcion_id = ? AND anulado = 0', c.businessId, ins.id)) throw new HttpError(409, 'La matrícula tiene pagos: márcala como retirada en vez de borrarla');
    await c.env.DB.batch([...['ac_cuotas', 'ac_asistencia', 'ac_notas', 'ac_reposiciones', 'ac_pagos', 'ac_examenes'].map((t) => c.env.DB.prepare(`DELETE FROM ${t} WHERE business_id = ? AND inscripcion_id = ?`).bind(c.businessId, ins.id)),
      c.env.DB.prepare('DELETE FROM ac_inscripciones WHERE id = ? AND business_id = ?').bind(ins.id, c.businessId)]);
    await audit(c, `Borró la matrícula de ${ins.nombre} en «${ins.curso}»`, { modulo: MOD });
    return json({ ok: true });
  });

  r.get('/api/matriculas/:id/cuotas', `tenant:${MOD}`, async (c) => {
    const ins = await one(c.env, 'SELECT id, valor, descuento FROM ac_inscripciones WHERE id = ? AND business_id = ?', Number(c.params.id), c.businessId);
    if (!ins) throw new HttpError(404, 'Matrícula no encontrada');
    const cuotas = await all(c.env, 'SELECT n, etiqueta, vence, valor FROM ac_cuotas WHERE business_id = ? AND inscripcion_id = ?', c.businessId, ins.id);
    const pagado = await pagadoDe(c, ins.id);
    return json({ total: ins.valor - ins.descuento, pagado, cuotas: estadoCuotas(cuotas, pagado) });
  });
}
