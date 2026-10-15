// CRUD genérico por negocio para los módulos (Finanzas, Marketing y los propios de cada app).
// Cada entidad declara su tabla y sus campos con tipo; el motor valida cada campo, filtra SIEMPRE por c.businessId,
// pone las fechas de creación/edición y deja cada cambio en la bitácora.
//
//   const api = crud(r, { base: '/api/finanzas', modulo: 'finanzas', entities: { movements: { ... } } });
//   GET    <base>/<entidad>?q=&f_<campo>=&limit=     listar (búsqueda en `search`, filtros por campo)
//   POST   <base>/<entidad>                           crear
//   PATCH  <base>/<entidad>/:id                       editar (solo los campos que llegan)
//   DELETE <base>/<entidad>/:id                       borrar (por defecto solo propietario/administrador)
//
// Tipos de campo: text | long | email | url | date | month | money | int | num | usd | bool | json | ['opción', …]
//   «!» = obligatorio (text!) · «+» en bool = sí por defecto (bool+)
// Entidad: { table, label, title (campo que la nombra), search: [...], order, fields, readOnly?, prepareBody(body)?,
//            refs: { campo: 'tabla' } (el id referido debe ser del mismo negocio),
//            leer?, crear?, borrar? (nivel: 'tenant' | 'manager'), beforeCreate(c,row,body), afterCreate(c,id,row),
//            beforeUpdate(c,row,before), afterUpdate(c,id,row,before), beforeDelete(c,before), afterDelete(c,before), decorate(c,rows) }
// Las tablas llevan: id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, created_at INTEGER, updated_at INTEGER.
import { json, readJson, HttpError } from './http.js';
import { audit } from './audit.js';
import { todayBogota } from './auth.js';

export const today = todayBogota;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH = /^\d{4}-\d{2}$/;
export const now = () => Date.now();
export const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
export function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1 + n, 1));
  f.setUTCDate(Math.min(d, new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate()));
  return f.toISOString().slice(0, 10);
}
export const all = async (env, sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;
export const one = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();

export function cast(key, type, v) {
  if (Array.isArray(type)) {
    if (v === null || v === undefined || v === '') return type[0];
    if (!type.includes(v)) throw new HttpError(400, `Valor no válido para ${key}`);
    return v;
  }
  const t = type.replace(/[!+]$/, '');
  if (v === null || v === undefined || v === '') {
    if (type.endsWith('!')) throw new HttpError(400, `Falta ${key}`);
    return t === 'bool' ? (type.endsWith('+') ? 1 : 0) : null;
  }
  switch (t) {
    case 'text': return String(v).trim().slice(0, 300);
    case 'long': return String(v).trim().slice(0, 5000);
    case 'email': { const s = String(v).trim().toLowerCase().slice(0, 254); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new HttpError(400, `Correo no válido en ${key}`); return s; }
    case 'url': { const s = String(v).trim().slice(0, 500); if (!/^https?:\/\//i.test(s)) throw new HttpError(400, `La dirección de ${key} debe empezar por https://`); return s; }
    case 'date': { const s = String(v).slice(0, 10); if (!DATE.test(s) || Number.isNaN(Date.parse(s))) throw new HttpError(400, `Fecha no válida en ${key}`); return s; }
    case 'month': { const s = String(v).slice(0, 7); if (!MONTH.test(s)) throw new HttpError(400, `Mes no válido en ${key}`); return s; }
    case 'money': case 'int': {
      const n = Math.round(Number(String(v).replace(/[^\d.-]/g, '')));
      if (!Number.isFinite(n) || Math.abs(n) > 1e13) throw new HttpError(400, `Número no válido en ${key}`);
      if (t === 'money' && n < 0) throw new HttpError(400, `${key} no puede ser negativo`);
      return n;
    }
    case 'bool': return v === true || v === 1 || v === '1' || v === 'true' || v === 'on' ? 1 : 0;
    case 'json': {
      let x = v;
      if (typeof x === 'string') { try { x = JSON.parse(x); } catch { throw new HttpError(400, `Formato no válido en ${key}`); } }
      if (!Array.isArray(x)) throw new HttpError(400, `${key} debe ser una lista`);
      return x;
    }
    case 'usd': case 'num': {
      const n = Number(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
      if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `Número no válido en ${key}`);
      return Math.round(n * (t === 'usd' ? 100 : 10000)) / (t === 'usd' ? 100 : 10000);
    }
    default: return String(v);
  }
}

// creating: aplica obligatorios y valores por defecto de todo el esquema; editando: solo lo que llega.
export function pick(def, body, creating) {
  const out = {};
  for (const [k, type] of Object.entries(def.fields)) {
    if (!creating && !(k in body)) continue;
    out[k] = cast(k, type, body[k]);
  }
  return out;
}

// Un campo que apunta a otro registro (cuenta, campaña, contacto…) solo puede apuntar a uno del mismo negocio.
async function checkRefs(c, def, row) {
  for (const [field, table] of Object.entries(def.refs || {})) {
    if (row[field] == null) continue;
    if (!(await one(c.env, `SELECT 1 FROM ${table} WHERE id = ? AND business_id = ?`, row[field], c.businessId))) throw new HttpError(400, `${field} no existe en este negocio`);
  }
}

const nameOf = (def, row) => (def.title && row?.[def.title] ? ` «${String(row[def.title]).slice(0, 60)}»` : '');

export function crud(r, { base, modulo, entities }) {
  const get = async (c, def, id) => {
    const row = await one(c.env, `SELECT * FROM ${def.table} WHERE id = ? AND business_id = ?`, id, c.businessId);
    if (!row) throw new HttpError(404, 'No encontrado');
    return row;
  };

  async function list(c, name, params = new URLSearchParams()) {
    const def = entities[name];
    const q = (params.get('q') || '').trim();
    const limit = Math.min(1000, Math.max(1, Number(params.get('limit')) || 500));
    const where = ['business_id = ?'], args = [c.businessId];
    if (q && def.search?.length) { where.push('(' + def.search.map((col) => `${col} LIKE ?`).join(' OR ') + ')'); def.search.forEach(() => args.push(`%${q}%`)); }
    for (const [k, v] of params) {
      const col = k.startsWith('f_') ? k.slice(2) : null;
      if (col && (col in def.fields || col === 'id') && v !== '') { where.push(`${col} = ?`); args.push(v); }
    }
    const rows = await all(c.env, `SELECT * FROM ${def.table} WHERE ${where.join(' AND ')} ORDER BY ${def.order || 'id DESC'} LIMIT ${limit}`, ...args);
    return def.decorate ? def.decorate(c, rows) || rows : rows;
  }

  async function create(c, name, body) {
    const def = entities[name];
    if (def.prepareBody) body = def.prepareBody(body);
    const row = pick(def, body, true);
    await checkRefs(c, def, row);
    if (def.beforeCreate) await def.beforeCreate(c, row, body);
    for (const k of Object.keys(row)) if (row[k] === null) delete row[k]; // vacío: que aplique el valor por defecto de la tabla
    const t = now(), cols = Object.keys(row);
    const res = await c.env.DB.prepare(`INSERT INTO ${def.table} (business_id, ${cols.join(', ')}, created_at, updated_at) VALUES (?, ${cols.map(() => '?').join(', ')}, ?, ?)`)
      .bind(c.businessId, ...cols.map((k) => row[k]), t, t).run();
    const id = res.meta.last_row_id;
    if (def.afterCreate) await def.afterCreate(c, id, row);
    await audit(c, `Creó ${def.label || name}${nameOf(def, row)}`, { modulo });
    return { id };
  }

  async function update(c, name, id, body) {
    const def = entities[name];
    const before = await get(c, def, id);
    const row = pick(def, body, false);
    for (const [k, type] of Object.entries(def.fields)) if (row[k] === null && type === 'money' && typeof before[k] === 'number') row[k] = 0;
    await checkRefs(c, def, row);
    if (def.beforeUpdate) await def.beforeUpdate(c, row, before);
    const cols = Object.keys(row);
    if (cols.length) {
      await c.env.DB.prepare(`UPDATE ${def.table} SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND business_id = ?`)
        .bind(...cols.map((k) => row[k]), now(), id, c.businessId).run();
    }
    if (def.afterUpdate) await def.afterUpdate(c, id, row, before);
    await audit(c, `Editó ${def.label || name}${nameOf(def, { ...before, ...row })}`, { modulo });
    return { ok: true };
  }

  async function remove(c, name, id) {
    const def = entities[name];
    const before = await get(c, def, id);
    if (def.beforeDelete) await def.beforeDelete(c, before);
    await c.env.DB.prepare(`DELETE FROM ${def.table} WHERE id = ? AND business_id = ?`).bind(id, c.businessId).run();
    if (def.afterDelete) await def.afterDelete(c, before);
    await audit(c, `Borró ${def.label || name}${nameOf(def, before)}`, { modulo });
    return { ok: true };
  }

  const idOf = (c) => { const id = Number(c.params.id); if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Id no válido'); return id; };
  for (const [name, def] of Object.entries(entities)) {
    const path = `${base}/${name}`;
    r.get(path, `${def.leer || 'tenant'}:${modulo}`, async (c) => json({ rows: await list(c, name, c.url.searchParams) }));
    if (def.readOnly) continue;
    r.post(path, `${def.crear || 'tenant'}:${modulo}`, async (c) => json(await create(c, name, await readJson(c.req)), 201));
    r.patch(`${path}/:id`, `${def.crear || 'tenant'}:${modulo}`, async (c) => json(await update(c, name, idOf(c), await readJson(c.req))));
    r.delete(`${path}/:id`, `${def.borrar || 'manager'}:${modulo}`, async (c) => json(await remove(c, name, idOf(c))));
  }
  return { list, create, update, remove, get: (c, name, id) => get(c, entities[name], id) };
}
