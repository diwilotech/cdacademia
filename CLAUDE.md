# CD Academia — guía rápida

Responde en español. Modo económico: sin capturas salvo que se pidan; de las pruebas mostrar solo el resumen.

## Qué es
App `cdacademia` (cdacademia.diwilo.com). Cloudflare Workers + D1 `control-de-academia-db`, JS sin framework, Bootstrap.
Publica sola con Workers Builds al hacer push a `main` (aplica migraciones). Repo diwilotech/cdacademia.

## Mapa
- `src/index.js` rutas; `src/api/platform.js` + `src/lib/platform-rpc.js` = contrato con Diwilo (NO tocar).
- `src/lib/central.js` = puente a Diwilo Modulos (binding `MODULOS`): `/api/finanzas|marketing/*`, `/staff/<modulo>.html`, `/m/*`, `/l/*`, `/validar/*`, `/c/*` (tarjetas), herramientas IA.
- `modulos.app.json` (`"centrales": ["finanzas","marketing"]`). Login: `public/index.html`, `public/js/login.js`, `public/css/diwilo-login.css`.
- Turnstile: `TURNSTILE_SITE_KEY` en wrangler, secreto `TURNSTILE_SECRET_KEY`.

## Comandos
- `npm run db:migrate:local && npm test` → "Todo bien".

## Reglas
- Toda consulta filtra por negocio. Roles owner/admin/staff. Vencida = solo lectura.
- Migraciones nuevas: solo agregar, preservar datos (nunca DROP de tablas con datos).
- Push/publicar solo con confirmación del usuario.
