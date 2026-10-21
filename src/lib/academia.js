// Lógica académica de CD Academia (igual a la versión anterior del panel, ahora en el Worker):
// festivos de Colombia, sesiones de un curso, plan de cuotas, estado de las cuotas según los pagos,
// asistencia, notas y estado académico, y los datos de la academia (rubro, términos, mínimos, recibo).
import { one } from './crud.js';
import { todayBogota } from './auth.js';

export const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const NIVELES = ['Básico', 'Intermedio', 'Avanzado', 'Profesional'];
export const METODOS = ['Clase magistral', 'Demostración', 'Práctica guiada', 'Práctica en modelo', 'Taller', 'Evaluación teórica', 'Evaluación práctica', 'Virtual'];
export const ASIS = { P: 'Presente', A: 'Ausente', T: 'Llegó tarde', J: 'Excusa' };

/* ---------------- datos de la academia ---------------- */
export const RUBROS = {
  maquillaje: { nombre: 'Maquillaje', s: 'estudiante', p: 'estudiantes' }, barberia: { nombre: 'Barbería', s: 'aprendiz', p: 'aprendices' },
  unas: { nombre: 'Uñas', s: 'alumna', p: 'alumnas' }, idiomas: { nombre: 'Idiomas', s: 'estudiante', p: 'estudiantes' },
  musica: { nombre: 'Música', s: 'alumno', p: 'alumnos' }, cocina: { nombre: 'Cocina', s: 'alumno', p: 'alumnos' }, otro: { nombre: 'Otro', s: 'estudiante', p: 'estudiantes' },
};
export const CONFIG_DEFAULT = {
  rubro: 'otro', termS: 'estudiante', termP: 'estudiantes',
  escala: 5, notaMin: 3, asisMin: 80,
  valorRepo: 0, valorRepoVirtual: 0, horasVirtual: 4,
  recibo: 'ticket', pie: 'Gracias por formarte con nosotros.',
  nit: '', tel: '', dir: '', ig: '', web: '',
  consecutivo: 1,
  cuentaCobro: true,   // al matricular, crear la cuenta por cobrar en Finanzas (los pagos la abonan); apagado = solo recibos de caja sueltos
};
export async function getConfig(env, businessId) {
  const row = await one(env, 'SELECT data FROM ac_config WHERE business_id = ?', businessId);
  let saved = {}; try { saved = JSON.parse(row?.data || '{}'); } catch {}
  return { ...CONFIG_DEFAULT, ...saved };
}

/* ---------------- festivos de Colombia (Ley Emiliani + Semana Santa) ---------------- */
const _fest = {};
export function festivosCO(y) {
  if (_fest[y]) return _fest[y];
  const iso = (d) => d.toISOString().slice(0, 10);
  const D = (m, d) => new Date(Date.UTC(y, m - 1, d));
  const lunes = (d) => { const w = d.getUTCDay(); if (w !== 1) d.setUTCDate(d.getUTCDate() + ((8 - w) % 7)); return d; };
  const mas = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1, pascua = D(mes, dia);
  const lista = [D(1, 1), D(5, 1), D(7, 20), D(8, 7), D(12, 8), D(12, 25),
    lunes(D(1, 6)), lunes(D(3, 19)), lunes(D(6, 29)), lunes(D(8, 15)), lunes(D(10, 12)), lunes(D(11, 1)), lunes(D(11, 11)),
    mas(pascua, -3), mas(pascua, -2), mas(pascua, 43), mas(pascua, 64), mas(pascua, 71)];
  return (_fest[y] = new Set(lista.map(iso)));
}
export const esFestivo = (iso) => festivosCO(+iso.slice(0, 4)).has(iso);

// Fechas y horas de las N clases a partir del horario semanal (cada franja es una clase; salta festivos si aplica).
export function sesiones({ inicio, num_clases, horario, festivos }) {
  const N = Number(num_clases) || 0, slots = Array.isArray(horario) ? horario : [];
  if (!inicio || !slots.length || !N) return Array.from({ length: N }, () => ({ fecha: null, ini: slots[0]?.ini || null, fin: slots[0]?.fin || null }));
  const porDia = {};
  for (const s of slots) (porDia[s.dia] ||= []).push(s);
  Object.values(porDia).forEach((arr) => arr.sort((p, q) => p.ini.localeCompare(q.ini)));
  const out = [];
  const [y, m, d] = inicio.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  for (let guard = 0; out.length < N && guard < 3000; guard++) {
    const iso = t.toISOString().slice(0, 10), del = porDia[t.getUTCDay()];
    if (del && !(festivos && esFestivo(iso))) for (const x of del) if (out.length < N) out.push({ fecha: iso, ini: x.ini, fin: x.fin });
    t.setUTCDate(t.getUTCDate() + 1);
  }
  return out;
}

/* ---------------- cuotas ---------------- */
export function sumarFecha(iso, frecuencia, veces) {
  const [y, m, d] = iso.split('-').map(Number);
  if (frecuencia === 'mensual') {
    const base = new Date(Date.UTC(y, m - 1 + veces, 1));
    const ultimo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
    base.setUTCDate(Math.min(d, ultimo));
    return base.toISOString().slice(0, 10);
  }
  const dias = frecuencia === 'semanal' ? 7 : 15;
  return new Date(Date.UTC(y, m - 1, d + dias * veces)).toISOString().slice(0, 10);
}
// Plan: { inicial, n, frecuencia, primera }. Las cuotas se redondean a miles y la última absorbe la diferencia.
export function generarCuotas(total, plan, fechaInscripcion) {
  const cuotas = []; let resto = Math.max(0, Math.round(total));
  const inicial = Math.min(Math.round(+plan?.inicial || 0), resto);
  if (inicial > 0) { cuotas.push({ n: 0, etiqueta: 'Inicial', vence: fechaInscripcion, valor: inicial }); resto -= inicial; }
  const n = Math.max(1, Math.min(48, Math.round(+plan?.n || 1)));
  if (resto > 0) {
    const base = Math.floor(resto / n / 1000) * 1000;
    for (let k = 0; k < n; k++) {
      const valor = k === n - 1 ? resto - base * (n - 1) : base;
      cuotas.push({ n: k + 1, etiqueta: n === 1 ? 'Pago único' : `Cuota ${k + 1} de ${n}`, vence: sumarFecha(plan?.primera || fechaInscripcion, plan?.frecuencia || 'mensual', k), valor });
    }
  }
  return cuotas;
}
// Estado de cada cuota repartiendo lo pagado en orden de vencimiento.
export function estadoCuotas(cuotas, pagado, hoy = todayBogota()) {
  let disponible = pagado;
  return [...cuotas].sort((a, b) => a.vence.localeCompare(b.vence) || a.n - b.n).map((c) => {
    const abonado = Math.min(c.valor, disponible); disponible -= abonado;
    const falta = c.valor - abonado;
    const estado = falta <= 0 ? 'pagada' : c.vence < hoy ? 'vencida' : c.vence === hoy ? 'hoy' : abonado > 0 ? 'parcial' : 'pendiente';
    return { ...c, abonado, falta, estado, dias_mora: estado === 'vencida' ? Math.round((Date.parse(hoy) - Date.parse(c.vence)) / 864e5) : 0 };
  });
}

/* ---------------- asistencia, notas y estado académico ---------------- */
// Tarde y excusa cuentan como asistida; solo se cuentan clases ya marcadas. Una falla repuesta no cuenta.
export function resumenAsis(marcas, repuestas = new Set()) {
  const m = marcas.filter((x) => x.estado);
  const fallas = m.filter((x) => x.estado === 'A' && !repuestas.has(x.clase_n)).length;
  const porReponer = m.filter((x) => (x.estado === 'A' || x.estado === 'J') && !repuestas.has(x.clase_n)).length;
  return { pct: m.length ? Math.round(((m.length - fallas) / m.length) * 100) : null, fallas, por_reponer: porReponer, marcadas: m.length };
}
// Promedio ponderado de lo evaluado + % del curso ya evaluado.
export function resumenNotas(notas, evaluaciones) {
  let suma = 0, pesos = 0;
  for (const e of evaluaciones) {
    const n = notas.find((x) => x.evaluacion_id === e.id)?.nota;
    if (n !== undefined && n !== null) { suma += n * e.peso; pesos += e.peso; }
  }
  const total = evaluaciones.reduce((a, e) => a + e.peso, 0) || 100;
  return { prom: pesos ? Math.round((suma / pesos) * 100) / 100 : null, evaluado: Math.round((pesos / total) * 100) };
}
export function estadoAcad(asis, notas, cfg) {
  const notaOk = notas.prom === null || notas.prom >= cfg.notaMin, asisOk = asis.pct === null || asis.pct >= cfg.asisMin;
  if (notas.evaluado >= 100) return notaOk && asisOk ? ['ok', 'Aprobó'] : ['bad', 'No aprobó'];
  if (notas.prom === null && asis.pct === null) return ['free', 'Sin datos'];
  if (!notaOk && !asisOk) return ['bad', 'Nota y asistencia'];
  if (!notaOk) return ['bad', 'Nota baja'];
  if (!asisOk) return ['soon', 'Asistencia baja'];
  return ['ok', 'Va bien'];
}

// JSON guardado en una columna de texto (horario, plan, áreas…) con valor por defecto.
export const parse = (txt, fallback) => { try { const v = JSON.parse(txt); return v ?? fallback; } catch { return fallback; } };

// ¿La clase está en sesión ahora? Día de la clase y hora de Colombia entre su inicio y su fin (sin hora: todo el día; sin fin: hasta el final del día).
export const enSesion = (cl) => {
  if (!cl?.fecha) return false;
  const t = new Date(Date.now() - 5 * 3600000).toISOString();
  if (t.slice(0, 10) !== cl.fecha) return false;
  const h = t.slice(11, 16);
  return (!cl.ini || h >= cl.ini) && (!cl.fin || h <= cl.fin);
};
