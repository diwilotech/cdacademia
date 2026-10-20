// Inicio del estudiante: acceso por invitación, aislamiento (solo ve lo suyo y nada del panel del equipo),
// curso por iniciar con cuenta regresiva y calendario por semana.
export default async function ({ check, client, newBusiness, TS_TOKEN }) {
  const A = await newBusiness('Academia Alumnos', { login: true });
  const B = await newBusiness('Academia Otra', { login: true });
  const slug = A.created.data.slug;
  const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  const mas = (n) => new Date(Date.parse(`${hoy}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  const lunes = (iso) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

  // Dos cursos: uno que ya empezó y otro que empieza en 10 días
  const k1 = await A.app('/api/cursos/cursos', { method: 'POST', body: { nombre: 'Maquillaje en curso', precio: 400000, inicio: mas(-7), num_clases: 6, festivos: false, horario: [{ dia: 1, ini: '08:00', fin: '10:00' }, { dia: 3, ini: '08:00', fin: '10:00' }, { dia: 5, ini: '08:00', fin: '10:00' }] } });
  const k2 = await A.app('/api/cursos/cursos', { method: 'POST', body: { nombre: 'Barbería futura', precio: 300000, inicio: mas(10), num_clases: 4, festivos: false, horario: [{ dia: 2, ini: '19:00', fin: '21:00' }, { dia: 4, ini: '19:00', fin: '21:00' }] } });
  const e1 = await A.app('/api/estudiantes/estudiantes', { method: 'POST', body: { nombre: 'Sofía Alumna', email: `sofia${Date.now()}@ejemplo.com` } });
  const e2 = await A.app('/api/estudiantes/estudiantes', { method: 'POST', body: { nombre: 'Otro Alumno', email: `otro${Date.now()}@ejemplo.com` } });
  await A.app('/api/matriculas', { method: 'POST', body: { estudiante_id: e1.data.id, curso_id: k1.data.id, fecha: hoy, plan: { n: 2, frecuencia: 'mensual', primera: hoy } } });
  await A.app('/api/matriculas', { method: 'POST', body: { estudiante_id: e2.data.id, curso_id: k1.data.id, fecha: hoy } });

  // Acceso: solo propietario/administrador; el estudiante crea su contraseña con el enlace
  const sin = await A.app(`/api/estudiantes/${e1.data.id}/acceso`);
  check('Alumno: la ficha empieza sin acceso', sin.data.estado === 'sin_acceso');
  const dar = await A.app(`/api/estudiantes/${e1.data.id}/acceso`, { method: 'POST', body: {} });
  check('Alumno: dar acceso devuelve el enlace de invitación', dar.status === 201 && dar.data.estado === 'invitado' && /#invite=/.test(dar.data.invite_url), JSON.stringify(dar.data));
  const S = client();
  const token = new URLSearchParams(dar.data.invite_url.split('#')[1]).get('invite');
  const reg = await S('/api/auth/invite', { method: 'POST', body: { token, password: 'clave-segura-1', consent: true, adult: true, turnstile: TS_TOKEN } });
  check('Alumno: crea su contraseña y entra', reg.status === 200 && reg.data.businesses?.[0]?.role === 'estudiante', JSON.stringify(reg.data));
  check('Alumno: la ficha pasa a «Con acceso»', (await A.app(`/api/estudiantes/${e1.data.id}/acceso`)).data.estado === 'activo');
  check('Alumno: el equipo no lo ve en Equipo', !(await A.app('/api/team')).data.users.some((u) => u.role === 'estudiante'));
  check('Alumno: un correo del equipo no se puede dar como estudiante', (await A.app(`/api/estudiantes/${e2.data.id}/acceso`, { method: 'POST', body: { email: A.mail } })).status === 409);

  // Aislamiento: el estudiante no entra al panel ni a las APIs del equipo
  check('Alumno: /<dirección> sirve su inicio, no el panel', (await S(`/${slug}`)).data.text?.includes('alumno.js') === true && !(await S(`/${slug}`)).data.text?.includes('dw-frame'));
  check('Alumno: /staff/ lo regresa a su inicio', (await S('/staff/')).headers.get('location')?.endsWith(`/${slug}`));
  for (const [ruta, nombre] of [['/api/estudiantes/estudiantes', 'estudiantes'], ['/api/cursos/cursos', 'cursos'], ['/api/me', 'me'], ['/api/team', 'equipo'], ['/api/matriculas', 'matrículas'], ['/api/settings/bitacora', 'bitácora'], ['/api/finanzas/summary', 'finanzas']]) {
    const r = await S(ruta);
    check(`Alumno: no accede a ${nombre} (403)`, r.status === 403, String(r.status));
  }
  check('Alumno: no crea claves de IA', (await S('/api/ia/tokens', { method: 'POST', body: { name: 'x' } })).status === 403);
  check('Alumno: un miembro del equipo no entra a la API del alumno', (await A.app('/api/alumno/inicio')).status === 403);

  // Inicio: sus cursos, con cuenta regresiva del que aún no empieza
  const mat2 = await A.app('/api/matriculas', { method: 'POST', body: { estudiante_id: e1.data.id, curso_id: k2.data.id, fecha: hoy } });
  const ini = await S('/api/alumno/inicio');
  const [c1, c2] = [ini.data.cursos?.find((c) => c.curso === 'Maquillaje en curso'), ini.data.cursos?.find((c) => c.curso === 'Barbería futura')];
  check('Alumno: ve solo sus cursos', ini.status === 200 && ini.data.cursos.length === 2 && ini.data.estudiante.nombre === 'Sofía Alumna', JSON.stringify(ini.data).slice(0, 300));
  check('Alumno: curso por iniciar con días que faltan', c2?.estado === 'por_iniciar' && c2.inicio >= mas(10) && c2.empieza_en === Math.round((Date.parse(c2.inicio) - Date.parse(hoy)) / 864e5), JSON.stringify(c2));
  check('Alumno: curso en marcha con su avance', c1?.estado === 'en_curso' && c1.total_clases === 6 && c1.hechas >= 1, JSON.stringify(c1));
  check('Alumno: avisa que el curso futuro empieza pronto y de la cuota', ini.data.avisos.some((a) => a.tipo === 'inicio' && /Barbería futura/.test(a.texto)), JSON.stringify(ini.data.avisos));
  check('Alumno: no ve cursos de otros estudiantes', !ini.data.cursos.some((c) => c.id === (mat2.data.id + 1)));

  // Calendario y seguimiento
  const sem = await S(`/api/alumno/calendario?desde=${lunes(c2.inicio)}&hasta=${mas(0) > c2.inicio ? c2.inicio : (() => { const d = new Date(`${lunes(c2.inicio)}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 6); return d.toISOString().slice(0, 10); })()}`);
  check('Alumno: la semana del primer día trae las clases del curso futuro', sem.status === 200 && sem.data.clases.some((x) => x.curso === 'Barbería futura' && x.fecha === c2.inicio), JSON.stringify(sem.data).slice(0, 300));
  check('Alumno: el rango de calendario muy largo se rechaza', (await S(`/api/alumno/calendario?desde=${hoy}&hasta=${mas(200)}`)).status === 400);
  const det = await S(`/api/alumno/curso/${c1.id}`);
  check('Alumno: seguimiento de su curso (clases, notas, asistencia)', det.status === 200 && det.data.clases.length === 6 && Array.isArray(det.data.evaluaciones) && 'asistencia' in det.data, JSON.stringify(det.data).slice(0, 200));
  // La matrícula de otro estudiante (e2) no se abre
  const idOtro = (await A.app('/api/matriculas?limit=50')).data.rows?.find((m) => m.estudiante_id === e2.data.id)?.id;
  check('Alumno: no abre la matrícula de otro estudiante', idOtro != null && (await S(`/api/alumno/curso/${idOtro}`)).status === 404, String(idOtro));

  // Pagos: cuenta de cobro con las cuotas, comprobante, revisión del equipo y recibos
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
  const subir = (valor, body = png, tipo = 'image/png') => S(`/api/alumno/curso/${c1.id}/comprobantes?valor=${valor}&metodo=Nequi&nombre=pago.png`, { method: 'POST', body, headers: { 'content-type': tipo } });
  const cc = await S(`/api/alumno/curso/${c1.id}/cuenta-de-cobro`);
  check('Alumno: ve su cuenta de cobro con una línea por cuota', cc.status === 200 && /Cuota inicial|Cuota 1|Pago único|Cuota/.test(cc.data.text || '') && (cc.data.text.match(/<tr><td class="idx">/g) || []).length === 2, String(cc.status));
  check('Alumno: la cuenta de cobro usa los colores de la marca (rosa) y no el violeta fijo', /#be185d/i.test(cc.data.text || '') && !/#7c3aed/i.test(cc.data.text || ''));
  check('Alumno: el comprobante debe ser imagen o PDF', (await subir(100000, new Uint8Array([1, 2, 3, 4, 5]), 'text/plain')).status === 400);
  check('Alumno: el valor no puede superar su saldo', (await subir(999999999)).status === 400);
  const up = await subir(200000);
  check('Alumno: sube un comprobante y queda en revisión', up.status === 201 && up.data.estado === 'pendiente', JSON.stringify(up.data));
  const det2 = await S(`/api/alumno/curso/${c1.id}`);
  check('Alumno: ve sus cuotas y comprobantes', det2.data.pagos?.cuotas?.length === 2 && det2.data.pagos.comprobantes?.[0]?.estado === 'pendiente' && det2.data.pagos.saldo === 400000, JSON.stringify(det2.data.pagos).slice(0, 200));
  check('Alumno: puede ver su archivo', (await S(`/api/alumno/comprobantes/${up.data.id}/archivo`)).status === 200);
  check('Alumno: el equipo ve el comprobante pendiente', (await A.app('/api/cuotas/comprobantes?estado=pendiente')).data.pendientes === 1);
  check('Alumno: otro negocio no ve ni abre el comprobante', (await B.app(`/api/cuotas/comprobantes/${up.data.id}/archivo`)).status === 404 && (await B.app(`/api/cuotas/comprobantes/${up.data.id}/aprobar`, { method: 'POST', body: {} })).status === 404);
  const ap = await A.app(`/api/cuotas/comprobantes/${up.data.id}/aprobar`, { method: 'POST', body: {} });
  check('Alumno: aprobar registra el pago con recibo', ap.status === 200 && ap.data.pago > 0, JSON.stringify(ap.data));
  check('Alumno: no se aprueba dos veces', (await A.app(`/api/cuotas/comprobantes/${up.data.id}/aprobar`, { method: 'POST', body: {} })).status === 409);
  const rec = await S(`/api/alumno/curso/${c1.id}/recibos`);
  check('Alumno: ve su recibo y lo abre', rec.data.recibos?.length === 1 && rec.data.recibos[0].valor === 200000 && (await S(`/api/alumno/curso/${c1.id}/recibos/${rec.data.recibos[0].num}`)).data.text?.includes('Recibo de caja'), JSON.stringify(rec.data));
  // Finanzas: el recibo aparece en Movimientos con el comprobante, y la cuenta de cobro no cambia aunque cambien las cuotas
  const movs = (await A.app('/api/finanzas/movements?limit=100')).data.rows || [];
  const mv = movs.find((m) => m.receipt_number === rec.data.recibos[0].recibo);
  check('Finanzas: el movimiento trae su recibo y el comprobante', !!mv && mv.receipt_files?.[0]?.url === `/api/cuotas/comprobantes/${up.data.id}/archivo`, JSON.stringify(mv || movs[0]).slice(0, 250));
  const antes = (await S(`/api/alumno/curso/${c1.id}/cuenta-de-cobro`)).data.text || '';
  const cambia = await A.app(`/api/matriculas/${c1.id}`, { method: 'PATCH', body: { plan: { n: 4, frecuencia: 'semanal', primera: hoy } } });
  const despues = (await S(`/api/alumno/curso/${c1.id}/cuenta-de-cobro`)).data.text || '';
  const lineas = (t) => (t.match(/<tr><td class="idx">/g) || []).length;
  check('Finanzas: al cambiar las cuotas la cuenta de cobro queda igual', cambia.status === 200 && lineas(antes) === 2 && lineas(despues) === 2 && (await S(`/api/alumno/curso/${c1.id}`)).data.pagos.cuotas.length === 4, `${lineas(antes)} ${lineas(despues)}`);
  const detF = await A.app(`/api/finanzas/invoices/${(await A.app('/api/finanzas/invoices?limit=50')).data.rows.find((i) => i.ref === `academia:matricula:${c1.id}`).id}/detalle`);
  check('Finanzas: la cuenta por cobrar trae sus pagos con archivos', detF.status === 200 && detF.data.recibos.length === 1 && detF.data.recibos[0].files.length === 1, JSON.stringify(detF.data.recibos).slice(0, 200));
  check('Finanzas: gastos recurrentes con «este mes» y «por pagar»', (await A.app('/api/finanzas/recurring/estado')).data.por_pagar !== undefined);
  const up2 = await subir(100000);
  check('Alumno: rechazar pide motivo y el estudiante lo ve', (await A.app(`/api/cuotas/comprobantes/${up2.data.id}/rechazar`, { method: 'POST', body: {} })).status === 400
    && (await A.app(`/api/cuotas/comprobantes/${up2.data.id}/rechazar`, { method: 'POST', body: { motivo: 'No se ve el valor' } })).status === 200
    && (await S('/api/alumno/inicio')).data.avisos.some((a) => /No se ve el valor/.test(a.texto)));
  check('Alumno: el equipo no puede subir como estudiante', (await A.app(`/api/alumno/curso/${c1.id}/comprobantes?valor=1000`, { method: 'POST', body: png, headers: { 'content-type': 'image/png' } })).status === 403);

  // La clase: material del día, entregas y evaluaciones
  const mat = await A.app('/api/material/material', { method: 'POST', body: { titulo: 'Contorno facial', descripcion: 'Técnicas base', bloques: [{ tipo: 'texto', texto: 'Hoy practicamos el contorno.' }] } });
  const clases1 = (await A.app(`/api/cursos/${k1.data.id}/detalle`)).data.clases;
  const claseFut = clases1.at(-1), claseHoy = clases1.find((x) => x.fecha >= hoy && x.n !== claseFut.n) || clases1.at(-2);
  check('Clase: hay clases de prueba', claseFut.fecha > hoy, JSON.stringify(clases1.map((x) => x.fecha)));
  // Ponemos la clase de hoy (la movemos a hoy) con material y dos evaluaciones: una en línea y una en papel
  await A.app(`/api/cursos/${k1.data.id}/clases/${claseHoy.n}`, { method: 'PATCH', body: { fecha: hoy, material_id: mat.data.id } });
  const evq = await A.app('/api/cursos/evaluaciones', { method: 'POST', body: { curso_id: k1.data.id, nombre: 'Quiz contorno', peso: 20, clase_n: claseHoy.n, tipo: 'multiple',
    examen: JSON.stringify({ instrucciones: 'Responde', preguntas: [{ tipo: 'unica', enunciado: '¿Dónde va el contorno?', puntos: 2, opciones: [{ texto: 'Pómulos', ok: true }, { texto: 'Frente' }] }, { tipo: 'vf', enunciado: 'El contorno se difumina', puntos: 1, vf: true }] }) } });
  const evp = await A.app('/api/cursos/evaluaciones', { method: 'POST', body: { curso_id: k1.data.id, nombre: 'Práctica en papel', peso: 10, clase_n: claseHoy.n, tipo: 'examen' } });
  const evf = await A.app('/api/cursos/evaluaciones', { method: 'POST', body: { curso_id: k1.data.id, nombre: 'Quiz futuro', peso: 10, clase_n: claseFut.n, tipo: 'multiple',
    examen: JSON.stringify({ preguntas: [{ tipo: 'vf', enunciado: 'x', puntos: 1, vf: true }] }) } });
  check('Clase: evaluaciones creadas', evq.status === 201 && evp.status === 201 && evf.status === 201, JSON.stringify([evq.data, evp.data]));
  const cl = await S(`/api/alumno/curso/${c1.id}/clase/${claseHoy.n}`);
  check('Clase: el día de la clase ve el material y sus evaluaciones', cl.status === 200 && !cl.data.bloqueada && cl.data.material?.bloques?.length === 1 && cl.data.evaluaciones.length === 2 && cl.data.evaluaciones.every((e) => e.abierta), JSON.stringify(cl.data).slice(0, 300));
  const q1 = cl.data.evaluaciones.find((e) => e.nombre === 'Quiz contorno');
  check('Clase: el examen no trae las respuestas correctas', q1.examen && !JSON.stringify(q1.examen).includes('"ok"') && !JSON.stringify(q1.examen).includes('"vf":'), JSON.stringify(q1.examen).slice(0, 200));
  const fut = await S(`/api/alumno/curso/${c1.id}/clase/${claseFut.n}`);
  check('Clase: una clase futura está bloqueada y no entrega material ni examen', fut.data.bloqueada === true && !fut.data.material && !fut.data.evaluaciones);
  check('Clase: no presenta el examen de una clase futura', (await S(`/api/alumno/curso/${c1.id}/evaluaciones/${evf.data.id}/enviar`, { method: 'POST', body: { resp: {} } })).status === 409);
  check('Clase: el equipo no usa la API del estudiante', (await A.app(`/api/alumno/curso/${c1.id}/clase/${claseHoy.n}`)).status === 403);
  const mfile = Object.assign(new Uint8Array(png));
  const tri = await S(`/api/alumno/curso/${c1.id}/clase/${claseHoy.n}/entregas?nombre=trabajo.png`, { method: 'POST', body: mfile, headers: { 'content-type': 'image/png' } });
  check('Clase: sube su trabajo', tri.status === 201, JSON.stringify(tri.data));
  check('Clase: no sube ejecutables', (await S(`/api/alumno/curso/${c1.id}/clase/${claseHoy.n}/entregas?nombre=a.exe`, { method: 'POST', body: mfile, headers: { 'content-type': 'application/x-msdownload' } })).status === 400);
  check('Clase: no sube trabajo a una clase futura', (await S(`/api/alumno/curso/${c1.id}/clase/${claseFut.n}/entregas?nombre=a.png`, { method: 'POST', body: mfile, headers: { 'content-type': 'image/png' } })).status === 409);
  check('Clase: el equipo ve lo que subió', (await A.app(`/api/cursos/${k1.data.id}/entregas`)).data.rows?.some((x) => x.estudiante === 'Sofía Alumna' && x.nombre === 'trabajo.png'));
  check('Clase: el otro estudiante no abre su archivo', (await A.app(`/api/cursos/entregas/${tri.data.id}/archivo`)).status === 200 && (await B.app(`/api/cursos/entregas/${tri.data.id}/archivo`)).status === 404);
  const op = q1.examen.preguntas[0].opciones.find((o) => o.texto === 'Pómulos').id;
  const env = await S(`/api/alumno/curso/${c1.id}/evaluaciones/${q1.id}/enviar`, { method: 'POST', body: { resp: { [q1.examen.preguntas[0].id]: op, [q1.examen.preguntas[1].id]: true } } });
  check('Clase: envía el examen y se califica solo', env.status === 200 && env.data.evaluacion.enviado && env.data.evaluacion.nota === 5, JSON.stringify(env.data).slice(0, 300));
  check('Clase: el examen enviado no se puede cambiar ni reenviar', (await S(`/api/alumno/curso/${c1.id}/evaluaciones/${q1.id}`, { method: 'PUT', body: { resp: {} } })).status === 409);
  check('Clase: la nota quedó en Notas', (await S(`/api/alumno/curso/${c1.id}`)).data.evaluaciones.find((e) => e.id === q1.id)?.nota === 5);
  check('Clase: el examen en papel pide archivos antes de enviar', (await S(`/api/alumno/curso/${c1.id}/evaluaciones/${evp.data.id}/enviar`, { method: 'POST', body: {} })).status === 400);
  const ea = await S(`/api/alumno/curso/${c1.id}/evaluaciones/${evp.data.id}/archivo?nombre=hoja1.png`, { method: 'POST', body: mfile, headers: { 'content-type': 'image/png' } });
  const ee = await S(`/api/alumno/curso/${c1.id}/evaluaciones/${evp.data.id}/enviar`, { method: 'POST', body: {} });
  check('Clase: sube el examen en papel y queda en revisión', ea.status === 201 && ee.status === 200 && ee.data.evaluacion.en_revision === true, JSON.stringify(ee.data).slice(0, 200));
  check('Clase: el equipo ve el examen enviado', (await A.app(`/api/cursos/${k1.data.id}/examenes/${evp.data.id}/${c1.id}`)).data.archivos?.length === 1);
  const mes = await S(`/api/alumno/calendario?desde=${lunes(hoy)}&hasta=${mas(34)}`);
  check('Calendario: el rango de un mes completo responde', mes.status === 200 && mes.data.clases.length > 0);
  const cal = (await S(`/api/alumno/calendario?desde=${hoy}&hasta=${hoy}`)).data.clases.find((x) => x.n === claseHoy.n);
  check('Calendario: cada clase dice si tiene examen y cómo va', cal?.evaluaciones?.length === 2 && cal.evaluaciones.some((e) => e.nombre === 'Quiz contorno' && e.estado === 'nota' && e.nota === 5) && cal.evaluaciones.some((e) => e.nombre === 'Práctica en papel' && e.estado === 'enviado'), JSON.stringify(cal?.evaluaciones));
  const calF = (await S(`/api/alumno/calendario?desde=${claseFut.fecha}&hasta=${claseFut.fecha}`)).data.clases.find((x) => x.n === claseFut.n);
  check('Calendario: el examen de una clase futura sale pendiente', calF?.evaluaciones?.[0]?.estado === 'pendiente', JSON.stringify(calF?.evaluaciones));
  check('Notas: cada evaluación dice a qué clase pertenece', (await S(`/api/alumno/curso/${c1.id}`)).data.evaluaciones.every((e) => 'clase_n' in e && 'enviado' in e));
  const calE = (await A.app(`/api/cursos/calendario?desde=${hoy}&hasta=${hoy}`)).data.clases.find((x) => x.curso_id === k1.data.id && x.n === claseHoy.n);
  check('Calendario del equipo: la clase con evaluación trae su parcial', calE?.evaluaciones?.length === 2 && calE.evaluaciones.some((e) => e.nombre === 'Quiz contorno'), JSON.stringify(calE?.evaluaciones));
  check('Inicio: marca la clase de hoy', (await S('/api/alumno/inicio')).data.cursos.find((c) => c.id === c1.id)?.clase_hoy?.n === claseHoy.n);

  // IA Diwilo (botón flotante del panel): el equipo pregunta; el estudiante no
  const ia = await A.app('/api/ai/asistente', { method: 'POST', body: { mensajes: [{ role: 'user', content: '[prueba] hola' }] } });
  check('IA Diwilo: el asistente responde al equipo', ia.status === 200 && typeof ia.data.respuesta === 'string', JSON.stringify(ia.data).slice(0, 200));
  check('IA Diwilo: el panel carga el botón flotante', (await A.app(`/${slug}`)).data.text?.includes('/m/iafab.js') === true && (await A.app('/m/iafab.js')).data.text?.includes('IA Diwilo'));
  check('IA Diwilo: el estudiante no usa el asistente del equipo', (await S('/api/ai/asistente', { method: 'POST', body: { mensajes: [{ role: 'user', content: 'hola' }] } })).status === 403);

  // Quitar el acceso corta la sesión
  const quitar = await A.app(`/api/estudiantes/${e1.data.id}/acceso`, { method: 'DELETE' });
  check('Alumno: quitar el acceso cierra su sesión', quitar.status === 200 && (await S('/api/alumno/inicio')).status === 401);
  check('Alumno: otro negocio no puede darle acceso a una ficha ajena', (await B.app(`/api/estudiantes/${e1.data.id}/acceso`, { method: 'POST', body: {} })).status === 404);
}
