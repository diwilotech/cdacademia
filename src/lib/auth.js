import { first, run, nowIso } from "./db.js";
import { unauthorized } from "./http.js";
import { isPlatformCall } from "./platform-rpc.js";
import { sha256Hex, randomToken } from "./password.js";

const SESSION_DAYS = 30;
const COOKIE = "cda_session";

export function getCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export const sessionCookie = (token) =>
  `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
export const clearSessionCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

// Hoy en Colombia (UTC-5), 'YYYY-MM-DD'
export const todayBogota = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
export const isExpired = (paidUntil) => !!paidUntil && paidUntil < todayBogota();

// Crea la sesión: la cookie lleva el token y la base solo su SHA-256.
export async function createSession(env, userId, businessId) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await run(env, `INSERT INTO sessions (id, user_id, business_id, expires_at) VALUES (?,?,?,?)`,
    await sha256Hex(token), userId, businessId, expiresAt);
  return token;
}

// Devuelve la sesión vigente (con usuario y negocio) o null.
export async function currentSession(request, env) {
  const token = getCookie(request, COOKIE);
  if (!token) return null;
  const s = await first(env,
    `SELECT s.id, s.business_id, u.id AS user_id, u.email, u.name, u.role, b.name AS business_name, b.slug, b.paid_until
     FROM sessions s
     JOIN users u ON u.id = s.user_id AND u.active = 1
     JOIN businesses b ON b.id = s.business_id AND b.archived_at IS NULL
     WHERE s.id = ? AND s.expires_at > ?`, await sha256Hex(token), nowIso());
  if (s) s.read_only = isExpired(s.paid_until);
  return s;
}

// Middleware de /staff/*: exige sesión y deja ctx.user / ctx.businessId. null = sigue adelante.
export async function requireStaff(request, env, ctx) {
  const s = await currentSession(request, env);
  if (!s) return unauthorized();
  ctx.user = s;
  ctx.businessId = s.business_id;
  return null;
}

// Diwilo Web entra solo por RPC (Platform.call, ver platform-rpc.js); desde internet /api/platform da 401.
export async function requirePlatform(request) {
  return isPlatformCall(request) ? null : unauthorized();
}
