// Puente con «Diwilo Modulos» (Worker central de los módulos horizontales), por service binding MODULOS (RPC).
// La app verifica sesión, negocio, rol y que el módulo esté activo; el Worker central hace el resto con el contexto
// que le enviamos. Lo que registre en la bitácora vuelve aquí y se guarda en audit_log del negocio.
//   /api/<modulo>/…        API del módulo                 /staff/<modulo>.html   página (shell de la app + su <main>)
//   /m/<modulo>.js         código de la página            /l/:slug · /validar/:código · /c/…   rutas públicas de los módulos
//   centralTools(c)        herramientas de IA para el MCP de la app
import { HttpError } from './http.js';
import { CENTRALES, activeModuleIds, APP } from './modules.js';

export const isCentralApi = (path) => CENTRALES.some((id) => path === `/api/${id}` || path.startsWith(`/api/${id}/`));
const centralOf = (path) => CENTRALES.find((id) => path.startsWith(`/api/${id}`));

const need = (env) => { if (!env.MODULOS) throw new HttpError(503, 'Falta la conexión con Diwilo Modulos (service binding MODULOS)'); return env.MODULOS; };

async function ctxOf(c) {
  const name = c.session?.business_name ?? (await c.env.DB.prepare('SELECT name FROM businesses WHERE id = ?').bind(c.businessId).first())?.name;
  const st = await c.env.DB.prepare('SELECT logo_key, tema FROM business_settings WHERE business_id = ?').bind(c.businessId).first();
  const logo = st?.logo_key ? '/api/settings/logo' : null, tema = st?.tema || APP.tema;
  const activos = new Set(await activeModuleIds(c.env, c.businessId));
  return {
    app: APP.id, business: { id: c.businessId, name: name || null, logo, tema }, role: c.role, readOnly: !!c.readOnly,
    user: { id: c.session?.user_id || null, email: c.session?.email || null, name: c.session?.name || null },
    origin: c.url?.origin || null, via: c.origin === 'mcp' ? 'mcp' : 'app', modulos: CENTRALES.filter((id) => activos.has(id)),
  };
}

// Cada pago de la academia se vuelve un ingreso en Finanzas (y la anulación, un egreso que lo revierte), sin duplicarse (ref).
// Es un efecto automático: se hace con permisos de titular y nunca hace fallar el pago si Finanzas no responde o no está activo.
export async function movimientoFinanzas(c, p) {
  try {
    if (!CENTRALES.includes('finanzas') || !(await activeModuleIds(c.env, c.businessId)).includes('finanzas') || !c.env.MODULOS) return { enviado: false };
    const ctx = { ...(await ctxOf(c)), role: 'owner', readOnly: false };
    const anulado = !!p.anulado;
    const body = {
      ref: `academia:pago:${p.num}${anulado ? ':anulado' : ''}`, kind: anulado ? 'gasto' : 'ingreso', date: anulado ? (p.hoy || p.fecha) : p.fecha, amount: p.valor,
      category: anulado ? 'Anulación de recibos' : p.tipo === 'reposicion' ? 'Reposiciones' : 'Matrículas y cuotas',
      description: `${anulado ? 'Anulación del recibo' : 'Recibo'} N.º ${p.num} · ${p.estudiante || ''} · ${p.curso || ''}${p.metodo ? ` (${p.metodo})` : ''}`.slice(0, 300),
      counterparty: p.estudiante || null, centro_costo: p.curso || null,
      ...(p.inscripcion_id && p.tipo !== 'reposicion' ? (anulado ? { anula_ref: `academia:pago:${p.num}` } : { invoice_ref: `academia:matricula:${p.inscripcion_id}` }) : {}),
    };
    const r = await c.env.MODULOS.call(ctx, { method: 'POST', path: '/api/finanzas/movements/externo', body: JSON.stringify(body) });
    await saveAudit(c, r.audit);
    return { enviado: r.status < 300, nuevo: r.status === 201 };
  } catch (x) { console.error('ingreso en Finanzas', x.message); return { enviado: false }; }
}

// Cuenta de cobro de una matrícula en Finanzas (una por matrícula; si cambia el valor o el plan, se actualiza). ins = { id, estudiante, documento, email, curso, total, fecha, vence }
export async function cuentaDeCobro(c, ins) {
  try {
    if (!CENTRALES.includes('finanzas') || !c.env.MODULOS || !(await activeModuleIds(c.env, c.businessId)).includes('finanzas') || !(ins.total > 0)) return null;
    const ctx = { ...(await ctxOf(c)), role: 'owner', readOnly: false };
    const body = { ref: `academia:matricula:${ins.id}`, counterparty: ins.estudiante, tax_id: ins.documento || null, client_email: ins.email || null, issue_date: ins.fecha, due_date: ins.vence || null,
      concept: `Matrícula · ${ins.curso}`, detail: ins.estudiante, total: ins.total, category: 'Matrículas y cuotas', centro_costo: ins.curso };
    const r = await c.env.MODULOS.call(ctx, { method: 'POST', path: '/api/finanzas/invoices/externo', body: JSON.stringify(body) });
    await saveAudit(c, r.audit);
    return r.status < 300 ? JSON.parse(r.body) : null;
  } catch (x) { console.error('cuenta de cobro en Finanzas', x.message); return null; }
}

// Página (HTML) de Finanzas, p. ej. la cuenta de cobro lista para imprimir.
export async function finanzasPagina(c, path) {
  if (!CENTRALES.includes('finanzas') || !c.env.MODULOS || !(await activeModuleIds(c.env, c.businessId)).includes('finanzas')) throw new HttpError(409, 'Finanzas no está activo para este negocio');
  const ctx = { ...(await ctxOf(c)), role: 'owner', readOnly: false };
  const [p, q = ''] = path.split('?');
  const r = await c.env.MODULOS.call(ctx, { method: 'GET', path: p, query: q ? `?${q}` : '' });
  if (r.status >= 300) throw new HttpError(502, 'Finanzas no respondió');
  return new Response(r.body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

// Lee de Finanzas (GET) con permisos de titular. Devuelve el JSON, o lanza 409 si Finanzas no está activo para el negocio.
export async function finanzasLeer(c, path) {
  if (!CENTRALES.includes('finanzas') || !c.env.MODULOS || !(await activeModuleIds(c.env, c.businessId)).includes('finanzas')) throw new HttpError(409, 'Finanzas no está activo para este negocio');
  const ctx = { ...(await ctxOf(c)), role: 'owner', readOnly: false };
  const [p, q = ''] = path.split('?');
  const r = await c.env.MODULOS.call(ctx, { method: 'GET', path: p, query: q ? `?${q}` : '' });
  if (r.status >= 300) throw new HttpError(502, 'Finanzas no respondió');
  try { return JSON.parse(r.body); } catch { throw new HttpError(502, 'Finanzas respondió algo que no se entiende'); }
}

// Escribe en la bitácora del negocio lo que hizo el módulo central.
async function saveAudit(c, entries = []) {
  if (!entries.length) return;
  await c.env.DB.batch(entries.map((e) => c.env.DB.prepare('INSERT INTO audit_log (business_id, user_id, origen, modulo, accion, detalle) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(c.businessId, c.session?.user_id || null, e.origen || c.origin || 'app', e.modulo, e.accion, e.detalle))).catch((x) => console.error('bitácora central', x.message));
  c.audited = true;
}

// API de un módulo central. Ya pasó authenticate(c, 'tenant:<modulo>') en src/index.js.
export async function centralApi(c) {
  const body = c.req.method === 'GET' || c.req.method === 'HEAD' ? null : await c.req.text();
  const r = await need(c.env).call(await ctxOf(c), { method: c.req.method, path: c.url.pathname, query: c.url.search, body });
  await saveAudit(c, r.audit);
  return new Response(r.body, { status: r.status, headers: r.headers });
}
export const centralModuleOf = centralOf;

// Página de un módulo central: el shell de esta app (public/staff/index.html) con el <main> y el script del módulo.
export async function centralPage(env, req, id) {
  const [shellRes, main] = await Promise.all([env.ASSETS.fetch(new Request(new URL('/staff/', req.url), { headers: req.headers })), need(env).asset(`/m/${id}.html`)]);
  if (main.status !== 200) throw new HttpError(404, 'Página no encontrada');
  const shell = await shellRes.text();
  const titulo = /data-titulo="([^"]+)"/.exec(main.body)?.[1] || id;
  const html = shell
    .replace(/<main class="dw-main"[\s\S]*?<\/main>/, `<!-- Módulo «${id}» de Diwilo Modulos (Worker central) -->\n${main.body.trim()}`)
    .replace(/<title>[^<·]*·/, `<title>${titulo} ·`)
    .replace(/<script src="\/js\/pages\/[^"]+\.js"><\/script>/, `<script src="/m/${id}.js"></script>`);
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
export async function centralAsset(env, path) {
  const a = await need(env).asset(path);
  return new Response(a.body, { status: a.status, headers: { 'content-type': a.type, 'cache-control': 'no-cache' } });
}

// Rutas públicas: links de rastreo (Marketing) y validación de documentos (Finanzas), en el dominio de la app.
export async function centralPublic(env, url, req) {
  const notFound = () => new Response('Este enlace no existe.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  if (url.pathname.startsWith('/l/')) {
    if (!CENTRALES.includes('marketing')) return notFound();
    const l = await need(env).link(APP.id, decodeURIComponent(url.pathname.slice(3)));
    if (!l) return notFound();
    // Solo si el negocio sigue activo y tiene Marketing
    const biz = await env.DB.prepare("SELECT 1 FROM businesses WHERE id = ? AND status = 'active' AND archived_at IS NULL").bind(l.business_id).first();
    if (!biz || !(await activeModuleIds(env, l.business_id)).includes('marketing')) return notFound();
    await env.MODULOS.click(APP.id, l.id);
    return new Response(null, { status: 302, headers: { location: l.url, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer-when-downgrade' } });
  }
  // Tarjetas de presentación (Marketing): /c/<slug>, su foto, íconos, manifest, vCard y service worker
  if (url.pathname.startsWith('/c/') && CENTRALES.includes('marketing')) {
    const r = await need(env).tarjeta(APP.id, decodeURIComponent(url.pathname.slice(3)), url.origin, { bot: /bot|crawl|spider|preview/i.test(req?.headers?.get('user-agent') || '') });
    if (r.business_id) {
      const biz = await env.DB.prepare("SELECT 1 FROM businesses WHERE id = ? AND status = 'active' AND archived_at IS NULL").bind(r.business_id).first();
      if (!biz || !(await activeModuleIds(env, r.business_id)).includes('marketing')) return notFound();
    }
    const body = r.base64 ? Uint8Array.from(atob(r.body), (ch) => ch.charCodeAt(0)) : r.body;
    return new Response(r.status === 302 ? null : body, { status: r.status, headers: r.headers });
  }
  if (url.pathname.startsWith('/validar/') && CENTRALES.includes('finanzas')) {
    const r = await need(env).validar(APP.id, decodeURIComponent(url.pathname.slice(9)), url.origin);
    return new Response(r.body, { status: r.status, headers: { ...r.headers, 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' } });
  }
  return notFound();
}

// Herramientas de IA de los módulos centrales, con la misma forma que las de src/ia/ (las filtra y publica mcp.js).
let toolDefs = null, toolsAt = 0;
export async function centralTools(env) {
  if (!CENTRALES.length || !env.MODULOS) return [];
  if (!toolDefs || Date.now() - toolsAt > 300000) {
    try { toolDefs = (await env.MODULOS.tools()).filter((t) => CENTRALES.includes(t.modulo)); toolsAt = Date.now(); } catch (e) { console.error('herramientas centrales', e.message); toolDefs ||= []; }
  }
  return toolDefs.map((t) => ({ ...t, run: async (c, args) => {
    const r = await env.MODULOS.tool(await ctxOf(c), t.name, args);
    await saveAudit(c, r.audit);
    if (!r.ok) throw new HttpError(r.status || 500, r.error);
    return r.result;
  } }));
}

// Registros de cada módulo central del negocio (Diwilo avisa antes de quitar un módulo).
export async function centralUso(env, businessId) {
  if (!CENTRALES.length || !env.MODULOS) return {};
  try { const u = await env.MODULOS.uso(APP.id, businessId); return Object.fromEntries(CENTRALES.map((id) => [id, u[id] ?? 0])); } catch { return {}; }
}
