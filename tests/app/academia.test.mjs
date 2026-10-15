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
