// Login, invitación, negocio activo, cambio de contraseña y salida. Igual en todas las apps de Diwilo.
import { json, readJson, HttpError, str } from '../lib/http.js';
import { db } from '../lib/db.js';
import {
  userByEmail, userBusinesses, checkPassword, setPassword, createSession, sessionCookie, loadSession,
  userByInvite, isExpired,
} from '../lib/auth.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { APP } from '../lib/modules.js';

// Versión de la política de tratamiento de datos que el usuario acepta (public/privacidad.html).
export const POLICY_VERSION = '2026-10';

// Abre sesión; si el usuario está en un solo negocio, lo deja elegido.
async function startSession(c, userId) {
  const businesses = await userBusinesses(c.env, userId);
  const token = await createSession(c.env, userId, businesses.length === 1 ? businesses[0].id : null);
  return json({ ok: true, businesses: businesses.map(publicBusiness) }, 200, { 'set-cookie': sessionCookie(token, c.req) });
}

const publicBusiness = (b) => ({ id: b.id, name: b.name, slug: b.slug, role: b.role, readOnly: isExpired(b.paid_until) });

export function routes(r) {
  // Datos públicos para el login: nombre de la app y llave pública de Turnstile.
  r.get('/api/config', 'public', async (c) => json({ app: APP.nombre, tema: APP.tema, turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || null, policyVersion: POLICY_VERSION }));

  r.post('/api/auth/login', 'public', async (c) => {
    const { email, password, turnstile } = await readJson(c.req);
    const mail = String(email || '').trim().toLowerCase();
    if (!mail || !password) throw new HttpError(400, 'Escribe tu correo y tu contraseña');
    await verifyTurnstile(c, turnstile);
    const user = await userByEmail(c.env, mail);
    await checkPassword(c.env, user, mail, password, c.req);
    return startSession(c, user.id);
  });

  // Estado de la sesión: lo usan el login (para saltar al panel) y el encabezado del panel.
  r.get('/api/auth/me', 'session', async (c) => {
    const s = c.session;
    return json({
      user: { id: s.user_id, email: s.email, name: s.name },
      business: s.business_id && s.role
        ? { id: s.business_id, name: s.business_name, slug: s.business_slug, role: s.role, readOnly: isExpired(s.paid_until), paidUntil: s.paid_until }
        : null,
      businesses: (await userBusinesses(c.env, s.user_id)).map(publicBusiness),
    });
  });

  // Link de invitación: crear la contraseña (primera vez) o restablecerla (olvido).
  r.get('/api/auth/invite', 'public', async (c) => {
    const user = await userByInvite(c.env, new URL(c.req.url).searchParams.get('token'));
    if (!user) throw new HttpError(404, 'Este link ya no es válido. Pide uno nuevo.', 'BAD_INVITE');
    return json({ email: user.email, name: user.name, reset: !!user.password_hash, needsConsent: !user.consent_at });
  });

  r.post('/api/auth/invite', 'public', async (c) => {
    const body = await readJson(c.req);
    await verifyTurnstile(c, body.turnstile);
    const user = await userByInvite(c.env, body.token);
    if (!user) throw new HttpError(404, 'Este link ya no es válido. Pide uno nuevo.', 'BAD_INVITE');
    // Registro: autorización de tratamiento de datos (Ley 1581) y mayoría de edad, la primera vez.
    if (!user.consent_at && (body.consent !== true || body.adult !== true)) {
      throw new HttpError(400, 'Para continuar, autoriza el tratamiento de tus datos y confirma que eres mayor de edad', 'CONSENT');
    }
    await setPassword(c.env, user.id, body.password);
    const name = str(body.name, { max: 100, label: 'Nombre' });
    const d = db(c.env);
    await d.batch([
      d.prepare('UPDATE users SET name = COALESCE(?, name) WHERE id = ?', name, user.id),
      ...(user.consent_at ? [] : [d.prepare(`UPDATE users SET consent_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), consent_version = ?, adult_confirmed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, POLICY_VERSION, user.id)]),
      d.prepare('DELETE FROM sessions WHERE user_id = ?', user.id),
    ]);
    return startSession(c, user.id);
  });

  // Cambia el negocio activo de la sesión (cuentas con varios negocios).
  r.post('/api/auth/business', 'session', async (c) => {
    const { businessId } = await readJson(c.req);
    const b = (await userBusinesses(c.env, c.session.user_id)).find((x) => x.id === businessId);
    if (!b) throw new HttpError(403, 'No perteneces a ese negocio');
    await db(c.env).run('UPDATE sessions SET business_id = ? WHERE id = ?', b.id, c.session.session_id);
    return json({ ok: true, business: publicBusiness(b) });
  });

  // Cambiar la contraseña desde el panel. Funciona aunque la suscripción esté vencida y cierra las demás sesiones.
  r.post('/api/auth/password', 'session', async (c) => {
    const { current, password } = await readJson(c.req);
    const user = await userByEmail(c.env, c.session.email);
    await checkPassword(c.env, user, user.email, current, c.req);
    await setPassword(c.env, user.id, password);
    await db(c.env).run('DELETE FROM sessions WHERE user_id = ? AND id <> ?', user.id, c.session.session_id);
    return json({ ok: true });
  });

  r.post('/api/auth/logout', 'public', async (c) => {
    const s = await loadSession(c.req, c.env);
    if (s) await db(c.env).run('DELETE FROM sessions WHERE id = ?', s.session_id);
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(null, c.req) });
  });
}
