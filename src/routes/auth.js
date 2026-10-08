import { json, error, readJson } from "../lib/http.js";
import { first, all, run, nowIso } from "../lib/db.js";
import { verifyPassword, hashPassword, randomSalt, validatePassword, sha256Hex } from "../lib/password.js";
import { createSession, sessionCookie, clearSessionCookie, getCookie, currentSession } from "../lib/auth.js";

const MAX_FALLOS = 5, BLOQUEO_MIN = 15;
const GENERIC = "Correo o contraseña incorrectos";

export function registerAuth(router) {
  // Login con correo + contraseña. Bloquea 15 min tras 5 intentos fallidos del mismo correo.
  // Si la cuenta está en varios negocios responde { choose: [...] } y el cliente repite con business_id.
  router.post("/api/auth/login", async (request, env) => {
    const { email, password, business_id } = await readJson(request);
    const mail = String(email || "").trim().toLowerCase();
    if (!mail || !password) return error("Escribe tu correo y tu contraseña");

    const intento = await first(env, `SELECT * FROM login_attempts WHERE email = ?`, mail);
    if (intento?.locked_until && intento.locked_until > nowIso()) return error("Demasiados intentos. Prueba en unos minutos.", 429);

    const users = await all(env,
      `SELECT u.*, b.name AS business_name FROM users u JOIN businesses b ON b.id = u.business_id
       WHERE u.email = ? AND u.active = 1 ${business_id ? "AND u.business_id = ?" : ""}`,
      ...(business_id ? [mail, business_id] : [mail]));
    const matches = [];
    for (const u of users) if (await verifyPassword(String(password), u.password_salt, u.password_hash)) matches.push(u);

    if (!matches.length) {
      const n = (intento?.fails || 0) + 1;
      const lock = n >= MAX_FALLOS ? new Date(Date.now() + BLOQUEO_MIN * 60000).toISOString() : null;
      const fails = lock ? 0 : n;
      await run(env, `INSERT INTO login_attempts (email, fails, locked_until) VALUES (?,?,?)
                      ON CONFLICT(email) DO UPDATE SET fails = ?, locked_until = ?`, mail, fails, lock, fails, lock);
      return error(GENERIC, 401);
    }
    await run(env, `DELETE FROM login_attempts WHERE email = ?`, mail);
    if (matches.length > 1) return json({ choose: matches.map((u) => ({ id: u.business_id, name: u.business_name })) });
    const token = await createSession(env, matches[0].id, matches[0].business_id);
    return json({ ok: true }, { headers: { "set-cookie": sessionCookie(token) } });
  });

  router.post("/api/logout", async (request, env) => {
    const token = getCookie(request, "cda_session");
    if (token) await run(env, `DELETE FROM sessions WHERE id = ?`, await sha256Hex(token));
    return json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
  });

  // Invitación: sirve para crear la cuenta y para restablecer la contraseña.
  router.get("/api/auth/invite", async (request, env) => {
    const token = new URL(request.url).searchParams.get("token") || "";
    const u = token && await first(env, `SELECT email, name, password_hash FROM users WHERE invite_hash = ? AND active = 1`, await sha256Hex(token));
    if (!u) return error("Este link ya no es válido. Pide uno nuevo.", 404);
    return json({ email: u.email, name: u.name, reset: !!u.password_hash });
  });

  router.post("/api/auth/invite", async (request, env) => {
    const { token, password, name } = await readJson(request);
    const u = token && await first(env, `SELECT * FROM users WHERE invite_hash = ? AND active = 1`, await sha256Hex(String(token)));
    if (!u) return error("Este link ya no es válido. Pide uno nuevo.", 404);
    if (!validatePassword(password)) return error("La contraseña debe tener mínimo 8 caracteres");
    const salt = randomSalt();
    await env.DB.batch([
      env.DB.prepare(`UPDATE users SET password_hash = ?, password_salt = ?, invite_hash = NULL, name = ? WHERE id = ?`)
        .bind(await hashPassword(String(password), salt), salt, String(name || "").trim().slice(0, 120) || u.name, u.id),
      env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(u.id),
    ]);
    const session = await createSession(env, u.id, u.business_id);
    return json({ ok: true }, { headers: { "set-cookie": sessionCookie(session) } });
  });

  router.get("/staff/me", async (request, env) => {
    const s = await currentSession(request, env);
    return s ? json({ email: s.email, name: s.name, role: s.role, negocio: s.business_name, readOnly: s.read_only, paidUntil: s.paid_until })
             : error("No autorizado", 401);
  });
}
