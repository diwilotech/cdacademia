import { json, error, readJson } from "../lib/http.js";
import { first, all, uid } from "../lib/db.js";
import { sha256Hex, randomToken } from "../lib/password.js";

// Personal con acceso al panel. Vive en la tabla `users` (la misma que lee Diwilo Web), así que
// lo que se crea aquí aparece en el panel de Diwilo y viceversa. Solo dueño/administrador.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ["admin", "staff"];   // el dueño solo se asigna desde Diwilo

const puede = (ctx) => ["owner", "admin"].includes(ctx.user.role);
const estado = (u) => (!u.active ? "inactive" : u.password_hash ? "active" : "invited");
const forma = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, status: estado(u) });

export function registerTeam(router) {
  const guard = (fn) => async (request, env, ctx) => (puede(ctx) ? fn(request, env, ctx) : error("Solo el dueño o un administrador gestiona el personal.", 403));

  router.get("/staff/team", guard(async (request, env, ctx) => {
    const us = await all(env, `SELECT * FROM users WHERE business_id = ? ORDER BY created_at`, ctx.businessId);
    return json({ users: us.map(forma), yo: ctx.user.user_id });
  }));

  // Crea al usuario sin contraseña; si ya existe, cambia su rol y genera un link nuevo.
  router.post("/staff/team", guard(async (request, env, ctx) => {
    const { email, name, role } = await readJson(request);
    const mail = String(email || "").trim().toLowerCase();
    if (!EMAIL.test(mail)) return error("El correo no es válido");
    const rol = role || "staff";
    if (!ROLES.includes(rol)) return error("Rol no válido");
    const token = randomToken(), hash = await sha256Hex(token);
    const prev = await first(env, `SELECT id, role FROM users WHERE business_id = ? AND email = ?`, ctx.businessId, mail);
    let id = prev?.id;
    if (prev) {
      if (prev.role === "owner") return error("El dueño se gestiona desde Diwilo.", 403);
      await env.DB.prepare(`UPDATE users SET role = ?, invite_hash = ?, active = 1 WHERE id = ?`).bind(rol, hash, id).run();
    } else {
      id = uid();
      await env.DB.prepare(`INSERT INTO users (id, business_id, email, name, role, invite_hash) VALUES (?,?,?,?,?,?)`)
        .bind(id, ctx.businessId, mail, String(name || "").trim().slice(0, 120) || mail, rol, hash).run();
    }
    return json({ id, invite_path: `/${ctx.user.slug}#invite=${token}` });
  }));

  const objetivo = async (env, ctx) => {
    const u = await first(env, `SELECT * FROM users WHERE id = ? AND business_id = ?`, ctx.params.id, ctx.businessId);
    if (!u) return [null, error("Usuario no encontrado", 404)];
    if (u.role === "owner") return [null, error("El dueño se gestiona desde Diwilo.", 403)];
    if (u.id === ctx.user.user_id) return [null, error("No puedes cambiarte a ti mismo.", 400)];
    return [u, null];
  };

  router.patch("/staff/team/:id", guard(async (request, env, ctx) => {
    const [u, fallo] = await objetivo(env, ctx); if (fallo) return fallo;
    const b = await readJson(request);
    if (b.role !== undefined) {
      if (!ROLES.includes(b.role)) return error("Rol no válido");
      await env.DB.prepare(`UPDATE users SET role = ? WHERE id = ?`).bind(b.role, u.id).run();
    }
    if (b.active !== undefined) {
      await env.DB.prepare(`UPDATE users SET active = ? WHERE id = ?`).bind(b.active ? 1 : 0, u.id).run();
      if (!b.active) await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(u.id).run();
    }
    return json({ ok: true });
  }));

  router.delete("/staff/team/:id", guard(async (request, env, ctx) => {
    const [u, fallo] = await objetivo(env, ctx); if (fallo) return fallo;
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(u.id),
      env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(u.id),
    ]);
    return json({ ok: true });
  }));
}
