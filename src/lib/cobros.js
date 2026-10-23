// Cobros de Eventos, Certificaciones y Asesorías. Todos cobran por Finanzas (recibo de caja, ref academia:cobro:<id>),
// pero si ya se pagó por fuera se marca «ya pagado» con una nota y, si hay, el comprobante (foto/PDF): ese no genera recibo.
//   GET  <base>/<recurso>/:id/cobros                         lista de cobros y saldo
//   POST <base>/<recurso>/:id/cobros { valor, metodo?, fecha?, nota?, ya_pagado? }
//   POST <base>/<recurso>/:id/cobros/:cid/comprobante         (cuerpo = el archivo)  ·  GET …/comprobante
//   POST <base>/<recurso>/:id/cobros/:cid/anular              anula también el recibo en Finanzas
import { json, readJson, HttpError } from './http.js';
import { all, one, now, today, cast, DATE } from './crud.js';
import { audit } from './audit.js';
import { reciboExterno } from './central.js';
import { guardarArchivo, servirArchivo, borrarArchivo } from './archivos.js';

export const METODOS_COBRO = ['Efectivo', 'Transferencia', 'Nequi', 'Daviplata', 'Tarjeta', 'Bre-B', 'Consignación', 'Otro'];

// Lo cobrado (sin anulados) de varios registros del mismo origen: { id: pagado }.
export async function pagadoDe(env, businessId, origen, ids) {
  if (!ids.length) return {};
  const rows = await all(env, `SELECT origen_id, SUM(valor) s FROM ac_cobros WHERE business_id = ? AND origen = ? AND anulado = 0 AND origen_id IN (${ids.map(() => '?').join(',')}) GROUP BY origen_id`, businessId, origen, ...ids);
  return Object.fromEntries(rows.map((r) => [r.origen_id, r.s]));
}
export const estadoCobro = (precio, pagado) => (!(precio > 0) ? 'sin_cobro' : (pagado || 0) >= precio ? 'pagado' : (pagado || 0) > 0 ? 'parcial' : 'pendiente');

// cfg: { r, base, modulo, recurso, origen, cargar(c, id) -> { precio, tercero, concepto, centro } | null }
export function cobrosRoutes({ r, base, modulo, recurso, origen, cargar }) {
  const ruta = `${base}/${recurso}/:id/cobros`;
  const idOf = (c, k = 'id') => { const n = Number(c.params[k]); if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Id no válido'); return n; };
  const dato = async (c) => { const id = idOf(c), d = await cargar(c, id); if (!d) throw new HttpError(404, 'No encontrado'); return { id, ...d }; };
  const publico = ({ r2_key, ...x }) => ({ ...x, comprobante: !!r2_key });
  const cobro = async (c, id, cid) => {
    const x = await one(c.env, 'SELECT * FROM ac_cobros WHERE id = ? AND business_id = ? AND origen = ? AND origen_id = ?', cid, c.businessId, origen, id);
    if (!x) throw new HttpError(404, 'No encontrado');
    return x;
  };

  r.get(ruta, `tenant:${modulo}`, async (c) => {
    const d = await dato(c);
    const rows = await all(c.env, 'SELECT * FROM ac_cobros WHERE business_id = ? AND origen = ? AND origen_id = ? ORDER BY id DESC', c.businessId, origen, d.id);
    const pagado = rows.filter((x) => !x.anulado).reduce((a, x) => a + x.valor, 0);
    return json({ precio: d.precio, pagado, saldo: Math.max(0, d.precio - pagado), estado: estadoCobro(d.precio, pagado), rows: rows.map(publico) });
  });

  r.post(ruta, `tenant:${modulo}`, async (c) => {
    const d = await dato(c), b = await readJson(c.req);
    const valor = cast('valor', 'money!', b.valor);
    if (!(valor > 0)) throw new HttpError(400, 'Escribe el valor');
    const pagado = (await one(c.env, 'SELECT COALESCE(SUM(valor), 0) s FROM ac_cobros WHERE business_id = ? AND origen = ? AND origen_id = ? AND anulado = 0', c.businessId, origen, d.id)).s;
    if (d.precio > 0 && valor > d.precio - pagado) throw new HttpError(400, `El valor supera el saldo ($${Math.max(0, d.precio - pagado).toLocaleString('es-CO')})`);
    const fecha = DATE.test(b.fecha || '') && b.fecha <= today() ? b.fecha : today();
    const metodo = METODOS_COBRO.includes(b.metodo) ? b.metodo : null;
    const ya = b.ya_pagado ? 1 : 0, nota = b.nota ? String(b.nota).trim().slice(0, 300) : null;
    if (ya && !nota) throw new HttpError(400, 'Si ya estaba pagado, escribe una nota (quién recibió, cómo, cuándo) o adjunta el comprobante después');
    const t = now();
    const res = await c.env.DB.prepare('INSERT INTO ac_cobros (business_id, origen, origen_id, valor, metodo, fecha, nota, ya_pagado, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(c.businessId, origen, d.id, valor, metodo, fecha, nota, ya, c.session?.email || null, t, t).run();
    const cid = res.meta.last_row_id;
    let recibo = null;
    if (!ya) {
      const f = await reciboExterno(c, { ref: `academia:cobro:${cid}`, fecha, valor, metodo, tercero: d.tercero, centro: d.centro, concepto: d.concepto, notas: nota });
      recibo = f.recibo;
      if (recibo) await c.env.DB.prepare('UPDATE ac_cobros SET recibo = ? WHERE id = ?').bind(String(recibo), cid).run();
    }
    await audit(c, `${ya ? 'Marcó como ya pagado' : 'Registró cobro'} $${valor.toLocaleString('es-CO')} · ${d.concepto}`, { modulo });
    return json({ id: cid, recibo, ya_pagado: !!ya }, 201);
  });

  r.post(`${ruta}/:cid/comprobante`, `tenant:${modulo}`, async (c) => {
    const d = await dato(c), x = await cobro(c, d.id, idOf(c, 'cid'));
    const f = await guardarArchivo(c, `cobro/${x.id}`);
    await c.env.DB.prepare('UPDATE ac_cobros SET r2_key = ?, mime = ?, nombre = ?, updated_at = ? WHERE id = ? AND business_id = ?').bind(f.key, f.mime, f.nombre, now(), x.id, c.businessId).run();
    await borrarArchivo(c.env, x.r2_key);
    await audit(c, `Adjuntó comprobante al cobro de ${d.concepto}`, { modulo });
    return json({ ok: true });
  });
  r.get(`${ruta}/:cid/comprobante`, `tenant:${modulo}`, async (c) => {
    const d = await dato(c), x = await cobro(c, d.id, idOf(c, 'cid'));
    return servirArchivo(c, { key: x.r2_key, mime: x.mime, nombre: x.nombre });
  });

  r.post(`${ruta}/:cid/anular`, `manager:${modulo}`, async (c) => {
    const d = await dato(c), x = await cobro(c, d.id, idOf(c, 'cid'));
    if (x.anulado) throw new HttpError(409, 'Ese cobro ya está anulado');
    await c.env.DB.prepare('UPDATE ac_cobros SET anulado = 1, updated_at = ? WHERE id = ? AND business_id = ?').bind(now(), x.id, c.businessId).run();
    if (!x.ya_pagado) await reciboExterno(c, { ref: `academia:cobro:${x.id}`, anulado: true });
    await audit(c, `Anuló cobro de ${d.concepto}`, { modulo });
    return json({ ok: true });
  });
}
