// Material de estudio (biblioteca): por área y nivel, con bloques de texto, enlaces, videos y archivos en R2.
// Ver y crear: todo el equipo; borrar: propietario y administrador.
//   CRUD /api/material/material   ·   POST /api/material/archivos?nombre=  (cuerpo = archivo, máx. 20 MB)
//   GET  /api/material/archivos/:key   ·   DELETE /api/material/archivos/:key
import { json, HttpError } from '../lib/http.js';
import { crud, one } from '../lib/crud.js';
import { audit } from '../lib/audit.js';
import { parse } from '../lib/academia.js';

const MOD = 'material';
const MAX = 20 * 1024 * 1024;
const INLINE = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|video\/(mp4|webm)|audio\/(mpeg|mp4|wav|ogg|webm))$/;
const TIPOS = ['texto', 'enlace', 'video', 'archivo'];
function bloques(c, row) {
  if (!('bloques' in row) || !row.bloques) return;
  row.bloques = JSON.stringify(row.bloques.slice(0, 80).map((b) => {
    if (!TIPOS.includes(b.tipo)) throw new HttpError(400, 'Tipo de bloque no válido');
    const out = { tipo: b.tipo, titulo: String(b.titulo || '').slice(0, 200) };
    if (b.tipo === 'texto') out.texto = String(b.texto || '').slice(0, 20000);
    if (b.tipo === 'enlace' || b.tipo === 'video') { const u = String(b.url || '').trim(); if (!/^https:\/\//i.test(u)) throw new HttpError(400, 'Los enlaces deben empezar por https://'); out.url = u.slice(0, 800); }
    if (b.tipo === 'archivo') {
      const key = String(b.key || '');
      if (!key.startsWith(`${c.businessId}/material/`)) throw new HttpError(400, 'Archivo no válido');
      Object.assign(out, { key, nombre: String(b.nombre || 'archivo').slice(0, 200), tipoArchivo: String(b.tipoArchivo || '').slice(0, 100) });
    }
    return out;
  }));
}
export const ENTITIES = {
  material: { table: 'ac_material', label: 'el material', title: 'titulo', search: ['titulo', 'descripcion'], order: 'titulo',
    fields: { titulo: 'text!', area_id: 'int', nivel: 'text', descripcion: 'long', bloques: 'json' },
    refs: { area_id: 'ac_areas' },
    beforeCreate: bloques, beforeUpdate: bloques,
    async afterDelete(c, before) {
      for (const b of parse(before.bloques, [])) if (b.tipo === 'archivo' && b.key?.startsWith(`${c.businessId}/`) && c.env.FILES) await c.env.FILES.delete(b.key);
    },
    decorate(c, rows) { return rows.map((m) => ({ ...m, bloques: parse(m.bloques, []) })); } },
};

export function routes(r) {
  crud(r, { base: '/api/material', modulo: MOD, entities: ENTITIES });
  r.post('/api/material/archivos', `tenant:${MOD}`, async (c) => {
    if (!c.env.FILES) throw new HttpError(501, 'Esta app no tiene almacenamiento de archivos configurado');
    if (Number(c.req.headers.get('content-length') || 0) > MAX) throw new HttpError(413, 'El archivo supera los 20 MB');
    const body = await c.req.arrayBuffer();
    if (body.byteLength > MAX) throw new HttpError(413, 'El archivo supera los 20 MB');
    if (!body.byteLength) throw new HttpError(400, 'El archivo está vacío');
    const nombre = String(c.url.searchParams.get('nombre') || 'archivo').replace(/[^\w.\- ]+/g, '_').slice(0, 100);
    const type = (c.req.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim().toLowerCase().slice(0, 100);
    const key = `${c.businessId}/material/${crypto.randomUUID()}-${nombre}`;
    await c.env.FILES.put(key, body, { httpMetadata: { contentType: type } });
    await audit(c, `Subió el archivo «${nombre}»`, { modulo: MOD });
    return json({ key, nombre, tipoArchivo: type }, 201);
  });
  r.get('/api/material/archivos/:key', `tenant:${MOD}`, async (c) => {
    const key = c.params.key;
    if (!key.startsWith(`${c.businessId}/material/`)) throw new HttpError(404, 'No encontrado');
    const obj = c.env.FILES && await c.env.FILES.get(key);
    if (!obj) throw new HttpError(404, 'No encontrado');
    const type = obj.httpMetadata?.contentType || 'application/octet-stream', inline = INLINE.test(type) && c.url.searchParams.get('dl') !== '1';
    return new Response(obj.body, { headers: { 'content-type': inline ? type : 'application/octet-stream', 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff',
      'content-disposition': inline ? 'inline' : `attachment; filename*=UTF-8''${encodeURIComponent(key.split('/').pop().replace(/^[0-9a-f-]{36}-/, ''))}` } });
  });
  r.delete('/api/material/archivos/:key', `manager:${MOD}`, async (c) => {
    const key = c.params.key;
    if (!key.startsWith(`${c.businessId}/material/`)) throw new HttpError(404, 'No encontrado');
    if (await one(c.env, 'SELECT 1 FROM ac_material WHERE business_id = ? AND bloques LIKE ?', c.businessId, `%${key}%`)) throw new HttpError(409, 'Ese archivo lo usa un material: quítalo primero');
    await c.env.FILES?.delete(key);
    return json({ ok: true });
  });
}
