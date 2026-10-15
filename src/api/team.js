// Equipo del negocio: el propietario o un administrador invitan, cambian de rol y quitan a administradores y
// personal desde la app. El propietario solo lo asigna Diwilo Web (api/platform.js).
import { json, readJson, HttpError, str, oneOf, email } from '../lib/http.js';
import { db, uuid } from '../lib/db.js';
import { createInvite, invitePath } from '../lib/auth.js';

const TEAM_ROLES = ['admin', 'staff'];

async function member(c, userId) {
  const m = await db(c.env).first('SELECT role FROM memberships WHERE business_id = ? AND user_id = ?', c.businessId, userId);
  if (!m) throw new HttpError(404, 'No está en el equipo');
  if (m.role === 'owner') throw new HttpError(409, 'El propietario solo se cambia desde Diwilo');
  return m;
}
const inviteUrl = (c, token) => new URL(invitePath(token), c.url.origin).toString();

export function routes(r) {
  r.get('/api/team', 'tenant', async (c) => {
    const users = await db(c.env).all(
      `SELECT u.id, u.email, u.name, m.role, u.password_hash IS NOT NULL AS has_password
         FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.business_id = ?
        ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.email`, c.businessId);
    return json({ users: users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, status: u.has_password ? 'active' : 'invited' })) });
  });

  r.post('/api/team', 'manager', async (c) => {
    const body = await readJson(c.req);
    const mail = email(body.email, { required: true });
    const role = oneOf(body.role, TEAM_ROLES, { label: 'Rol', fallback: 'staff' });
    const d = db(c.env);
    let user = await d.first('SELECT id FROM users WHERE email = ?', mail);
    if (user && await d.first('SELECT 1 FROM memberships WHERE business_id = ? AND user_id = ?', c.businessId, user.id)) throw new HttpError(409, 'Esa persona ya está en el equipo');
    if (!user) { user = { id: uuid() }; await d.run('INSERT INTO users (id, email, name) VALUES (?, ?, ?)', user.id, mail, str(body.name, { max: 100 }) || mail.split('@')[0]); }
    await d.run('INSERT INTO memberships (user_id, business_id, role) VALUES (?, ?, ?)', user.id, c.businessId, role);
    return json({ id: user.id, invite_url: inviteUrl(c, await createInvite(c.env, user.id)) }, 201);
  });

  r.patch('/api/team/:userId', 'manager', async (c) => {
    await member(c, c.params.userId);
    const role = oneOf((await readJson(c.req)).role, TEAM_ROLES, { label: 'Rol' });
    if (!role) throw new HttpError(400, 'Rol es obligatorio');
    await db(c.env).run('UPDATE memberships SET role = ? WHERE business_id = ? AND user_id = ?', role, c.businessId, c.params.userId);
    return json({ ok: true, role });
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
