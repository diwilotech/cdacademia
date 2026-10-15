// MCP (Model Context Protocol) del negocio: el negocio conecta su propio asistente (Claude u otro) a su app.
// JSON-RPC 2.0 sobre HTTP en POST /mcp, sin dependencias. Acceso con un token del negocio:
//   Authorization: Bearer <token>   (se genera en Configuración → IA → Conexiones; se guarda solo el SHA-256)
// El token queda atado al negocio y al usuario que lo creó: las herramientas usan su rol actual,
// solo aparecen las de módulos activos y nunca se usa la contraseña.
// Las de escritura se marcan (destructiveHint) para que el asistente pida confirmación, y quedan en la bitácora.
//
// Tokens (sesión normal de la app):
//   GET    /api/ia/tokens          los del usuario (owner/admin ven todos los del negocio)
//   POST   /api/ia/tokens          { name } -> { token } se muestra una sola vez
//   DELETE /api/ia/tokens/:id      revocar
import { json, readJson, HttpError, str } from '../lib/http.js';
import { db, uuid, nowIso } from '../lib/db.js';
import { randomHex, sha256Hex, isExpired } from '../lib/auth.js';
import { activeModuleIds, roleReaches, APP } from '../lib/modules.js';
import { audit } from '../lib/audit.js';
import { TOOLS } from '../ia/index.js';
import { centralTools } from '../lib/central.js';

const PROTOCOL = '2025-06-18';

async function tokenContext(c) {
  const m = /^Bearer\s+(dwm_[0-9a-f]{64})$/i.exec(c.req.headers.get('authorization') || '');
  if (!m) throw new HttpError(401, 'Falta el token de conexión (Authorization: Bearer …)');
  const t = await db(c.env).first(`SELECT t.id, t.business_id, t.user_id, mb.role, b.paid_until, u.email, u.name
      FROM mcp_tokens t
      JOIN businesses b ON b.id = t.business_id AND b.status = 'active' AND b.archived_at IS NULL
      JOIN memberships mb ON mb.business_id = t.business_id AND mb.user_id = t.user_id
      JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = ? AND t.revoked_at IS NULL`, await sha256Hex(m[1]));
  if (!t) throw new HttpError(401, 'Token no válido o revocado');
  await db(c.env).run('UPDATE mcp_tokens SET last_used_at = ? WHERE id = ?', nowIso(), t.id);
  Object.assign(c, { businessId: t.business_id, role: t.role, readOnly: isExpired(t.paid_until), origin: 'mcp',
    session: { user_id: t.user_id, email: t.email, name: t.name } });
}

async function availableTools(c) {
  const active = new Set(await activeModuleIds(c.env, c.businessId));
  return [...TOOLS, ...(await centralTools(c.env))].filter((t) => (!t.modulo || active.has(t.modulo)) && roleReaches(c.role, t.rol || 'staff'));
}

// Los clientes de IA solo aceptan [a-zA-Z0-9_-] en el nombre: «items.listar» se publica como «items_listar».
const wire = (name) => name.replace(/\./g, '_');
const describe = (t) => ({
  name: wire(t.name), description: t.description, inputSchema: t.inputSchema,
  annotations: { readOnlyHint: t.tipo !== 'escritura', destructiveHint: t.tipo === 'escritura', title: t.description },
});

async function handle(c, msg) {
  const { id, method, params = {} } = msg || {};
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof method !== 'string') return fail(-32600, 'Petición no válida');
  if (method.startsWith('notifications/')) return null;
  if (method === 'initialize') return ok({ protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: APP.id, title: APP.nombre, version: '1.0.0' },
    instructions: `Herramientas de ${APP.nombre} para el negocio conectado. Pide confirmación antes de usar herramientas que escriben.` });
  if (method === 'ping') return ok({});
  if (method === 'tools/list') return ok({ tools: (await availableTools(c)).map(describe) });
  if (method === 'tools/call') {
    const tool = (await availableTools(c)).find((t) => wire(t.name) === params.name || t.name === params.name);
    if (!tool) return fail(-32602, 'Herramienta no disponible para este negocio o rol');
    if (tool.tipo === 'escritura' && c.readOnly) return ok({ isError: true, content: [{ type: 'text', text: 'La suscripción del negocio está vencida: solo lectura.' }] });
    try {
      c.audited = false;
      const out = await tool.run(c, params.arguments || {});
      if (tool.tipo === 'escritura' && !c.audited) await audit(c, `IA: ${tool.name}`, { modulo: tool.modulo, detalle: params.arguments, origen: 'mcp' });
      return ok({ content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out });
    } catch (e) {
      return ok({ isError: true, content: [{ type: 'text', text: e instanceof HttpError ? e.message : 'Error al ejecutar la herramienta' }] });
    }
  }
  return fail(-32601, `Método no soportado: ${method}`);
}

export async function mcpFetch(req, env, ctx) {
  if (req.method === 'GET') return new Response(null, { status: 405, headers: { allow: 'POST' } }); // sin SSE: respuestas JSON
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  const c = { req, env, ctx, url: new URL(req.url) };
  try {
    await tokenContext(c);
  } catch (e) {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: e.message } }, e.status || 401, { 'www-authenticate': 'Bearer' });
  }
  let body;
  try { body = await req.json(); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } }, 400); }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(c, m)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202 });
  }
  const out = await handle(c, body);
  return out ? json(out) : new Response(null, { status: 202 });
}

export function routes(r) {
  r.get('/api/ia/tokens', 'tenant', async (c) => {
    const all = ['owner', 'admin'].includes(c.role);
    return json({ tokens: await db(c.env).all(`SELECT t.id, t.name, t.created_at, t.last_used_at, t.revoked_at, u.email
      FROM mcp_tokens t JOIN users u ON u.id = t.user_id WHERE t.business_id = ? ${all ? '' : 'AND t.user_id = ?'} ORDER BY t.created_at DESC`,
      c.businessId, ...(all ? [] : [c.session.user_id])), url: `${c.url.origin}/mcp` });
  });

  r.post('/api/ia/tokens', 'tenant', async (c) => {
    const name = str((await readJson(c.req)).name, { max: 60, required: true, label: 'Nombre de la conexión' });
    const token = `dwm_${randomHex(32)}`;
    await db(c.env).run('INSERT INTO mcp_tokens (id, business_id, user_id, name, token_hash) VALUES (?, ?, ?, ?, ?)',
      uuid(), c.businessId, c.session.user_id, name, await sha256Hex(token));
    await audit(c, `Creó la conexión de IA «${name}»`, { modulo: 'ia' });
    return json({ token, url: `${c.url.origin}/mcp` }, 201);
  });

  r.delete('/api/ia/tokens/:id', 'tenant', async (c) => {
    const t = await db(c.env).first('SELECT user_id, name FROM mcp_tokens WHERE id = ? AND business_id = ?', c.params.id, c.businessId);
    if (!t) throw new HttpError(404, 'No encontrada');
    if (t.user_id !== c.session.user_id && !['owner', 'admin'].includes(c.role)) throw new HttpError(403, 'Solo puedes revocar tus conexiones');
    await db(c.env).run('UPDATE mcp_tokens SET revoked_at = ? WHERE id = ? AND business_id = ?', nowIso(), c.params.id, c.businessId);
    await audit(c, `Revocó la conexión de IA «${t.name}»`, { modulo: 'ia' });
    return json({ ok: true });
  });
}
