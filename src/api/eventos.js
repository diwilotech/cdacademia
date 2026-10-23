// Eventos: conversación semanal, cine, ferias, charlas… Cupo, asistentes con lista de espera, precio opcional (cobra por Finanzas) y página pública de inscripción.
//   CRUD /api/eventos/eventos  (repetir_semanas al crear: crea una copia por semana)  ·  CRUD /api/eventos/asistentes
//   GET  /api/eventos/resumen                                   KPIs y próximos
//   Cobros: /api/eventos/asistentes/:id/cobros… (ver lib/cobros.js)  ·  Página pública: /<negocio>/eventos (lib/eventos-web.js)
import { json, HttpError } from '../lib/http.js';
import { crud, all, one, addDays, today } from '../lib/crud.js';
import { cobrosRoutes, pagadoDe, estadoCobro } from '../lib/cobros.js';

const MOD = 'eventos';
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEF = { estado: 'abierto', tipo: 'General', publico: 1, cupo: 0, precio: 0 };
export const TIPOS =['General', 'Semanal', 'Cultural', 'Charla', 'Taller', 'Feria'];

const ocupados = (env, businessId, eventoId) => one(env, "SELECT COUNT(*) n FROM ac_evento_asistentes WHERE business_id = ? AND evento_id = ? AND estado IN ('inscrito','asistio')", businessId, eventoId).then((x) => x.n);

function validarHoras(c, row) {
  for (const k of ['hora_ini', 'hora_fin']) if (row[k] && !HORA.test(row[k])) throw new HttpError(400, 'Hora no válida (HH:MM)');
  if (row.hora_ini && row.hora_fin && row.hora_fin <= row.hora_ini) throw new HttpError(400, 'La hora de fin debe ser después de la de inicio');
}

// Estado de un asistente nuevo: lista de espera si el evento está lleno.
export async function estadoNuevo(env, businessId, ev) {
  return ev.cupo > 0 && (await ocupados(env, businessId, ev.id)) >= ev.cupo ? 'espera' : 'inscrito';
}

export const ENTITIES = {
  eventos: { table: 'ac_eventos', label: 'el evento', title: 'titulo', search: ['titulo', 'lugar', 'tipo'], order: 'fecha DESC, hora_ini',
    fields: { titulo: 'text!', tipo: 'text', fecha: 'date!', hora_ini: 'text', hora_fin: 'text', lugar: 'text', enlace: 'url', descripcion: 'long', cupo: 'int', precio: 'money', publico: 'bool+', curso_id: 'int', estado: ['abierto', 'cancelado'] },
    refs: { curso_id: 'ac_cursos' },
    beforeCreate(c, row, body) {
      validarHoras(c, row);
      if (row.cupo == null || row.cupo < 0) row.cupo = 0;
      const rep = Math.min(52, Math.max(0, Number(body.repetir_semanas) || 0));
      if (rep) { c._rep = rep; row.serie = crypto.randomUUID().slice(0, 8); c._serie = row.serie; }
    },
    async afterCreate(c, id, row) {
      if (!c._rep) return;
      const t = Date.now(), cols = ['titulo', 'tipo', 'fecha', 'hora_ini', 'hora_fin', 'lugar', 'enlace', 'descripcion', 'cupo', 'precio', 'publico', 'curso_id', 'estado', 'serie'];
      const base = { ...row, serie: c._serie };
      for (let i = 1; i <= c._rep; i++) {
        const v = { ...base, fecha: addDays(row.fecha, 7 * i) };
        await c.env.DB.prepare(`INSERT INTO ac_eventos (business_id, ${cols.join(', ')}, created_at, updated_at) VALUES (?, ${cols.map(() => '?').join(', ')}, ?, ?)`)
          .bind(c.businessId, ...cols.map((k) => v[k] ?? DEF[k] ?? null), t, t).run();
      }
    },
    beforeUpdate(c, row) { validarHoras(c, row); },
    async beforeDelete(c, before) {
      if ((await one(c.env, 'SELECT COUNT(*) n FROM ac_evento_asistentes WHERE business_id = ? AND evento_id = ?', c.businessId, before.id)).n) throw new HttpError(409, 'El evento tiene asistentes: cancélalo en vez de borrarlo');
    },
    async decorate(c, rows) {
      if (!rows.length) return rows;
      const cnt = await all(c.env, `SELECT evento_id, estado, COUNT(*) n FROM ac_evento_asistentes WHERE business_id = ? AND evento_id IN (${rows.map(() => '?').join(',')}) GROUP BY evento_id, estado`, c.businessId, ...rows.map((x) => x.id));
      return rows.map((e) => {
        const m = Object.fromEntries(cnt.filter((x) => x.evento_id === e.id).map((x) => [x.estado, x.n]));
        return { ...e, inscritos: (m.inscrito || 0) + (m.asistio || 0), espera: m.espera || 0, asistieron: m.asistio || 0, no_asistieron: m.no_asistio || 0 };
      });
    } },

  asistentes: { table: 'ac_evento_asistentes', label: 'el asistente', title: 'nombre', search: ['nombre', 'email', 'telefono'], order: 'id DESC',
    fields: { evento_id: 'int!', estudiante_id: 'int', nombre: 'text', telefono: 'text', email: 'email', estado: ['inscrito', 'espera', 'asistio', 'no_asistio'], origen: 'text', nota: 'long' },
    refs: { evento_id: 'ac_eventos', estudiante_id: 'ac_estudiantes' },
    async beforeCreate(c, row, body) {
      const ev = await one(c.env, 'SELECT * FROM ac_eventos WHERE id = ? AND business_id = ?', row.evento_id, c.businessId);
      if (ev.estado === 'cancelado') throw new HttpError(409, 'El evento está cancelado');
      if (row.estudiante_id) {
        const e = await one(c.env, 'SELECT nombre, telefono, email FROM ac_estudiantes WHERE id = ? AND business_id = ?', row.estudiante_id, c.businessId);
        row.nombre ||= e.nombre; row.telefono ||= e.telefono; row.email ||= e.email;
        if (await one(c.env, 'SELECT 1 FROM ac_evento_asistentes WHERE business_id = ? AND evento_id = ? AND estudiante_id = ?', c.businessId, ev.id, row.estudiante_id)) throw new HttpError(409, 'Ya está inscrito');
      }
      if (!row.nombre) throw new HttpError(400, 'Falta el nombre');
      if (row.email && await one(c.env, 'SELECT 1 FROM ac_evento_asistentes WHERE business_id = ? AND evento_id = ? AND email = ?', c.businessId, ev.id, row.email)) throw new HttpError(409, 'Ese correo ya está inscrito');
      if (!('estado' in body) || !body.estado) row.estado = await estadoNuevo(c.env, c.businessId, ev);
    },
    async beforeUpdate(c, row, before) {
      if ('nombre' in row && !row.nombre) throw new HttpError(400, 'Falta el nombre');
      if ('evento_id' in row && row.evento_id !== before.evento_id) throw new HttpError(400, 'No se cambia de evento: inscribe de nuevo en el otro');
      if (row.estado === 'inscrito' && before.estado === 'espera') {
        const ev = await one(c.env, 'SELECT cupo FROM ac_eventos WHERE id = ? AND business_id = ?', before.evento_id, c.businessId);
        if (ev.cupo > 0 && (await ocupados(c.env, c.businessId, before.evento_id)) >= ev.cupo) throw new HttpError(409, 'El evento sigue lleno');
      }
    },
    async beforeDelete(c, before) {
      if ((await one(c.env, 'SELECT COUNT(*) n FROM ac_cobros WHERE business_id = ? AND origen = ? AND origen_id = ? AND anulado = 0', c.businessId, 'evento', before.id)).n) throw new HttpError(409, 'Tiene cobros: anúlalos primero');
    },
    async decorate(c, rows) {
      if (!rows.length) return rows;
      const evs = await all(c.env, `SELECT id, titulo, fecha, precio FROM ac_eventos WHERE business_id = ? AND id IN (${[...new Set(rows.map((x) => x.evento_id))].map(() => '?').join(',')})`, c.businessId, ...new Set(rows.map((x) => x.evento_id)));
      const pag = await pagadoDe(c.env, c.businessId, 'evento', rows.map((x) => x.id));
      return rows.map((a) => { const e = evs.find((x) => x.id === a.evento_id) || {}; return { ...a, evento: e.titulo || null, fecha: e.fecha || null, precio: e.precio || 0, pagado: pag[a.id] || 0, cobro: estadoCobro(e.precio, pag[a.id]) }; });
    } },
};

export function routes(r) {
  crud(r, { base: '/api/eventos', modulo: MOD, entities: ENTITIES });

  r.get('/api/eventos/resumen', `tenant:${MOD}`, async (c) => {
    const hoy = today(), mes = hoy.slice(0, 7);
    const prox = await all(c.env, "SELECT id, titulo, fecha, hora_ini, cupo, lugar FROM ac_eventos WHERE business_id = ? AND estado = 'abierto' AND fecha >= ? ORDER BY fecha, hora_ini LIMIT 5", c.businessId, hoy);
    const n = (sql, ...a) => one(c.env, sql, c.businessId, ...a).then((x) => x.n);
    return json({
      proximos: prox,
      eventos_proximos: await n("SELECT COUNT(*) n FROM ac_eventos WHERE business_id = ? AND estado = 'abierto' AND fecha >= ?", hoy),
      inscritos_proximos: await n("SELECT COUNT(*) n FROM ac_evento_asistentes a JOIN ac_eventos e ON e.id = a.evento_id AND e.business_id = a.business_id WHERE a.business_id = ? AND e.fecha >= ? AND e.estado = 'abierto' AND a.estado = 'inscrito'", hoy),
      asistencias_mes: await n("SELECT COUNT(*) n FROM ac_evento_asistentes a JOIN ac_eventos e ON e.id = a.evento_id AND e.business_id = a.business_id WHERE a.business_id = ? AND substr(e.fecha, 1, 7) = ? AND a.estado = 'asistio'", mes),
      en_espera: await n("SELECT COUNT(*) n FROM ac_evento_asistentes WHERE business_id = ? AND estado = 'espera'"),
    });
  });

  cobrosRoutes({ r, base: '/api/eventos', modulo: MOD, recurso: 'asistentes', origen: 'evento',
    async cargar(c, id) {
      const a = await one(c.env, 'SELECT a.nombre, e.titulo, e.precio FROM ac_evento_asistentes a JOIN ac_eventos e ON e.id = a.evento_id AND e.business_id = a.business_id WHERE a.id = ? AND a.business_id = ?', id, c.businessId);
      return a && { precio: a.precio, tercero: a.nombre, concepto: `Evento · ${a.titulo}`, centro: null };
    } });
}
