// Control total de la academia por IA: cursos, estudiantes, matrículas, cuotas y comprobantes, reposiciones y videos, material,
// profesionales, la academia y el equipo con su nómina. Cada herramienta llama a la MISMA ruta de la API (ver interno.js), así que
// respeta roles, módulos activos, suscripción vencida y bitácora. Las de escritura se marcan para que el asistente pida confirmación.
import { herramienta as H, crudHerramientas as CRUD } from './interno.js';

const id = (d) => ({ type: 'integer', description: d });
const txt = (d) => ({ type: 'string', ...(d ? { description: d } : {}) });
const num = (d) => ({ type: 'number', ...(d ? { description: d } : {}) });
const bool = (d) => ({ type: 'boolean', ...(d ? { description: d } : {}) });
const fecha = (d = 'AAAA-MM-DD') => txt(d);
const lista = (items, d) => ({ type: 'array', items, ...(d ? { description: d } : {}) });
const METODOS = ['Efectivo', 'Transferencia', 'Nequi', 'Daviplata', 'Tarjeta', 'Bre-B', 'Otro'];
const HORARIO = lista({ type: 'object', properties: { dia: { type: 'integer', description: '0 domingo … 6 sábado' }, ini: txt('HH:MM'), fin: txt('HH:MM') }, required: ['dia', 'ini', 'fin'] });
const PLAN = { type: 'object', description: 'Plan de cuotas', properties: { inicial: num('Cuota inicial en pesos'), n: { type: 'integer', description: 'Número de cuotas (1 a 48)' }, frecuencia: { type: 'string', enum: ['mensual', 'quincenal', 'semanal'] }, primera: fecha('Fecha de la primera cuota') }, additionalProperties: false };

export default [
  // ───────────────────────── Cursos ─────────────────────────
  ...CRUD({ modulo: 'cursos', base: 'cursos', entidad: 'cursos', singular: 'curso', plural: 'cursos', escribe: 'admin', required: ['nombre'], filtros: { activo: '1 o 0', area_id: 'Id del área' },
    props: { nombre: txt(), area_id: id('Id del área (academia.listar_areas)'), nivel: txt('Básico, Intermedio…'), precio: num('Pesos'), inicial: num('Cuota inicial sugerida'), descripcion: txt(), activo: bool(), profesional_id: id('Id del profesional'),
      jornada: txt(), inicio: fecha('Fecha de la primera clase'), num_clases: id('0 a 300'), festivos: bool('Saltar festivos de Colombia'), horario: HORARIO, plan: lista({ type: 'object', properties: { titulo: txt(), horas: num(), temas: lista(txt()) } }, 'Módulos del plan de estudio') } }),
  H({ name: 'cursos.ver_detalle', modulo: 'cursos', tipo: 'lectura', description: 'Un curso completo: clases (con fecha, tema y material), evaluaciones, cupones e inscritos con su asistencia y notas.', props: { curso_id: id() }, required: ['curso_id'], ruta: ['GET', '/api/cursos/:curso_id/detalle'] }),
  H({ name: 'cursos.calendario', modulo: 'cursos', tipo: 'lectura', description: 'Clases y espacios de reposición de un rango de fechas.', props: { desde: fecha(), hasta: fecha() }, required: ['desde', 'hasta'], ruta: ['GET', '/api/cursos/calendario'] }),
  H({ name: 'cursos.resumen_hoy', modulo: 'cursos', tipo: 'lectura', description: 'Resumen rápido de las clases de hoy.', ruta: ['GET', '/api/cursos/resumen'] }),
  H({ name: 'cursos.calcular_fechas', modulo: 'cursos', rol: 'admin', tipo: 'lectura', description: 'Calcula (sin guardar) las fechas de las clases según horario, inicio, número de clases y festivos. Úsalo para proponer un curso antes de crearlo.',
    props: { horario: HORARIO, num_clases: id(), inicio: fecha(), festivos: bool() }, required: ['horario', 'num_clases', 'inicio'], ruta: ['POST', '/api/cursos/calcular'] }),
  H({ name: 'cursos.editar_clase', modulo: 'cursos', tipo: 'escritura', description: 'Edita una clase de un curso: tema, detalle, métodos, virtual o material de la biblioteca. Fecha y hora solo las cambia el propietario o un administrador.',
    props: { curso_id: id(), n: id('Número de clase'), tema: txt(), detalle: txt(), materiales: txt('Qué traer'), metodos: lista(txt()), virtual: bool(), material_id: { type: ['integer', 'null'], description: 'Id del material (null lo quita)' }, fecha: fecha(), ini: txt('HH:MM'), fin: txt('HH:MM') },
    required: ['curso_id', 'n'], ruta: ['PATCH', '/api/cursos/:curso_id/clases/:n'] }),
  H({ name: 'cursos.tomar_asistencia', modulo: 'cursos', tipo: 'escritura', description: 'Marca la asistencia de una clase. Estados: P presente, A ausente, T tarde, J justificada, "" borra la marca. Los ids de matrícula salen de cursos_ver_detalle.',
    props: { curso_id: id(), clase_n: id(), marcas: lista({ type: 'object', properties: { inscripcion_id: id(), estado: { type: 'string', enum: ['P', 'A', 'T', 'J', ''] } }, required: ['inscripcion_id', 'estado'] }) },
    required: ['curso_id', 'clase_n', 'marcas'], ruta: ['POST', '/api/cursos/:curso_id/asistencia'] }),
  H({ name: 'cursos.poner_notas', modulo: 'cursos', tipo: 'escritura', description: 'Registra las notas de una evaluación (null borra la nota).',
    props: { curso_id: id(), evaluacion_id: id(), notas: lista({ type: 'object', properties: { inscripcion_id: id(), nota: { type: ['number', 'null'] } }, required: ['inscripcion_id', 'nota'] }) },
    required: ['curso_id', 'evaluacion_id', 'notas'], ruta: ['POST', '/api/cursos/:curso_id/notas'] }),
  H({ name: 'cursos.ver_examenes', modulo: 'cursos', tipo: 'lectura', description: 'Exámenes de un curso con el estado de cada estudiante.', props: { curso_id: id() }, required: ['curso_id'], ruta: ['GET', '/api/cursos/:curso_id/examenes'] }),
  H({ name: 'cursos.ver_examen', modulo: 'cursos', tipo: 'lectura', description: 'El examen de un estudiante: respuestas, archivos y calificación.', props: { curso_id: id(), evaluacion_id: id(), inscripcion_id: id() }, required: ['curso_id', 'evaluacion_id', 'inscripcion_id'],
    ruta: ['GET', '/api/cursos/:curso_id/examenes/:evaluacion_id/:inscripcion_id'] }),
  H({ name: 'cursos.aplicar_nota_examen', modulo: 'cursos', tipo: 'escritura', description: 'Pone la nota sugerida del examen de un estudiante en Notas.', props: { curso_id: id(), evaluacion_id: id(), inscripcion_id: id() }, required: ['curso_id', 'evaluacion_id', 'inscripcion_id'],
    ruta: ['POST', '/api/cursos/:curso_id/examenes/:evaluacion_id/:inscripcion_id/aplicar'] }),
  ...CRUD({ modulo: 'cursos', base: 'cursos', entidad: 'evaluaciones', singular: 'evaluacion', plural: 'evaluaciones', escribe: 'admin', required: ['curso_id', 'nombre'], filtros: { curso_id: 'Id del curso' },
    props: { curso_id: id(), nombre: txt(), peso: id('Porcentaje 0 a 100'), clase_n: id('Clase en que se presenta'), tipo: { type: 'string', enum: ['examen', 'multiple'] }, examen: { type: 'object', description: 'Definición del examen (preguntas)' }, materiales: lista(id(), 'Ids de materiales de la biblioteca') } }),
  ...CRUD({ modulo: 'cursos', base: 'cursos', entidad: 'cupones', singular: 'cupon', plural: 'cupones', escribe: 'admin', required: ['curso_id', 'codigo'], filtros: { curso_id: 'Id del curso' },
    props: { curso_id: id(), codigo: txt(), tipo: { type: 'string', enum: ['valor', 'pct'], description: 'valor = pesos, pct = porcentaje' }, valor: num(), hasta: fecha('Vigente hasta'), max: id('Usos máximos') } }),

  // ───────────────────────── Estudiantes ─────────────────────────
  ...CRUD({ modulo: 'estudiantes', base: 'estudiantes', entidad: 'estudiantes', singular: 'estudiante', plural: 'estudiantes', sin: ['crear'], filtros: { activo: '1 o 0' },
    props: { nombre: txt(), documento: txt(), telefono: txt(), email: txt(), origen: txt(), notas: txt(), activo: bool() } }),
  H({ name: 'estudiantes.resumen', modulo: 'estudiantes', tipo: 'lectura', description: 'Totales de estudiantes de la academia.', ruta: ['GET', '/api/estudiantes/resumen'] }),
  H({ name: 'estudiantes.ver_acceso', modulo: 'estudiantes', tipo: 'lectura', description: 'Si el estudiante ya tiene acceso a la app (sin_acceso, invitado o activo).', props: { estudiante_id: id() }, required: ['estudiante_id'], ruta: ['GET', '/api/estudiantes/:estudiante_id/acceso'] }),
  H({ name: 'estudiantes.dar_acceso', modulo: 'estudiantes', rol: 'admin', tipo: 'escritura', description: 'Da acceso a la app al estudiante (o reenvía el enlace). Devuelve el enlace para que cree su contraseña.', props: { estudiante_id: id(), email: txt('Si la ficha no lo tiene') }, required: ['estudiante_id'], ruta: ['POST', '/api/estudiantes/:estudiante_id/acceso'] }),
  H({ name: 'estudiantes.quitar_acceso', modulo: 'estudiantes', rol: 'admin', tipo: 'escritura', description: 'Quita el acceso del estudiante a la app.', props: { estudiante_id: id() }, required: ['estudiante_id'], ruta: ['DELETE', '/api/estudiantes/:estudiante_id/acceso'] }),

  // ───────────────────────── Matrículas ─────────────────────────
  H({ name: 'matriculas.listar_matriculas', modulo: 'matriculas', rol: 'admin', tipo: 'lectura', description: 'Matrículas con total, pagado, saldo y si están vencidas. Filtra por curso, estudiante, estado o texto.',
    props: { curso_id: id(), estudiante_id: id(), estado: txt(), q: txt('Nombre del estudiante, curso o documento') }, ruta: ['GET', '/api/matriculas'] }),
  H({ name: 'matriculas.matricular', modulo: 'matriculas', rol: 'admin', tipo: 'escritura', description: 'Matricula a un estudiante en un curso con su plan de cuotas, cupón o descuento. Genera las cuotas y la cuenta de cobro.',
    props: { estudiante_id: id(), curso_id: id(), fecha: fecha('Por defecto hoy'), cupon: txt('Código del cupón del curso'), descuento: num('Descuento a mano en pesos'), plan: PLAN }, required: ['estudiante_id', 'curso_id'], ruta: ['POST', '/api/matriculas'] }),
  H({ name: 'matriculas.editar_matricula', modulo: 'matriculas', rol: 'admin', tipo: 'escritura', description: 'Cambia el estado, el descuento o el plan de una matrícula (cambiar el plan rehace las cuotas; lo pagado se respeta).',
    props: { matricula_id: id(), estado: txt('Por ejemplo retirada'), descuento: num(), plan: PLAN }, required: ['matricula_id'], ruta: ['PATCH', '/api/matriculas/:matricula_id'] }),
  H({ name: 'matriculas.borrar_matricula', modulo: 'matriculas', rol: 'admin', tipo: 'escritura', description: 'Borra una matrícula. Solo si no tiene pagos; si los tiene, usa editar_matricula con estado retirada.', props: { matricula_id: id() }, required: ['matricula_id'], ruta: ['DELETE', '/api/matriculas/:matricula_id'] }),
  H({ name: 'matriculas.ver_cuotas', modulo: 'matriculas', rol: 'admin', tipo: 'lectura', description: 'Estado de cada cuota de una matrícula.', props: { matricula_id: id() }, required: ['matricula_id'], ruta: ['GET', '/api/matriculas/:matricula_id/cuotas'] }),
  H({ name: 'matriculas.ver_pagos', modulo: 'matriculas', rol: 'admin', tipo: 'lectura', description: 'Pagos de una matrícula con su recibo en Finanzas y cuántos faltan por enviar.', props: { matricula_id: id() }, required: ['matricula_id'], ruta: ['GET', '/api/matriculas/:matricula_id/pagos'] }),

  // ───────────────────────── Cuotas, pagos y comprobantes ─────────────────────────
  H({ name: 'cuotas.listar_pagos', modulo: 'cuotas', rol: 'admin', tipo: 'lectura', description: 'Pagos registrados, por rango de fechas o texto.', props: { desde: fecha(), hasta: fecha(), q: txt() }, ruta: ['GET', '/api/cuotas/pagos'] }),
  H({ name: 'cuotas.anular_pago', modulo: 'cuotas', rol: 'admin', tipo: 'escritura', description: 'Anula un pago (en Finanzas queda un egreso de anulación). Solo propietario o administrador.', props: { pago_id: id() }, required: ['pago_id'], ruta: ['POST', '/api/cuotas/pagos/:pago_id/anular'] }),
  H({ name: 'cuotas.resumen', modulo: 'cuotas', rol: 'admin', tipo: 'lectura', description: 'Vencido y por cobrar este mes.', ruta: ['GET', '/api/cuotas/resumen'] }),
  H({ name: 'cuotas.enviar_pagos_a_finanzas', modulo: 'cuotas', rol: 'admin', tipo: 'escritura', description: 'Envía a Finanzas los pagos que aún no tienen recibo allá (no duplica).', ruta: ['POST', '/api/cuotas/sync-finanzas'] }),
  H({ name: 'cuotas.listar_comprobantes', modulo: 'cuotas', rol: 'admin', tipo: 'lectura', description: 'Comprobantes de pago que subieron los estudiantes.', props: { estado: { type: 'string', enum: ['revision', 'aprobado', 'rechazado'], description: 'Por defecto todos' } }, ruta: ['GET', '/api/cuotas/comprobantes'] }),
  H({ name: 'cuotas.aprobar_comprobante', modulo: 'cuotas', rol: 'admin', tipo: 'escritura', description: 'Aprueba un comprobante: registra el pago y genera el recibo. Puedes corregir valor, método o fecha.', props: { comprobante_id: id(), valor: num(), metodo: { type: 'string', enum: METODOS }, fecha: fecha() }, required: ['comprobante_id'], ruta: ['POST', '/api/cuotas/comprobantes/:comprobante_id/aprobar'] }),
  H({ name: 'cuotas.rechazar_comprobante', modulo: 'cuotas', rol: 'admin', tipo: 'escritura', description: 'Rechaza un comprobante con un motivo que verá el estudiante.', props: { comprobante_id: id(), motivo: txt() }, required: ['comprobante_id', 'motivo'], ruta: ['POST', '/api/cuotas/comprobantes/:comprobante_id/rechazar'] }),

  // ───────────────────────── Reposiciones y videos ─────────────────────────
  H({ name: 'reposiciones.listar_reposiciones', modulo: 'reposiciones', tipo: 'lectura', description: 'Fallas con su reposición. Filtra por estado.', props: { estado: { type: 'string', enum: ['pendiente', 'agendada', 'hecha', 'todas'] } }, ruta: ['GET', '/api/reposiciones'] }),
  H({ name: 'reposiciones.agendar', modulo: 'reposiciones', tipo: 'escritura', description: 'Agenda (o reagenda) la reposición de una clase a la que faltó el estudiante, en un espacio disponible.', props: { inscripcion_id: id(), clase_n: id(), espacio_id: id('Id de espacio (reposiciones_listar_espacios)'), modo: { type: 'string', enum: ['presencial', 'virtual'] } }, required: ['inscripcion_id', 'clase_n'], ruta: ['POST', '/api/reposiciones'] }),
  H({ name: 'reposiciones.cambiar_estado', modulo: 'reposiciones', tipo: 'escritura', description: 'Marca una reposición como pendiente, agendada o hecha, o la exonera del cobro (exonerar solo propietario/administrador).', props: { reposicion_id: id(), estado: { type: 'string', enum: ['pendiente', 'agendada', 'hecha'] }, exonerada: bool() }, required: ['reposicion_id'], ruta: ['PATCH', '/api/reposiciones/:reposicion_id'] }),
  H({ name: 'reposiciones.cobrar', modulo: 'reposiciones', rol: 'admin', tipo: 'escritura', description: 'Cobra una reposición (queda como pago tipo reposición con el valor configurado, o el que indiques).', props: { reposicion_id: id(), metodo: { type: 'string', enum: METODOS }, valor: num() }, required: ['reposicion_id', 'metodo'], ruta: ['POST', '/api/reposiciones/:reposicion_id/cobrar'] }),
  H({ name: 'reposiciones.resumen', modulo: 'reposiciones', tipo: 'lectura', description: 'Resumen de reposiciones.', ruta: ['GET', '/api/reposiciones/resumen'] }),
  ...CRUD({ modulo: 'reposiciones', base: 'reposiciones', entidad: 'espacios', singular: 'espacio', plural: 'espacios', escribe: 'admin', required: ['fecha', 'ini', 'fin'], filtros: { curso_id: 'Id del curso' },
    props: { fecha: fecha(), ini: txt('HH:MM'), fin: txt('HH:MM'), profesional_id: id(), area_id: id(), curso_id: id(), clase_n: id(), cupos: id(), notas: txt() } }),
  H({ name: 'reposiciones.listar_videos', modulo: 'reposiciones', tipo: 'lectura', description: 'Clases grabadas listas, con cuántos enlaces y vistas tienen. (Subir un video nuevo se hace desde la app.)', props: { curso_id: id(), clase_n: id() }, ruta: ['GET', '/api/videos'] }),
  H({ name: 'reposiciones.borrar_video', modulo: 'reposiciones', rol: 'admin', tipo: 'escritura', description: 'Borra un video, sus enlaces y el archivo.', props: { video_id: id() }, required: ['video_id'], ruta: ['DELETE', '/api/videos/:video_id'] }),
  H({ name: 'reposiciones.crear_enlace_video', modulo: 'reposiciones', tipo: 'escritura', description: 'Crea el enlace personal para que el estudiante vea la clase grabada que se perdió (el video debe ser de esa clase).', props: { reposicion_id: id(), video_id: id(), dias: id('Vigencia 1 a 60, por defecto 7') }, required: ['reposicion_id', 'video_id'], ruta: ['POST', '/api/reposiciones/:reposicion_id/video-link'] }),
  H({ name: 'reposiciones.ver_enlaces_video', modulo: 'reposiciones', tipo: 'lectura', description: 'Enlaces de video de una reposición y lo que ha visto el estudiante.', props: { reposicion_id: id() }, required: ['reposicion_id'], ruta: ['GET', '/api/reposiciones/:reposicion_id/video-links'] }),
  H({ name: 'reposiciones.revocar_enlace_video', modulo: 'reposiciones', tipo: 'escritura', description: 'Revoca un enlace de video.', props: { acceso_id: id() }, required: ['acceso_id'], ruta: ['DELETE', '/api/video-accesos/:acceso_id'] }),

  // ───────────────────────── Material ─────────────────────────
  ...CRUD({ modulo: 'material', base: 'material', entidad: 'material', singular: 'material', plural: 'materiales', filtros: { area_id: 'Id del área' }, required: ['titulo'],
    props: { titulo: txt(), area_id: id(), nivel: txt(), descripcion: txt(), bloques: lista({ type: 'object', description: 'Bloque del documento: tipo (texto, separador, enlace, video, archivo), titulo, texto, url (https). Los archivos se suben desde la app.' }) } }),
  H({ name: 'material.cargar_ejemplos', modulo: 'material', rol: 'admin', tipo: 'escritura', description: 'Carga los materiales y exámenes de ejemplo de la academia (una sola vez).', ruta: ['POST', '/api/material/ejemplos'] }),

  // ───────────────────────── Profesionales ─────────────────────────
  ...CRUD({ modulo: 'profesionales', base: 'profesionales', entidad: 'profesionales', singular: 'profesional', plural: 'profesionales', escribe: 'admin', required: ['nombre'], filtros: { activo: '1 o 0' },
    props: { nombre: txt(), telefono: txt(), email: txt(), activo: bool(), notas: txt(), areas: lista({ type: 'object', properties: { area_id: id(), niveles: lista(txt()), reponer: bool() }, required: ['area_id'] }), horario: HORARIO } }),

  // ───────────────────────── Academia ─────────────────────────
  H({ name: 'academia.ver_configuracion', modulo: 'academia', rol: 'admin', tipo: 'lectura', description: 'Datos de la academia: rubro y términos, escala y nota mínima, asistencia mínima, valores de reposición, datos del recibo y consecutivo.', ruta: ['GET', '/api/academia/config'] }),
  H({ name: 'academia.editar_configuracion', modulo: 'academia', rol: 'admin', tipo: 'escritura', description: 'Cambia la configuración de la academia (solo los campos que envíes).',
    props: { rubro: txt(), termS: txt('Cómo llamas a un estudiante (singular)'), termP: txt('Plural'), escala: num('5 a 10'), notaMin: num(), asisMin: num('Porcentaje'), valorRepo: num(), valorRepoVirtual: num(), horasVirtual: num(), consecutivo: num('Próximo recibo'), recibo: { type: 'string', enum: ['ticket', 'carta'] }, pie: txt(), nit: txt(), tel: txt(), dir: txt(), ig: txt(), web: txt(), cuentaCobro: bool('Emitir cuenta de cobro al matricular') },
    ruta: ['PUT', '/api/academia/config'] }),
  H({ name: 'academia.metricas', modulo: 'academia', tipo: 'lectura', description: 'Indicadores de inicio de la academia (según módulos activos y rol).', ruta: ['GET', '/api/academia/metricas'] }),
  ...CRUD({ modulo: 'academia', base: 'academia', entidad: 'areas', singular: 'area', plural: 'areas', escribe: 'admin', required: ['nombre'], props: { nombre: txt(), color: txt() } }),
  H({ name: 'academia.ver_bitacora', modulo: 'academia', rol: 'admin', tipo: 'lectura', description: 'Últimas 200 acciones del negocio: quién hizo qué, cuándo y desde dónde (app, mcp o diwilo).', ruta: ['GET', '/api/settings/bitacora'] }),

  // ───────────────────────── Equipo y nómina ─────────────────────────
  H({ name: 'equipo.listar_equipo', modulo: 'academia', rol: 'admin', tipo: 'lectura', description: 'Personas del equipo con su rol, estado (activo o invitado) y módulos permitidos.', ruta: ['GET', '/api/team'] }),
  H({ name: 'equipo.invitar_persona', modulo: 'academia', rol: 'admin', tipo: 'escritura', description: 'Agrega una persona al equipo y devuelve su enlace de invitación.', props: { email: txt(), name: txt(), role: { type: 'string', enum: ['admin', 'staff'] }, modulos: lista(txt(), 'Solo para staff: ids de módulos permitidos') }, required: ['email'], ruta: ['POST', '/api/team'] }),
  H({ name: 'equipo.cambiar_permisos', modulo: 'academia', rol: 'admin', tipo: 'escritura', description: 'Cambia el rol o los módulos permitidos de una persona del equipo.', props: { user_id: txt(), role: { type: 'string', enum: ['admin', 'staff'] }, modulos: lista(txt()) }, required: ['user_id'], ruta: ['PATCH', '/api/team/:user_id'] }),
  H({ name: 'equipo.reenviar_invitacion', modulo: 'academia', rol: 'admin', tipo: 'escritura', description: 'Genera un nuevo enlace de invitación para una persona del equipo.', props: { user_id: txt() }, required: ['user_id'], ruta: ['POST', '/api/team/:user_id/invite'] }),
  H({ name: 'equipo.quitar_persona', modulo: 'academia', rol: 'admin', tipo: 'escritura', description: 'Quita a una persona del equipo y cierra sus sesiones.', props: { user_id: txt() }, required: ['user_id'], ruta: ['DELETE', '/api/team/:user_id'] }),
  H({ name: 'equipo.editar_datos_persona', modulo: 'academia', rol: 'admin', tipo: 'escritura', description: 'Datos de una persona del equipo o profesional: nombre, tipo y número de documento y celular. persona = u:<usuario> o p:<profesional>.',
    props: { persona: txt('u:<id de usuario> o p:<id de profesional>'), nombre: txt(), tipo_documento: { type: 'string', enum: ['CC', 'NIT', 'CE', 'PA'] }, documento: txt(), celular: txt() }, required: ['persona'], ruta: ['PUT', '/api/team/persona/:persona'] }),
  H({ name: 'equipo.ver_nomina', modulo: 'academia', rol: 'admin', tipo: 'lectura', description: 'Plan de nómina de cada persona (valor, periodicidad, centro de costo).', ruta: ['GET', '/api/team/nomina'] }),
  H({ name: 'equipo.personas_nomina', modulo: 'academia', rol: 'admin', tipo: 'lectura', description: 'Personas a las que se les puede asignar nómina, con su pago actual.', ruta: ['GET', '/api/team/nomina/personas'] }),
  H({ name: 'equipo.nomina_aproximada', modulo: 'academia', rol: 'admin', tipo: 'lectura', description: 'Lo que se aproxima a pagar en un mes a cada persona: lo fijo más las clases que dicta.', props: { month: txt('AAAA-MM') }, ruta: ['GET', '/api/team/nomina/aproximado'] }),
  H({ name: 'equipo.clases_del_profesional', modulo: 'academia', rol: 'admin', tipo: 'lectura', description: 'Clases que dicta un profesional en un mes (para armar su pago).', props: { profesional: id(), month: txt('AAAA-MM') }, required: ['profesional', 'month'], ruta: ['GET', '/api/team/nomina/clases'] }),
  H({ name: 'equipo.guardar_nomina', modulo: 'academia', rol: 'admin', tipo: 'escritura', description: 'Guarda el plan de nómina de una persona y lo deja como gasto recurrente en Finanzas (no se cobra solo; el pago se hace en Finanzas).',
    props: { persona: txt('u:<id de usuario> o p:<id de profesional>'), valor: num('Pesos'), periodicidad: txt('mensual, quincenal o semanal'), centro_costo: txt(), notas: txt(), documento: txt() }, required: ['persona', 'valor'], ruta: ['PUT', '/api/team/nomina/:persona'] }),
  H({ name: 'equipo.quitar_nomina', modulo: 'academia', rol: 'admin', tipo: 'escritura', description: 'Elimina el plan de nómina de una persona.', props: { persona: txt('u:<id> o p:<id>') }, required: ['persona'], ruta: ['DELETE', '/api/team/nomina/:persona'] }),
];
