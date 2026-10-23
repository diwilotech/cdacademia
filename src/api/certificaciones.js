// Certificaciones: exámenes OFICIALES externos (ÖSD, DELE, TOEFL, Cambridge…). No son las evaluaciones de clase de Cursos.
//   examenes      tipo de examen = entidad + nivel + partes con puntos máximos + mínimos por grupo + curso que prepara para él
//   convocatorias fecha, cierre de inscripción, cupo, precio y modalidad (Papel | Digital | Ambas)
//   candidatos    inscripción (pago por Finanzas, documento con foto, condiciones), hoja escaneada (R2 privada), puntos de 2 evaluadores + tercero, resultado
// Reglas configurables: partes [{ n, max, g }] y minimos { grupo: puntos }. Aprueba quien llega al mínimo de cada grupo.
//   GET  /api/certificaciones/elegibles?convocatoria_id=      estudiantes del curso que prepara ese examen y aún no inscritos
//   POST /api/certificaciones/candidatos/:id/hoja             (cuerpo = foto/PDF, hasta 10 MB)  ·  GET …/hoja
//   POST /api/certificaciones/candidatos/:id/calcular         { eval1?, eval2?, tercero?, puntos? } guarda y calcula el resultado
//   POST /api/certificaciones/cargar-ejemplos                 ÖSD A1, A2 y B2 con sus puntos (revisar contra la versión vigente de ÖSD)
import { json, readJson, HttpError } from '../lib/http.js';
import { crud, all, one, now } from '../lib/crud.js';
import { parse } from '../lib/academia.js';
import { audit } from '../lib/audit.js';
import { cobrosRoutes, pagadoDe, estadoCobro } from '../lib/cobros.js';
import { guardarArchivo, servirArchivo, borrarArchivo } from '../lib/archivos.js';

const MOD = 'certificaciones';
const MODALIDADES = ['Papel', 'Digital', 'Ambas'];

function validarReglas(c, row) {
  if ('partes' in row && row.partes) {
    const lista = typeof row.partes === 'string' ? parse(row.partes, []) : row.partes;
    if (!Array.isArray(lista)) throw new HttpError(400, 'Las partes deben ser una lista');
    row.partes = JSON.stringify(lista.slice(0, 20).map((p) => {
      const max = Number(p.max), n = String(p.n || '').trim().slice(0, 40), grupo = String(p.g || 'total').trim().slice(0, 30);
      if (!n || !(max > 0) || max > 1000) throw new HttpError(400, 'Cada parte necesita nombre y puntos máximos');
      return { n, max, g: grupo };
    }));
  }
  if ('minimos' in row && row.minimos != null) {
    const m = typeof row.minimos === 'string' ? parse(row.minimos, {}) : row.minimos;
    const out = {};
    for (const [k, v] of Object.entries(m || {})) { const n = Number(v); if (!(n >= 0) || n > 10000) throw new HttpError(400, `Mínimo no válido en ${k}`); out[String(k).slice(0, 30)] = n; }
    row.minimos = JSON.stringify(out);
  }
}

// Resultado según las reglas del examen: suma por grupo y compara con su mínimo. Devuelve { resultado, detalle }.
export function calcular(examen, puntos) {
  const partes = parse(examen.partes, []), minimos = parse(examen.minimos, {});
  if (!partes.length) return { resultado: 'pendiente', detalle: 'El examen no tiene partes configuradas' };
  const faltan = partes.filter((p) => puntos[p.n] == null || puntos[p.n] === '');
  if (faltan.length) return { resultado: 'pendiente', detalle: `Faltan puntos: ${faltan.map((p) => p.n).join(', ')}` };
  const grupos = {};
  for (const p of partes) {
    const v = Number(puntos[p.n]);
    if (!(v >= 0) || v > p.max) throw new HttpError(400, `${p.n}: los puntos van de 0 a ${p.max}`);
    const g = (grupos[p.g] ||= { sum: 0, max: 0 });
    g.sum += v; g.max += p.max;
  }
  let ok = true;
  const det = Object.entries(grupos).map(([g, x]) => {
    const min = minimos[g], pasa = min == null || x.sum >= min;
    if (!pasa) ok = false;
    return `${g} ${x.sum}/${x.max}${min != null ? ` (mín. ${min}) ${pasa ? '✔' : '✘'}` : ''}`;
  }).join(' · ');
  return { resultado: ok ? 'aprobado' : 'no_aprobado', detalle: det };
}

const EJEMPLOS = [
  { entidad: 'ÖSD', nombre: 'ÖSD Zertifikat A1 (ZA1)', nivel: 'A1', partes: [['Lesen', 30, 'escrita'], ['Hören', 30, 'escrita'], ['Schreiben', 15, 'escrita'], ['Sprechen', 25, 'oral']], minimos: { escrita: 38, oral: 12 } },
  { entidad: 'ÖSD', nombre: 'ÖSD Zertifikat A2 (ZA2)', nivel: 'A2', partes: [['Lesen', 25, 'escrita'], ['Hören', 30, 'escrita'], ['Schreiben', 15, 'escrita'], ['Sprechen', 20, 'oral']], minimos: { escrita: 35, oral: 10 } },
  { entidad: 'ÖSD', nombre: 'ÖSD Zertifikat B2 (ZB2)', nivel: 'B2', partes: [['Lesen', 20, 'escrita'], ['Hören', 20, 'escrita'], ['Schreiben', 30, 'escrita'], ['Sprechen', 30, 'oral']], minimos: { escrita: 42, oral: 18 } },
];

export const ENTITIES = {
  examenes: { table: 'ac_cert_examenes', label: 'el examen', title: 'nombre', search: ['nombre', 'entidad', 'nivel'], order: 'activo DESC, entidad, nivel', crear: 'manager',
    fields: { entidad: 'text!', nombre: 'text!', nivel: 'text', curso_id: 'int', precio: 'money', partes: 'doc', minimos: 'doc', reglas: 'long', activo: 'bool+' },
    refs: { curso_id: 'ac_cursos' },
    prepareBody(b) { return { ...b, partes: Array.isArray(b.partes) ? b.partes : b.partes ? parse(b.partes, []) : b.partes }; },
    beforeCreate: validarReglas, beforeUpdate: validarReglas,
    async beforeDelete(c, before) {
      if ((await one(c.env, 'SELECT COUNT(*) n FROM ac_cert_convocatorias WHERE business_id = ? AND examen_id = ?', c.businessId, before.id)).n) throw new HttpError(409, 'Tiene convocatorias: desactívalo en vez de borrarlo');
    },
    async decorate(c, rows) {
      const cursos = rows.length ? await all(c.env, 'SELECT id, nombre FROM ac_cursos WHERE business_id = ?', c.businessId) : [];
      return rows.map((e) => ({ ...e, partes: parse(e.partes, []), minimos: parse(e.minimos, {}), curso: cursos.find((k) => k.id === e.curso_id)?.nombre || null }));
    } },

  convocatorias: { table: 'ac_cert_convocatorias', label: 'la convocatoria', title: 'fecha', search: ['lugar', 'nota'], order: 'fecha DESC', crear: 'manager',
    fields: { examen_id: 'int!', fecha: 'date!', cierre: 'date', cupo: 'int', precio: 'money', modalidad: MODALIDADES, lugar: 'text', nota: 'long', estado: ['abierta', 'cerrada', 'realizada', 'cancelada'] },
    refs: { examen_id: 'ac_cert_examenes' },
    beforeCreate(c, row) { if (row.cierre && row.cierre > row.fecha) throw new HttpError(400, 'El cierre de inscripción debe ser antes del examen'); if (row.cupo == null) row.cupo = 0; },
    async beforeDelete(c, before) {
      if ((await one(c.env, 'SELECT COUNT(*) n FROM ac_cert_candidatos WHERE business_id = ? AND convocatoria_id = ?', c.businessId, before.id)).n) throw new HttpError(409, 'Tiene candidatos: cancélala en vez de borrarla');
    },
    async decorate(c, rows) {
      if (!rows.length) return rows;
      const ex = await all(c.env, 'SELECT id, nombre, entidad, nivel, precio, curso_id FROM ac_cert_examenes WHERE business_id = ?', c.businessId);
      const cnt = await all(c.env, 'SELECT convocatoria_id, COUNT(*) n FROM ac_cert_candidatos WHERE business_id = ? GROUP BY convocatoria_id', c.businessId);
      return rows.map((v) => { const e = ex.find((x) => x.id === v.examen_id) || {}; return { ...v, examen: e.nombre || null, entidad: e.entidad || null, nivel: e.nivel || null, curso_id: e.curso_id || null,
        precio_final: v.precio ?? e.precio ?? 0, candidatos: cnt.find((x) => x.convocatoria_id === v.id)?.n || 0 }; });
    } },

  candidatos: { table: 'ac_cert_candidatos', label: 'el candidato', title: 'nombre', search: ['nombre', 'documento', 'email'], order: 'id DESC',
    fields: { convocatoria_id: 'int!', estudiante_id: 'int', nombre: 'text', documento: 'text', telefono: 'text', email: 'email', modalidad: MODALIDADES.slice(0, 2), doc_foto: 'bool', acepta: 'bool', certificado_fecha: 'date', notas: 'long' },
    refs: { convocatoria_id: 'ac_cert_convocatorias', estudiante_id: 'ac_estudiantes' },
    async beforeCreate(c, row) {
      const v = await one(c.env, 'SELECT * FROM ac_cert_convocatorias WHERE id = ? AND business_id = ?', row.convocatoria_id, c.businessId);
      if (v.estado !== 'abierta') throw new HttpError(409, 'La convocatoria no está abierta');
      if (v.cupo > 0 && (await one(c.env, 'SELECT COUNT(*) n FROM ac_cert_candidatos WHERE business_id = ? AND convocatoria_id = ?', c.businessId, v.id)).n >= v.cupo) throw new HttpError(409, 'La convocatoria está llena');
      if (v.modalidad !== 'Ambas' && row.modalidad !== v.modalidad) row.modalidad = v.modalidad;
      if (row.estudiante_id) {
        const e = await one(c.env, 'SELECT nombre, documento, telefono, email FROM ac_estudiantes WHERE id = ? AND business_id = ?', row.estudiante_id, c.businessId);
        row.nombre ||= e.nombre; row.documento ||= e.documento; row.telefono ||= e.telefono; row.email ||= e.email;
        if (await one(c.env, 'SELECT 1 FROM ac_cert_candidatos WHERE business_id = ? AND convocatoria_id = ? AND estudiante_id = ?', c.businessId, v.id, row.estudiante_id)) throw new HttpError(409, 'Ya está inscrito en esta convocatoria');
      }
      if (!row.nombre) throw new HttpError(400, 'Falta el nombre');
    },
    beforeUpdate(c, row, before) { if ('nombre' in row && !row.nombre) throw new HttpError(400, 'Falta el nombre'); if ('convocatoria_id' in row && row.convocatoria_id !== before.convocatoria_id) throw new HttpError(400, 'No se cambia de convocatoria: inscribe de nuevo en la otra'); },
    async beforeDelete(c, before) {
      if ((await one(c.env, 'SELECT COUNT(*) n FROM ac_cobros WHERE business_id = ? AND origen = ? AND origen_id = ? AND anulado = 0', c.businessId, 'certificacion', before.id)).n) throw new HttpError(409, 'Tiene cobros: anúlalos primero');
    },
    afterDelete(c, before) { return borrarArchivo(c.env, before.hoja_key); },
    async decorate(c, rows) {
      if (!rows.length) return rows;
      const vs = await all(c.env, `SELECT v.id, v.fecha, v.precio, e.nombre examen, e.precio ep, e.partes, e.minimos FROM ac_cert_convocatorias v JOIN ac_cert_examenes e ON e.id = v.examen_id AND e.business_id = v.business_id WHERE v.business_id = ?`, c.businessId);
      const pag = await pagadoDe(c.env, c.businessId, 'certificacion', rows.map((x) => x.id));
      return rows.map(({ hoja_key, ...k }) => { const v = vs.find((x) => x.id === k.convocatoria_id) || {}, precio = v.precio ?? v.ep ?? 0;
        return { ...k, hoja: !!hoja_key, examen: v.examen || null, fecha: v.fecha || null, partes: parse(v.partes, []), minimos: parse(v.minimos, {}), eval1: parse(k.eval1, null), eval2: parse(k.eval2, null), tercero: parse(k.tercero, null), puntos: parse(k.puntos, null),
          precio, pagado: pag[k.id] || 0, cobro: estadoCobro(precio, pag[k.id]) }; });
    } },
};

const precioDe = async (c, id) => one(c.env, `SELECT k.id, k.nombre, k.hoja_key, k.hoja_mime, k.hoja_nombre, k.eval1, k.eval2, k.tercero, k.puntos, e.nombre examen, e.partes, e.minimos, COALESCE(v.precio, e.precio, 0) precio
  FROM ac_cert_candidatos k JOIN ac_cert_convocatorias v ON v.id = k.convocatoria_id AND v.business_id = k.business_id JOIN ac_cert_examenes e ON e.id = v.examen_id AND e.business_id = v.business_id WHERE k.id = ? AND k.business_id = ?`, id, c.businessId);
const idOf = (c) => { const n = Number(c.params.id); if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Id no válido'); return n; };
const puntosLimpios = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.entries(o).slice(0, 20).filter(([, v]) => v !== '' && v != null && Number.isFinite(Number(v))).map(([k, v]) => [String(k).slice(0, 40), Number(v)])) : null);

export function routes(r) {
  crud(r, { base: '/api/certificaciones', modulo: MOD, entities: ENTITIES });

  r.get('/api/certificaciones/elegibles', `tenant:${MOD}`, async (c) => {
    const vid = Number(c.url.searchParams.get('convocatoria_id'));
    const v = await one(c.env, 'SELECT v.id, e.curso_id FROM ac_cert_convocatorias v JOIN ac_cert_examenes e ON e.id = v.examen_id AND e.business_id = v.business_id WHERE v.id = ? AND v.business_id = ?', vid, c.businessId);
    if (!v) throw new HttpError(404, 'No encontrado');
    if (!v.curso_id) return json({ curso: null, rows: [] });
    const rows = await all(c.env, `SELECT s.id, s.nombre, s.documento, s.telefono, s.email, i.estado inscripcion FROM ac_inscripciones i JOIN ac_estudiantes s ON s.id = i.estudiante_id AND s.business_id = i.business_id
      WHERE i.business_id = ? AND i.curso_id = ? AND i.estado IN ('activa','terminada') AND s.id NOT IN (SELECT estudiante_id FROM ac_cert_candidatos WHERE business_id = ? AND convocatoria_id = ? AND estudiante_id IS NOT NULL) ORDER BY s.nombre`, c.businessId, v.curso_id, c.businessId, vid);
    return json({ curso: v.curso_id, rows });
  });

  r.post('/api/certificaciones/candidatos/:id/hoja', `tenant:${MOD}`, async (c) => {
    const k = await precioDe(c, idOf(c));
    if (!k) throw new HttpError(404, 'No encontrado');
    const f = await guardarArchivo(c, `cert/${k.id}`, { max: 10 * 1024 * 1024 });
    await c.env.DB.prepare('UPDATE ac_cert_candidatos SET hoja_key = ?, hoja_mime = ?, hoja_nombre = ?, updated_at = ? WHERE id = ? AND business_id = ?').bind(f.key, f.mime, f.nombre, now(), k.id, c.businessId).run();
    await borrarArchivo(c.env, k.hoja_key);
    await audit(c, `Subió la hoja de ${k.nombre} (${k.examen})`, { modulo: MOD });
    return json({ ok: true });
  });
  r.get('/api/certificaciones/candidatos/:id/hoja', `tenant:${MOD}`, async (c) => {
    const k = await precioDe(c, idOf(c));
    if (!k) throw new HttpError(404, 'No encontrado');
    return servirArchivo(c, { key: k.hoja_key, mime: k.hoja_mime, nombre: k.hoja_nombre });
  });

  r.post('/api/certificaciones/candidatos/:id/calcular', `tenant:${MOD}`, async (c) => {
    const k = await precioDe(c, idOf(c)), b = await readJson(c.req);
    if (!k) throw new HttpError(404, 'No encontrado');
    const e1 = 'eval1' in b ? puntosLimpios(b.eval1) : parse(k.eval1, null), e2 = 'eval2' in b ? puntosLimpios(b.eval2) : parse(k.eval2, null), e3 = 'tercero' in b ? puntosLimpios(b.tercero) : parse(k.tercero, null);
    const puntos = 'puntos' in b ? puntosLimpios(b.puntos) : parse(k.puntos, null);
    if (!puntos) throw new HttpError(400, 'Faltan los puntos finales');
    const res = calcular(k, puntos);
    await c.env.DB.prepare('UPDATE ac_cert_candidatos SET eval1 = ?, eval2 = ?, tercero = ?, puntos = ?, resultado = ?, detalle = ?, updated_at = ? WHERE id = ? AND business_id = ?')
      .bind(e1 && JSON.stringify(e1), e2 && JSON.stringify(e2), e3 && JSON.stringify(e3), JSON.stringify(puntos), res.resultado, res.detalle, now(), k.id, c.businessId).run();
    await audit(c, `Registró puntos de ${k.nombre} (${k.examen}): ${res.resultado}`, { modulo: MOD });
    return json(res);
  });

  r.post('/api/certificaciones/cargar-ejemplos', `manager:${MOD}`, async (c) => {
    const t = now();
    let n = 0;
    for (const e of EJEMPLOS) {
      if (await one(c.env, 'SELECT 1 FROM ac_cert_examenes WHERE business_id = ? AND nombre = ?', c.businessId, e.nombre)) continue;
      await c.env.DB.prepare('INSERT INTO ac_cert_examenes (business_id, entidad, nombre, nivel, partes, minimos, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(c.businessId, e.entidad, e.nombre, e.nivel, JSON.stringify(e.partes.map(([n, max, g]) => ({ n, max, g }))), JSON.stringify(e.minimos), t, t).run();
      n++;
    }
    await audit(c, `Cargó ${n} exámenes de ejemplo`, { modulo: MOD });
    return json({ creados: n });
  });

  cobrosRoutes({ r, base: '/api/certificaciones', modulo: MOD, recurso: 'candidatos', origen: 'certificacion',
    async cargar(c, id) { const k = await precioDe(c, id); return k && { precio: k.precio, tercero: k.nombre, concepto: `Inscripción · ${k.examen}`, centro: null }; } });
}
