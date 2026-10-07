import { first, run, uid, nowIso } from "./db.js";
import { unauthorized } from "./http.js";
import { sha256Hex, timingSafeEqual } from "./password.js";

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

export async function createSession(env, userId, businessId) {
  const token = uid();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await run(env, `INSERT INTO sessions (id, user_id, business_id, expires_at) VALUES (?,?,?,?)`,
    token, userId, businessId, expiresAt);
  return token;
}

// Devuelve la sesión vigente (con usuario y negocio) o null.
export async function currentSession(request, env) {
  const token = getCookie(request, COOKIE);
  if (!token) return null;
  return first(env,
    `SELECT s.id, s.business_id, u.id AS user_id, u.email, u.name, u.role, b.name AS business_name, b.slug
     FROM sessions s
     JOIN users u ON u.id = s.user_id AND u.active = 1
     JOIN businesses b ON b.id = s.business_id
     WHERE s.id = ? AND s.expires_at > ?`, token, nowIso());
}

// Middleware de /staff/*: exige sesión y deja ctx.user / ctx.businessId. null = sigue adelante.
export async function requireStaff(request, env, ctx) {
  const s = await currentSession(request, env);
  if (!s) return unauthorized();
  ctx.user = s;
  ctx.businessId = s.business_id;
  return null;
}

export async function requireSetupKey(request, env) {
  const auth = request.headers.get("authorization") || "";
  if (!env.SETUP_KEY || !timingSafeEqual(await sha256Hex(auth), await sha256Hex(`Bearer ${env.SETUP_KEY}`))) return unauthorized();
  return null;
}
