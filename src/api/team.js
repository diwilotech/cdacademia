// Equipo del negocio: el propietario o un administrador invitan, cambian de rol y quitan a administradores y
// personal desde la app. El propietario solo lo asigna Diwilo Web (api/platform.js).
import { json, readJson, HttpError, str, oneOf, email } from '../lib/http.js';
import { db, uuid } from '../lib/db.js';
import { createInvite, invitePath } from '../lib/auth.js';
import { assignableModules, parseModulos, moduleAllowed } from '../lib/modules.js';

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
    const rows = await db(c.env).all('SELECT persona, valor, periodicidad, centro_costo, notas, updated_at FROM ac_nomina WHERE business_id = ?', c.businessId);
    const mes = { mensual: 1, quincenal: 2, semanal: 4.33 };   // clase y hora son variables: no suman al total mensual
    return json({ rows, total_mensual: Math.round(rows.reduce((a, x) => a + x.valor * (mes[x.periodicidad] || 0), 0)) });
  });
  // Personas con pago definido (nombre, rol y valor): lo usa Finanzas → Pagos del mes → Nómina
  r.get('/api/team/nomina/personas', 'manager', async (c) => {
    const d = db(c.env);
    const [nom, users, profs] = await Promise.all([
      d.all('SELECT persona, valor, periodicidad, centro_costo, notas FROM ac_nomina WHERE business_id = ? AND valor > 0', c.businessId),
      d.all("SELECT u.id, u.name, u.email, m.role FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.business_id = ? AND m.role <> 'estudiante'", c.businessId),
      d.all('SELECT id, nombre, email FROM ac_profesionales WHERE business_id = ?', c.businessId)]);
    const ROL = { owner: 'Propietario', admin: 'Administrador', staff: 'Personal' };
    return json({ personas: nom.map((x) => {
      const u = x.persona.startsWith('u:') ? users.find((y) => y.id === x.persona.slice(2)) : null, p = x.persona.startsWith('p:') ? profs.find((y) => String(y.id) === x.persona.slice(2)) : null;
      return { key: x.persona, nombre: u ? (u.name || u.email) : p?.nombre || x.persona, detalle: u ? ROL[u.role] || u.role : p ? 'Profesional' : '', valor: x.valor, periodicidad: x.periodicidad, centro_costo: x.centro_costo, notas: x.notas };
    }) });
  });
  r.put('/api/team/nomina/:persona', 'manager', async (c) => {
    await personaOk(c, c.params.persona);
    const b = await readJson(c.req);
    const valor = Math.round(Number(b.valor));
    if (!Number.isFinite(valor) || valor < 0 || valor > 1e10) throw new HttpError(400, 'Escribe un valor válido');
    const periodo = oneOf(b.periodicidad, PERIODOS, { label: 'Periodicidad', fallback: 'mensual' });
    await db(c.env).run(`INSERT INTO ac_nomina (business_id, persona, valor, periodicidad, centro_costo, notas, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(business_id, persona) DO UPDATE SET valor = excluded.valor, periodicidad = excluded.periodicidad, centro_costo = excluded.centro_costo, notas = excluded.notas, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      c.businessId, c.params.persona, valor, periodo, str(b.centro_costo, { max: 120 }) || null, str(b.notas, { max: 300 }) || null, c.session.user_id, Date.now());
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
