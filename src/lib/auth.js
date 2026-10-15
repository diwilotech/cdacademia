// Ingreso con correo + contraseña -> sesión en D1 referenciada por una cookie HttpOnly.
// La sesión también fija el negocio activo. Los negocios, sus usuarios y la suscripción los maneja
// Diwilo Web (api/platform.js, nivel 'platform', solo por RPC).
import { HttpError, getCookie } from './http.js';
import { db, nowIso, isoIn } from './db.js';
import { isPlatformCall } from './platform-rpc.js';
import { requireModule } from './modules.js';

export const SESSION_COOKIE = 'cda_sid';   // cámbialo por app (cdp_, cdn_, cdc_...) para que no choquen en el navegador
const SESSION_HOURS = 24 * 30;              // 30 días (cookie HttpOnly + Secure)
const MAX_FAILS = 5;                        // intentos fallidos antes de bloquear (por correo y por IP)
const LOCK_MINUTES = [5, 15, 60, 1440];     // espera creciente: cada bloqueo nuevo dura más
const PBKDF2_ITERATIONS = 100000;
export const MIN_PASSWORD = 8;

const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));
export const randomHex = (bytes) => toHex(crypto.getRandomValues(new Uint8Array(bytes)));
export const sha256Hex = async (text) => toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));

export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hashPassword(password, saltHex = randomHex(16)) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: PBKDF2_ITERATIONS }, key, 256);
  return { hash: toHex(bits), salt: saltHex };
}

// ---------- suscripción ----------
// paid_until 'YYYY-MM-DD' inclusive en hora de Colombia. Vencida = solo lectura (no se borra nada).
export const todayBogota = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
export const isExpired = (paidUntil) => !!paidUntil && paidUntil < todayBogota();

// ---------- usuarios y contraseña ----------

export const userByEmail = (env, email) =>
  db(env).first('SELECT * FROM users WHERE email = ?', String(email || '').trim().toLowerCase());

export const userBusinesses = (env, userId) =>
  db(env).all(
    `SELECT b.id, b.name, b.slug, b.paid_until, m.role
       FROM memberships m JOIN businesses b ON b.id = m.business_id
      WHERE m.user_id = ? AND b.status = 'active' AND b.archived_at IS NULL ORDER BY b.name`, userId);

// ---------- bloqueo de intentos (correo e IP, espera creciente) ----------
const ipOf = (req) => req.headers.get('cf-connecting-ip') || 'local';

async function throttleCheck(env, keys) {
  const now = nowIso();
  for (const key of keys) {
    const t = await db(env).first('SELECT locked_until FROM auth_throttle WHERE key = ?', key);
    if (t?.locked_until && t.locked_until > now) throw new HttpError(429, 'Demasiados intentos. Prueba de nuevo más tarde.', 'LOCKED');
  }
}

async function throttleFail(env, keys) {
  let locked = false;
  for (const key of keys) {
    const t = await db(env).first('SELECT fails, strikes FROM auth_throttle WHERE key = ?', key);
    const fails = (t?.fails || 0) + 1;
    const lock = fails >= MAX_FAILS;
    const strikes = (t?.strikes || 0) + (lock ? 1 : 0);
    const until = lock ? isoIn(LOCK_MINUTES[Math.min(strikes, LOCK_MINUTES.length) - 1] * 60000) : null;
    locked = locked || lock;
    await db(env).run(`INSERT INTO auth_throttle (key, fails, strikes, locked_until, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET fails = excluded.fails, strikes = excluded.strikes, locked_until = excluded.locked_until, updated_at = excluded.updated_at`,
      key, lock ? 0 : fails, strikes, until, nowIso());
  }
  return locked;
}

// Lanza 401/429 si no coincide. Mismo mensaje para correo inexistente o contraseña mala.
export async function checkPassword(env, user, mail, password, req) {
  const keys = [`mail:${mail}`, ...(req ? [`ip:${ipOf(req)}`] : [])];
  await throttleCheck(env, keys);
  const ok = user?.password_hash
    ? timingSafeEqual((await hashPassword(String(password || ''), user.password_salt)).hash, user.password_hash)
    : (await hashPassword(String(password || '')), false); // mismo costo aunque el correo no exista
  if (ok) {
    await db(env).run(`UPDATE auth_throttle SET fails = 0 WHERE key = ?`, `mail:${mail}`);
    return;
  }
  const locked = await throttleFail(env, keys);
  throw new HttpError(locked ? 429 : 401, locked ? 'Demasiados intentos. Tu acceso quedó en pausa unos minutos.' : 'Correo o contraseña incorrectos', locked ? 'LOCKED' : 'BAD_LOGIN');
}

export async function setPassword(env, userId, password) {
  const p = String(password || '');
  if (p.length < MIN_PASSWORD || p.length > 200) throw new HttpError(400, `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`);
  const { hash, salt } = await hashPassword(p);
  await db(env).run('UPDATE users SET password_hash = ?, password_salt = ?, invite_hash = NULL WHERE id = ?', hash, salt, userId);
}

// ---------- invitaciones ----------
// Link /#invite=<token> para crear (o restablecer) la contraseña. Se guarda solo el SHA-256;
// generar uno nuevo invalida el anterior. Diwilo arma el link completo con la URL pública de la app.
export const invitePath = (token) => `/#invite=${token}`;

export async function createInvite(env, userId) {
  const token = randomHex(32);
  await db(env).run('UPDATE users SET invite_hash = ? WHERE id = ?', await sha256Hex(token), userId);
  return token;
}

export async function userByInvite(env, token) {
  if (!/^[0-9a-f]{64}$/.test(String(token || ''))) return null;
  return db(env).first('SELECT * FROM users WHERE invite_hash = ?', await sha256Hex(token));
}

// ---------- sesiones ----------

export async function createSession(env, userId, businessId) {
  const token = randomHex(32);
  await db(env).run('INSERT INTO sessions (id, user_id, business_id, expires_at) VALUES (?, ?, ?, ?)',
    await sha256Hex(token), userId, businessId, isoIn(SESSION_HOURS * 3600000));
  return token;
}

export function sessionCookie(token, req) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return token
    ? `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}${secure}`
    : `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function loadSession(req, env) {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  return db(env).first(
    `SELECT s.id AS session_id, s.business_id, u.id AS user_id, u.email, u.name,
            b.name AS business_name, b.slug AS business_slug, b.paid_until, m.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN businesses b ON b.id = s.business_id AND b.status = 'active' AND b.archived_at IS NULL
       LEFT JOIN memberships m ON m.user_id = s.user_id AND m.business_id = s.business_id
      WHERE s.id = ? AND s.expires_at > ?`, await sha256Hex(token), nowIso());
}

// ---------- niveles de acceso por ruta ----------
//   'public'   : sin sesión
//   'session'  : con sesión (puede no tener negocio elegido)
//   'tenant'   : + negocio activo con membresía. Con suscripción vencida solo deja leer (402 en escrituras).
//   'manager'  : + rol owner/admin en el negocio
//   'platform' : Diwilo Web por RPC (Platform.call). Desde internet siempre 401.
// Las rutas de un módulo lo declaran después de dos puntos: 'tenant:items', 'manager:items'.
// Así se comprueba en cada petición que el módulo esté activo para el negocio (si no, 403).
export async function authenticate(c, spec) {
  const [level, moduleId] = String(spec).split(':');
  if (level === 'public') return;
  if (level === 'platform') {
    if (!isPlatformCall(c.req)) throw new HttpError(401, 'No autorizado');
    return;
  }
  const s = await loadSession(c.req, c.env);
  if (!s) throw new HttpError(401, 'Inicia sesión', 'NO_SESSION');
  c.session = s;
  if (level === 'session') return;
  if (!s.business_id || !s.role) throw new HttpError(409, 'Elige un negocio', 'NO_BUSINESS');
  c.businessId = s.business_id;
  c.role = s.role;
  c.readOnly = isExpired(s.paid_until);
  if (c.readOnly && c.req.method !== 'GET') {
    throw new HttpError(402, 'La suscripción del negocio está vencida: solo lectura.', 'READ_ONLY');
  }
  if (level === 'manager' && !['owner', 'admin'].includes(s.role)) throw new HttpError(403, 'Solo el propietario o un administrador');
  if (moduleId) await requireModule(c, moduleId);
}
