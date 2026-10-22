// Equipo: datos de las personas, docencia por profesional y paso del equipo al módulo Nómina.
export default async function ({ check, newBusiness, newMember }) {
  const A = await newBusiness('Academia Equipo', { login: true });
  const B = await newBusiness('Academia Otro Equipo', { login: true });
  const S = await newMember(A.id, 'staff');
  const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  const yo = (await A.app('/api/me')).data.user;
  const prof = await A.app('/api/profesionales/profesionales', { method: 'POST', body: { nombre: 'Profe Docente', areas: [] } });
  const curso = await A.app('/api/cursos/cursos', { method: 'POST', body: { nombre: 'Maquillaje social', profesional_id: prof.data.id, num_clases: 4, inicio: hoy, horario: [{ dia: new Date(Date.now() - 5 * 3600000).getUTCDay(), ini: '09:00', fin: '11:00' }], precio: 100000 } });

  const per = (await A.app('/api/team/personas')).data.personas;
  check('Equipo: lista las personas con sus datos', per.length === 3 && per.some((x) => x.key === `u:${yo.id}`) && per.some((x) => x.key === `p:${prof.data.id}`));
  check('Equipo: las personas son solo del propietario y administradores', (await S.app('/api/team/personas')).status === 403 && (await B.app('/api/team/personas')).data.personas.length === 1);
  const dp = await A.app(`/api/team/persona/${encodeURIComponent(`u:${yo.id}`)}`, { method: 'PUT', body: { nombre: 'Dueña Academia', tipo_documento: 'NIT', documento: '900.123.456-7', celular: '3001112233' } });
  const perDoc = (await A.app('/api/team/personas')).data.personas.find((x) => x.key === `u:${yo.id}`);
  check('Equipo: los datos de la persona se editan', dp.status === 200 && perDoc.nombre === 'Dueña Academia' && perDoc.tipo_documento === 'NIT' && perDoc.documento === '900.123.456-7' && perDoc.celular === '3001112233');
  check('Equipo: el personal no edita datos (403) ni uno de otro negocio (404)', (await S.app(`/api/team/persona/${encodeURIComponent(`u:${yo.id}`)}`, { method: 'PUT', body: { documento: '1' } })).status === 403 && (await B.app(`/api/team/persona/${encodeURIComponent(`p:${prof.data.id}`)}`, { method: 'PUT', body: { documento: '1' } })).status === 404);
  check('Equipo: un tipo de documento inválido se rechaza', (await A.app(`/api/team/persona/${encodeURIComponent(`u:${yo.id}`)}`, { method: 'PUT', body: { tipo_documento: 'XX', documento: '1' } })).status === 400);

  // Docencia
  const dc = (await A.app('/api/team/docencia')).data;
  const mia = dc.profesionales.find((x) => x.profesional_id === prof.data.id);
  check('Equipo: la docencia trae los cursos del profesional con su avance', curso.status === 201 && mia?.cursos.length === 1 && mia.cursos[0].total === 4 && mia.cursos[0].dictadas >= 0 && typeof mia.mes_faltan === 'number', JSON.stringify(mia));
  check('Equipo: la docencia la ve también el personal y no cruza negocios', (await S.app('/api/team/docencia')).status === 200 && (await B.app('/api/team/docencia')).data.profesionales.length === 0);

  // Paso a Nómina (módulo central)
  const sy = await A.app('/api/team/nomina/sincronizar', { method: 'POST' });
  check('Equipo: pasa el equipo a Nómina', sy.status === 200 && sy.data.creados === 2 && sy.data.total === 2, JSON.stringify(sy.data));
  const emp = (await A.app('/api/nomina/employees')).data.rows;
  check('Equipo: el docente entra a Nómina como contratista por prestación', emp.length === 2 && emp.find((x) => x.name === 'Profe Docente')?.contract_type === 'prestacion' && emp.find((x) => x.position === 'Personal')?.contract_type === 'indefinido', JSON.stringify(emp));
  const sy2 = await A.app('/api/team/nomina/sincronizar', { method: 'POST' });
  check('Equipo: repetirlo no duplica', sy2.status === 200 && sy2.data.creados === 0 && (await A.app('/api/nomina/employees')).data.rows.length === 2);
  check('Equipo: solo propietario y administradores lo pasan a Nómina', (await S.app('/api/team/nomina/sincronizar', { method: 'POST' })).status === 403);
  check('Equipo: las rutas de pago de antes ya no existen', [404, 405].includes((await A.app('/api/team/nomina')).status) && [404, 405].includes((await A.app('/api/team/nomina/aproximado')).status));
}
