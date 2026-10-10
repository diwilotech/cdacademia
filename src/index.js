import { WorkerEntrypoint } from "cloudflare:workers";
import { platformCall } from "./lib/platform-rpc.js";
import { Router } from "./lib/router.js";
import { notFound, unauthorized, error } from "./lib/http.js";
import { requireStaff, currentSession } from "./lib/auth.js";
import { registerPlatform } from "./routes/platform.js";
import { registerAuth } from "./routes/auth.js";
import { registerState } from "./routes/state.js";
import { registerFiles } from "./routes/files.js";
import { registerIA } from "./routes/ia.js";

const router = new Router();
registerPlatform(router); // primero: /api/platform/* no debe caer en otras rutas
registerAuth(router);
registerState(router);
registerFiles(router);
registerIA(router);

// JSON seguro para incrustar dentro de <script>
const inline = (v) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

// Sirve admin.html con el estado del negocio ya incrustado: el panel arranca sin esperar una petición.
async function servirAdmin(request, env, session) {
  const url = new URL(request.url); url.pathname = "/admin"; // los assets resuelven /admin -> admin.html (pedir .html redirige)
  const res = await env.ASSETS.fetch(new Request(url, request));
  const row = await env.DB.prepare(`SELECT data, version FROM app_state WHERE business_id = ?`).bind(session.business_id).first();
  const boot = { estado: row ? JSON.parse(row.data) : null, version: row?.version || 0, negocio: session.business_name, usuario: session.name, readOnly: session.read_only, paidUntil: session.paid_until };
  return new HTMLRewriter()
    .on("head", { element(el) { el.append(`<script>window.__BOOT__=${inline(boot)};</script>`, { html: true }); } })
    .transform(new Response(res.body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }));
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname;

    // Páginas protegidas
    if (path === "/admin" || path === "/admin.html") {
      const s = await currentSession(request, env);
      return s ? servirAdmin(request, env, s) : Response.redirect(new URL("/", url), 302);
    }
    // Login en la raíz (la página manda al panel si ya hay sesión y no trae #invite)
    if (path === "/" || path === "/login") {
      url.pathname = "/"; // el binding de assets sirve index.html en "/" sin volver a pasar por el Worker
      return env.ASSETS.fetch(new Request(url, request));
    }

    if (!path.startsWith("/api/") && !path.startsWith("/staff/")) return env.ASSETS.fetch(request);

    const match = router.match(request.method, path);
    if (!match) return notFound();
    const ctx = { params: match.params };

    // Todo /staff/* exige sesión (verificada contra D1 en cada request)
    if (path.startsWith("/staff/")) {
      const denied = await requireStaff(request, env, ctx);
      if (denied) return denied;
      // Defensa CSRF: las escrituras solo se aceptan con la cabecera propia del front
      if (request.method !== "GET" && request.headers.get("x-requested-with") !== "cda") return unauthorized();
      // Suscripción vencida: solo lectura
      if (request.method !== "GET" && ctx.user.read_only) return error("La suscripción del negocio está vencida: solo lectura.", 402);
    }
    try {
      return await match.handler(request, env, ctx);
    } catch (e) {
      console.error(e);
      return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: { "content-type": "application/json" } });
    }
  },
};
export default worker;

// Diwilo Web administra esta app por RPC (service binding con entrypoint "Platform"), sin clave compartida.
export class Platform extends WorkerEntrypoint {
  call(method, path, body, origin) {
    return platformCall(worker, this.env, this.ctx, method, path, body, origin);
  }
}
