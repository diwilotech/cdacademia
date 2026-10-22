// Equipo del negocio: el propietario o un administrador invitan, cambian de rol y quitan a administradores y
// personal desde la app. El propietario solo lo asigna Diwilo Web (api/platform.js).
import { json, readJson, HttpError, str, oneOf, email } from '../lib/http.js';
import { db, uuid } from '../lib/db.js';
import { createInvite, invitePath } from '../lib/auth.js';
import { assignableModules, parseModulos, moduleAllowed } from '../lib/modules.js';
import { nominaSincronizar } from '../lib/central.js';
import { audit } from '../lib/audit.js';

const TEAM_ROLES = ['admin', 'staff'];

async function member(c, userId) {
  const m = await db(c.env).first('SELECT role FROM memberships WHERE business_id = ? AND user_id = ?', c.businessId, userId);
  if (!m) throw new HttpError(404, 'No está en el equipo');
  if (m.role === 'estudiante') throw new HttpError(404, 'No está en el equipo');
  if (m.role === 'owner') throw new HttpError(409, 'El propietario solo se cambia desde Diwilo');
  return m;
}
// Lista elegida de módulos (solo ids que se pueden asignar) o error.
async function modulosDe(c, raw) {
  if (!Array.isArray(raw)) throw new HttpError(400, 'Módulos no válidos');
  const ok = new Set((await assignableModules(c.env)).map((m) => m.id));
  return JSON.stringify([...new Set(raw.map(String))].filter((id) => ok.has(id)));
}
const inviteUrl = (c, token) => new URL(invitePath(token), c.url.origin).toString();

const hoyCo = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
const minutos = (h) => { const [a, b] = String(h || '').split(':').map(Number); return Number.isFinite(a) ? a * 60 + (b || 0) : null; };

export function routes(r) {
  const personaOk = async (c, persona) => {
    const m = /^([up]):(.{1,60})$/.exec(persona || '');
    if (!m) throw new HttpError(400, 'Persona no válida');
    const ok = m[1] === 'u'
      ? await db(c.env).first("SELECT 1 FROM memberships WHERE business_id = ? AND user_id = ? AND role <> 'estudiante'", c.businessId, m[2])
      : await db(c.env).first('SELECT 1 FROM ac_profesionales WHERE business_id = ? AND id = ?', c.businessId, Number(m[2]) || 0);
    if (!ok) throw new HttpError(404, 'Esa persona no está en el equipo');
  };
  // Todas las personas del equipo (usuarios con acceso + profesionales, unidos por correo) con sus datos (documento, celular).
  // El pago ya no se define aquí: vive en el módulo Nómina; `pago` solo trae lo que había guardado antes para estrenar las personas allí.
  const personasEquipo = async (c) => {
    const d = db(c.env);
    const [nom, users, profs] = await Promise.all([
      d.all('SELECT persona, valor, periodicidad, centro_costo, documento, tipo_documento, celular, updated_at FROM ac_nomina WHERE business_id = ?', c.businessId),
      d.all("SELECT u.id, u.name, u.email, m.role FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.business_id = ? AND m.role <> 'estudiante'", c.businessId),
      d.all('SELECT id, nombre, email, telefono FROM ac_profesionales WHERE business_id = ? AND activo = 1', c.businessId)]);
    const ROL = { owner: 'Propietario', admin: 'Administrador', staff: 'Personal' }, mail = (e) => String(e || '').trim().toLowerCase();
    const datosDe = (...keys) => { const f = nom.filter((x) => keys.includes(x.persona)); if (!f.length) return {}; const base = f.find((x) => x.valor > 0) || f[0]; const pick = (k) => base[k] || f.find((x) => x[k])?.[k] || null; return { ...base, documento: pick('documento'), tipo_documento: pick('tipo_documento'), celular: pick('celular') }; };
    const ficha = (key, role, nombre, detalle, profId, g, extra = {}) => ({ key, role, nombre, detalle, email: extra.email || null, profesional_id: profId, documento: g.documento || null, tipo_documento: g.tipo_documento || (g.documento ? 'CC' : null), celular: g.celular || extra.telefono || null,
      pago: g.valor > 0 ? { valor: g.valor, periodicidad: g.periodicidad, centro_costo: g.centro_costo || null } : null, desde: g.updated_at ? new Date(g.updated_at).toISOString().slice(0, 10) : null });
    const out = users.map((u) => {
      const p = profs.find((y) => y.email && mail(y.email) === mail(u.email));
      return ficha(`u:${u.id}`, u.role, u.name || u.email, `${ROL[u.role] || u.role}${p ? ' · Profesional' : ''}`, p?.id || null, datosDe(`u:${u.id}`, p && `p:${p.id}`), { email: u.email, telefono: p?.telefono });
    });
    for (const p of profs.filter((y) => !out.some((o) => o.profesional_id === y.id))) out.push(ficha(`p:${p.id}`, 'profesional', p.nombre, 'Profesional', p.id, datosDe(`p:${p.id}`), { email: p.email, telefono: p.telefono }));
    return out;
  };
  r.get('/api/team/personas', 'manager', async (c) => json({ personas: await personasEquipo(c) }));

  // Docencia: por profesional, sus cursos con el avance de clases, lo dictado y lo que falta este mes. GET /api/team/docencia?month=AAAA-MM
  r.get('/api/team/docencia', 'tenant', async (c) => {
    const hoy = hoyCo(), q = c.url.searchParams.get('month'), month = /^\d{4}-\d{2}$/.test(q || '') ? q : hoy.slice(0, 7);
    const rows = await db(c.env).all(`SELECT k.id AS curso_id, k.nombre, k.profesional_id AS prof, k.num_clases, a.color, cl.n, cl.fecha, cl.ini, cl.fin
      FROM ac_cursos k LEFT JOIN ac_areas a ON a.id = k.area_id AND a.business_id = k.business_id LEFT JOIN ac_clases cl ON cl.curso_id = k.id AND cl.business_id = k.business_id
      WHERE k.business_id = ? AND k.profesional_id IS NOT NULL AND k.activo = 1 ORDER BY k.nombre, cl.n`, c.businessId);
    const por = new Map();
    for (const x of rows) {
      const p = por.get(x.prof) || { profesional_id: x.prof, cursos: new Map(), dictadas: 0, mes_dictadas: 0, mes_faltan: 0, horas_mes: 0, proxima: null };
      por.set(x.prof, p);
      const k = p.cursos.get(x.curso_id) || { id: x.curso_id, nombre: x.nombre, color: x.color || null, total: x.num_clases || 0, dictadas: 0, proxima: null };
      p.cursos.set(x.curso_id, k);
      if (!x.fecha) continue;
      const dictada = x.fecha < hoy, enMes = x.fecha.slice(0, 7) === month, mins = Math.max(0, (minutos(x.fin) ?? 0) - (minutos(x.ini) ?? 0));
      if (dictada) { k.dictadas++; p.dictadas++; }
      else if (!k.proxima || x.fecha < k.proxima.fecha) k.proxima = { fecha: x.fecha, ini: x.ini, n: x.n };
      if (enMes) { if (x.fecha <= hoy) { p.mes_dictadas++; p.horas_mes += mins; } else p.mes_faltan++; }
      if (!dictada && (!p.proxima || x.fecha < p.proxima.fecha || (x.fecha === p.proxima.fecha && (x.ini || '') < (p.proxima.ini || '')))) p.proxima = { fecha: x.fecha, ini: x.ini, curso: x.nombre, n: x.n };
    }
    return json({ month, hoy, profesionales: [...por.values()].map((p) => ({ ...p, cursos: [...p.cursos.values()], horas_mes: Math.round(p.horas_mes / 6) / 10 })) });
  });

  // Manda el equipo al módulo Nómina (sin duplicar): quien cobra por clase u hora entra como contratista y sus clases del mes quedan como honorarios.
  r.post('/api/team/nomina/sincronizar', 'manager', async (c) => {
    const personas = (await personasEquipo(c)).filter((p) => p.role !== 'owner');
    const hoy = hoyCo(), mes = hoy.slice(0, 7), FACTOR = { mensual: 1, quincenal: 2, semanal: 4.33 };
    const clases = await db(c.env).all(`SELECT k.profesional_id AS prof, k.nombre AS curso, cl.n, cl.fecha, cl.ini, cl.fin FROM ac_clases cl JOIN ac_cursos k ON k.id = cl.curso_id AND k.business_id = cl.business_id
      WHERE cl.business_id = ? AND k.profesional_id IS NOT NULL AND cl.fecha BETWEEN ? AND ? ORDER BY cl.fecha, cl.ini`, c.businessId, `${mes}-01`, hoy);
    const empleados = [], novedades = [];
    for (const p of personas) {
      const variable = p.pago && ['clase', 'hora'].includes(p.pago.periodicidad), soloDocente = p.key.startsWith('p:');
      empleados.push({ ref: p.key, name: p.nombre, doc_type: p.tipo_documento || 'CC', doc_number: p.documento, email: p.email, phone: p.celular, position: p.profesional_id ? 'Docente' : p.role === 'admin' ? 'Administrador' : 'Personal',
        contract_type: variable || soloDocente ? 'prestacion' : 'indefinido', salary: p.pago && FACTOR[p.pago.periodicidad] ? Math.round(p.pago.valor * FACTOR[p.pago.periodicidad]) : 0,
        start_date: p.desde || hoy, cost_center: p.pago?.centro_costo || null, notes: 'Traído de Equipo: confirma la fecha de ingreso, el tipo de contrato y el valor.' });
      if (variable && p.profesional_id) {   // una línea por clase dictada: así la cuenta de cobro lleva cada cargo separado
        for (const x of clases.filter((y) => y.prof === p.profesional_id)) {
          const horas = Math.max(0, (minutos(x.fin) ?? 0) - (minutos(x.ini) ?? 0)) / 60, amount = Math.round(p.pago.periodicidad === 'clase' ? p.pago.valor : p.pago.valor * horas);
          if (amount > 0) novedades.push({ ref: p.key, period: mes, amount, note: `Clase ${x.n} · ${x.curso} · ${x.fecha}${p.pago.periodicidad === 'hora' ? ` (${Math.round(horas * 10) / 10} h)` : ''}` });
        }
      }
    }
    const res = await nominaSincronizar(c, { empleados, novedades });
    if (!res) throw new HttpError(409, 'El módulo Nómina no está activo en este negocio');
    await audit(c, `Pasó el equipo a Nómina: ${res.creados} nuevos, ${res.actualizados} actualizados`, { modulo: 'equipo' });
    return json({ ...res, total: empleados.length });
  });

  // Datos de la persona (se editan desde Equipo): nombre, tipo y número de documento, celular. PUT /api/team/persona/:persona { nombre?, tipo_documento, documento, celular }
  r.put('/api/team/persona/:persona', 'manager', async (c) => {
    await personaOk(c, c.params.persona);
    const b = await readJson(c.req), d = db(c.env), m = /^([up]):(.+)$/.exec(c.params.persona);
    const nombre = b.nombre === undefined ? null : str(b.nombre, { max: 100, label: 'Nombre' }) || null;
    const tipo = oneOf(b.tipo_documento, ['CC', 'NIT', 'CE', 'PA'], { label: 'Tipo de documento', fallback: 'CC' });
    await d.run(`INSERT INTO ac_nomina (business_id, persona, valor, periodicidad, documento, tipo_documento, celular, updated_by, updated_at) VALUES (?, ?, 0, 'mensual', ?, ?, ?, ?, ?)
      ON CONFLICT(business_id, persona) DO UPDATE SET documento = excluded.documento, tipo_documento = excluded.tipo_documento, celular = excluded.celular, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      c.businessId, c.params.persona, str(b.documento, { max: 40 }) || null, tipo, str(b.celular, { max: 30 }) || null, c.session.user_id, Date.now());
    if (nombre) {
      if (m[1] === 'u') await d.run('UPDATE users SET name = ? WHERE id = ? AND id IN (SELECT user_id FROM memberships WHERE business_id = ?)', nombre, m[2], c.businessId);
      else await c.env.DB.prepare('UPDATE ac_profesionales SET nombre = ?, updated_at = ? WHERE id = ? AND business_id = ?').bind(nombre, Date.now(), Number(m[2]), c.businessId).run();
    }
    await audit(c, 'Editó los datos de una persona del equipo', { modulo: 'equipo' });
    return json({ ok: true });
  });

  r.get('/api/team', 'tenant', async (c) => {
    const users = await db(c.env).all(
      `SELECT u.id, u.email, u.name, m.role, m.modulos, u.password_hash IS NOT NULL AS has_password
         FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.business_id = ? AND m.role <> 'estudiante'
        ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.email`, c.businessId);
    const catalogo = (await assignableModules(c.env)).map((m) => ({ id: m.id, nombre: m.nombre, defecto: moduleAllowed('staff', null, m.id) }));
    return json({ catalogo, users: users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, status: u.has_password ? 'active' : 'invited',
      modulos: u.role === 'staff' ? catalogo.map((m) => m.id).filter((id) => moduleAllowed('staff', parseModulos(u.modulos), id)) : null })) });
  });

  r.post('/api/team', 'manager', async (c) => {
    const body = await readJson(c.req);
    const mail = email(body.email, { required: true });
    const role = oneOf(body.role, TEAM_ROLES, { label: 'Rol', fallback: 'staff' });
    const d = db(c.env);
    let user = await d.first('SELECT id FROM users WHERE email = ?', mail);
    if (user && await d.first('SELECT 1 FROM memberships WHERE business_id = ? AND user_id = ?', c.businessId, user.id)) throw new HttpError(409, 'Esa persona ya está en el equipo');
    if (!user) { user = { id: uuid() }; await d.run('INSERT INTO users (id, email, name) VALUES (?, ?, ?)', user.id, mail, str(body.name, { max: 100 }) || mail.split('@')[0]); }
    const modulos = Array.isArray(body.modulos) && role === 'staff' ? await modulosDe(c, body.modulos) : null;
    await d.run('INSERT INTO memberships (user_id, business_id, role, modulos) VALUES (?, ?, ?, ?)', user.id, c.businessId, role, modulos);
    return json({ id: user.id, invite_url: inviteUrl(c, await createInvite(c.env, user.id)) }, 201);
  });

  r.patch('/api/team/:userId', 'manager', async (c) => {
    await member(c, c.params.userId);
    const body = await readJson(c.req);
    const d = db(c.env);
    if (body.role !== undefined) {
      const role = oneOf(body.role, TEAM_ROLES, { label: 'Rol' });
      await d.run('UPDATE memberships SET role = ? WHERE business_id = ? AND user_id = ?', role, c.businessId, c.params.userId);
    }
    if (body.modulos !== undefined) await d.run('UPDATE memberships SET modulos = ? WHERE business_id = ? AND user_id = ?', await modulosDe(c, body.modulos), c.businessId, c.params.userId);
    return json({ ok: true });
  });

  r.post('/api/team/:userId/invite', 'manager', async (c) => {
    await member(c, c.params.userId);
    return json({ invite_url: inviteUrl(c, await createInvite(c.env, c.params.userId)) });
  });

  r.delete('/api/team/:userId', 'manager', async (c) => {
    await member(c, c.params.userId);
    const d = db(c.env);
    await d.batch([
      d.prepare('DELETE FROM memberships WHERE business_id = ? AND user_id = ?', c.businessId, c.params.userId),
      d.prepare('DELETE FROM sessions WHERE business_id = ? AND user_id = ?', c.businessId, c.params.userId),
    ]);
    return json({ ok: true });
  });
}
