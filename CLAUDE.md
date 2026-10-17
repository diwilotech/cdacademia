# CD Academia — guía rápida

Responde en español. Modo económico: sin capturas salvo que se pidan; de las pruebas mostrar solo el resumen.

## Qué es
App `cdacademia` (cdacademia.diwilo.com). Cloudflare Workers + D1 `control-de-academia-db`, JS sin framework, Bootstrap.
Publica sola con Workers Builds al hacer push a `main` (aplica migraciones). Repo diwilotech/cdacademia.

## Mapa
- Dirección fija por negocio: `/<slug>` (ej. `/demo`) es el ingreso y, con sesión, el panel (`public/staff/panel.html`): menú + un marco (`#dw-frame`) donde se carga cada módulo (`/staff/<modulo>.html`) sin cambiar la URL. Las páginas incrustadas las detecta `shell.js` (`window.top !== window.self`) y no pintan menú. Abrir `/staff/*` directo redirige a `/<slug>?go=…`. `wrangler.jsonc` → `run_worker_first` manda todo al Worker salvo css/js/íconos.
- `src/index.js` rutas; `src/api/platform.js` + `src/lib/platform-rpc.js` = contrato con Diwilo (NO tocar).
- `src/lib/central.js` = puente a Diwilo Modulos (binding `MODULOS`): `/api/finanzas|marketing/*`, `/staff/<modulo>.html`, `/m/*`, `/l/*`, `/validar/*`, `/c/*` (tarjetas), herramientas IA.
- Pagos → Finanzas: `registrarPago`/anular llaman `movimientoFinanzas` (central.js) → `POST /api/finanzas/movements/externo` con `ref academia:pago:<N.º>` (no duplica); la anulación crea un egreso `…:anulado`. Botón «Enviar pagos a Finanzas» en Pagos para los de antes.
- Pagos y recibos en pantalla salen de Finanzas (`GET /api/matriculas/:id/pagos` y `/pagos/:num/recibo`, vía `finanzasLeer`); `ac_pagos` queda solo como índice interno para saldo/cartera. Matrículas ya no tiene pestañas Cartera/Pagos: filtro «Cobro».
- `modulos.app.json` (`"centrales": ["finanzas","marketing","marca"]`). Marca e IA: color de la marca (por defecto el de Apariencia), tipografía, tono y plantillas de IA; las tarjetas leen de ahí. Login: `public/index.html`, `public/js/login.js`, `public/css/diwilo-login.css`.
- Turnstile: `TURNSTILE_SITE_KEY` en wrangler, secreto `TURNSTILE_SECRET_KEY`.

## Comandos
- `npm run db:migrate:local && npm test` → "Todo bien".

## Reglas
- Toda consulta filtra por negocio. Roles owner/admin/staff. Vencida = solo lectura.
- Migraciones nuevas: solo agregar, preservar datos (nunca DROP de tablas con datos).
- Push/publicar solo con confirmación del usuario.
