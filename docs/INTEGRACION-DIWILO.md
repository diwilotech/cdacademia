# Control de Academia (cdacademia) — estado y conexión con Diwilo Web

Documento de referencia. Última revisión: 2026-10-07.

## 1. Principio

Diwilo Web (`diwilo.com/admin`) es el **único panel de plataforma**: ahí se crean los negocios, se invita a sus
dueños, se cobran las suscripciones y se entregan los accesos de **todas** las apps (Pedidos, Nutrición, Citas,
Residentes y, ahora, Academia). La app no tiene registro público ni super-administrador propio. Cada persona
entra a la app con **correo + contraseña** (sin Cloudflare Access; Access solo protege `diwilo.com/admin`).

## 2. Estado (actualizado 2026-10-08)

Implementado: contraseña (mín. 8, PBKDF2), login único sin negocio en la URL (elige negocio si hay varios),
invitaciones `#invite=` (crear/restablecer), bloqueo 5/15, solo lectura con 402 y barra roja, `/api/platform/*`,
`/api/setup` eliminado, diseño `diwilo-login.css`. Migraciones 0001 y 0002 aplicadas en producción.

| Dato | Valor |
| --- | --- |
| URL | https://cdacademia.diwilo.com (sin workers.dev) |
| Worker | `cdacademia` |
| D1 | `control-de-academia-db` · `3cad86e3-cbc8-4e0c-b69b-8367c63f4b65` |
| R2 | `cdacademia-files` |
| Repo | https://github.com/diwilotech/cdacademia (push a `main` = deploy) |
| Cuenta Cloudflare | Diwilo Account · `add05706f955a450e7d0c9680cc33ba4` |
| Secreto `PLATFORM_KEY` | **Pendiente de poner** en este Worker, con el mismo valor que Diwilo Web: `npx wrangler secret put PLATFORM_KEY` |

**Usuarios:** no hay ninguno. Se crean desde Diwilo Web → Negocios → app Academia.

## 3. Registro en Diwilo Web (hecho)
`wrangler.jsonc`: service `ACADEMIA` → `cdacademia` y `ACADEMIA_URL`; `worker/src/platform.js`: entrada `academia`
(roles owner/admin/staff, sin slug). `loginUrl` ya es genérico (`<url>/`).

## 4. Estado técnico de los datos
- Etapa 1: todo el estado del negocio es un JSON en `app_state` (con versión, tope ~2 MB).
- Etapa 2 (pendiente): tablas normalizadas con `business_id`.
- Fotos de marketing: aún en el navegador (IndexedDB); `PUT/GET /staff/files/:name` (R2) ya existe.
- Stubs: reposición virtual (Cloudflare Stream) y "Organizar con IA".
