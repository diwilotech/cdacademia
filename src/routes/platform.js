import { json, error, readJson } from "../lib/http.js";
import { first, all, uid } from "../lib/db.js";
import { sha256Hex, randomToken } from "../lib/password.js";
import { requirePlatform, isExpired } from "../lib/auth.js";
import { RESERVADOS } from "../lib/slug.js";

// API de plataforma para Diwilo Web: solo por RPC (ver lib/platform-rpc.js). Sin cookies ni CSRF.
const ROLES = ["owner", "admin", "staff"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// el link de invitación lleva la dirección del negocio: /<slug>#invite=<token>
const inviteTo = (slug, token) => `/${slug}#invite=${token}`;

const slugify = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "academia";

async function uniqueSlug(env, name) {
  const base = slugify(name);
  for (let i = 0; i < 6; i++) {
    const slug = i === 0 ? base : `${base}-${randomToken().slice(0, 4)}`;
    if (!RESERVADOS.has(slug) && !(await first(env, `SELECT 1 FROM businesses WHERE slug = ?`, slug))) return slug;
  }
  return `${base}-${randomToken().slice(0, 8)}`;
}

function shape(b, users) {
  return {
    id: b.id, name: b.name, slug: b.slug, created_at: b.created_at, paid_until: b.paid_until, read_only: isExpired(b.paid_until),
    users: users.filter((u) => u.business_id === b.id).map((u) => ({
      id: u.id, email: u.email, name: u.name, role: u.role,
      status: !u.active ? "inactive" : u.password_hash ? "active" : "invited", invite_path: null,
    })),
  };
}

export function registerPlatform(router) {
  const guard = (fn) => async (request, env, ctx) => {
    const denied = await requirePlatform(request, env);
    return denied || fn(request, env, ctx);
  };
  const load = async (env, id) => {
    const b = await first(env, `SELECT * FROM businesses WHERE id = ?`, id);
    if (!b) return null;
    return shape(b, await all(env, `SELECT * FROM users WHERE business_id = ?`, id));
  };

  router.get("/api/platform/businesses", guard(async (request, env) => {
    const bs = await all(env, `SELECT * FROM businesses ORDER BY created_at DESC`);
    const users = await all(env, `SELECT * FROM users`);
    return json({ businesses: bs.map((b) => shape(b, users)) });
  }));

  router.post("/api/platform/businesses", guard(async (request, env) => {
    const { name, owner_email, owner_name, paid_until } = await readJson(request);
    const nombre = String(name || "").trim().slice(0, 120), mail = String(owner_email || "").trim().toLowerCase();
    if (!nombre) return error("Falta el nombre del negocio");
    if (!EMAIL.test(mail)) return error("El correo del dueño no es válido");
    if (paid_until != null && paid_until !== "" && !DATE.test(paid_until)) return error("La fecha debe ser AAAA-MM-DD");
    const bizId = uid(), userId = uid(), token = randomToken(), slug = await uniqueSlug(env, nombre);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO businesses (id, slug, name, paid_until) VALUES (?,?,?,?)`).bind(bizId, slug, nombre, paid_until || null),
      env.DB.prepare(`INSERT INTO users (id, business_id, email, name, role, invite_hash) VALUES (?,?,?,?, 'owner', ?)`)
        .bind(userId, bizId, mail, String(owner_name || "").trim().slice(0, 120) || mail, await sha256Hex(token)),
    ]);
    return json({ id: bizId, invite_path: inviteTo(slug, token) }, { status: 201 });
  }));

  router.get("/api/platform/businesses/:id", guard(async (request, env, ctx) => {
    const b = await load(env, ctx.params.id);
    return b ? json(b) : error("Negocio no encontrado", 404);
  }));

  router.patch("/api/platform/businesses/:id", guard(async (request, env, ctx) => {
    if (!(await first(env, `SELECT 1 FROM businesses WHERE id = ?`, ctx.params.id))) return error("Negocio no encontrado", 404);
    const body = await readJson(request), sets = [], vals = [];
    if (body.name !== undefined) {
      const n = String(body.name).trim().slice(0, 120);
      if (!n) return error("El nombre no puede estar vacío");
      sets.push("name = ?"); vals.push(n);
    }
    if ("paid_until" in body) {
      if (body.paid_until != null && !DATE.test(body.paid_until)) return error("La fecha debe ser AAAA-MM-DD");
      sets.push("paid_until = ?"); vals.push(body.paid_until || null);
    }
    if (sets.length) await env.DB.prepare(`UPDATE businesses SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, ctx.params.id).run();
    return json({ ok: true });
  }));

  // Crea al usuario sin contraseña; si ya existe, actualiza su rol y genera un link nuevo (restablecer).
  router.post("/api/platform/businesses/:id/users", guard(async (request, env, ctx) => {
    const negocio = await first(env, `SELECT slug FROM businesses WHERE id = ?`, ctx.params.id);
    if (!negocio) return error("Negocio no encontrado", 404);
    const { email, name, role } = await readJson(request);
    const mail = String(email || "").trim().toLowerCase();
    if (!EMAIL.test(mail)) return error("El correo no es válido");
    const rol = role || "staff";
    if (!ROLES.includes(rol)) return error("Rol no válido");
    const token = randomToken(), hash = await sha256Hex(token);
    const prev = await first(env, `SELECT id FROM users WHERE business_id = ? AND email = ?`, ctx.params.id, mail);
    let id = prev?.id;
    if (prev) {
      await env.DB.prepare(`UPDATE users SET role = ?, invite_hash = ?, active = 1 WHERE id = ?`).bind(rol, hash, id).run();
    } else {
      id = uid();
      await env.DB.prepare(`INSERT INTO users (id, business_id, email, name, role, invite_hash) VALUES (?,?,?,?,?,?)`)
        .bind(id, ctx.params.id, mail, String(name || "").trim().slice(0, 120) || mail, rol, hash).run();
    }
    return json({ id, invite_path: inviteTo(negocio.slug, token) });
  }));

  // Cambia solo el rol (permisos), sin link nuevo ni tocar la contraseña. 'owner' pasa la propiedad
  // (el propietario anterior queda como administrador).
  router.patch("/api/platform/businesses/:id/users/:userId", guard(async (request, env, ctx) => {
    const { role } = await readJson(request);
    if (!ROLES.includes(role)) return error("Rol no válido");
    const u = await first(env, `SELECT id, role FROM users WHERE id = ? AND business_id = ?`, ctx.params.userId, ctx.params.id);
    if (!u) return error("El usuario no pertenece a este negocio", 404);
    if (u.role === role) return json({ ok: true, role });
    if (u.role === "owner") return error("Es el propietario: para cambiarlo, asigna otro propietario", 409);
    await env.DB.batch([
      ...(role === "owner" ? [env.DB.prepare(`UPDATE users SET role = 'admin' WHERE business_id = ? AND role = 'owner'`).bind(ctx.params.id)] : []),
      env.DB.prepare(`UPDATE users SET role = ? WHERE id = ?`).bind(role, u.id),
    ]);
    return json({ ok: true, role });
  }));

  router.delete("/api/platform/businesses/:id/users/:userId", guard(async (request, env, ctx) => {
    const u = await first(env, `SELECT id FROM users WHERE id = ? AND business_id = ?`, ctx.params.userId, ctx.params.id);
    if (!u) return error("Usuario no encontrado", 404);
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(u.id),
      env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(u.id),
    ]);
    return json({ ok: true });
  }));
}
