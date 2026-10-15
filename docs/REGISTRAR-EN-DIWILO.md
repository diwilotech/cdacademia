# Registrar una app nueva en Diwilo Web

Todo en el repo **Diwilo Web Admin** (`diwilotech/diwilo-Web`). Ejemplo con la app `cdNOMBRE`, clave `nombre`.

## 1. Conexión (obligatorio para que aparezca en Negocios)

**`wrangler.jsonc`**, en `services` y en `vars`:

```jsonc
{ "binding": "NOMBRE", "service": "cdNOMBRE", "entrypoint": "Platform" },
...
"NOMBRE_URL": "https://cdNOMBRE.diwilo.com",
```

**`worker/src/platform.js`**, en `APPS`:

```js
nombre: { name: 'Nombre', binding: 'NOMBRE', url: 'NOMBRE_URL', roles: ['owner', 'admin', 'staff'], slug: false },
```

- `roles`: los que acepta la app (los de la plantilla son esos tres).
- `slug`: `false` si la app no usa dirección propia por negocio, `'optional'` o `'required'` si sí.

**`public/admin.html`**, en `PERMS` (opcional): qué puede hacer cada rol en esta app. Si no lo pones, usa el texto general.

Despliega primero la app y después Diwilo. En Negocios aparecerá la pestaña nueva.

**Antes del primer deploy de la app** (sin esto nadie puede entrar o no hay logos):
- Widget de **Turnstile** para `cdNOMBRE.diwilo.com` (Cloudflare → Turnstile): la llave pública en `TURNSTILE_SITE_KEY`
  (`wrangler.jsonc`) y el secret con `npx wrangler secret put TURNSTILE_SECRET_KEY`.
- Bucket de **R2**: `npx wrangler r2 bucket create cdNOMBRE-archivos`.

**Módulos por negocio** (Diwilo → Módulos): la app expone por RPC
- `GET /api/platform/modules`: su catálogo (`modulos.app.json`: propios y centrales). Diwilo lo lee solo; pon en cada
  módulo propio su `tablas` (así Diwilo muestra cuántos registros tiene un negocio antes de quitarle el módulo).
- `PUT /api/platform/businesses/:id/modules { modules, version }`: los módulos efectivos (plan + excepciones) y su huella.
  Con huella la lista es exacta (vacía = ningún módulo).
- `GET /api/platform/modules/sync`: las huellas de todos los negocios; la revisión diaria reenvía solo a los desactualizados.

Los módulos horizontales (Finanzas, Marketing…) no se instalan: se piden en `modulos.app.json` → `"centrales"` y los
atiende el Worker central **Diwilo Modulos** por el binding `MODULOS` (debe estar publicado antes que la app).

Mientras Diwilo no gestione un negocio (sin huella), el negocio tiene todos los módulos activos. Al desplegar la app,
entra a Diwilo → Módulos → «Sincronizar»: se crea el plan «Completo» y cada negocio queda gestionado.

## 2. Sitio público (cuando la app esté lista para venderse)

- `worker/src/index.js` → `APPS_INFO`: nombre, URL, para quién es y qué hace (lo usan el chat y el servidor MCP).
- `src/pages/apps.html`: una `.app-row` con imagen en `public/assets/img/apps/nombre.jpg`.
- `public/assets/js/main.js`: la app en el modal «¿En cuál app estás interesado?» (`APPS`) y las respuestas
  predeterminadas del chat de inicio (`CANNED`).
- Textos que enumeran las apps: `src/pages/index.html` (franja y «apps propias»), `tools/build.py` (título de /apps),
  `worker/src/blog.js` (tarjeta lateral).
- Opcional: una guía en el blog («Cómo elegir software para …») y su enlace «Leer guía».

## 3. Comprobar

1. `diwilo.com/admin` → Negocios → la app: crea un negocio de prueba con tu correo.
2. Abre el link de invitación, crea la contraseña y entra.
3. Cambia un rol y un correo, registra un pago, bloquea/desbloquea la app y usa «Entrar como dueño».
   Elimina el negocio de prueba: queda en «Archivados» y el cron diario de Diwilo lo borra a los 20 días.
4. `curl https://cdNOMBRE.diwilo.com/api/platform/businesses` debe responder 401.
5. Instala la app en el celular desde el navegador («Agregar a pantalla de inicio») y comprueba que abre en `/staff/`.
