// Equipo del negocio: el propietario o un administrador invitan, cambian de rol y quitan a administradores y
// personal desde la app. El propietario solo lo asigna Diwilo Web (api/platform.js).
import { json, readJson, HttpError, str, oneOf, email } from '../lib/http.js';
import { db, uuid } from '../lib/db.js';
import { createInvite, invitePath } from '../lib/auth.js';
import { assignableModules, parseModulos, moduleAllowed } from '../lib/modules.js';

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

export function routes(r) {
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
