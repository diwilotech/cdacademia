// Herramientas de IA de CD Academia (MCP del negocio). Siempre trabajan sobre c.businessId y con las mismas reglas que la API.
import { ENTITIES as EST } from '../api/estudiantes.js';
import { fichaEstudiante } from '../api/estudiantes.js';
import { cartera, registrarPago } from '../api/cuotas.js';
import { fallas } from '../api/reposiciones.js';
import { crud, all, today } from '../lib/crud.js';
import { Router } from '../router.js';

const est = crud(new Router(), { base: '/ia/estudiantes', modulo: 'estudiantes', entities: EST });

export default [
  {
    name: 'estudiantes.buscar', modulo: 'estudiantes', rol: 'staff', tipo: 'lectura',
    description: 'Busca estudiantes por nombre, documento, teléfono o correo.',
    inputSchema: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'], additionalProperties: false },
    run: async (c, a) => ({ estudiantes: (await est.list(c, 'estudiantes', new URLSearchParams({ q: a.texto, limit: '20' }))).map(({ id, nombre, documento, telefono, email, activo }) => ({ id, nombre, documento, telefono, email, activo })) }),
  },
  {
    name: 'estudiantes.ficha', modulo: 'estudiantes', rol: 'staff', tipo: 'lectura',
    description: 'Ficha de un estudiante: sus matrículas con asistencia, notas, estado académico, saldo y pagos.',
    inputSchema: { type: 'object', properties: { estudiante_id: { type: 'integer' } }, required: ['estudiante_id'], additionalProperties: false },
    run: async (c, a) => {
      const f = await fichaEstudiante(c, a.estudiante_id);
      if (c.role === 'staff') { f.matriculas = f.matriculas.map(({ total, pagado, saldo, vencido, ...m }) => m); delete f.pagos; } // el personal no ve dinero
      return f;
    },
  },
  {
    name: 'estudiantes.crear', modulo: 'estudiantes', rol: 'staff', tipo: 'escritura',
    description: 'Registra un estudiante nuevo.',
    inputSchema: { type: 'object', properties: { nombre: { type: 'string' }, documento: { type: 'string' }, telefono: { type: 'string' }, email: { type: 'string' }, origen: { type: 'string', description: 'Cómo llegó (Instagram, referido…)' } }, required: ['nombre'], additionalProperties: false },
    run: async (c, a) => { return { creado: await est.create(c, 'estudiantes', a) }; },
  },
  {
    name: 'cuotas.cartera', modulo: 'cuotas', rol: 'admin', tipo: 'lectura',
    description: 'Cuotas vencidas, que vencen hoy o pendientes, con estudiante, teléfono, curso, valor que falta y días de mora.',
    inputSchema: { type: 'object', properties: { estado: { type: 'string', enum: ['vencida', 'hoy', 'pendientes'], description: 'Por defecto vencida' } }, additionalProperties: false },
    run: async (c, a) => {
      const rows = (await cartera(c)).filter((q) => q.falta > 0 && (a.estado === 'pendientes' || q.estado === (a.estado || 'vencida')));
      return { total: rows.reduce((s, q) => s + q.falta, 0), cuotas: rows.slice(0, 100).map(({ inscripcion_id, estudiante, telefono, curso, etiqueta, vence, falta, dias_mora }) => ({ inscripcion_id, estudiante, telefono, curso, etiqueta, vence, falta, dias_mora })) };
    },
  },
  {
    name: 'cuotas.registrar_pago', modulo: 'cuotas', rol: 'admin', tipo: 'escritura',
    description: 'Registra un pago de cuotas de una matrícula (se reparte solo entre las cuotas en orden) y genera el número de recibo.',
    inputSchema: { type: 'object', properties: { inscripcion_id: { type: 'integer', description: 'Id de la matrícula (sale de estudiantes_ficha o cuotas_cartera)' }, valor: { type: 'number', description: 'Pesos colombianos' },
      metodo: { type: 'string', enum: ['Efectivo', 'Transferencia', 'Nequi', 'Daviplata', 'Tarjeta', 'Bre-B', 'Otro'] }, fecha: { type: 'string', description: 'AAAA-MM-DD (por defecto hoy)' } }, required: ['inscripcion_id', 'valor'], additionalProperties: false },
    run: async (c, a) => { const p = await registrarPago(c, a); return { recibo: p.num, id: p.id }; },
  },
  {
    name: 'cursos.clases_de_hoy', modulo: 'cursos', rol: 'staff', tipo: 'lectura',
    description: 'Clases programadas en una fecha (por defecto hoy) con curso, hora, tema y profesional.',
    inputSchema: { type: 'object', properties: { fecha: { type: 'string', description: 'AAAA-MM-DD' } }, additionalProperties: false },
    run: async (c, a) => ({ fecha: a.fecha || today(), clases: await all(c.env, `SELECT cl.n, cl.ini, cl.fin, cl.tema, k.nombre AS curso, p.nombre AS profesional FROM ac_clases cl
      JOIN ac_cursos k ON k.id = cl.curso_id AND k.business_id = cl.business_id LEFT JOIN ac_profesionales p ON p.id = k.profesional_id AND p.business_id = k.business_id
      WHERE cl.business_id = ? AND cl.fecha = ? AND k.activo = 1 ORDER BY cl.ini`, c.businessId, a.fecha || today()) }),
  },
  {
    name: 'reposiciones.pendientes', modulo: 'reposiciones', rol: 'staff', tipo: 'lectura',
    description: 'Fallas (ausencias o excusas) que aún no se han repuesto, con estudiante, curso, clase y si ya está agendada.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (c) => ({ fallas: (await fallas(c)).filter((x) => x.estado !== 'hecha').slice(0, 100)
      .map(({ estudiante, telefono, curso, clase_n, clase_fecha, tema, estado, espacio_fecha, espacio_ini }) => ({ estudiante, telefono, curso, clase_n, clase_fecha, tema, estado, espacio_fecha, espacio_ini })) }),
  },
];
