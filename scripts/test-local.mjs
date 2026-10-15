// Prueba de punta a punta en local: Diwilo (simulado) crea negocios por RPC y se recorre la app completa.
// Uso: npm run db:migrate:local && npm run test
// Turnstile con las claves de PRUEBA de Cloudflare (siempre pasa); nunca con las reales.
import { readdirSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { startApp, check, failures, fail, diwilo, client, mcp, newBusiness, newMember, TS_TOKEN, APP } from './test-helpers.mjs';

await startApp();

try {
  const A = await newBusiness('Negocio A');
  const app = A.app;
  check('Diwilo crea un negocio por RPC', A.created.status === 201 && A.created.data.invite_path);
  const bid = A.created.data.id;

  // --- Seguridad del ingreso ---
  check('Desde internet /api/platform da 401', (await app('/api/platform/businesses')).status === 401);
  check('Desde internet /api/platform/modules da 401', (await app('/api/platform/modules')).status === 401);
  check('/api/config entrega la llave pública de Turnstile', !!(await app('/api/config')).data.turnstileSiteKey);
  check('Invitación sin Turnstile se rechaza', (await app('/api/auth/invite', { method: 'POST', body: { token: A.token, password: 'clave-segura-1' } })).status === 400);
  const inv0 = await app('/api/auth/invite', { method: 'POST', body: { token: A.token, password: 'clave-segura-1', turnstile: TS_TOKEN } });
  check('Sin autorizar datos ni confirmar mayoría de edad no se registra', inv0.status === 400 && inv0.data.code === 'CONSENT', JSON.stringify(inv0.data));
  check('El link pide el consentimiento', (await app(`/api/auth/invite?token=${A.token}`)).data.needsConsent === true);
  const inv = await app('/api/auth/invite', { method: 'POST', body: { token: A.token, password: 'clave-segura-1', name: 'Dueña A', consent: true, adult: true, turnstile: TS_TOKEN } });
  check('Crea su contraseña (con Turnstile y consentimiento) y entra', inv.status === 200 && inv.data.businesses.length === 1, JSON.stringify(inv.data));
  const cookie = inv.headers.get('set-cookie') || '';
  check('Cookie de sesión HttpOnly de 30 días', /HttpOnly/i.test(cookie) && /Max-Age=2592000/.test(cookie), cookie);
  check('Login sin Turnstile se rechaza', (await client()('/api/auth/login', { method: 'POST', body: { email: A.mail, password: 'clave-segura-1' } })).status === 400);
  check('Login con Turnstile entra', (await client()('/api/auth/login', { method: 'POST', body: { email: A.mail, password: 'clave-segura-1', turnstile: TS_TOKEN } })).status === 200);

  // --- Shell: /api/me, módulos, páginas ---
  const me = await app('/api/me');
  check('/api/me trae rol, tema y módulos', me.data.role === 'owner' && me.data.settings?.tema && me.data.modules?.some((m) => m.id === 'estudiantes'), JSON.stringify(me.data).slice(0, 300));
  check('/staff/ sin sesión redirige al ingreso', (await client()('/staff/')).status === 302);
  check('/staff/ con sesión responde', (await app('/staff/')).status === 200);
  check('/app (enlace viejo) redirige a /staff/', (await app('/app')).headers.get('location')?.endsWith('/staff/'));
  check('/admin.html (versión anterior) redirige a /staff/', (await app('/admin.html')).headers.get('location')?.endsWith('/staff/'));
  check('Una dirección que no existe muestra la página 404', (await client()('/no-existe')).status === 404);
  check('Escritura sin x-app se rechaza (CSRF)', (await app('/api/estudiantes/estudiantes', { method: 'POST', body: { nombre: 'x' }, headers: { 'x-app': '' } })).status === 403);
  const it = await app('/api/estudiantes/estudiantes', { method: 'POST', body: { nombre: 'Primera' } });
  check('Crea un estudiante del negocio', it.status === 201);
  check('El widget del dashboard responde', (await app('/api/estudiantes/resumen')).data.valor === 1);

  // --- Aislamiento entre negocios ---
  const B = await newBusiness('Negocio B');
  await B.app('/api/auth/invite', { method: 'POST', body: { token: B.token, password: 'clave-segura-B', consent: true, adult: true, turnstile: TS_TOKEN } });
  check('B no ve los estudiantes de A', (await B.app('/api/estudiantes/estudiantes')).data.rows?.length === 0);
  check('B no puede borrar un estudiante de A', (await B.app(`/api/estudiantes/estudiantes/${it.data.id}`, { method: 'DELETE' })).status === 404);
  check('El estudiante de A sigue intacto', (await app('/api/estudiantes/estudiantes')).data.rows.length === 1);
  check('B no ve el equipo de A', !(await B.app('/api/team')).data.users.some((u) => u.email === A.mail));

  // --- Módulos por negocio (los asigna Diwilo) ---
  check('Diwilo lee el catálogo de módulos de la app', (await diwilo('GET', '/modules')).data.modulos?.some((m) => m.id === 'estudiantes'));
  check('Módulo desconocido se rechaza', (await diwilo('PUT', `/businesses/${bid}/modules`, { modules: [{ modulo: 'nada', activo: true }] })).status === 400);
  await diwilo('PUT', `/businesses/${bid}/modules`, { modules: [{ modulo: 'estudiantes', activo: false }] });
  check('Módulo inactivo: su API responde 403', (await app('/api/estudiantes/estudiantes')).status === 403);
  check('Módulo inactivo: no aparece en el menú', !(await app('/api/me')).data.modules.some((m) => m.id === 'estudiantes'));
  check('Módulo inactivo en A no afecta a B', (await B.app('/api/estudiantes/estudiantes')).status === 200);
  check('Módulo con fecha de fin vencida queda inactivo', (await diwilo('PUT', `/businesses/${bid}/modules`, { modules: [{ modulo: 'estudiantes', activo: true, hasta: '2020-01-01' }] })).status === 200 && (await app('/api/estudiantes/estudiantes')).status === 403);
  await diwilo('PUT', `/businesses/${bid}/modules`, { modules: [{ modulo: 'estudiantes', activo: true }] });
  check('Reactivado: los datos siguen ahí', (await app('/api/estudiantes/estudiantes')).data.rows?.length === 1);
  // Gestionado por Diwilo (con huella): la lista es exacta, vacía = ningún módulo; sin huella vuelve a «todos»
  await diwilo('PUT', `/businesses/${bid}/modules`, { modules: [], version: 'h1' });
  check('Gestionado por Diwilo: lista vacía apaga los módulos', (await app('/api/estudiantes/estudiantes')).status === 403);
  check('Diwilo lee las huellas de todos los negocios', (await diwilo('GET', '/modules/sync')).data.rows?.some((r) => r.business_id === bid && r.version === 'h1'));
  const bm = (await diwilo('GET', `/businesses/${bid}/modules`)).data;
  check('Diwilo ve cuántos registros tiene cada módulo', bm.managed === true && bm.uso?.estudiantes === 1, JSON.stringify(bm));
  await diwilo('PUT', `/businesses/${bid}/modules`, { modules: [{ modulo: 'estudiantes', activo: true }], version: 'h2' });
  check('Con la huella nueva el módulo vuelve', (await app('/api/estudiantes/estudiantes')).status === 200);
  await diwilo('PUT', `/businesses/${bid}/modules`, { modules: [] });

  // --- Apariencia ---
  check('Tema fuera de la paleta se rechaza', (await app('/api/settings/apariencia', { method: 'PUT', body: { tema: 'fucsia' } })).status === 400);
  const ap = await app('/api/settings/apariencia', { method: 'PUT', body: { tema: 'verde', modo: 'dark' } });
  check('El propietario cambia tema y modo', ap.data.tema === 'verde' && ap.data.modo === 'dark');
  check('/api/me trae el tema nuevo', (await app('/api/me')).data.settings.tema === 'verde');
  const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  check('Sube el logo a R2 y se puede ver', (await app('/api/settings/logo', { method: 'PUT', body: { dataUrl: logo } })).status === 200 && (await app('/api/settings/logo')).status === 200);

  // --- Equipo y roles ---
  const staffMail = `staff${Date.now()}@ejemplo.com`;
  const staff = await diwilo('POST', `/businesses/${bid}/users`, { email: staffMail, role: 'staff' });
  check('Invita a una persona del equipo', staff.status === 201);
  const S = client();
  const st = new URLSearchParams(staff.data.invite_path.split('#')[1]).get('invite');
  await S('/api/auth/invite', { method: 'POST', body: { token: st, password: 'clave-staff-1', consent: true, adult: true, turnstile: TS_TOKEN } });
  check('Personal no cambia la apariencia (403)', (await S('/api/settings/apariencia', { method: 'PUT', body: { tema: 'rojo' } })).status === 403);
  check('Personal no borra estudiantes (403)', (await S(`/api/estudiantes/estudiantes/${it.data.id}`, { method: 'DELETE' })).status === 403);
  check('Personal no ve la bitácora (403)', (await S('/api/settings/bitacora')).status === 403);
  check('Cambia su rol a admin', (await diwilo('PATCH', `/businesses/${bid}/users/${staff.data.id}`, { role: 'admin' })).data.role === 'admin');
  check('No se puede quitar al propietario', (await diwilo('DELETE', `/businesses/${bid}/users/${me.data.user.id}`)).status === 409);
  const tm = await app('/api/team', { method: 'POST', body: { email: `admin${Date.now()}@ejemplo.com`, role: 'admin' } });
  check('El propietario invita a un administrador desde la app', tm.status === 201 && tm.data.invite_url.includes('#invite='));
  check('El propietario no se puede tocar desde Equipo', (await app(`/api/team/${me.data.user.id}`, { method: 'DELETE' })).status === 409);

  // --- MCP ---
  check('MCP sin token da 401', (await mcp(null, { jsonrpc: '2.0', id: 1, method: 'initialize' })).status === 401);
  const tk = await app('/api/ia/tokens', { method: 'POST', body: { name: 'Claude de prueba' } });
  check('Crea una conexión de IA (token)', tk.status === 201 && tk.data.token?.startsWith('dwm_'));
  const init = await mcp(tk.data.token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } } });
  check('MCP initialize', init.status === 200 && init.data.result?.serverInfo?.name);
  const tools = await mcp(tk.data.token, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  check('MCP lista las herramientas del módulo activo', tools.data.result?.tools?.some((t) => t.name === 'estudiantes_crear' && t.annotations.destructiveHint));
  const call = await mcp(tk.data.token, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'estudiantes_crear', arguments: { nombre: 'Desde la IA' } } });
  check('MCP crea un estudiante en su negocio', !call.data.result?.isError && (await app('/api/estudiantes/estudiantes')).data.rows.some((i) => i.nombre === 'Desde la IA'));
  check('La IA no escribe en otro negocio', (await B.app('/api/estudiantes/estudiantes')).data.rows.length === 0);
  check('La escritura de la IA queda en la bitácora', (await app('/api/settings/bitacora')).data.items.some((a) => a.origen === 'mcp'));
  await diwilo('PUT', `/businesses/${bid}/modules`, { modules: [{ modulo: 'estudiantes', activo: false }] });
  check('Módulo inactivo: sus herramientas no aparecen en MCP', !(await mcp(tk.data.token, { jsonrpc: '2.0', id: 4, method: 'tools/list' })).data.result.tools.some((t) => t.name.startsWith('estudiantes_')));
  await diwilo('PUT', `/businesses/${bid}/modules`, { modules: [] });
  await app(`/api/ia/tokens/${(await app('/api/ia/tokens')).data.tokens[0].id}`, { method: 'DELETE' });
  check('Token revocado ya no entra', (await mcp(tk.data.token, { jsonrpc: '2.0', id: 5, method: 'tools/list' })).status === 401);

  // --- Suscripción vencida = solo lectura ---
  await diwilo('PATCH', `/businesses/${bid}`, { paid_until: '2020-01-01' });
  check('Vencida: puede leer', (await app('/api/estudiantes/estudiantes')).status === 200);
  check('Vencida: no puede escribir (402)', (await app('/api/estudiantes/estudiantes', { method: 'POST', body: { nombre: 'No' } })).status === 402);
  check('Vencida: /api/me la marca como solo lectura', (await app('/api/me')).data.business.readOnly === true);
  check('Vencida: sí puede cambiar su contraseña', (await app('/api/auth/password', { method: 'POST', body: { current: 'clave-segura-1', password: 'clave-segura-2' } })).status === 200);
  await diwilo('PATCH', `/businesses/${bid}`, { paid_until: null });

  // --- PWA y páginas públicas ---
  const man = await client()('/manifest.json');
  check('manifest.json con íconos 192, 512 y maskable', man.status === 200 && man.data.icons?.length === 3 && man.data.icons.some((i) => i.purpose === 'maskable') && man.data.display === 'standalone');
  const sw = await client()('/sw.js');
  check('sw.js no guarda /staff, /api ni /mcp', sw.status === 200 && /staff\|api\|mcp/.test(sw.data.text || ''));
  for (const p of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/privacidad', '/dmca']) check(`${p} responde`, (await client()(p)).status === 200);

  // --- Diwilo: entrar como dueño, archivar, restaurar ---
  const sso = await diwilo('POST', `/businesses/${bid}/sso`);
  const first = await fetch(APP + sso.data.path, { redirect: 'manual' });
  check('El pase abre la sesión del propietario', first.status === 302 && first.headers.getSetCookie().length > 0, String(first.status));
  check('El pase sirve una sola vez', (await fetch(APP + sso.data.path, { redirect: 'manual' })).status === 410);
  const ar = await diwilo('DELETE', `/businesses/${bid}`);
  check('Archivar lo saca de la lista y da fecha de borrado', ar.status === 200 && ar.data.purge_on);
  check('Archivado: la sesión ya no sirve', (await app('/api/me')).status === 409 || (await app('/api/me')).status === 401);
  check('Restaurar lo devuelve', (await diwilo('POST', `/businesses/${bid}/restore`)).status === 200);
  check('La limpieza no toca los negocios vigentes', (await diwilo('POST', '/purge', { days: 20 })).data.purged.length === 0);

  // --- Bloqueo por intentos ---
  const L = client();
  for (let i = 0; i < 5; i++) await L('/api/auth/login', { method: 'POST', body: { email: A.mail, password: 'mala-clave', turnstile: TS_TOKEN } });
  check('5 intentos fallidos bloquean (429)', (await L('/api/auth/login', { method: 'POST', body: { email: A.mail, password: 'clave-segura-2', turnstile: TS_TOKEN } })).status === 429);
  check('El bloqueo por IP alcanza a otros correos', (await L('/api/auth/login', { method: 'POST', body: { email: B.mail, password: 'clave-segura-B', turnstile: TS_TOKEN } })).status === 429);

  // Pruebas de los módulos propios (tests/app/) y, si las hay, otras de integración (tests/modulos/).
  // Antes, las de los módulos propios de la app (tests/app/).
  for (const dir of ['tests/app', 'tests/modulos']) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.test.mjs')).sort()) {
      console.log(`\n— Módulo ${f.replace('.test.mjs', '')}`);
      await (await import(pathToFileURL(`${dir}/${f}`).href)).default({ check, diwilo, client, mcp, newBusiness, newMember, TS_TOKEN, APP });
    }
  }
} catch (e) {
  console.error(e);
  fail();
} finally {
  const n = failures();
  console.log(n ? `\n${n} prueba(s) fallaron` : '\nTodo bien');
  process.exit(n ? 1 : 0);
}
