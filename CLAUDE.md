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
- `modulos.app.json` (`"centrales": ["finanzas","marketing","marca","ai"]`). Módulos BASE (siempre activos): `ai` (IA: chats de clientes en `/chat/<slug>`, conversaciones, asistente, agentes, plantillas, consumo, conexiones MCP, claves de API `/v1/*` y bitácora; usa `/api/settings/*` y `/api/ia/tokens` de la app) reemplaza a Configuración y va abajo en el menú, junto a Equipo; `marca` es el servicio de marca (se edita en Marketing → Tarjetas → Marca). Color y modo de la app: menú de usuario. Ya no existe `/staff/configuracion.html`. Login: `public/index.html`, `public/js/login.js`, `public/css/diwilo-login.css`.
- Turnstile: `TURNSTILE_SITE_KEY` en wrangler, secreto `TURNSTILE_SECRET_KEY`.

- Clases grabadas (reposiciones): `src/api/videos.js` (subida por partes a R2, enlaces personales), `src/lib/ver.js` + `public/ver.html` + `public/js/ver.js` (`/ver/<enlace>`: público, sesión única, marca de agua con el nombre, sin descarga, Range; al 90 % del tiempo real visto la reposición queda hecha). Tablas `ac_videos`, `ac_video_partes`, `ac_video_accesos` (migración 0013). Disuade, no impide grabar la pantalla.

- Guía de uso por módulo para el MCP: bloque `mcp` del manifiesto (`modulos.app.json` / `modulo.json` central) → `GET /api/<módulo>/mcp`, recursos `diwilo://<módulo>/guia` y prompts `<módulo>_<flujo>` (estándar único en Diwilo Modulos: `src/lib/guias.js`; aquí `src/api/mcp.js` pide las guías por RPC y `propiasDe` en `src/lib/central.js` entrega las herramientas propias al asistente y a los agentes de la IA). Todo módulo nuevo debe traer su bloque `mcp`.

- Inicio del estudiante: rol `estudiante` (membresía; ficha enlazada por `ac_estudiantes.user_id`, migración 0014). Se invita desde la ficha (Estudiantes → «Acceso a la app», `/api/estudiantes/:id/acceso`). `authenticate` (lib/auth.js): nivel `alumno` solo para él; `tenant`/`manager` lo rechazan (403) y `any` lo deja pasar. `/<slug>` le sirve `public/alumno.html` + `public/js/alumno.js` (API `src/api/alumno.js`: inicio, calendario, curso/:id); `/staff/*` lo devuelve a su inicio. Un curso → entra directo; varios → calendario general. Curso sin empezar: abre en la semana del primer día con cuenta regresiva. Avisos calculados al abrir (sin push real todavía).

- Pagos del estudiante (migración 0015, `src/api/comprobantes.js`): sube foto/PDF (máx. 5 MB, tipo por bytes) a R2 → `ac_comprobantes` en revisión; el equipo (Matrículas → pestaña Comprobantes, módulo `cuotas`) aprueba (llama `registrarPago` → recibo en Finanzas) o rechaza con motivo. El estudiante ve su cuenta de cobro y recibos (`/api/alumno/curso/:id/cuenta-de-cobro|recibos`) servidos desde Finanzas. La cuenta de cobro lleva una línea por cuota (`cuentaDeMatricula`) y toma la marca del negocio (Diwilo Modulos ≥ finanzas 1.4.0: desplegar ese primero).
- Pruebas: `DEV_LOG=1 npm test` muestra los errores del Worker. Si falla con «no such column» en la base local de Modulos, la base de `.wrangler` quedó vieja respecto a sus migraciones.

- La clase del estudiante (migración 0016, `src/api/trabajo.js`): el día de la clase (y después) ve el material (`ac_clases.material_id`; archivos por `/api/alumno/material/:key`, `AC.doc.base`), sube su trabajo (`ac_entregas`, R2 `<negocio>/entrega/`; el equipo lo ve en Cursos → Entregas) y presenta las evaluaciones de esa clase (`ac_evaluaciones.clase_n`): solo el día de la clase, se envía una vez (`ac_examenes.enviado_at`), sin respuestas correctas hacia el cliente; si todo se califica solo y no hay nota, queda en Notas. Calendario con vista Semana/Mes.

- Nómina (migraciones 0017/0018/0019, rutas en `src/api/team.js`, editor en `public/js/pages/equipo.js`): en **Equipo** el botón de tarjeta abre el editor de la persona (pestañas Datos y Nómina). Datos: nombre, tipo de documento (CC/NIT/CE/PA), número y celular (`ac_nomina`, `persona` = `u:<usuario>` | `p:<profesional>`). Nómina: solo los **ítems** del mes (sueldo, clases del profesional, otros), cada cuánto y centro de costo; lo que se le paga es el total de los ítems. «Guardar» deja el plan en Finanzas (`/api/finanzas/pagos-mes`, presupuesto del mes) y `recurrenteNomina` (lib/central.js) crea/actualiza el gasto recurrente tipo Nómina (`ref academia:nomina:<persona>`, no se cobra solo). **El pago se hace en Finanzas** (botón Pagar del gasto, con cuentas divididas); «Pagar en Finanzas» de Equipo lo abre (`#pagar:<id>`). Solo propietario/admin.

## Comandos
- `npm run db:migrate:local && npm test` → "Todo bien".

## Reglas
- Toda consulta filtra por negocio. Roles owner/admin/staff (+ `estudiante`, solo `/api/alumno/*`). Vencida = solo lectura.
- Migraciones nuevas: solo agregar, preservar datos (nunca DROP de tablas con datos).
- Push/publicar solo con confirmación del usuario.
