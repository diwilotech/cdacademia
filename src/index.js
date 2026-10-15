// App de Diwilo — Worker único: API + archivos de public/.
//   /            login (o al panel si ya hay sesión)
//   /staff/*     páginas del negocio (una por módulo; exigen sesión con negocio). /app redirige aquí.
//   /api/*       API (src/api/*.js); /api/platform/* solo para Diwilo Web por RPC
//   /mcp         MCP del negocio (token de Configuración → IA → Conexiones)
//   /privacidad, /dmca, /manifest.json, /sw.js   públicos
import { WorkerEntrypoint } from 'cloudflare:workers';
import { Router } from './router.js';
import { HttpError, errorResponse } from './lib/http.js';
import { authenticate, loadSession } from './lib/auth.js';
import { platformCall } from './lib/platform-rpc.js';
import * as authApi from './api/auth.js';
import * as platformApi from './api/platform.js';
import * as platformModulesApi from './api/platform-modules.js';
import * as meApi from './api/me.js';
import * as settingsApi from './api/settings.js';
import * as mcpApi from './api/mcp.js';
import * as teamApi from './api/team.js';
import * as academiaApi from './api/academia.js';
import * as estudiantesApi from './api/estudiantes.js';
import * as profesionalesApi from './api/profesionales.js';
import * as materialApi from './api/material.js';
import * as cursosApi from './api/cursos.js';
import * as matriculasApi from './api/matriculas.js';
import * as cuotasApi from './api/cuotas.js';
import * as reposicionesApi from './api/reposiciones.js';
import { isCentralApi, centralModuleOf, centralApi, centralPage, centralAsset, centralPublic } from './lib/central.js';
import { CENTRALES } from './lib/modules.js';

const router = new Router();
// platform va primero. Agrega aquí cada módulo nuevo de src/api/ (y su entrada en modulos.app.json).
// Los horizontales (Finanzas, Marketing…) no van aquí: se piden en modulos.app.json → "centrales" y viven en Diwilo Modulos.
const MODULE_APIS = [academiaApi, estudiantesApi, profesionalesApi, materialApi, cursosApi, matriculasApi, cuotasApi, reposicionesApi];
for (const mod of [platformApi, platformModulesApi, authApi, meApi, settingsApi, mcpApi, teamApi, ...MODULE_APIS]) if (typeof mod.routes === 'function') mod.routes(router);

const SECURITY_HEADERS = {
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
};

function withHeaders(res, headers) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}

async function handleApi(req, env, ctx, url) {
  const { route, params } = router.match(req.method, url.pathname);
  // CSRF: toda escritura del navegador trae este encabezado (fuerza preflight entre orígenes).
  // Diwilo Web (nivel 'platform') llega por RPC y no usa cookies.
  if (req.method !== 'GET' && route.auth !== 'platform' && req.headers.get('x-app') !== '1') {
    throw new HttpError(403, 'Solicitud no permitida');
  }
  const c = { req, env, ctx, url, params };
  await authenticate(c, route.auth);
  return route.handler(c);
}

// Módulos centrales: la app verifica sesión, negocio, rol, módulo activo y CSRF; Diwilo Modulos hace el resto.
async function handleCentral(req, env, ctx, url) {
  if (req.method !== 'GET' && req.headers.get('x-app') !== '1') throw new HttpError(403, 'Solicitud no permitida');
  const c = { req, env, ctx, url, params: {} };
  await authenticate(c, `tenant:${centralModuleOf(url.pathname)}`);
  return centralApi(c);
}

const asset = (env, req, path) => {
  const u = new URL(req.url);
  u.pathname = path;
  return env.ASSETS.fetch(new Request(u, req));
};

const worker = {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const isApi = url.pathname.startsWith('/api/');
    try {
      if (isApi && isCentralApi(url.pathname)) return withHeaders(await handleCentral(req, env, ctx, url), SECURITY_HEADERS);
      if (isApi) return withHeaders(await handleApi(req, env, ctx, url), SECURITY_HEADERS);
      if (url.pathname === '/mcp') return withHeaders(await mcpApi.mcpFetch(req, env, ctx), SECURITY_HEADERS);
      // Rutas públicas que declaran los módulos: links de rastreo (/l/…) y validación de documentos (/validar/…)
      if (url.pathname.startsWith('/l/') || url.pathname.startsWith('/validar/')) return withHeaders(await centralPublic(env, url), SECURITY_HEADERS);
      // Código de las páginas de los módulos centrales
      if (url.pathname.startsWith('/m/')) return withHeaders(await centralAsset(env, url.pathname), SECURITY_HEADERS);
      if (url.pathname === '/') {
        const s = await loadSession(req, env);
        if (s?.business_id && s.role) return Response.redirect(`${url.origin}/staff/`, 302);
        return withHeaders(await asset(env, req, '/'), SECURITY_HEADERS);
      }
      // Enlaces viejos y el pase de Diwilo (/api/sso) llegan a /app: el panel ahora vive en /staff/.
      // También las direcciones de versiones anteriores del panel (/admin, /admin.html).
      if (['/app', '/app.html', '/admin', '/admin.html'].includes(url.pathname)) return Response.redirect(`${url.origin}/staff/`, 302);
      if (url.pathname === '/staff' || url.pathname.startsWith('/staff/')) {
        const s = await loadSession(req, env);
        if (!s?.business_id || !s.role) return Response.redirect(`${url.origin}/`, 302);
        const central = CENTRALES.find((id) => url.pathname === `/staff/${id}.html` || url.pathname === `/staff/${id}`);
        if (central) return withHeaders(await centralPage(env, req, central), SECURITY_HEADERS);
        const res = withHeaders(await env.ASSETS.fetch(req), { ...SECURITY_HEADERS, 'cache-control': 'no-store' });
        return res;
      }
      return env.ASSETS.fetch(req);
    } catch (err) {
      return errorResponse(err);
    }
  },
};

// Tareas diarias de los módulos propios (cron de wrangler.jsonc, 3:00 a. m. Colombia): cada módulo puede exportar daily(env).
// Las de los módulos centrales corren una sola vez en Diwilo Modulos.
worker.scheduled = async (event, env, ctx) => {
  for (const mod of MODULE_APIS) {
    if (typeof mod.daily !== 'function') continue;
    ctx.waitUntil(mod.daily(env).catch((e) => console.error('tarea diaria', e.message)));
  }
};

export default worker;

// Diwilo Web administra esta app por RPC (service binding con "entrypoint": "Platform"), sin clave compartida.
export class Platform extends WorkerEntrypoint {
  call(method, path, body, origin) {
    return platformCall(worker, this.env, this.ctx, method, path, body, origin);
  }
}
