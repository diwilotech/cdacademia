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

- Control total por IA: `src/ia/academia.js` (7 herramientas a mano) + `src/ia/control.js` (≈86, declarativas) llaman a las MISMAS rutas de la API con `llamar()` de `src/ia/interno.js` (hereda roles, módulo activo, solo lectura, validaciones y bitácora; solo rutas tenant/manager/any). Nombre `<modulo>.<verbo>_<objeto>` (`cursos.crear_curso`); CRUD con `crudHerramientas`. Herramienta nueva = una línea con `herramienta({... ruta: [MÉTODO, '/api/…/:param']})`; actualiza el bloque `mcp` del módulo en `modulos.app.json`. Fuera de MCP a propósito: subir archivos/videos, páginas e impresos (cuenta de cobro, recibo), todo `/api/alumno/*`.

- Inicio del estudiante: rol `estudiante` (membresía; ficha enlazada por `ac_estudiantes.user_id`, migración 0014). Se invita desde la ficha (Estudiantes → «Acceso a la app», `/api/estudiantes/:id/acceso`). `authenticate` (lib/auth.js): nivel `alumno` solo para él; `tenant`/`manager` lo rechazan (403) y `any` lo deja pasar. `/<slug>` le sirve `public/alumno.html` + `public/js/alumno.js` (API `src/api/alumno.js`: inicio, calendario, curso/:id); `/staff/*` lo devuelve a su inicio. Un curso → entra directo; varios → calendario general. Curso sin empezar: abre en la semana del primer día con cuenta regresiva. Avisos calculados al abrir (sin push real todavía).

- Pagos del estudiante (migración 0015, `src/api/comprobantes.js`): sube foto/PDF (máx. 5 MB, tipo por bytes) a R2 → `ac_comprobantes` en revisión; el equipo (Matrículas → pestaña Comprobantes, módulo `cuotas`) aprueba (llama `registrarPago` → recibo en Finanzas) o rechaza con motivo. El estudiante ve su cuenta de cobro y recibos (`/api/alumno/curso/:id/cuenta-de-cobro|recibos`) servidos desde Finanzas. La cuenta de cobro lleva una línea por cuota (`cuentaDeMatricula`) y toma la marca del negocio (Diwilo Modulos ≥ finanzas 1.4.0: desplegar ese primero).
- Pruebas: `DEV_LOG=1 npm test` muestra los errores del Worker. Si falla con «no such column» en la base local de Modulos, la base de `.wrangler` quedó vieja respecto a sus migraciones.

- La clase del estudiante (migración 0016, `src/api/trabajo.js`): el día de la clase (y después) ve el material (`ac_clases.material_id`; archivos por `/api/alumno/material/:key`, `AC.doc.base`) y presenta las evaluaciones de esa clase (`ac_evaluaciones.clase_n`): solo durante la sesión (día y franja ini–fin, hora de Colombia: `enSesion` en lib/academia.js), se envía una vez (`ac_examenes.enviado_at`), sin respuestas correctas hacia el cliente; solo el examen con subida lleva archivo (foto/PDF). NO hay «subir mi trabajo»/entregas (tabla `ac_entregas` queda sin uso). Si todo se califica solo y no hay nota, queda en Notas. Calendario con vista Semana/Mes.

- Nómina (migraciones 0017/0018/0019, rutas en `src/api/team.js`, editor en `public/js/pages/equipo.js`): en **Equipo** cada persona tiene dos botones: el birrete abre **Info** (nombre, tipo de documento, número, celular y el interruptor «Es profesional», que muestra juntos áreas, niveles y horario — `AC.profCampos`; sin marcar no es profesional) y el **$** abre **Nómina** (`ac_nomina`, `persona` = `u:<usuario>` | `p:<profesional>`): una sola lista de **ítems** del mes (sueldo, bonos, clases del profesional), cada cuánto y centro de costo; el total cubre el mes. «Guardar» deja el plan en Finanzas (`/api/finanzas/pagos-mes`) y `recurrenteNomina` (lib/central.js) crea/actualiza el gasto recurrente tipo Nómina (`ref academia:nomina:<persona>`, amount = total ÷ 4 semanas o ÷ 2 quincenas, no se cobra solo). **El pago se hace en Finanzas** (botón Pagar, cuentas divididas, una parte por semana/quincena); «Pagar en Finanzas» de Equipo lo abre (`#pagar:<id>`). Solo propietario/admin.

- Matrícula pública y embudo (Marketing): `/<negocio>/matricula` (`src/lib/matricula-web.js`, sin sesión; GET página con los cursos abiertos, POST interés → RPC `MODULOS.lead`). Las campañas de la academia nacen con un link `/l/<slug>` a `/matricula` (central.js lo resuelve a `/<negocio>/matricula?ref=<slug>`); al matricular (`matriculadoMarketing`) el lead pasa a cliente. Requiere Diwilo Modulos ≥ marketing 1.7.0 (migración 0017): desplegar ese primero.

## Comandos
- `npm run db:migrate:local && npm test` → "Todo bien".

## Reglas
- Toda consulta filtra por negocio. Roles owner/admin/staff (+ `estudiante`, solo `/api/alumno/*`). Vencida = solo lectura.
- Migraciones nuevas: solo agregar, preservar datos (nunca DROP de tablas con datos).
- Push/publicar solo con confirmación del usuario.
