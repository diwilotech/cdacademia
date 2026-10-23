// Asesorías: acompañamiento de una persona en un trámite largo (estudiar o trabajar en el exterior, visas, becas…) por pasos.
//   tipos        plantillas que define cada negocio: pasos en orden y, por paso, los documentos que se piden
//   asesorias    un proceso por persona: copia los pasos de la plantilla al crear (cambiar la plantilla no mueve procesos en curso), asesor, paso actual, próxima acción
//   docs         documentos por paso (pendiente → recibido → aprobado) con archivo privado en R2 · avances: historial
//   GET  /api/asesorias/asesorias/:id/detalle                          proceso + documentos + historial
//   POST /api/asesorias/asesorias/:id/paso { accion: avanzar|retroceder|ir, paso?, texto? }
//   POST /api/asesorias/asesorias/:id/avances { texto }                nota en el historial
//   POST /api/asesorias/asesorias/:id/docs { paso, nombre }  ·  PATCH/DELETE /api/asesorias/docs/:id  ·  POST/GET /api/asesorias/docs/:id/archivo
//   GET  /api/asesorias/resumen  ·  Cobros: /api/asesorias/asesorias/:id/cobros… (lib/cobros.js)
import { json, readJson, HttpError } from '../lib/http.js';
import { crud, all, one, now, today, addDays, cast } from '../lib/crud.js';
import { parse } from '../lib/academia.js';
import { audit } from '../lib/audit.js';
import { cobrosRoutes, pagadoDe, estadoCobro } from '../lib/cobros.js';
import { guardarArchivo, servirArchivo, borrarArchivo } from '../lib/archivos.js';

const MOD = 'asesorias';
const DOC_ESTADOS = ['pendiente', 'recibido', 'aprobado'];
const idOf = (c, k = 'id') => { const n = Number(c.params[k]); if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Id no válido'); return n; };

function validarPasos(c, row) {
  if ('pasos' in row && row.pasos) {
    const lista = typeof row.pasos === 'string' ? parse(row.pasos, []) : row.pasos;
    if (!Array.isArray(lista) || !lista.length) throw new HttpError(400, 'Agrega al menos un paso');
    row.pasos = JSON.stringify(lista.slice(0, 20).map((p) => {
      const nombre = String(p.nombre || '').trim().slice(0, 80);
      if (!nombre) throw new HttpError(400, 'Cada paso necesita un nombre');
      return { nombre, docs: (Array.isArray(p.docs) ? p.docs : []).map((d) => String(d).trim().slice(0, 120)).filter(Boolean).slice(0, 30) };
    }));
  }
}

const avance = (c, asesoriaId, paso, texto) => c.env.DB.prepare('INSERT INTO ac_asesoria_avances (business_id, asesoria_id, paso, texto, usuario, created_at) VALUES (?, ?, ?, ?, ?, ?)')
  .bind(c.businessId, asesoriaId, paso, String(texto).slice(0, 500), c.session?.email || null, now()).run();
const cargar = async (c, id) => {
  const a = await one(c.env, 'SELECT * FROM ac_asesorias WHERE id = ? AND business_id = ?', id, c.businessId);
  if (!a) throw new HttpError(404, 'No encontrado');
  return a;
};

export const ENTITIES = {
  tipos: { table: 'ac_asesoria_tipos', label: 'el tipo de asesoría', title: 'nombre', search: ['nombre', 'descripcion'], order: 'activo DESC, nombre', crear: 'manager',
    fields: { nombre: 'text!', descripcion: 'long', pasos: 'doc', precio: 'money', activo: 'bool+' },
    beforeCreate: validarPasos, beforeUpdate: validarPasos,
    async beforeDelete(c, before) {
      if ((await one(c.env, 'SELECT COUNT(*) n FROM ac_asesorias WHERE business_id = ? AND tipo_id = ?', c.businessId, before.id)).n) throw new HttpError(409, 'Tiene procesos: desactívalo en vez de borrarlo');
    },
    decorate(c, rows) { return rows.map((t) => ({ ...t, pasos: parse(t.pasos, []) })); } },

  asesorias: { table: 'ac_asesorias', label: 'la asesoría', title: 'nombre', search: ['nombre', 'email', 'telefono', 'prox_texto'], order: "CASE estado WHEN 'activo' THEN 0 WHEN 'pausado' THEN 1 ELSE 2 END, prox_fecha IS NULL, prox_fecha, id DESC",
    fields: { tipo_id: 'int!', estudiante_id: 'int', asesor_id: 'int', nombre: 'text', telefono: 'text', email: 'email', estado: ['activo', 'pausado', 'terminado', 'cancelado'], precio: 'money', prox_fecha: 'date', prox_texto: 'text', notas: 'long' },
    refs: { tipo_id: 'ac_asesoria_tipos', estudiante_id: 'ac_estudiantes', asesor_id: 'ac_profesionales' },
    async beforeCreate(c, row) {
      const t = await one(c.env, 'SELECT * FROM ac_asesoria_tipos WHERE id = ? AND business_id = ?', row.tipo_id, c.businessId);
      if (!t.activo) throw new HttpError(409, 'Ese tipo de asesoría está desactivado');
      if (row.estudiante_id) {
        const e = await one(c.env, 'SELECT nombre, telefono, email FROM ac_estudiantes WHERE id = ? AND business_id = ?', row.estudiante_id, c.businessId);
        row.nombre ||= e.nombre; row.telefono ||= e.telefono; row.email ||= e.email;
      }
      if (!row.nombre) throw new HttpError(400, 'Falta el nombre');
      if (row.precio == null) row.precio = t.precio;
      row.pasos = t.pasos || '[]';
    },
    async afterCreate(c, id, row) {
      const pasos = parse(row.pasos, []), t = now();
      for (const [i, p] of pasos.entries()) for (const d of p.docs || []) {
        await c.env.DB.prepare('INSERT INTO ac_asesoria_docs (business_id, asesoria_id, paso, nombre, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(c.businessId, id, i, d, t, t).run();
      }
      await avance(c, id, 0, 'Proceso iniciado');
    },
    async beforeUpdate(c, row, before) {
      if ('nombre' in row && !row.nombre) throw new HttpError(400, 'Falta el nombre');
      if ('tipo_id' in row && row.tipo_id !== before.tipo_id) throw new HttpError(400, 'No se cambia el tipo: crea otro proceso');
      if (row.estado && row.estado !== before.estado) c._cambio = `Estado: ${before.estado} → ${row.estado}`;
    },
    async afterUpdate(c, id, row, before) { if (c._cambio) await avance(c, id, before.paso, c._cambio); },
    async beforeDelete(c, before) {
      if ((await one(c.env, 'SELECT COUNT(*) n FROM ac_cobros WHERE business_id = ? AND origen = ? AND origen_id = ? AND anulado = 0', c.businessId, 'asesoria', before.id)).n) throw new HttpError(409, 'Tiene cobros: anúlalos primero');
    },
    async afterDelete(c, before) {
      for (const d of await all(c.env, 'SELECT r2_key FROM ac_asesoria_docs WHERE business_id = ? AND asesoria_id = ?', c.businessId, before.id)) await borrarArchivo(c.env, d.r2_key);
      await c.env.DB.batch([c.env.DB.prepare('DELETE FROM ac_asesoria_docs WHERE business_id = ? AND asesoria_id = ?').bind(c.businessId, before.id), c.env.DB.prepare('DELETE FROM ac_asesoria_avances WHERE business_id = ? AND asesoria_id = ?').bind(c.businessId, before.id)]);
    },
    async decorate(c, rows) {
      if (!rows.length) return rows;
      const tipos = await all(c.env, 'SELECT id, nombre FROM ac_asesoria_tipos WHERE business_id = ?', c.businessId);
      const profs = await all(c.env, 'SELECT id, nombre FROM ac_profesionales WHERE business_id = ?', c.businessId);
      const docs = await all(c.env, "SELECT asesoria_id, paso, COUNT(*) n, SUM(estado = 'aprobado') ok FROM ac_asesoria_docs WHERE business_id = ? GROUP BY asesoria_id, paso", c.businessId);
      const ult = await all(c.env, 'SELECT asesoria_id, MAX(created_at) t FROM ac_asesoria_avances WHERE business_id = ? GROUP BY asesoria_id', c.businessId);
      const pag = await pagadoDe(c.env, c.businessId, 'asesoria', rows.map((x) => x.id));
      return rows.map((a) => {
        const pasos = parse(a.pasos, []), d = docs.filter((x) => x.asesoria_id === a.id), aqui = d.find((x) => x.paso === a.paso);
        const t = ult.find((x) => x.asesoria_id === a.id)?.t || a.created_at;
        return { ...a, pasos, tipo: tipos.find((x) => x.id === a.tipo_id)?.nombre || null, asesor: profs.find((x) => x.id === a.asesor_id)?.nombre || null,
          paso_nombre: pasos[a.paso]?.nombre || null, total_pasos: pasos.length, docs_paso: aqui?.n || 0, docs_ok: aqui?.ok || 0,
          dias_sin_avance: Math.floor((Date.now() - t) / 86400000), pagado: pag[a.id] || 0, cobro: estadoCobro(a.precio, pag[a.id]) };
      });
    } },
};

export function routes(r) {
  crud(r, { base: '/api/asesorias', modulo: MOD, entities: ENTITIES });

  r.get('/api/asesorias/asesorias/:id/detalle', `tenant:${MOD}`, async (c) => {
    const id = idOf(c), a = await cargar(c, id);
    const docs = await all(c.env, 'SELECT id, paso, nombre, estado, archivo, nota, (r2_key IS NOT NULL) AS tiene FROM ac_asesoria_docs WHERE business_id = ? AND asesoria_id = ? ORDER BY paso, id', c.businessId, id);
    const avances = await all(c.env, 'SELECT id, paso, texto, usuario, created_at FROM ac_asesoria_avances WHERE business_id = ? AND asesoria_id = ? ORDER BY id DESC LIMIT 200', c.businessId, id);
    return json({ asesoria: { ...a, pasos: parse(a.pasos, []) }, docs, avances });
  });

  r.post('/api/asesorias/asesorias/:id/paso', `tenant:${MOD}`, async (c) => {
    const id = idOf(c), a = await cargar(c, id), b = await readJson(c.req), total = parse(a.pasos, []).length;
    if (a.estado === 'terminado' || a.estado === 'cancelado') throw new HttpError(409, 'El proceso ya está cerrado');
    let paso = a.paso;
    if (b.accion === 'avanzar') paso++; else if (b.accion === 'retroceder') paso--; else if (b.accion === 'ir') paso = Number(b.paso); else throw new HttpError(400, 'Acción no válida');
    if (!Number.isInteger(paso) || paso < 0 || paso > total) throw new HttpError(400, 'Paso no válido');
    const termina = paso >= total, nuevo = termina ? total - 1 : paso;
    await c.env.DB.prepare('UPDATE ac_asesorias SET paso = ?, estado = ?, updated_at = ? WHERE id = ? AND business_id = ?').bind(nuevo, termina ? 'terminado' : a.estado, now(), id, c.businessId).run();
    const nombre = parse(a.pasos, [])[nuevo]?.nombre;
    await avance(c, id, nuevo, [termina ? 'Proceso terminado' : `Paso: ${nombre}`, b.texto && String(b.texto).trim()].filter(Boolean).join(' — '));
    await audit(c, `${termina ? 'Terminó' : 'Movió'} la asesoría de ${a.nombre}`, { modulo: MOD });
    return json({ paso: nuevo, estado: termina ? 'terminado' : a.estado });
  });

  r.post('/api/asesorias/asesorias/:id/avances', `tenant:${MOD}`, async (c) => {
    const id = idOf(c), a = await cargar(c, id), b = await readJson(c.req), texto = String(b.texto || '').trim();
    if (!texto) throw new HttpError(400, 'Escribe la nota');
    await avance(c, id, a.paso, texto);
    return json({ ok: true }, 201);
  });

  /* ---- documentos ---- */
  const doc = async (c, id) => {
    const d = await one(c.env, 'SELECT * FROM ac_asesoria_docs WHERE id = ? AND business_id = ?', id, c.businessId);
    if (!d) throw new HttpError(404, 'No encontrado');
    return d;
  };
  r.post('/api/asesorias/asesorias/:id/docs', `tenant:${MOD}`, async (c) => {
    const id = idOf(c), a = await cargar(c, id), b = await readJson(c.req), nombre = cast('nombre', 'text!', b.nombre), paso = Number(b.paso ?? a.paso);
    if (!Number.isInteger(paso) || paso < 0 || paso >= parse(a.pasos, []).length) throw new HttpError(400, 'Paso no válido');
    const t = now();
    const res = await c.env.DB.prepare('INSERT INTO ac_asesoria_docs (business_id, asesoria_id, paso, nombre, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(c.businessId, id, paso, nombre, t, t).run();
    return json({ id: res.meta.last_row_id }, 201);
  });
  r.patch('/api/asesorias/docs/:id', `tenant:${MOD}`, async (c) => {
    const d = await doc(c, idOf(c)), b = await readJson(c.req), set = [], args = [];
    if ('estado' in b) { if (!DOC_ESTADOS.includes(b.estado)) throw new HttpError(400, 'Estado no válido'); set.push('estado = ?'); args.push(b.estado); }
    if ('nota' in b) { set.push('nota = ?'); args.push(b.nota ? String(b.nota).trim().slice(0, 300) : null); }
    if ('nombre' in b) { set.push('nombre = ?'); args.push(cast('nombre', 'text!', b.nombre)); }
    if (set.length) await c.env.DB.prepare(`UPDATE ac_asesoria_docs SET ${set.join(', ')}, updated_at = ? WHERE id = ? AND business_id = ?`).bind(...args, now(), d.id, c.businessId).run();
    return json({ ok: true });
  });
  r.delete('/api/asesorias/docs/:id', `tenant:${MOD}`, async (c) => {
    const d = await doc(c, idOf(c));
    await borrarArchivo(c.env, d.r2_key);
    await c.env.DB.prepare('DELETE FROM ac_asesoria_docs WHERE id = ? AND business_id = ?').bind(d.id, c.businessId).run();
    return json({ ok: true });
  });
  r.post('/api/asesorias/docs/:id/archivo', `tenant:${MOD}`, async (c) => {
    const d = await doc(c, idOf(c)), f = await guardarArchivo(c, `asesoria/${d.asesoria_id}`, { max: 10 * 1024 * 1024 });
    await c.env.DB.prepare("UPDATE ac_asesoria_docs SET r2_key = ?, mime = ?, archivo = ?, estado = CASE estado WHEN 'pendiente' THEN 'recibido' ELSE estado END, updated_at = ? WHERE id = ? AND business_id = ?").bind(f.key, f.mime, f.nombre, now(), d.id, c.businessId).run();
    await borrarArchivo(c.env, d.r2_key);
    return json({ ok: true });
  });
  r.get('/api/asesorias/docs/:id/archivo', `tenant:${MOD}`, async (c) => {
    const d = await doc(c, idOf(c));
    return servirArchivo(c, { key: d.r2_key, mime: d.mime, nombre: d.archivo });
  });

  r.get('/api/asesorias/resumen', `tenant:${MOD}`, async (c) => {
    const hoy = today(), n = (sql, ...a) => one(c.env, sql, c.businessId, ...a).then((x) => x.n);
    return json({
      activas: await n("SELECT COUNT(*) n FROM ac_asesorias WHERE business_id = ? AND estado = 'activo'"),
      terminadas: await n("SELECT COUNT(*) n FROM ac_asesorias WHERE business_id = ? AND estado = 'terminado'"),
      acciones_semana: await n("SELECT COUNT(*) n FROM ac_asesorias WHERE business_id = ? AND estado = 'activo' AND prox_fecha IS NOT NULL AND prox_fecha <= ?", addDays(hoy, 7)),
      sin_avance: await n("SELECT COUNT(*) n FROM ac_asesorias a WHERE a.business_id = ? AND a.estado = 'activo' AND COALESCE((SELECT MAX(created_at) FROM ac_asesoria_avances v WHERE v.business_id = a.business_id AND v.asesoria_id = a.id), a.created_at) < ?", Date.now() - 14 * 86400000),
    });
  });

  cobrosRoutes({ r, base: '/api/asesorias', modulo: MOD, recurso: 'asesorias', origen: 'asesoria',
    async cargar(c, id) { const a = await one(c.env, 'SELECT a.nombre, a.precio, t.nombre tipo FROM ac_asesorias a JOIN ac_asesoria_tipos t ON t.id = a.tipo_id AND t.business_id = a.business_id WHERE a.id = ? AND a.business_id = ?', id, c.businessId);
      return a && { precio: a.precio, tercero: a.nombre, concepto: `Asesoría · ${a.tipo}`, centro: null }; } });
}
