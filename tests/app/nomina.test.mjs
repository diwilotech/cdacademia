// Nómina del equipo: solo propietario y administradores; por persona (usuario o profesional); total mensual de lo fijo.
export default async function ({ check, newBusiness, newMember }) {
  const A = await newBusiness('Academia Nómina', { login: true });
  const B = await newBusiness('Academia Otra Nómina', { login: true });
  const S = await newMember(A.id, 'staff');
  const yo = (await A.app('/api/team')).data.users.find((u) => u.role === 'owner');
  const prof = await A.app('/api/profesionales/profesionales', { method: 'POST', body: { nombre: 'Laura Docente', activo: true } });
  const put = (app, persona, body) => app(`/api/team/nomina/${encodeURIComponent(persona)}`, { method: 'PUT', body });

  check('Nómina: el propietario fija un pago mensual', (await put(A.app, `u:${yo.id}`, { valor: 2000000, periodicidad: 'mensual', centro_costo: 'Administración' })).status === 200);
  check('Nómina: un profesional se paga por clase', (await put(A.app, `p:${prof.data.id}`, { valor: 50000, periodicidad: 'clase', notas: 'Maquillaje' })).status === 200);
  const n = (await A.app('/api/team/nomina')).data;
  check('Nómina: el total mensual solo suma lo fijo (por clase es variable)', n.rows.length === 2 && n.total_mensual === 2000000, JSON.stringify(n));
  check('Nómina: el personal no ve ni cambia la nómina (403)', (await S.app('/api/team/nomina')).status === 403 && (await put(S.app, `u:${yo.id}`, { valor: 1 })).status === 403);
  check('Nómina: no acepta una persona de otro negocio', (await put(B.app, `u:${yo.id}`, { valor: 1000 })).status === 404 && (await put(B.app, `p:${prof.data.id}`, { valor: 1000 })).status === 404);
  check('Nómina: otro negocio no ve la nómina ajena', (await B.app('/api/team/nomina')).data.rows.length === 0);
  check('Nómina: valor y periodicidad inválidos se rechazan', (await put(A.app, `u:${yo.id}`, { valor: -5 })).status === 400 && (await put(A.app, `u:${yo.id}`, { valor: 1000, periodicidad: 'diaria' })).status === 400);
  check('Nómina: borra el pago de una persona', (await A.app(`/api/team/nomina/${encodeURIComponent(`p:${prof.data.id}`)}`, { method: 'DELETE' })).status === 200 && (await A.app('/api/team/nomina')).data.rows.length === 1);
}
