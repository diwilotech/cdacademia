// Plataforma: Diwilo Web crea los negocios, invita usuarios, cambia permisos y fija hasta cuándo está
// paga la suscripción. Nivel 'platform' = solo por RPC (ver lib/platform-rpc.js); desde internet da 401.
//
// Contrato común a todas las apps de Diwilo (no lo cambies: el panel de Diwilo depende de él):
//   GET    /api/platform/businesses                    -> { businesses: [Business] }
//   POST   /api/platform/businesses                    { name, slug?, owner_email, owner_name?, paid_until } -> { id, slug, invite_path }
//   GET    /api/platform/businesses/:id                -> Business
//   PATCH  /api/platform/businesses/:id                { name?, slug?, paid_until? }
//   POST   /api/platform/businesses/:id/users          { email, name?, role } -> { id, invite_path }
//          Si el usuario ya existe en el negocio: actualiza el rol y genera un link nuevo (sirve para restablecer).
//   PATCH  /api/platform/businesses/:id/users/:userId  { role?, email? }  permisos y/o correo (sin link ni contraseña)
//   DELETE /api/platform/businesses/:id/users/:userId  (el propietario no se quita: primero se pasa la propiedad)
//   DELETE /api/platform/businesses/:id                archiva: nadie entra; se borra por lotes a los 20 días
//   POST   /api/platform/businesses/:id/restore        lo saca del archivo
//   GET    /api/platform/businesses?archived=1         solo los archivados (con purge_on)
//   POST   /api/platform/purge                         { days? } borra por lotes los archivados vencidos (cron de Diwilo)
//   POST   /api/platform/businesses/:id/sso            pase de un solo uso para entrar como el propietario -> { path }
//   GET    /api/sso?t=<pase>                           (público) cambia el pase por la sesión del propietario
//
// Business = { id, name, slug, created_at, paid_until, read_only, archived_at, purge_on, users: [{ id, email, name, role, status, invite_path }] }
//   status: 'active' (ya tiene contraseña) | 'invited'. invite_path solo se ve al generarlo (se guarda el hash).
// Roles: owner (uno por negocio) | admin | staff. Deben coincidir con `roles` de la app en Diwilo (worker/src/platform.js).
import { json, readJson, HttpError, str, oneOf, email, date } from '../lib/http.js';
import { db, uuid } from '../lib/db.js';
import { createInvite, invitePath, isExpired, createSession, sessionCookie } from '../lib/auth.js';
import { purgeArchived, purgeDate, issueSsoTicket, takeSsoTicket } from '../lib/platform-tools.js';

const ROLES = ['owner', 'admin', 'staff'];
const RESERVED = new Set(['api', 'app', 'admin', 'login', 'assets', 'platform', 'staff', 'mcp', 'm', 'l', 'c', 'validar', 'css', 'js', 'icons', 'privacidad', 'dmca']);

const slugify = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'negocio';

async function uniqueSlug(env, wanted) {
  const base = slugify(wanted);
  for (let i = 0; i < 8; i++) {
    const slug = i ? `${base}-${crypto.randomUUID().slice(0, 4)}` : base;
    if (!RESERVED.has(slug) && !(await db(env).first('SELECT 1 FROM businesses WHERE slug = ?', slug))) return slug;
  }
  throw new HttpError(409, 'No se pudo generar una dirección única');
}

async function listBusinesses(env, id, archived = false) {
  const d = db(env);
  const [businesses, members] = await Promise.all([
    d.all(`SELECT * FROM businesses WHERE ${id ? 'id = ?' : `archived_at IS ${archived ? 'NOT NULL' : 'NULL'}`} ORDER BY created_at DESC`, ...(id ? [id] : [])),
    d.all(`SELECT m.business_id, m.role, u.id, u.email, u.name, u.password_hash IS NOT NULL AS has_password
             FROM memberships m JOIN users u ON u.id = m.user_id ${id ? 'WHERE m.business_id = ?' : ''}
            ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.email`, ...(id ? [id] : [])),
  ]);
  return businesses.map((b) => ({
    id: b.id, name: b.name, slug: b.slug, created_at: b.created_at, paid_until: b.paid_until || null,
    read_only: isExpired(b.paid_until),
    archived_at: b.archived_at || null, purge_on: purgeDate(b.archived_at),
    users: members.filter((m) => m.business_id === b.id).map((m) => ({
      id: m.id, email: m.email, name: m.name, role: m.role, status: m.has_password ? 'active' : 'invited', invite_path: null,
    })),
  }));
}

// Crea el usuario si no existe (un correo = una cuenta) y lo vincula al negocio con el rol.
// role 'owner' pasa la propiedad: el propietario anterior queda como administrador.
async function addMember(env, businessId, mail, name, role) {
  const d = db(env);
  let user = await d.first('SELECT id FROM users WHERE email = ?', mail);
  const stmts = [];
  if (!user) {
    user = { id: uuid() };
    stmts.push(d.prepare('INSERT INTO users (id, email, name) VALUES (?, ?, ?)', user.id, mail, name || mail.split('@')[0]));
  }
  if (role === 'owner') {
    stmts.push(d.prepare(`UPDATE memberships SET role = 'admin' WHERE business_id = ? AND role = 'owner' AND user_id <> ?`, businessId, user.id));
  }
  stmts.push(d.prepare(`INSERT INTO memberships (user_id, business_id, role) VALUES (?, ?, ?)
                        ON CONFLICT(user_id, business_id) DO UPDATE SET role = excluded.role`, user.id, businessId, role));
  await d.batch(stmts);
  return { id: user.id, invite_path: invitePath(await createInvite(env, user.id)) };
}

async function mustExist(env, id) {
  if (!(await db(env).first('SELECT 1 FROM businesses WHERE id = ?', id))) throw new HttpError(404, 'Negocio no encontrado');
}

export function routes(r) {
  r.get('/api/platform/businesses', 'platform', async (c) =>
    json({ businesses: await listBusinesses(c.env, null, c.url.searchParams.get('archived') === '1') }));

  r.post('/api/platform/businesses', 'platform', async (c) => {
    const body = await readJson(c.req);
    const name = str(body.name, { max: 120, required: true, label: 'Nombre' });
    const ownerEmail = email(body.owner_email, { required: true, label: 'Correo del propietario' });
    const paidUntil = date(body.paid_until) ?? null;
    const id = uuid();
    const slug = await uniqueSlug(c.env, body.slug || name);
    await db(c.env).run('INSERT INTO businesses (id, slug, name, paid_until) VALUES (?, ?, ?, ?)', id, slug, name, paidUntil);
    const owner = await addMember(c.env, id, ownerEmail, str(body.owner_name, { max: 100 }), 'owner');
    return json({ id, slug, invite_path: owner.invite_path }, 201);
  });

  r.get('/api/platform/businesses/:id', 'platform', async (c) => {
    const [b] = await listBusinesses(c.env, c.params.id);
    if (!b) throw new HttpError(404, 'Negocio no encontrado');
    return json(b);
  });

  r.patch('/api/platform/businesses/:id', 'platform', async (c) => {
    await mustExist(c.env, c.params.id);
    const body = await readJson(c.req);
    const d = db(c.env);
    const stmts = [];
    if (body.name !== undefined) {
      stmts.push(d.prepare(`UPDATE businesses SET name = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
        str(body.name, { max: 120, required: true, label: 'Nombre' }), c.params.id));
    }
    if (body.slug !== undefined) {
      const slug = slugify(str(body.slug, { max: 40, required: true, label: 'Dirección' }));
      if (slug.length < 3 || RESERVED.has(slug)) throw new HttpError(400, 'Dirección no válida');
      if (await d.first('SELECT 1 FROM businesses WHERE slug = ? AND id <> ?', slug, c.params.id)) throw new HttpError(409, 'Esa dirección ya la usa otro negocio');
      stmts.push(d.prepare(`UPDATE businesses SET slug = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, slug, c.params.id));
    }
    const paidUntil = date(body.paid_until);
    if (paidUntil !== undefined) {
      stmts.push(d.prepare(`UPDATE businesses SET paid_until = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, paidUntil, c.params.id));
    }
    if (stmts.length) await d.batch(stmts);
    return json({ ok: true });
  });

  r.post('/api/platform/businesses/:id/users', 'platform', async (c) => {
    await mustExist(c.env, c.params.id);
    const body = await readJson(c.req);
    const member = await addMember(c.env, c.params.id,
      email(body.email, { required: true }), str(body.name, { max: 100 }), oneOf(body.role, ROLES, { label: 'Rol', fallback: 'staff' }));
    return json(member, 201);
  });

  r.patch('/api/platform/businesses/:id/users/:userId', 'platform', async (c) => {
    const body = await readJson(c.req);
    const role = oneOf(body.role, ROLES, { label: 'Rol' });
    const newEmail = email(body.email);
    if (!role && !newEmail) throw new HttpError(400, 'Indica el rol o el correo');
    const d = db(c.env);
    const m = await d.first('SELECT m.role, u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.business_id = ? AND m.user_id = ?', c.params.id, c.params.userId);
    if (!m) throw new HttpError(404, 'El usuario no pertenece a este negocio');
    const stmts = [];
    // Correo: es la cuenta de la persona (la misma en todos sus negocios).
    if (newEmail && newEmail !== m.email) {
      if (await d.first('SELECT 1 FROM users WHERE email = ? AND id <> ?', newEmail, c.params.userId)) throw new HttpError(409, 'Ese correo ya tiene otra cuenta en la app');
      stmts.push(d.prepare('UPDATE users SET email = ? WHERE id = ?', newEmail, c.params.userId));
    }
    // Rol. 'owner' pasa la propiedad: el propietario anterior queda como administrador.
    if (role && role !== m.role) {
      if (m.role === 'owner') throw new HttpError(409, 'Es el propietario: para cambiarlo, asigna otro propietario');
      if (role === 'owner') stmts.push(d.prepare(`UPDATE memberships SET role = 'admin' WHERE business_id = ? AND role = 'owner'`, c.params.id));
      stmts.push(d.prepare('UPDATE memberships SET role = ? WHERE business_id = ? AND user_id = ?', role, c.params.id, c.params.userId));
    }
    if (stmts.length) await d.batch(stmts);
    return json({ ok: true, role: role || m.role, email: newEmail || m.email });
  });

  r.delete('/api/platform/businesses/:id/users/:userId', 'platform', async (c) => {
    const d = db(c.env);
    const m = await d.first('SELECT role FROM memberships WHERE business_id = ? AND user_id = ?', c.params.id, c.params.userId);
    if (m?.role === 'owner') throw new HttpError(409, 'No se puede quitar al propietario: primero asigna otro propietario');
    await d.batch([
      d.prepare('DELETE FROM memberships WHERE business_id = ? AND user_id = ?', c.params.id, c.params.userId),
      d.prepare('DELETE FROM sessions WHERE business_id = ? AND user_id = ?', c.params.id, c.params.userId),
    ]);
    return json({ ok: true });
  });

  // Archivar: nadie entra y sale de la lista. Se borra por lotes a los 20 días (POST /api/platform/purge).
  r.delete('/api/platform/businesses/:id', 'platform', async (c) => {
    const d = db(c.env);
    const b = await d.first('SELECT archived_at FROM businesses WHERE id = ?', c.params.id);
    if (!b) throw new HttpError(404, 'Negocio no encontrado');
    const at = b.archived_at || new Date().toISOString();
    await d.batch([
      d.prepare('UPDATE businesses SET archived_at = ? WHERE id = ?', at, c.params.id),
      d.prepare('DELETE FROM sessions WHERE business_id = ?', c.params.id),
    ]);
    return json({ ok: true, archived_at: at, purge_on: purgeDate(at) });
  });

  r.post('/api/platform/businesses/:id/restore', 'platform', async (c) => {
    const res = await db(c.env).run('UPDATE businesses SET archived_at = NULL WHERE id = ? AND archived_at IS NOT NULL', c.params.id);
    if (!res.meta.changes) throw new HttpError(404, 'No está archivado');
    return json({ ok: true });
  });

  r.post('/api/platform/purge', 'platform', async (c) => {
    const body = await readJson(c.req).catch(() => ({}));
    const days = Math.max(1, Math.min(365, Number(body.days) || 20));
    return json(await purgeArchived(c.env, {
      table: 'businesses', tenantCol: 'business_id', bucket: c.env.FILES,
      // Cuentas que quedaron sin ningún negocio.
      after: (env) => env.DB.prepare('DELETE FROM users WHERE id NOT IN (SELECT user_id FROM memberships)').run().catch(() => {}),
    }, { days }));
  });

  // Entrar como el propietario sin contraseña: pase de un solo uso que Diwilo abre en el navegador.
  r.post('/api/platform/businesses/:id/sso', 'platform', async (c) => {
    const owner = await db(c.env).first(
      `SELECT m.user_id FROM memberships m JOIN businesses b ON b.id = m.business_id
        WHERE m.business_id = ? AND m.role = 'owner' AND b.archived_at IS NULL`, c.params.id);
    if (!owner) throw new HttpError(404, 'El negocio no tiene propietario o está archivado');
    return json({ path: `/api/sso?t=${await issueSsoTicket(c.env, c.params.id, owner.user_id)}` });
  });

  r.get('/api/sso', 'public', async (c) => {
    const t = await takeSsoTicket(c.env, c.url.searchParams.get('t'));
    const ok = t && await db(c.env).first(
      `SELECT 1 FROM memberships m JOIN businesses b ON b.id = m.business_id AND b.status = 'active' AND b.archived_at IS NULL
        WHERE m.business_id = ? AND m.user_id = ? AND m.role = 'owner'`, t.business_id, t.user_id);
    if (!ok) return new Response('Este acceso ya se usó o venció. Vuelve a abrirlo desde Diwilo.', { status: 410, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    const token = await createSession(c.env, t.user_id, t.business_id);
    return new Response(null, { status: 302, headers: { location: '/app', 'set-cookie': sessionCookie(token, c.req), 'cache-control': 'no-store' } });
  });
}
