// Equipo del negocio: el propietario o un administrador invitan, cambian de rol y quitan a administradores y
// personal desde la app. El propietario solo lo asigna Diwilo Web (api/platform.js).
import { json, readJson, HttpError, str, oneOf, email } from '../lib/http.js';
import { db, uuid } from '../lib/db.js';
import { createInvite, invitePath } from '../lib/auth.js';
import { assignableModules, parseModulos, moduleAllowed } from '../lib/modules.js';
import { recurrenteNomina } from '../lib/central.js';
import { audit } from '../lib/audit.js';

const TEAM_ROLES = ['admin', 'staff'];
const PERIODOS = ['mensual', 'quincenal', 'semanal', 'clase', 'hora'];

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

export function routes(r) {
  // Nómina: cuánto se le paga a cada persona del equipo (sensible: solo propietario y administradores).
  //   GET /api/team/nomina  ·  PUT /api/team/nomina/:persona { valor, periodicidad, centro_costo?, notas? }  ·  DELETE /api/team/nomina/:persona
  const personaOk = async (c, persona) => {
    const m = /^([up]):(.{1,60})$/.exec(persona || '');
    if (!m) throw new HttpError(400, 'Persona no válida');
    const ok = m[1] === 'u'
      ? await db(c.env).first("SELECT 1 FROM memberships WHERE business_id = ? AND user_id = ? AND role <> 'estudiante'", c.businessId, m[2])
      : await db(c.env).first('SELECT 1 FROM ac_profesionales WHERE business_id = ? AND id = ?', c.businessId, Number(m[2]) || 0);
    if (!ok) throw new HttpError(404, 'Esa persona no está en el equipo');
  };
  r.get('/api/team/nomina', 'manager', async (c) => {
    const rows = await db(c.env).all('SELECT persona, valor, periodicidad, centro_costo, notas, documento, updated_at FROM ac_nomina WHERE business_id = ?', c.businessId);
    const mes = { mensual: 1, quincenal: 2, semanal: 4.33 };   // clase y hora son variables: no suman al total mensual
    return json({ rows, total_mensual: Math.round(rows.reduce((a, x) => a + x.valor * (mes[x.periodicidad] || 0), 0)) });
  });
  // Todas las personas del equipo con su pago definido (si lo hay)
  const personasConPago = async (c) => {
    const d = db(c.env);
    const [nom, users, profs] = await Promise.all([
      d.all('SELECT persona, valor, periodicidad, centro_costo, notas, documento, tipo_documento, celular FROM ac_nomina WHERE business_id = ?', c.businessId),
      d.all("SELECT u.id, u.name, u.email, m.role FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.business_id = ? AND m.role <> 'estudiante'", c.businessId),
      d.all('SELECT id, nombre, email, telefono FROM ac_profesionales WHERE business_id = ? AND activo = 1', c.businessId)]);
    const ROL = { owner: 'Propietario', admin: 'Administrador', staff: 'Personal' }, mail = (e) => String(e || '').trim().toLowerCase();
    // Una persona puede estar como usuario y como profesional: se unen sus datos (el pago de la fila que lo tenga y la cédula de cualquiera)
    const pagoDe = (...keys) => { const f = nom.filter((x) => keys.includes(x.persona)); if (!f.length) return undefined; const base = f.find((x) => x.valor > 0) || f[0]; const pick = (k) => base[k] || f.find((x) => x[k])?.[k] || null; return { ...base, documento: pick('documento'), tipo_documento: pick('tipo_documento'), celular: pick('celular') }; };
    const ficha = (key, nombre, detalle, profId, g, extra = {}) => ({ key, nombre, detalle, email: extra.email || null, profesional_id: profId, valor: g?.valor || 0, periodicidad: g?.periodicidad || 'mensual', centro_costo: g?.centro_costo || null, notas: g?.notas || null,
      documento: g?.documento || null, tipo_documento: g?.tipo_documento || (g?.documento ? 'CC' : null), celular: g?.celular || extra.telefono || null });
    const out = users.map((u) => {
      const p = profs.find((y) => y.email && mail(y.email) === mail(u.email));
      return ficha(`u:${u.id}`, u.name || u.email, `${ROL[u.role] || u.role}${p ? ' · Profesional' : ''}`, p?.id || null, pagoDe(`u:${u.id}`, p && `p:${p.id}`), { email: u.email, telefono: p?.telefono });
    });
    for (const p of profs.filter((y) => !out.some((o) => o.profesional_id === y.id))) out.push(ficha(`p:${p.id}`, p.nombre, 'Profesional', p.id, pagoDe(`p:${p.id}`), { email: p.email, telefono: p.telefono }));
    return out;
  };
  r.get('/api/team/nomina/personas', 'manager', async (c) => json({ personas: await personasConPago(c) }));
  // Lo que se aproxima a pagar en el mes a cada persona: lo fijo (sueldo) + lo variable (clases u horas que dicta) × su valor. GET /api/team/nomina/aproximado?month=AAAA-MM
  r.get('/api/team/nomina/aproximado', 'manager', async (c) => {
    const month = /^\d{4}-\d{2}$/.test(c.url.searchParams.get('month') || '') ? c.url.searchParams.get('month') : new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 7);
    const personas = await personasConPago(c), FACTOR = { mensual: 1, quincenal: 2, semanal: 4 };
    const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const clases = await db(c.env).all(`SELECT k.profesional_id AS prof, cl.fecha, cl.ini, cl.fin FROM ac_clases cl JOIN ac_cursos k ON k.id = cl.curso_id AND k.business_id = cl.business_id
      WHERE cl.business_id = ? AND k.profesional_id IS NOT NULL AND cl.fecha BETWEEN ? AND ?`, c.businessId, `${month}-01`, `${month}-31`);
    const min = (h) => { const [a, b] = String(h || '').split(':').map(Number); return Number.isFinite(a) ? a * 60 + (b || 0) : null; };
    return json({ month, rows: personas.map((p) => {
      const mias = p.profesional_id ? clases.filter((x) => x.prof === p.profesional_id) : [], horas = Math.round(mias.reduce((a, x) => a + Math.max(0, (min(x.fin) ?? 0) - (min(x.ini) ?? 0)), 0) / 6) / 10;
      const base = FACTOR[p.periodicidad] ? p.valor * FACTOR[p.periodicidad] : 0, variable = p.periodicidad === 'clase' ? p.valor * mias.length : p.periodicidad === 'hora' ? Math.round(p.valor * horas) : 0;
      const faltan = mias.filter((x) => x.fecha >= hoy), horasFaltan = Math.round(faltan.reduce((a, x) => a + Math.max(0, (min(x.fin) ?? 0) - (min(x.ini) ?? 0)), 0) / 6) / 10;
      return { key: p.key, valor: p.valor, estimado: Math.round(base + variable), clases: mias.length, clases_faltan: faltan.length, horas, horas_faltan: horasFaltan, periodicidad: p.periodicidad, definido: p.valor > 0 };
    }) });
  });
  // Las clases que dicta un profesional en un mes (para armar su pago): GET /api/team/nomina/clases?profesional=<id>&month=AAAA-MM
  r.get('/api/team/nomina/clases', 'manager', async (c) => {
    const q = c.url.searchParams, month = /^\d{4}-\d{2}$/.test(q.get('month') || '') ? q.get('month') : new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 7);
    const rows = await db(c.env).all(`SELECT cl.n, cl.fecha, cl.ini, cl.fin, cl.tema, k.nombre AS curso FROM ac_clases cl JOIN ac_cursos k ON k.id = cl.curso_id AND k.business_id = cl.business_id
      WHERE cl.business_id = ? AND k.profesional_id = ? AND cl.fecha BETWEEN ? AND ? ORDER BY cl.fecha, cl.ini`, c.businessId, Number(q.get('profesional')) || 0, `${month}-01`, `${month}-31`);
    return json({ month, clases: rows });
  });
  // Lleva a Finanzas la nómina de una persona (gasto recurrente de tipo «Nómina») con sus datos al día
  const sincronizar = async (c, key) => {
    const p = (await personasConPago(c)).find((x) => x.key === key || (key.startsWith('p:') && x.profesional_id === Number(key.slice(2))));
    if (p) await recurrenteNomina(c, { ...p, key: p.key });
  };
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
    await sincronizar(c, c.params.persona);
    return json({ ok: true });
  });
  r.put('/api/team/nomina/:persona', 'manager', async (c) => {
    await personaOk(c, c.params.persona);
    const b = await readJson(c.req);
    const valor = Math.round(Number(b.valor));
    if (!Number.isFinite(valor) || valor < 0 || valor > 1e10) throw new HttpError(400, 'Escribe un valor válido');
    const periodo = oneOf(b.periodicidad, PERIODOS, { label: 'Periodicidad', fallback: 'mensual' });
    await db(c.env).run(`INSERT INTO ac_nomina (business_id, persona, valor, periodicidad, centro_costo, notas, documento, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(business_id, persona) DO UPDATE SET valor = excluded.valor, periodicidad = excluded.periodicidad, centro_costo = excluded.centro_costo, notas = excluded.notas, documento = COALESCE(excluded.documento, ac_nomina.documento), updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      c.businessId, c.params.persona, valor, periodo, str(b.centro_costo, { max: 120 }) || null, str(b.notas, { max: 300 }) || null, b.documento === undefined ? null : str(b.documento, { max: 40 }) || null, c.session.user_id, Date.now());
    await sincronizar(c, c.params.persona);
    return json({ ok: true });
  });
  r.delete('/api/team/nomina/:persona', 'manager', async (c) => {
    await db(c.env).run('DELETE FROM ac_nomina WHERE business_id = ? AND persona = ?', c.businessId, c.params.persona);
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
