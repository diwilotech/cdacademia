# CD Academia

App de Diwilo para academias (maquillaje, barbería, uñas, idiomas, música, cocina…): cursos con clases y calendario,
estudiantes, matrículas con plan de cuotas, cartera y pagos con recibo, asistencia y notas, reposiciones de clases,
material de estudio y profesionales. Dominio `cdacademia.diwilo.com`, Worker `cdacademia`.

> **Reglas:** Fábrica de Apps Diwilo, skill `diwilo-nueva-app` versión **2026-10-14** · **Estado:** Revisión · Reconstruida sobre la plantilla el 2026-10-14

La base común (login con Turnstile, shell con temas, módulos por negocio, bitácora, MCP, PWA, legal, contrato con Diwilo)
es la de la **Plantilla App Diwilo**; las reglas que no se cambian están en su README.

## Módulos

| Módulo | Ver | Qué hace |
|---|---|---|
| Cursos (`cursos`) | todo el equipo | Cursos con horario semanal; las clases se fechan solas saltando los festivos de Colombia. Inscritos con avance, asistencia (presente, tarde, excusa, ausente), notas por evaluación con pesos, clases (tema, contenido, métodos, material; mover fecha solo admin), evaluaciones y cupones. Calendario de la semana. |
| Estudiantes (`estudiantes`) | todo el equipo | Lista y ficha: cursos, asistencia, promedio, estado académico y (solo admin) pagos y saldo. El nombre («alumnas», «aprendices»…) sale del rubro. |
| Matrículas (`matriculas`) | admin | Inscribir con cupón o descuento y plan de cuotas (inicial, número, frecuencia, primera fecha) con vista previa. Cambiar plan (rehace las cuotas y respeta lo pagado), terminada / retirada. No se borra si tiene pagos. |
| Cuotas (`cuotas`) | admin | Cartera (vencidas, hoy, del mes) con recordatorio por WhatsApp; pagos que se reparten solos entre las cuotas, consecutivo de recibos, recibo imprimible (tirilla o carta), anular. |
| Reposiciones (`reposiciones`) | todo el equipo | Fallas por reponer, espacios con cupos, agendar (o virtual), hecha, cobrar (queda como pago con recibo) y exonerar (solo admin). |
| Material (`material`) | todo el equipo | Biblioteca por área y nivel con texto, enlaces, videos de YouTube y archivos en R2 (20 MB). |
| Profesionales (`profesionales`) | todo el equipo | Áreas con niveles y si reponen, disponibilidad semanal. |
| Mi academia (`academia`) | admin | Rubro y términos, escala y mínimos, valor de reposición, datos del recibo y consecutivo; áreas. |
| Marketing y Finanzas | centrales | Del Worker central **Diwilo Modulos** (`modulos.app.json` → `centrales`): Marketing Hub y Finance Hub de Diwilo, versión 1.1.0, con informes del analista y las herramientas de IA de IA Diwilo. La app pone las pantallas y los llama por RPC. |

**IA (MCP):** `estudiantes_buscar`, `estudiantes_ficha`, `estudiantes_crear`, `cuotas_cartera`, `cuotas_registrar_pago`,
`cursos_clases_de_hoy`, `reposiciones_pendientes`, más las de Finanzas y Marketing.

## Estructura propia

```
migrations/0005_reconstruccion_base.sql  borra las tablas de la versión anterior (solo había datos de prueba) y crea la base
migrations/0006_shell_modulos_ia.sql     apariencia, módulos, bitácora, bloqueo por IP, consentimiento, tokens MCP
migrations/0007_academia.sql             tablas ac_* de los módulos propios
migrations/0008_modulos_sync.sql         huella de sincronización de módulos con Diwilo
src/lib/academia.js                      festivos, sesiones, cuotas, asistencia, notas y estado académico
src/api/{academia,cursos,estudiantes,matriculas,cuotas,reposiciones,material,profesionales}.js
src/ia/academia.js                       herramientas de IA de los módulos propios
public/staff/*.html + public/js/pages/   una página por módulo; academia-comun.js tiene las piezas compartidas
tests/app/academia.test.mjs              pruebas de los módulos propios y de la conexión con Diwilo Modulos
```

## Probar

`npm install && npm run db:migrate:local && npm run test` → «Todo bien». Necesita la carpeta hermana `Diwilo Modulos` (la levanta sola).

## Cumplimiento legal

Igual que la plantilla: política Ley 1581 y casillas de autorización y mayoría de edad al aceptar la invitación,
`/dmca`, sin analítica. Los datos de los estudiantes los registra la academia (responsable del tratamiento); Diwilo es encargado.

## Pendientes

- Al desplegar: Diwilo → Módulos → Academia → «Sincronizar» (crea el plan «Completo» y deja cada negocio gestionado).
- Publicar **Diwilo Modulos antes** que Academia (su service binding `MODULOS` debe existir).
- **Despliegue (con confirmación):** migración remota de D1 (borra los datos de prueba de la versión anterior), bucket R2
  `cdacademia-files`, widget y secret de Turnstile, push del repo y comprobar en `diwilo.com/admin`.
- Editor del plan de estudios (temario por módulos) y de exámenes en línea: las columnas existen, falta la pantalla.
- Dirección postal de Diwilo para `/dmca` y los correos de Marketing.
