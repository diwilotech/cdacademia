// Pruebas de los módulos propios de CD Academia: cursos con clases y festivos, matrícula con cupón y cuotas,
// pagos con recibo, asistencia y reposiciones, permisos por rol, aislamiento entre negocios y módulo inactivo.
export default async function ({ check, diwilo, newBusiness, newMember, mcp }) {
  const A = await newBusiness('Academia A', { login: true });
  const B = await newBusiness('Academia B', { login: true });
  const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);

  check('Academia: guarda los datos (escala, reposición, consecutivo)', (await A.app('/api/academia/config', { method: 'PUT', body: { rubro: 'maquillaje', valorRepo: 30000, consecutivo: 100, nit: '900.123.456-7' } })).data.consecutivo === 100);
  const area = await A.app('/api/academia/areas', { method: 'POST', body: { nombre: 'Maquillaje social' } });
  const prof = await A.app('/api/profesionales/profesionales', { method: 'POST', body: { nombre: 'Laura Docente', areas: [{ area_id: area.data.id, niveles: ['Básico'], reponer: true }], horario: [{ dia: 1, ini: '08:00', fin: '12:00' }] } });
  check('Academia: crea área y profesional', area.status === 201 && prof.status === 201, JSON.stringify(prof.data));
  check('Academia: profesional con área de otro negocio se rechaza', (await B.app('/api/profesionales/profesionales', { method: 'POST', body: { nombre: 'X', areas: [{ area_id: area.data.id }] } })).status === 400);

  // Curso que empieza el lunes 2026-08-03 (lunes y miércoles); el 17 de agosto es festivo (Asunción, trasladado)
  const k = await A.app('/api/cursos/cursos', { method: 'POST', body: { nombre: 'Automaquillaje', area_id: area.data.id, profesional_id: prof.data.id, nivel: 'Básico', precio: 1000000,
    inicio: '2026-08-03', num_clases: 8, festivos: true, horario: [{ dia: 1, ini: '18:00', fin: '20:00' }, { dia: 3, ini: '18:00', fin: '20:00' }] } });
  check('Cursos: crea el curso', k.status === 201, JSON.stringify(k.data));
  let det = (await A.app(`/api/cursos/${k.data.id}/detalle`)).data;
  check('Cursos: genera 8 clases saltando el festivo del 17 de agosto', det.clases?.length === 8 && !det.clases.some((x) => x.fecha === '2026-08-17') && det.clases[0].fecha === '2026-08-03', JSON.stringify(det.clases?.map((x) => x.fecha)));
  check('Cursos: horario inválido se rechaza', (await A.app('/api/cursos/cursos', { method: 'POST', body: { nombre: 'Malo', horario: [{ dia: 9, ini: '25:00', fin: '1' }] } })).status === 400);
  const ev = await A.app('/api/cursos/evaluaciones', { method: 'POST', body: { curso_id: k.data.id, nombre: 'Final', peso: 100 } });
  check('Cursos: crea una evaluación', ev.status === 201);
  // Materiales de ejemplo y examen ligado a materiales (solo los del propio negocio)
  const ej = await A.app('/api/material/ejemplos', { method: 'POST' }), ej2 = await A.app('/api/material/ejemplos', { method: 'POST' });
  check('Material: carga los ejemplos una sola vez', ej.status === 201 && ej.data.creados > 0 && ej2.data.creados === 0, JSON.stringify(ej.data));
  const mats = (await A.app('/api/material/material?limit=50')).data.rows, matsB = await B.app('/api/material/material?limit=50');
  check('Material: los ejemplos de A no aparecen en B', matsB.data.rows.length === 0 && mats.length === ej.data.creados);
  await B.app('/api/material/ejemplos', { method: 'POST' });
  const ajeno = (await B.app('/api/material/material?limit=50')).data.rows[0].id;
  await A.app(`/api/cursos/evaluaciones/${ev.data.id}`, { method: 'PATCH', body: { tipo: 'multiple', materiales: [mats[0].id, mats[1].id, ajeno, mats[0].id] } });
  const evs = (await A.app(`/api/cursos/${k.data.id}/detalle`)).data.evaluaciones.find((x) => x.id === ev.data.id);
  const pc = await A.app(`/api/cursos/${k.data.id}/clases/1`, { method: 'PATCH', body: { material_id: mats[0].id } });
  const cl1 = (await A.app(`/api/cursos/${k.data.id}/detalle`)).data.clases[0];
  check('Clases: el tema y el concepto los da el material', pc.status === 200 && cl1.tema === mats[0].titulo && cl1.detalle === (mats[0].descripcion || ''), JSON.stringify([pc.status, cl1.tema]));
  await A.app(`/api/material/material/${mats[0].id}`, { method: 'PATCH', body: { titulo: 'Título nuevo' } });
  check('Clases: si cambia el título del material, la clase lo sigue', (await A.app(`/api/cursos/${k.data.id}/detalle`)).data.clases[0].tema === 'Título nuevo');
  check('Exámenes: se ligan a materiales propios (sin repetidos ni ajenos)', evs.materiales.length === 2 && evs.materiales.includes(mats[0].id) && !evs.materiales.includes(ajeno), JSON.stringify(evs.materiales));
  const cup = await A.app('/api/cursos/cupones', { method: 'POST', body: { curso_id: k.data.id, codigo: 'AMIGA10', tipo: 'pct', valor: 10, max: 1 } });
  check('Cursos: crea un cupón', cup.status === 201, JSON.stringify(cup.data));

  // Estudiantes y matrícula
  const e1 = await A.app('/api/estudiantes/estudiantes', { method: 'POST', body: { nombre: 'Ana Pérez', documento: '1001', telefono: '3001234567' } });
  const e2 = await A.app('/api/estudiantes/estudiantes', { method: 'POST', body: { nombre: 'Bea Gómez', documento: '1002' } });
  check('Estudiantes: crea dos', e1.status === 201 && e2.status === 201);
  check('Estudiantes: documento repetido da 409', (await A.app('/api/estudiantes/estudiantes', { method: 'POST', body: { nombre: 'Otra', documento: '1001' } })).status === 409);
  const m1 = await A.app('/api/matriculas', { method: 'POST', body: { estudiante_id: e1.data.id, curso_id: k.data.id, cupon: 'amiga10', fecha: hoy, plan: { inicial: 200000, n: 3, frecuencia: 'mensual', primera: hoy } } });
  check('Matrículas: matricula con cupón del 10% (total 900.000)', m1.status === 201 && m1.data.total === 900000, JSON.stringify(m1.data));
  check('Matrículas: inicial + 3 cuotas que suman el total', m1.data.cuotas?.length === 4 && m1.data.cuotas.reduce((s, q) => s + q.valor, 0) === 900000, JSON.stringify(m1.data.cuotas));
  check('Matrículas: el cupón ya no tiene usos', (await A.app('/api/matriculas', { method: 'POST', body: { estudiante_id: e2.data.id, curso_id: k.data.id, cupon: 'AMIGA10' } })).status === 400);
  const m2 = await A.app('/api/matriculas', { method: 'POST', body: { estudiante_id: e2.data.id, curso_id: k.data.id, plan: { n: 1 } } });
  check('Matrículas: matrícula sin cupón al precio del curso', m2.status === 201 && m2.data.total === 1000000);
  check('Matrículas: no se matricula dos veces al mismo curso', (await A.app('/api/matriculas', { method: 'POST', body: { estudiante_id: e1.data.id, curso_id: k.data.id } })).status === 409);
  check('Cursos: no se borra un curso con matrículas', (await A.app(`/api/cursos/cursos/${k.data.id}`, { method: 'DELETE' })).status === 409);

  // Pagos y recibo
  const p1 = await A.app('/api/cuotas/pagos', { method: 'POST', body: { inscripcion_id: m1.data.id, valor: 300000, metodo: 'Nequi' } });
  check('Cuotas: registra un pago con consecutivo desde 100', p1.status === 201 && p1.data.num === 100, JSON.stringify(p1.data));
  const cu = (await A.app(`/api/matriculas/${m1.data.id}/cuotas`)).data;
  check('Cuotas: el pago cubre la inicial y abona a la cuota 1', cu.cuotas?.[0].estado === 'pagada' && cu.cuotas[1].abonado === 100000, JSON.stringify(cu.cuotas));
  check('Cuotas: un pago mayor al saldo se rechaza', (await A.app('/api/cuotas/pagos', { method: 'POST', body: { inscripcion_id: m1.data.id, valor: 700000 } })).status === 400);
  const rec = await A.app(`/api/cuotas/pagos/${p1.data.id}/recibo`);
  check('Cuotas: recibo imprimible con número, NIT y saldo', rec.status === 200 && rec.data.text?.includes('N.º 100') && rec.data.text.includes('900.123.456-7') && rec.data.text.includes('600.000'));
  const car = (await A.app('/api/cuotas/cartera?estado=todas')).data;
  check('Cuotas: cartera con totales', car.rows?.length === 5 && car.totales.pendiente === 1600000, JSON.stringify(car.totales));
  check('Matrículas: no se borra una matrícula con pagos', (await A.app(`/api/matriculas/${m1.data.id}`, { method: 'DELETE' })).status === 409);

  // Asistencia, notas y reposiciones
  const marcas = [{ inscripcion_id: m1.data.id, estado: 'P' }, { inscripcion_id: m2.data.id, estado: 'A' }];
  check('Cursos: toma asistencia de la clase 1', (await A.app(`/api/cursos/${k.data.id}/asistencia`, { method: 'POST', body: { clase_n: 1, marcas } })).status === 200);
  check('Cursos: nota fuera de escala se rechaza', (await A.app(`/api/cursos/${k.data.id}/notas`, { method: 'POST', body: { evaluacion_id: ev.data.id, notas: [{ inscripcion_id: m1.data.id, nota: 7 }] } })).status === 400);
  check('Cursos: pone una nota', (await A.app(`/api/cursos/${k.data.id}/notas`, { method: 'POST', body: { evaluacion_id: ev.data.id, notas: [{ inscripcion_id: m1.data.id, nota: 4.5 }] } })).status === 200);
  det = (await A.app(`/api/cursos/${k.data.id}/detalle`)).data;
  const ana = det.inscritos?.find((i) => i.id === m1.data.id);
  check('Cursos: Ana aprobó (100% evaluado, nota 4.5)', ana?.academico?.[1] === 'Aprobó', JSON.stringify(ana?.academico));
  let rp = (await A.app('/api/reposiciones')).data;
  check('Reposiciones: la falla de Bea aparece pendiente', rp.rows?.length === 1 && rp.rows[0].estado === 'pendiente' && rp.rows[0].clase_n === 1, JSON.stringify(rp));
  const esp = await A.app('/api/reposiciones/espacios', { method: 'POST', body: { fecha: '2026-08-08', ini: '09:00', fin: '11:00', profesional_id: prof.data.id, cupos: 1 } });
  check('Reposiciones: crea un espacio', esp.status === 201, JSON.stringify(esp.data));
  const ag = await A.app('/api/reposiciones', { method: 'POST', body: { inscripcion_id: m2.data.id, clase_n: 1, espacio_id: esp.data.id } });
  check('Reposiciones: agenda en el espacio', ag.status === 201 && ag.data.estado === 'agendada');
  check('Reposiciones: no agenda una clase sin falla', (await A.app('/api/reposiciones', { method: 'POST', body: { inscripcion_id: m1.data.id, clase_n: 1, espacio_id: esp.data.id } })).status === 400);
  const cob = await A.app(`/api/reposiciones/${ag.data.id}/cobrar`, { method: 'POST', body: { metodo: 'Efectivo' } });
  check('Reposiciones: cobra con el valor configurado (recibo 101)', cob.status === 201 && cob.data.num === 101, JSON.stringify(cob.data));
  check('Reposiciones: no se cobra dos veces', (await A.app(`/api/reposiciones/${ag.data.id}/cobrar`, { method: 'POST', body: {} })).status === 409);
  check('Reposiciones: el cobro no toca el saldo de cuotas', (await A.app(`/api/matriculas/${m2.data.id}/cuotas`)).data.pagado === 0);
  await A.app(`/api/reposiciones/${ag.data.id}`, { method: 'PATCH', body: { estado: 'hecha' } });
  rp = (await A.app('/api/reposiciones')).data;
  check('Reposiciones: hecha sale de pendientes', rp.rows.length === 0 && rp.totales.hecha === 1);

  // Roles: el personal toma asistencia pero no ve dinero ni configura
  const S = await newMember(A.id, 'staff');
  check('Personal: ve los cursos', (await S.app('/api/cursos/cursos')).status === 200);
  check('Personal: toma asistencia', (await S.app(`/api/cursos/${k.data.id}/asistencia`, { method: 'POST', body: { clase_n: 2, marcas } })).status === 200);
  check('Personal: no ve cuotas (403)', (await S.app('/api/cuotas/cartera')).status === 403);
  check('Personal: no ve matrículas (403)', (await S.app('/api/matriculas')).status === 403);
  check('Personal: no crea cursos (403)', (await S.app('/api/cursos/cursos', { method: 'POST', body: { nombre: 'X' } })).status === 403);
  check('Personal: no mueve una clase (403)', (await S.app(`/api/cursos/${k.data.id}/clases/3`, { method: 'PATCH', body: { fecha: '2026-09-01' } })).status === 403);
  check('Personal: sí edita el tema de una clase', (await S.app(`/api/cursos/${k.data.id}/clases/3`, { method: 'PATCH', body: { tema: 'Piel y preparación' } })).status === 200);
  check('Personal: no exonera reposiciones (403)', (await S.app(`/api/reposiciones/${ag.data.id}`, { method: 'PATCH', body: { exonerada: true } })).status === 403);

  // Material como documento y reposiciones por curso
  const mat = await A.app('/api/material/material', { method: 'POST', body: { titulo: 'Piel y preparación', area_id: area.data.id, bloques: [
    { tipo: 'titulo', texto: 'Tipos de piel' }, { tipo: 'texto', texto: 'La **piel** se prepara *antes*.' }, { tipo: 'lista', texto: 'Limpiar\nHidratar' }, { tipo: 'destacado', texto: 'Siempre protector' }, { tipo: 'separador' },
    { tipo: 'enlace', nombre: 'Video', url: 'https://youtu.be/dQw4w9WgXcQ' }] } });
  check('Material: guarda un documento con formato', mat.status === 201, JSON.stringify(mat.data));
  const matLeido = (await A.app('/api/material/material')).data.rows.find((x) => x.id === mat.data.id) || {};
  check('Material: conserva los tipos de bloque', ['titulo', 'texto', 'lista', 'destacado', 'separador', 'enlace'].every((t, i) => matLeido.bloques?.[i]?.tipo === t), JSON.stringify(matLeido.bloques));
  check('Material: un enlace sin https se rechaza', (await A.app('/api/material/material', { method: 'POST', body: { titulo: 'X', bloques: [{ tipo: 'enlace', url: 'http://x.com' }] } })).status === 400);
  check('Material: un archivo de otro negocio se rechaza', (await A.app('/api/material/material', { method: 'POST', body: { titulo: 'X', bloques: [{ tipo: 'archivo', key: 'otro/material/x.png' }] } })).status === 400);
  await A.app(`/api/cursos/${k.data.id}/clases/2`, { method: 'PATCH', body: { material_id: mat.data.id } });
  const matLista = (await A.app('/api/material/material')).data.rows.find((x) => x.id === mat.data.id);
  check('Material: la lista dice en qué cursos se usa', matLista?.cursos?.length === 1 && matLista.cursos[0].id === k.data.id, JSON.stringify(matLista?.cursos));
  const rpCurso = (await A.app(`/api/reposiciones?estado=todas&curso_id=${k.data.id}`)).data, rpOtro = (await A.app('/api/reposiciones?estado=todas&curso_id=999999')).data;
  check('Reposiciones: se filtran por curso', rpCurso.rows.length >= 1 && rpCurso.rows.every((x) => x.curso_id === k.data.id) && rpOtro.rows.length === 0, JSON.stringify([rpCurso.rows.length, rpOtro.rows.length]));
  const meMods = (await A.app('/api/me')).data.modules;
  check('Menú: Cuotas y Reposiciones siguen como módulos pero ocultos del menú', meMods.find((x) => x.id === 'cuotas')?.oculto === true && meMods.find((x) => x.id === 'reposiciones')?.oculto === true && !meMods.find((x) => x.id === 'cursos')?.oculto);

  // Editor de curso: cuota inicial, tarjetas con avance y cálculo de choques
  const kk2 = await A.app('/api/cursos/cursos', { method: 'POST', body: { nombre: 'Cejas', area_id: area.data.id, profesional_id: prof.data.id, precio: 500000, inicial: 150000, inicio: '2026-08-03', num_clases: 3, festivos: false, horario: [{ dia: 1, ini: '18:30', fin: '19:30' }] } });
  check('Cursos: guarda la cuota inicial del curso', kk2.status === 201 && (await A.app('/api/cursos/lista')).data.cursos.find((x) => x.id === kk2.data.id)?.inicial === 150000, JSON.stringify(kk2.data));
  const calc = await A.app('/api/cursos/calcular', { method: 'POST', body: { inicio: '2026-08-03', num_clases: 3, festivos: false, horario: [{ dia: 1, ini: '18:00', fin: '20:00' }], profesional_id: prof.data.id, area_id: area.data.id, curso_id: kk2.data.id } });
  check('Cursos: calcula las fechas y marca el choque con otra clase del mismo profesional', calc.status === 200 && calc.data.clases.length === 3 && calc.data.clases[0].fecha === '2026-08-03' && calc.data.clases[0].choques.length >= 1 && calc.data.clases[0].choques[0].curso === 'Automaquillaje', JSON.stringify(calc.data.clases?.[0]));
  check('Cursos: marca la clase fuera de la disponibilidad del profesional', calc.data.clases[0].fuera === true, JSON.stringify(calc.data.clases?.[0]));
  const calcEdit = await A.app('/api/cursos/calcular', { method: 'POST', body: { horario: [{ dia: 1, ini: '18:00', fin: '20:00' }], profesional_id: prof.data.id, clases: [{ fecha: '2026-09-07', ini: '09:00', fin: '10:00' }] } });
  check('Cursos: revisa choques de fechas editadas a mano', calcEdit.status === 200 && calcEdit.data.clases[0].fecha === '2026-09-07' && calcEdit.data.clases[0].choques.length === 0);
  check('Cursos: horario inválido en el cálculo se rechaza', (await A.app('/api/cursos/calcular', { method: 'POST', body: { horario: [{ dia: 9, ini: 'x', fin: 'y' }] } })).status === 400);
  const tarj = (await A.app('/api/cursos/tarjetas')).data.rows.find((x) => x.id === k.data.id);
  check('Cursos: la tarjeta trae profesional, matriculados, avance y estado', tarj?.profesional === 'Laura Docente' && tarj.inscritos === 2 && tarj.dictadas >= 1 && tarj.estado === 'Finalizado' && tarj.fin, JSON.stringify(tarj));
  check('Cursos: las tarjetas filtran por estado', (await A.app('/api/cursos/tarjetas?activo=0')).data.rows.length === 0);
  check('Cursos: el personal no calcula horarios (403)', (await S.app('/api/cursos/calcular', { method: 'POST', body: { horario: [] } })).status === 403);

  // Exámenes: preguntas, respuestas calificadas por el servidor y nota sugerida
  const examen = { instrucciones: 'Marca la correcta', preguntas: [
    { id: 'q1', tipo: 'unica', enunciado: 'Complementario del azul', puntos: 2, opciones: [{ id: 'a', texto: 'Naranja', ok: true }, { id: 'b', texto: 'Verde', ok: false }] },
    { id: 'q2', tipo: 'multiple', enunciado: 'Desinfección', puntos: 2, opciones: [{ id: 'a', texto: 'Alcohol', ok: true }, { id: 'b', texto: 'Toalla', ok: true }, { id: 'c', texto: 'Esponja usada', ok: false }] },
    { id: 'q3', tipo: 'vf', enunciado: 'Se desinfecta antes de cada servicio', puntos: 1, vf: true },
    { id: 'q4', tipo: 'corta', enunciado: 'Círculo de colores', puntos: 1, respuesta: 'círculo cromático, circulo cromatico' },
    { id: 'q5', tipo: 'abierta', enunciado: 'Describe la base para piel mixta', puntos: 4 }] };
  const evQ = await A.app('/api/cursos/evaluaciones', { method: 'POST', body: { curso_id: k.data.id, nombre: 'Quiz', peso: 0, tipo: 'multiple', examen: JSON.stringify(examen) } });
  check('Exámenes: crea una evaluación de selección múltiple con preguntas', evQ.status === 201, JSON.stringify(evQ.data));
  const malo = await A.app('/api/cursos/evaluaciones', { method: 'POST', body: { curso_id: k.data.id, nombre: 'Malo', peso: 0, tipo: 'multiple', examen: JSON.stringify({ preguntas: [{ tipo: 'unica', enunciado: 'x', opciones: [{ texto: 'a' }, { texto: 'b' }] }] }) } });
  check('Exámenes: una pregunta sin respuesta correcta se rechaza', malo.status === 400, JSON.stringify(malo.data));
  check('Exámenes: un tipo de pregunta desconocido se rechaza', (await A.app('/api/cursos/evaluaciones', { method: 'POST', body: { curso_id: k.data.id, nombre: 'Malo2', peso: 0, examen: JSON.stringify({ preguntas: [{ tipo: 'rara', enunciado: 'x' }] }) } })).status === 400);
  const exBase = `/api/cursos/${k.data.id}/examenes/${evQ.data.id}/${m1.data.id}`;
  const exVacio = await A.app(exBase);
  check('Exámenes: el examen vacío empieza sin puntos', exVacio.status === 200 && exVacio.data.calificacion.obtenido === 0 && exVacio.data.calificacion.total === 10, JSON.stringify(exVacio.data.calificacion));
  const exResp = await A.app(exBase, { method: 'PUT', body: { resp: { q1: 'a', q2: ['a', 'c'], q3: true, q4: 'Circulo Cromatico', q5: 'Usaría base fluida' }, manual: { q5: 3 } } });
  check('Exámenes: califica sola (única 2 + múltiple 0.5×2... parcial + vf 1 + corta 1 + abierta 3)', exResp.status === 200 && exResp.data.calificacion.det.q1.pts === 2 && exResp.data.calificacion.det.q2.pts === 0 && exResp.data.calificacion.det.q3.pts === 1 && exResp.data.calificacion.det.q4.pts === 1 && exResp.data.calificacion.det.q5.pts === 3, JSON.stringify(exResp.data.calificacion));
  check('Exámenes: la nota sugerida sale del porcentaje y la escala', exResp.data.nota === 3.5 && exResp.data.calificacion.obtenido === 7, JSON.stringify([exResp.data.nota, exResp.data.calificacion.obtenido]));
  const exParcial = await A.app(exBase, { method: 'PUT', body: { resp: { q2: ['a', 'b'] } } });
  check('Exámenes: una abierta sin calificar queda pendiente y la múltiple completa vale todo', exParcial.data.calificacion.det.q2.estado === 'ok' && exParcial.data.calificacion.det.q2.pts === 2, JSON.stringify(exParcial.data.calificacion.det.q2));
  const exSucio = await A.app(exBase, { method: 'PUT', body: { resp: { q1: 'zzz', inventada: 'x' } } });
  check('Exámenes: las respuestas que no corresponden a la pregunta se descartan', exSucio.data.resp.q1 === undefined && exSucio.data.resp.inventada === undefined);
  await A.app(exBase, { method: 'PUT', body: { resp: { q1: 'a', q3: true, q4: 'circulo cromatico' }, manual: {} } });
  const aplic = await A.app(`${exBase}/aplicar`, { method: 'POST' });
  const notaAplicada = (await A.app(`/api/cursos/${k.data.id}/detalle`)).data.inscritos.find((i) => i.id === m1.data.id)?.notas?.[evQ.data.id];
  check('Exámenes: aplica la nota sugerida a Notas', aplic.status === 200 && notaAplicada === aplic.data.nota && aplic.data.nota > 0, JSON.stringify([aplic.data, notaAplicada]));
  check('Exámenes: el examen de otra matrícula del curso no se mezcla', (await A.app(`/api/cursos/${k.data.id}/examenes/${evQ.data.id}/${m2.data.id}`)).data.calificacion.obtenido === 0);
  check('Exámenes: lista cuáles tienen respuestas', (await A.app(`/api/cursos/${k.data.id}/examenes`)).data.rows.some((x) => x.inscripcion_id === m1.data.id && x.respondidas >= 1));
  check('Exámenes: el personal sí puede responder el examen', (await S.app(exBase)).status === 200);
  check('Exámenes: B no ve el examen de A', (await B.app(exBase)).status === 404);
  check('Exámenes: una evaluación de otro curso no se abre', (await A.app(`/api/cursos/${kk2.data.id}/examenes/${evQ.data.id}/${m1.data.id}`)).status === 404);
  const detEv = (await A.app(`/api/cursos/${k.data.id}/detalle`)).data.evaluaciones.find((e) => e.id === evQ.data.id);
  check('Exámenes: el detalle trae el tipo y las preguntas', detEv?.tipo === 'multiple' && detEv.examen?.preguntas?.length === 5);

  // Inicio: indicadores propios de la academia según rol y módulos
  const metA = (await A.app('/api/academia/metricas')).data, idsA = metA.tiles.map((t) => t.id), tv = (id) => metA.tiles.find((t) => t.id === id);
  check('Inicio: el propietario ve estudiantes, matrículas, cursos, asistencia y dinero', ['estudiantes', 'matriculas', 'cursos', 'clases_hoy', 'asistencia', 'riesgo', 'notas', 'reposiciones', 'recaudo', 'por_cobrar', 'vencido'].every((x) => idsA.includes(x)), JSON.stringify(idsA));
  check('Inicio: cuenta los estudiantes y matrículas de verdad', tv('estudiantes').valor === 2 && tv('matriculas').valor === 2, JSON.stringify([tv('estudiantes'), tv('matriculas')]));
  check('Inicio: trae la serie de los últimos 6 meses', metA.serie.length === 6 && metA.serie.every((x) => 'recaudo' in x && 'matriculas' in x));
  const metS = (await S.app('/api/academia/metricas')).data.tiles.map((t) => t.id);
  check('Inicio: el personal no ve matrículas ni dinero pero sí lo académico', metS.includes('cursos') && metS.includes('asistencia') && !['matriculas', 'recaudo', 'por_cobrar', 'vencido'].some((x) => metS.includes(x)), JSON.stringify(metS));
  check('Inicio: B no ve los datos de A', (await B.app('/api/academia/metricas')).data.tiles.find((t) => t.id === 'estudiantes')?.valor === 0);
  check('Inicio: /api/me marca los módulos propios y los compartidos', (await A.app('/api/me')).data.modules.find((x) => x.id === 'cursos')?.tipo === 'propio' && (await A.app('/api/me')).data.modules.find((x) => x.id === 'finanzas')?.tipo === 'compartido');

  // Notas y asistencia en matriz: el detalle trae la cédula de cada inscrito, y la asistencia se corrige clase por clase
  const detM = (await A.app(`/api/cursos/${k.data.id}/detalle`)).data;
  check('Curso: los inscritos traen su cédula (para la matriz de notas y asistencia)', detM.inscritos.find((i) => i.id === m1.data.id)?.documento === '1001' && detM.inscritos.find((i) => i.id === m2.data.id)?.documento === '1002');
  const cambioAs = await A.app(`/api/cursos/${k.data.id}/asistencia`, { method: 'POST', body: { clase_n: 3, marcas: [{ inscripcion_id: m1.data.id, estado: 'T' }, { inscripcion_id: m2.data.id, estado: 'J' }] } });
  const detM2 = (await A.app(`/api/cursos/${k.data.id}/detalle`)).data;
  check('Asistencia: guarda los estados tarde y excusa por clase', cambioAs.status === 200 && detM2.inscritos.find((i) => i.id === m1.data.id).asistencia[3] === 'T' && detM2.inscritos.find((i) => i.id === m2.data.id).asistencia[3] === 'J');
  await A.app(`/api/cursos/${k.data.id}/asistencia`, { method: 'POST', body: { clase_n: 3, marcas: [{ inscripcion_id: m1.data.id, estado: '' }] } });
  check('Asistencia: una marca vacía borra el registro', (await A.app(`/api/cursos/${k.data.id}/detalle`)).data.inscritos.find((i) => i.id === m1.data.id).asistencia[3] === undefined);

  // Aislamiento
  check('Aislamiento: B no ve cursos ni estudiantes de A', (await B.app('/api/cursos/cursos')).data.rows?.length === 0 && (await B.app('/api/estudiantes/estudiantes')).data.rows?.length === 0);
  check('Aislamiento: B no ve el detalle del curso de A', (await B.app(`/api/cursos/${k.data.id}/detalle`)).status === 404);
  check('Aislamiento: B no ve el recibo de A', (await B.app(`/api/cuotas/pagos/${p1.data.id}/recibo`)).status === 404);
  check('Aislamiento: B no paga una matrícula de A', (await B.app('/api/cuotas/pagos', { method: 'POST', body: { inscripcion_id: m1.data.id, valor: 1000 } })).status === 400);
  check('Aislamiento: B no matricula con estudiante de A', (await B.app('/api/matriculas', { method: 'POST', body: { estudiante_id: e1.data.id, curso_id: k.data.id } })).status === 400);
  check('Aislamiento: B no ve fallas de A', (await B.app('/api/reposiciones')).data.rows?.length === 0);

  // Módulo inactivo y anular
  await diwilo('PUT', `/businesses/${A.id}/modules`, { modules: [{ modulo: 'cuotas', activo: false }] });
  check('Cuotas inactivo: su API responde 403', (await A.app('/api/cuotas/cartera')).status === 403);
  await diwilo('PUT', `/businesses/${A.id}/modules`, { modules: [] });
  check('Cuotas: anula un pago', (await A.app(`/api/cuotas/pagos/${p1.data.id}/anular`, { method: 'POST' })).status === 200 && (await A.app(`/api/matriculas/${m1.data.id}/cuotas`)).data.pagado === 0);

  // Módulos centrales (Diwilo Modulos): Finanzas y Marketing por RPC, con su página en el shell de la app
  check('Centrales: Finanzas responde desde Diwilo Modulos', (await A.app('/api/finanzas/summary')).status === 200);
  const pgFin = await A.app('/staff/finanzas.html');
  check('Centrales: la página de Finanzas se arma con el shell de la app', pgFin.status === 200 && pgFin.data.text?.includes('/m/finanzas.js') && pgFin.data.text.includes('CD Academia'));
  check('Centrales: el código de la página llega del Worker central', (await A.app('/m/marketing.js')).status === 200);
  check('Centrales: el personal no ve Finanzas (403)', (await S.app('/api/finanzas/summary')).status === 403);
  const ct = await A.app('/api/marketing/contacts', { method: 'POST', body: { name: 'Lead central' } });
  check('Centrales: Marketing guarda y queda en la bitácora de la app', ct.status === 201 && (await A.app('/api/settings/bitacora')).data.items?.some((x) => x.modulo === 'marketing'));
  check('Centrales: B no ve los contactos de A', (await B.app('/api/marketing/contacts')).data.rows?.length === 0);

  // IA (MCP)
  const tk = await A.app('/api/ia/tokens', { method: 'POST', body: { name: 'Prueba academia' } });
  const call = (name, args) => mcp(tk.data.token, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  const vc = await call('cuotas_cartera', { estado: 'pendientes' });
  check('IA: consulta la cartera', !vc.data.result?.isError && JSON.parse(vc.data.result.content[0].text).total === 1900000, JSON.stringify(vc.data).slice(0, 300));
  const pg = await call('cuotas_registrar_pago', { inscripcion_id: m1.data.id, valor: 200000, metodo: 'Efectivo' });
  check('IA: registra un pago con recibo', !pg.data.result?.isError && JSON.parse(pg.data.result.content[0].text).recibo === 102, JSON.stringify(pg.data).slice(0, 300));
  const fi = await call('estudiantes_ficha', { estudiante_id: e1.data.id });
  check('IA: ficha del estudiante', JSON.parse(fi.data.result?.content?.[0]?.text || '{}').matriculas?.[0]?.pagado === 200000);
}
