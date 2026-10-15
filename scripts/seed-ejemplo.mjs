// Llena la base LOCAL con una academia de ejemplo: áreas, docentes, cursos, estudiantes, matrículas, pagos, asistencia, notas y reposiciones.
// Uso: npm run db:migrate:local && node scripts/seed-ejemplo.mjs   (deja la app en http://localhost:8799 hasta Ctrl+C)
// Entra con el correo y la clave que imprime al final. Nunca toca la base remota.
import { startApp, newBusiness, APP, TS_TOKEN } from './test-helpers.mjs';

await startApp();

const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
const suma = (f, d) => new Date(Date.parse(f) + d * 86400000).toISOString().slice(0, 10);

const A = await newBusiness('Academia Ejemplo', { login: true });
const api = async (path, method, body) => {
  const r = await A.app(path, { method, body });
  if (r.status >= 300) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
};

await api('/api/academia/config', 'PUT', { rubro: 'maquillaje', valorRepo: 30000, consecutivo: 1, nit: '900.123.456-7' });

const mak = await api('/api/academia/areas', 'POST', { nombre: 'Maquillaje' });
const cej = await api('/api/academia/areas', 'POST', { nombre: 'Cejas y pestañas' });
const bar = await api('/api/academia/areas', 'POST', { nombre: 'Barbería' });

const h = (dia, ini, fin) => ({ dia, ini, fin });
const pLaura = await api('/api/profesionales/profesionales', 'POST', { nombre: 'Laura Mendoza', telefono: '3001110001', areas: [{ area_id: mak.id, niveles: ['Básico', 'Avanzado'], reponer: true }], horario: [h(1, '08:00', '12:00'), h(3, '08:00', '12:00'), h(6, '09:00', '13:00')] });
const pCamila = await api('/api/profesionales/profesionales', 'POST', { nombre: 'Camila Ríos', telefono: '3001110002', areas: [{ area_id: cej.id, niveles: ['Básico'], reponer: true }], horario: [h(2, '14:00', '18:00'), h(4, '14:00', '18:00')] });
const pAndres = await api('/api/profesionales/profesionales', 'POST', { nombre: 'Andrés Salazar', telefono: '3001110003', areas: [{ area_id: bar.id, niveles: ['Básico'], reponer: true }], horario: [h(5, '09:00', '13:00')] });

const cursoAuto = await api('/api/cursos/cursos', 'POST', { nombre: 'Automaquillaje', area_id: mak.id, profesional_id: pLaura.id, nivel: 'Básico', jornada: 'Noche', precio: 1000000, inicio: '2026-09-07', num_clases: 10, festivos: true, horario: [h(1, '18:00', '20:00'), h(3, '18:00', '20:00')] });
const cursoCejas = await api('/api/cursos/cursos', 'POST', { nombre: 'Diseño de cejas y pestañas', area_id: cej.id, profesional_id: pCamila.id, nivel: 'Básico', jornada: 'Tarde', precio: 800000, inicio: '2026-10-06', num_clases: 8, festivos: true, horario: [h(2, '14:00', '17:00'), h(4, '14:00', '17:00')] });
const cursoBarba = await api('/api/cursos/cursos', 'POST', { nombre: 'Barbería profesional', area_id: bar.id, profesional_id: pAndres.id, nivel: 'Básico', jornada: 'Mañana', precio: 1200000, inicio: '2026-11-06', num_clases: 12, festivos: true, horario: [h(5, '09:00', '13:00')] });

const evAuto = [];
for (const [nombre, peso] of [['Teórico', 30], ['Práctica en modelo', 40], ['Final', 30]]) evAuto.push(await api('/api/cursos/evaluaciones', 'POST', { curso_id: cursoAuto.id, nombre, peso }));
const evCejas = [];
for (const [nombre, peso] of [['Diseño de cejas', 50], ['Final', 50]]) evCejas.push(await api('/api/cursos/evaluaciones', 'POST', { curso_id: cursoCejas.id, nombre, peso }));

await api('/api/cursos/cupones', 'POST', { curso_id: cursoAuto.id, codigo: 'AMIGA10', tipo: 'pct', valor: 10, max: 5 });
await api('/api/cursos/cupones', 'POST', { curso_id: cursoCejas.id, codigo: 'BECA100', tipo: 'valor', valor: 100000, max: 3 });

const nombres = [
  ['Ana Pérez', '1001', '3001234501'], ['Bea Gómez', '1002', '3001234502'], ['Carolina Torres', '1003', '3001234503'], ['Daniela Ruiz', '1004', '3001234504'],
  ['Elena Castro', '1005', '3001234505'], ['Felipe Vargas', '1006', '3001234506'], ['Gabriela Soto', '1007', '3001234507'], ['Hugo Medina', '1008', '3001234508'],
];
const est = [];
for (const [nombre, documento, telefono] of nombres) est.push(await api('/api/estudiantes/estudiantes', 'POST', { nombre, documento, telefono, email: `${nombre.split(' ')[0].toLowerCase()}@ejemplo.com`, origen: 'Instagram' }));

const mat = async (e, curso, extra = {}) => api('/api/matriculas', 'POST', { estudiante_id: est[e].id, curso_id: curso.id, fecha: suma(hoy, -40), ...extra });
const m = {
  ana: await mat(0, cursoAuto, { cupon: 'AMIGA10', plan: { inicial: 200000, n: 3, frecuencia: 'mensual', primera: suma(hoy, -10) } }),
  bea: await mat(1, cursoAuto, { plan: { inicial: 300000, n: 2, frecuencia: 'quincenal', primera: suma(hoy, -20) } }),
  carolina: await mat(2, cursoAuto, { plan: { n: 1 } }),
  daniela: await mat(3, cursoAuto, { plan: { inicial: 250000, n: 3, frecuencia: 'mensual', primera: suma(hoy, 5) } }),
  elena: await mat(4, cursoCejas, { fecha: suma(hoy, -10), cupon: 'BECA100', plan: { inicial: 200000, n: 2, frecuencia: 'mensual', primera: suma(hoy, 20) } }),
  felipe: await mat(5, cursoCejas, { fecha: suma(hoy, -9), plan: { inicial: 200000, n: 3, frecuencia: 'quincenal', primera: suma(hoy, 6) } }),
  gabriela: await mat(6, cursoBarba, { fecha: suma(hoy, -3), plan: { inicial: 300000, n: 3, frecuencia: 'mensual', primera: suma(hoy, 25) } }),
  ana2: await mat(0, cursoCejas, { fecha: suma(hoy, -8), plan: { inicial: 300000, n: 2, frecuencia: 'mensual', primera: suma(hoy, 22) } }),
  hugo: await mat(7, cursoBarba, { fecha: suma(hoy, -1), plan: { n: 1 } }),
};

// Pagos: unos al día, otros con saldo y otros con cuotas vencidas (Bea y Daniela)
const pago = (mt, valor, metodo, dias = 0) => api('/api/cuotas/pagos', 'POST', { inscripcion_id: mt.id, valor, metodo, fecha: suma(hoy, -dias) });
await pago(m.ana, 500000, 'Nequi', 30);
await pago(m.ana, 200000, 'Transferencia', 8);
await pago(m.bea, 300000, 'Efectivo', 38);
await pago(m.carolina, 1000000, 'Transferencia', 35);
await pago(m.daniela, 250000, 'Nequi', 38);
await pago(m.elena, 200000, 'Efectivo', 10);
await pago(m.felipe, 200000, 'Nequi', 9);
await pago(m.felipe, 150000, 'Efectivo', 2);
await pago(m.gabriela, 300000, 'Transferencia', 3);
await pago(m.hugo, 1200000, 'Transferencia', 1);
await pago(m.ana2, 300000, 'Nequi', 8);

// Asistencia y notas de lo que ya pasó
const pasadas = async (curso) => (await api(`/api/cursos/${curso.id}/detalle`, 'GET')).clases.filter((c) => c.fecha < hoy);
const patron = { ana: 'PPPPPPPPPP', bea: 'PPATPAPPPP', carolina: 'PPPPPJPPPP', daniela: 'APAPPPAPPP' };
const clasesAuto = await pasadas(cursoAuto);
for (const c of clasesAuto) {
  const marcas = Object.entries(patron).map(([k, p]) => ({ inscripcion_id: m[k].id, estado: p[c.n - 1] || 'P' }));
  await api(`/api/cursos/${cursoAuto.id}/asistencia`, 'POST', { clase_n: c.n, marcas });
}
const notasAuto = [[4.5, 4.0, 3.8, 3.5], [4.0, 4.5, 3.0, 4.2], [3.5, 3.8, 4.1, 4.4]];
for (const [i, ev] of evAuto.entries()) {
  const ks = ['ana', 'bea', 'carolina', 'daniela'];
  await api(`/api/cursos/${cursoAuto.id}/notas`, 'POST', { evaluacion_id: ev.id, notas: ks.map((k, j) => ({ inscripcion_id: m[k].id, nota: notasAuto[i][j] })) });
}
for (const c of await pasadas(cursoCejas)) {
  await api(`/api/cursos/${cursoCejas.id}/asistencia`, 'POST', { clase_n: c.n, marcas: [{ inscripcion_id: m.elena.id, estado: 'P' }, { inscripcion_id: m.felipe.id, estado: c.n === 2 ? 'A' : 'P' }, { inscripcion_id: m.ana2.id, estado: 'P' }] });
}
await api(`/api/cursos/${cursoCejas.id}/notas`, 'POST', { evaluacion_id: evCejas[0].id, notas: [{ inscripcion_id: m.elena.id, nota: 4.8 }, { inscripcion_id: m.felipe.id, nota: 3.9 }, { inscripcion_id: m.ana2.id, nota: 4.3 }] });

// Reposiciones: espacio con cupos, una agendada y cobrada, el resto pendientes por las ausencias
const esp = await api('/api/reposiciones/espacios', 'POST', { fecha: suma(hoy, 3), ini: '09:00', fin: '11:00', profesional_id: pLaura.id, area_id: mak.id, cupos: 3 });
const pend = (await api('/api/reposiciones', 'GET')).rows || [];
const deBea = pend.find((r) => r.inscripcion_id === m.bea.id);
if (deBea) {
  const ag = await api('/api/reposiciones', 'POST', { inscripcion_id: m.bea.id, clase_n: deBea.clase_n, espacio_id: esp.id });
  await api(`/api/reposiciones/${ag.id}/cobrar`, 'POST', { metodo: 'Efectivo' });
}

console.log(`\n✓ Academia de ejemplo lista: 3 áreas, 3 docentes, 3 cursos, ${est.length} estudiantes, ${Object.keys(m).length} matrículas.`);
console.log(`  Abre ${APP}/  ·  correo: ${A.mail}  ·  clave: clave-segura-1  (Turnstile de prueba: ${TS_TOKEN})`);
console.log('  Ctrl+C para detener la app local.');
setInterval(() => {}, 1 << 30);
