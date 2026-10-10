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
| Conexión con Diwilo | RPC por service binding (`entrypoint: "Platform"`). No usa `PLATFORM_KEY` |

**Usuarios:** no hay ninguno. Se crean desde Diwilo Web → Negocios → app Academia.

## 3. Registro en Diwilo Web (hecho)
`wrangler.jsonc`: service `ACADEMIA` → `cdacademia` y `ACADEMIA_URL`; `worker/src/platform.js`: entrada `academia`
(roles owner/admin/staff, sin slug). `loginUrl` ya es genérico (`<url>/`).

## 4. Modelo académico (octubre 2026)
- **Áreas** (`DB.areas`): Maquillaje, Cejas y Pestañas, Cabello, Manicure, Pedicure, Estética facial (editables). Cada curso, módulo,
  profesional y espacio de reposición pertenece a un área.
- **Profesionales** (`DB.profesionales`): por área, niveles que dicta (Básico…Profesional) y si **puede reponer**; horario semanal.
  Solo ellos se ofrecen como docente de un curso y como responsables de una reposición de esa área y nivel.
- **Horario del curso**: se llena como lista la primera semana («Clase 1: sábado, Clase 2: martes», con «días de clase por semana»); la fecha de la primera clase marca el inicio
  y el resto de las clases se llenan solas con ese patrón (`grupo.slots`). El botón «Calcular clases» muestra la lista completa de clases (fecha y hora editables una por una; lo cambiado se guarda como ajuste de esa clase) y marca en rojo las que chocan; arma todas las fechas y revisa si chocan con clases futuras de otros cursos de la misma área o del mismo profesor (y con espacios de reposición); al guardar con choques avisa una vez.
- **Módulos** (`DB.modulos`, biblioteca general): se construyen como un documento de bloques (`bloques`: título, subtítulo, texto con **negrita**/*cursiva*, listas, nota destacada,
  archivos con vista previa incrustada —imagen, PDF completo, audio, video—, enlaces y videos de YouTube/Vimeo, separador). `items`, `temas` y `descripcion` se derivan al guardar.
  Un curso los referencia con `curso.modulos = [{ref, desde, hasta}]` (orden = orden del arreglo). El formulario del curso muestra los módulos como tarjetas para agregar y ordenar.
- **Exámenes**: `evaluacion.examen` (preguntas: única, múltiple, V/F, corta, abierta) y `inscripcion.examenes[evalId]` (foto/PDF + respuestas + puntos manuales).
  Calificación automática y «Poner esta nota». Al copiar texto del examen, el portapapeles lleva un aviso de no resolverlo.
- **Códigos de descuento por curso** (`curso.descuentos`): % o valor, vencimiento y límite de usos; se aplican al inscribir.
- Migración automática al abrir (`migrarEsquema`): `plan` → módulos de la biblioteca; docentes escritos a mano → profesionales; `dias/horaIni/horaFin` → franjas.

- **Calendario único** (`admin-calendario.js`): clases y reposiciones se ven siempre igual: columnas lunes–domingo y filas por momento del día
  (mañana, media mañana, tarde, media tarde, noche); cada tarjeta lleva hora, título de la clase, curso, profesor, módulos y estudiantes.
  Se usa en Reposiciones, en Cursos (vista Calendario) y en cada curso (pestaña Clases). Así seguirán todos los calendarios nuevos.

## 5. Datos técnicos
- Etapa 1: todo el estado del negocio es un JSON en `app_state` (con versión, tope ~2 MB).
- Etapa 2 (pendiente): tablas normalizadas con `business_id`.
- Archivos: R2 `cdacademia-files`, hasta 20 MB; solo PDF/imágenes/audio/video se muestran en línea, lo demás se descarga.
- Fotos de marketing: aún en el navegador (IndexedDB).
- Stubs: reposición virtual (Cloudflare Stream) y organizar plan con IA (hoy analizador local).
