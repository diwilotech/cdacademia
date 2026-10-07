# Control de Academia

Gestión de academias (estudiantes, cursos, cuotas, asistencia, notas, reposiciones y marketing).
Un solo Cloudflare Worker (API + frontend), D1 multi-tenant (`business_id`), R2 para archivos.

## Estructura
- `src/index.js` – entrada del Worker: protege `/admin` y `/staff/*`, sirve el login en `/`.
- `src/lib/router.js` – router propio sin dependencias. `auth.js`, `password.js` (PBKDF2 + salt), `db.js`, `http.js`.
- `src/routes/` – `auth.js` (login/logout/setup), `state.js` (estado del negocio), `files.js` (R2).
- `public/index.html` – login (correo + PIN). `public/admin.html` – panel SPA con pestañas (JS en `admin-*.js`).
- `migrations/` – esquema D1.

## Puesta en marcha
```bash
npm install
npx wrangler d1 create control-de-academia-db     # copia el database_id en wrangler.toml
npx wrangler r2 bucket create cdacademia-files
npm run db:migrate:remote
npx wrangler secret put SETUP_KEY
```
Crear el primer negocio y usuario:
```bash
curl -X POST https://TU-WORKER/api/setup -H "authorization: Bearer $SETUP_KEY" -H "content-type: application/json" \
  -d '{"negocio":"Mi Academia","slug":"mi-academia","email":"yo@correo.com","name":"Yo","pin":"123456"}'
```
Local: `echo 'SETUP_KEY=dev' > .dev.vars && npm run db:migrate:local && npm run dev`.

## Despliegue
GitHub + Workers Builds: push a `main` despliega solo (conectar el repo en el panel de Cloudflare).

## Seguridad
Sesión por cookie `HttpOnly; Secure; SameSite=Lax` (30 días) verificada contra D1 en cada request a `/staff/*`;
escrituras exigen la cabecera `x-requested-with: cda`; bloqueo de 15 min tras 5 PIN fallidos.

## Estado actual / pendiente
- Etapa 1: el estado completo del negocio se guarda como JSON en `app_state` (control de versión optimista, límite ~2 MB).
  Etapa 2: pasar a tablas normalizadas (estudiantes, cursos, inscripciones, pagos…) con `business_id`.
- Las fotos de marketing siguen en IndexedDB del navegador; `PUT/GET /staff/files/:name` (R2) ya existe para migrarlas.
- Reposición virtual (Cloudflare Stream) y "Organizar con IA" son stubs documentados en el código.
