// Nómina del equipo: solo propietario y administradores; por persona (usuario o profesional); total mensual de lo fijo.
export default async function ({ check, newBusiness, newMember }) {
  const A = await newBusiness('Academia Nómina', { login: true });
  const B = await newBusiness('Academia Otra Nómina', { login: true });
  const S = await newMember(A.id, 'staff');
  const yo = (await A.app('/api/team')).data.users.find((u) => u.role === 'owner');
  const prof = await A.app('/api/profesionales/profesionales', { method: 'POST', body: { nombre: 'Laura Docente', activo: true } });
  const put = (app, persona, body) => app(`/api/team/nomina/${encodeURIComponent(persona)}`, { method: 'PUT', body });

  check('Nómina: el propietario fija un pago mensual', (await put(A.app, `u:${yo.id}`, { valor: 2000000, periodicidad: 'mensual', centro_costo: 'Administración' })).status === 200);
  check('Nómina: un profesional se paga por clase', (await put(A.app, `p:${prof.data.id}`, { valor: 50000, periodicidad: 'clase', notas: 'Maquillaje', documento: '52123456' })).status === 200);
  const n = (await A.app('/api/team/nomina')).data;
  check('Nómina: el total mensual solo suma lo fijo (por clase es variable)', n.rows.length === 2 && n.total_mensual === 2000000, JSON.stringify(n));
  const per = (await A.app('/api/team/nomina/personas')).data.personas;
  check('Nómina: la lista para Finanzas trae nombre, detalle y valor de cada persona', per.length === 3 && per.find((x) => x.key.startsWith('u:') && x.valor === 0) && per.some((x) => x.key === `p:${prof.data.id}` && x.nombre === 'Laura Docente' && x.detalle === 'Profesional' && x.valor === 50000 && x.periodicidad === 'clase' && x.documento === '52123456'), JSON.stringify(per));
  check('Nómina: la lista para Finanzas es solo del propietario y administradores', (await S.app('/api/team/nomina/personas')).status === 403 && !(await B.app('/api/team/nomina/personas')).data.personas.some((x) => x.nombre === 'Laura Docente'));
  // Las clases de un profesional para armar su pago
  const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  const curso = await A.app('/api/cursos/cursos', { method: 'POST', body: { nombre: 'Maquillaje social', profesional_id: prof.data.id, precio: 100000, inicio: hoy, num_clases: 3, festivos: false, horario: [{ dia: new Date(`${hoy}T12:00:00Z`).getUTCDay(), ini: '08:00', fin: '10:00' }] } });
  const cl = (await A.app(`/api/team/nomina/clases?profesional=${prof.data.id}&month=${hoy.slice(0, 7)}`)).data.clases;
  check('Nómina: las clases que dicta el profesional aparecen para armar su pago', curso.status === 201 && cl.length >= 1 && cl.every((x) => x.curso === 'Maquillaje social'), JSON.stringify(cl));
  const ap = (await A.app(`/api/team/nomina/aproximado?month=${hoy.slice(0, 7)}`)).data.rows;
  const aL = ap.find((x) => x.key === `p:${prof.data.id}`), aO = ap.find((x) => x.key === `u:${yo.id}`);
  check('Nómina: lo que se aproxima a pagar al mes (sueldo fijo y clases × valor)', aO?.estimado === 2000000 && aL?.periodicidad === 'clase' && aL.clases === cl.length && aL.estimado === 50000 * cl.length, JSON.stringify([aO, aL]));
  check('Nómina: el aproximado es solo del propietario y administradores', (await S.app('/api/team/nomina/aproximado')).status === 403);
  check('Nómina: otro negocio y el personal no ven las clases', (await S.app(`/api/team/nomina/clases?profesional=${prof.data.id}`)).status === 403 && (await B.app(`/api/team/nomina/clases?profesional=${prof.data.id}&month=${hoy.slice(0, 7)}`)).data.clases.length === 0);
  // Los datos de la persona (nombre, tipo y número de documento, celular) se editan desde Equipo y no pisan el pago
  const dp = await A.app(`/api/team/persona/${encodeURIComponent(`u:${yo.id}`)}`, { method: 'PUT', body: { nombre: 'Dueña Academia', tipo_documento: 'NIT', documento: '900.123.456-7', celular: '300 111 2233' } });
  const perDoc = (await A.app('/api/team/nomina/personas')).data.personas.find((x) => x.key === `u:${yo.id}`);
  check('Nómina: los datos de la persona se editan desde Equipo y conservan el pago', dp.status === 200 && perDoc.nombre === 'Dueña Academia' && perDoc.tipo_documento === 'NIT' && perDoc.documento === '900.123.456-7' && perDoc.celular === '300 111 2233' && perDoc.valor === 2000000, JSON.stringify(perDoc));
  await put(A.app, `u:${yo.id}`, { valor: 2100000, periodicidad: 'quincenal', centro_costo: 'Administración' });
  check('Nómina: cambiar el pago no borra los datos de la persona', (await A.app('/api/team/nomina/personas')).data.personas.find((x) => x.key === `u:${yo.id}`).documento === '900.123.456-7');
  check('Nómina: los datos son solo del propietario y administradores y de gente del equipo', (await S.app(`/api/team/persona/${encodeURIComponent(`u:${yo.id}`)}`, { method: 'PUT', body: { documento: '1' } })).status === 403 && (await B.app(`/api/team/persona/${encodeURIComponent(`u:${yo.id}`)}`, { method: 'PUT', body: { documento: '1' } })).status === 404);
  check('Nómina: un tipo de documento inválido se rechaza', (await A.app(`/api/team/persona/${encodeURIComponent(`u:${yo.id}`)}`, { method: 'PUT', body: { tipo_documento: 'XX', documento: '1' } })).status === 400);
  // La nómina de cada persona queda en Finanzas como gasto recurrente de tipo Nómina (nombre, cédula, valor, ciclo y centro de costo)
  const recN = (await A.app('/api/finanzas/recurring?limit=200')).data.rows.find((x) => x.ref === `academia:nomina:u:${yo.id}`);
  check('Nómina: queda en Finanzas como gasto recurrente de tipo Nómina con su cédula y ciclo (el total del mes entre sus quincenas)', recN?.category === 'nomina' && recN.name === 'Nómina · Dueña Academia' && recN.vendor === 'Dueña Academia' && recN.tax_id === 'NIT 900.123.456-7' && recN.amount === 1050000 && recN.cycle === 'quincenal' && recN.url === `/staff/equipo.html#pago:u:${yo.id}` && recN.cost_center_id > 0, JSON.stringify(recN));
  const recL = (await A.app('/api/finanzas/recurring?limit=200')).data.rows.find((x) => x.ref === `academia:nomina:p:${prof.data.id}`);
  check('Nómina: el pago por clase queda como mensual con la nota «Pago por clase»', recL?.cycle === 'mensual' && recL.notes === 'Pago por clase' && recL.amount === 50000, JSON.stringify(recL));
  await put(A.app, `p:${prof.data.id}`, { valor: 0, periodicidad: 'clase' });
  check('Nómina: sin pago definido el gasto de nómina queda pausado', (await A.app('/api/finanzas/recurring?limit=200')).data.rows.find((x) => x.ref === `academia:nomina:p:${prof.data.id}`)?.active === 0);
  const aF = (await A.app(`/api/team/nomina/aproximado?month=${hoy.slice(0, 7)}`)).data.rows.find((x) => x.key === `p:${prof.data.id}`);
  check('Nómina: el aproximado dice cuántas clases faltan en el mes', typeof aF?.clases_faltan === 'number' && aF.clases_faltan <= aF.clases, JSON.stringify(aF));
  check('Nómina: el personal no ve ni cambia la nómina (403)', (await S.app('/api/team/nomina')).status === 403 && (await put(S.app, `u:${yo.id}`, { valor: 1 })).status === 403);
  check('Nómina: no acepta una persona de otro negocio', (await put(B.app, `u:${yo.id}`, { valor: 1000 })).status === 404 && (await put(B.app, `p:${prof.data.id}`, { valor: 1000 })).status === 404);
  check('Nómina: otro negocio no ve la nómina ajena', (await B.app('/api/team/nomina')).data.rows.length === 0);
  check('Nómina: valor y periodicidad inválidos se rechazan', (await put(A.app, `u:${yo.id}`, { valor: -5 })).status === 400 && (await put(A.app, `u:${yo.id}`, { valor: 1000, periodicidad: 'diaria' })).status === 400);
  check('Nómina: borra el pago de una persona', (await A.app(`/api/team/nomina/${encodeURIComponent(`p:${prof.data.id}`)}`, { method: 'DELETE' })).status === 200 && (await A.app('/api/team/nomina')).data.rows.length === 1);
}
