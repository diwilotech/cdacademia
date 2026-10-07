import { json, error, readJson } from "../lib/http.js";
import { first, run, uid, nowIso } from "../lib/db.js";
import { verifyPassword, hashPassword, randomSalt } from "../lib/password.js";
import { createSession, sessionCookie, clearSessionCookie, getCookie, currentSession, requireSetupKey } from "../lib/auth.js";

const MAX_FALLOS = 5, BLOQUEO_MIN = 15;

export function registerAuth(router) {
  // Login por correo + PIN. Bloquea 15 min tras 5 intentos fallidos del mismo correo.
  router.post("/api/login", async (request, env) => {
    const { email, pin } = await readJson(request);
    const mail = String(email || "").trim().toLowerCase();
    if (!mail || !pin) return error("Escribe tu correo y tu PIN");

    const intento = await first(env, `SELECT * FROM login_attempts WHERE email = ?`, mail);
    if (intento?.locked_until && intento.locked_until > nowIso()) return error("Demasiados intentos. Prueba en unos minutos.", 429);

    const user = await first(env, `SELECT * FROM users WHERE email = ? AND active = 1`, mail);
    const ok = user && await verifyPassword(String(pin), user.pin_salt, user.pin_hash);
    if (!ok) {
      const n = (intento?.fails || 0) + 1;
      const lock = n >= MAX_FALLOS ? new Date(Date.now() + BLOQUEO_MIN * 60000).toISOString() : null;
      await run(env, `INSERT INTO login_attempts (email, fails, locked_until) VALUES (?,?,?)
                      ON CONFLICT(email) DO UPDATE SET fails = ?, locked_until = ?`, mail, lock ? 0 : n, lock, lock ? 0 : n, lock);
      return error("Correo o PIN incorrectos", 401);
    }
    await run(env, `DELETE FROM login_attempts WHERE email = ?`, mail);
    const token = await createSession(env, user.id, user.business_id);
    return json({ ok: true }, { headers: { "set-cookie": sessionCookie(token) } });
  });

  router.post("/api/logout", async (request, env) => {
    const token = getCookie(request, "cda_session");
    if (token) await run(env, `DELETE FROM sessions WHERE id = ?`, token);
    return json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
  });

  // Crea un negocio con su primer usuario. Protegido con el secreto SETUP_KEY (wrangler secret put SETUP_KEY).
  router.post("/api/setup", async (request, env) => {
    const denied = await requireSetupKey(request, env);
    if (denied) return denied;
    const { negocio, slug, email, name, pin } = await readJson(request);
    if (!negocio || !slug || !email || !pin || String(pin).length < 6) return error("Faltan datos (PIN de mínimo 6 caracteres)");
    const bizId = uid(), userId = uid(), salt = randomSalt();
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO businesses (id, slug, name) VALUES (?,?,?)`).bind(bizId, String(slug).toLowerCase(), negocio),
        env.DB.prepare(`INSERT INTO users (id, business_id, email, name, role, pin_hash, pin_salt) VALUES (?,?,?,?, 'admin', ?, ?)`)
          .bind(userId, bizId, String(email).toLowerCase(), name || email, await hashPassword(String(pin), salt), salt),
      ]);
    } catch (e) { return error("Ese correo o slug ya existe", 409); }
    return json({ ok: true, business_id: bizId }, { status: 201 });
  });

  router.get("/staff/me", async (request, env) => {
    const s = await currentSession(request, env);
    return s ? json({ email: s.email, name: s.name, role: s.role, negocio: s.business_name }) : error("No autorizado", 401);
  });
}
