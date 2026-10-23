// Inicio del estudiante (rol 'estudiante', nivel 'alumno'): solo ve lo suyo, nunca el panel del equipo.
//   GET /api/alumno/inicio                 sus cursos (avance, próxima clase, cuenta regresiva), cuotas y avisos
//   GET /api/alumno/calendario?desde=&hasta=   clases de sus cursos y reposiciones agendadas del rango
//   GET /api/alumno/curso/:id              seguimiento de una matrícula: clases con asistencia, notas
import { json, HttpError } from '../lib/http.js';
import { activeModuleIds } from '../lib/modules.js';
import { all, one, today, addDays, DATE } from '../lib/crud.js';
import { getConfig, resumenAsis, resumenNotas, estadoAcad, estadoCuotas, enSesion } from '../lib/academia.js';
import { businessSettings } from './me.js';
import { cuentaDeMatricula, pagosDeFinanzas } from './matriculas.js';
import { finanzasPagina } from '../lib/central.js';
import { comprobantesDe } from './comprobantes.js';

const dias = (desde, hasta) => Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 864e5);
const C = { money: (n) => '$' + Math.round(n || 0).toLocaleString('es-CO') };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Matrículas activas del estudiante con los datos de su curso.
export const matriculas = (c, id) => all(c.env,
  `SELECT i.id, i.curso_id, i.valor, i.descuento, k.nombre AS curso, k.nivel, k.num_clases, k.jornada, a.color, p.nombre AS profesional
     FROM ac_inscripciones i JOIN ac_cursos k ON k.id = i.curso_id AND k.business_id = i.business_id
     LEFT JOIN ac_areas a ON a.id = k.area_id AND a.business_id = k.business_id
     LEFT JOIN ac_profesionales p ON p.id = k.profesional_id AND p.business_id = k.business_id
    WHERE i.business_id = ? AND i.estudiante_id = ? AND i.estado = 'activa' AND k.activo = 1 ORDER BY k.inicio, k.nombre`, c.businessId, id);

export function routes(r) {
  r.get('/api/alumno/inicio', 'alumno', async (c) => {
    const hoy = today(), e = c.estudiante;
    const [cfg, settings, ins] = await Promise.all([getConfig(c.env, c.businessId), businessSettings(c.env, c.businessId), matriculas(c, e.id)]);
    const avisos = [], cursos = [];
    for (const i of ins) {
      const [clases, marcas, notas, evs, repos, cuotas, pag] = await Promise.all([
        all(c.env, 'SELECT n, fecha, ini, fin, tema, virtual FROM ac_clases WHERE business_id = ? AND curso_id = ? AND fecha IS NOT NULL ORDER BY fecha, ini', c.businessId, i.curso_id),
        all(c.env, 'SELECT clase_n, estado FROM ac_asistencia WHERE business_id = ? AND inscripcion_id = ?', c.businessId, i.id),
        all(c.env, 'SELECT evaluacion_id, nota FROM ac_notas WHERE business_id = ? AND inscripcion_id = ?', c.businessId, i.id),
        all(c.env, 'SELECT id, peso FROM ac_evaluaciones WHERE business_id = ? AND curso_id = ?', c.businessId, i.curso_id),
        all(c.env, `SELECT r.clase_n, r.estado, s.fecha, s.ini, s.fin FROM ac_reposiciones r LEFT JOIN ac_espacios s ON s.id = r.espacio_id AND s.business_id = r.business_id
                     WHERE r.business_id = ? AND r.inscripcion_id = ?`, c.businessId, i.id),
        all(c.env, 'SELECT n, etiqueta, vence, valor FROM ac_cuotas WHERE business_id = ? AND inscripcion_id = ? ORDER BY vence, n', c.businessId, i.id),
        one(c.env, "SELECT COALESCE(SUM(valor), 0) s FROM ac_pagos WHERE business_id = ? AND inscripcion_id = ? AND tipo = 'cuota' AND anulado = 0", c.businessId, i.id),
      ]);
      const asis = resumenAsis(marcas, new Set(repos.filter((x) => x.estado === 'hecha').map((x) => x.clase_n)));
      const nts = resumenNotas(notas, evs);
      const total = clases.length || i.num_clases, primera = clases[0]?.fecha || null, ultima = clases[clases.length - 1]?.fecha || null;
      const hechas = clases.filter((x) => x.fecha < hoy).length;
      const proxima = clases.find((x) => x.fecha >= hoy) || null;
      const estado = !primera ? 'sin_fecha' : primera > hoy ? 'por_iniciar' : ultima < hoy ? 'terminado' : 'en_curso';
      const cu = estadoCuotas(cuotas, pag.s), vencidas = cu.filter((x) => x.estado === 'vencida'), sig = cu.find((x) => x.estado !== 'pagada' && x.estado !== 'vencida') || null;
      // Si hoy hay clase: cuántas evaluaciones de esa clase le faltan por presentar
      const pendHoy = proxima && enSesion(proxima) ? (await all(c.env, `SELECT e.id, e.nombre FROM ac_evaluaciones e LEFT JOIN ac_examenes x ON x.evaluacion_id = e.id AND x.inscripcion_id = ? AND x.business_id = e.business_id
        WHERE e.business_id = ? AND e.curso_id = ? AND e.clase_n = ? AND x.enviado_at IS NULL`, i.id, c.businessId, i.curso_id, proxima.n)) : [];
      cursos.push({ id: i.id, clase_hoy: proxima && proxima.fecha === hoy ? { n: proxima.n, ini: proxima.ini, fin: proxima.fin, tema: proxima.tema, pendientes: pendHoy.map((e) => e.nombre) } : null, curso_id: i.curso_id, curso: i.curso, nivel: i.nivel, color: i.color, profesional: i.profesional, jornada: i.jornada,
        inicio: primera, fin: ultima, estado, empieza_en: estado === 'por_iniciar' ? dias(hoy, primera) : null, total_clases: total, hechas, proxima,
        asistencia: { pct: asis.pct, fallas: asis.fallas, por_reponer: asis.por_reponer }, notas: nts, academico: estadoAcad(asis, nts, cfg),
        total_pago: i.valor - i.descuento, pagado: pag.s, saldo: Math.max(0, i.valor - i.descuento - pag.s), vencido: vencidas.reduce((s, x) => s + x.falta, 0), proxima_cuota: sig ? { etiqueta: sig.etiqueta, vence: sig.vence, falta: sig.falta } : null });

      // Avisos (se calculan al abrir; no se guardan)
      if (estado === 'por_iniciar' && dias(hoy, primera) <= 30) avisos.push({ tipo: 'inicio', icono: 'bi-flag', tono: 'info', fecha: primera, texto: `${i.curso} empieza ${dias(hoy, primera) === 1 ? 'mañana' : `en ${dias(hoy, primera)} días`}` });
      if (proxima && proxima.fecha === hoy) avisos.push({ tipo: 'clase', icono: 'bi-journal-bookmark', tono: 'info', fecha: hoy, texto: `Hoy tienes clase de ${i.curso}${proxima.ini ? ` a las ${proxima.ini}` : ''}` });
      for (const e of pendHoy) avisos.push({ tipo: 'evaluacion', icono: 'bi-pencil-square', tono: 'soon', fecha: hoy, texto: `Hoy puedes presentar «${e.nombre}» (${i.curso})` });
      if (proxima && proxima.fecha === addDays(hoy, 1) && estado !== 'por_iniciar') avisos.push({ tipo: 'clase', icono: 'bi-journal-bookmark', tono: 'info', fecha: proxima.fecha, texto: `Mañana tienes clase de ${i.curso}${proxima.ini ? ` a las ${proxima.ini}` : ''}` });
      for (const q of vencidas) avisos.push({ tipo: 'cuota', icono: 'bi-exclamation-circle', tono: 'bad', fecha: q.vence, texto: `Tu cuota de ${i.curso} está vencida (${q.etiqueta || `cuota ${q.n}`})` });
      for (const q of cu.filter((x) => x.estado !== 'pagada' && x.estado !== 'vencida' && dias(hoy, x.vence) <= 7)) avisos.push({ tipo: 'cuota', icono: 'bi-cash-coin', tono: 'soon', fecha: q.vence, texto: `${cap(q.etiqueta || `cuota ${q.n}`)} de ${i.curso} vence ${q.vence === hoy ? 'hoy' : `el ${q.vence}`}` });
      for (const x of repos.filter((y) => y.estado === 'agendada' && y.fecha && y.fecha >= hoy && dias(hoy, y.fecha) <= 7)) avisos.push({ tipo: 'reposicion', icono: 'bi-arrow-repeat', tono: 'info', fecha: x.fecha, texto: `Reposición de ${i.curso} (clase ${x.clase_n}) el ${x.fecha}${x.ini ? ` a las ${x.ini}` : ''}` });
      for (const m of await comprobantesDe(c, i.id)) {
        const dias_ = Math.round((Date.now() - m.created_at) / 864e5);
        if (m.estado === 'pendiente') avisos.push({ tipo: 'comprobante', icono: 'bi-hourglass-split', tono: 'info', fecha: hoy, texto: `Tu comprobante de ${C.money(m.valor)} (${i.curso}) está en revisión` });
        else if (m.estado === 'rechazado' && dias_ <= 14) avisos.push({ tipo: 'comprobante', icono: 'bi-x-circle', tono: 'bad', fecha: hoy, texto: `Tu comprobante de ${C.money(m.valor)} (${i.curso}) no se pudo aprobar: ${m.motivo || 'revísalo y súbelo de nuevo'}` });
        else if (m.estado === 'aprobado' && dias_ <= 7) avisos.push({ tipo: 'comprobante', icono: 'bi-check-circle', tono: 'ok', fecha: hoy, texto: `Pago de ${C.money(m.valor)} confirmado (${i.curso})` });
      }
      if (asis.por_reponer > 0) avisos.push({ tipo: 'reposicion', icono: 'bi-arrow-repeat', tono: 'soon', fecha: hoy, texto: `Tienes ${asis.por_reponer} clase${asis.por_reponer > 1 ? 's' : ''} por reponer en ${i.curso}` });
    }
    avisos.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    return json({ hoy, estudiante: { nombre: e.nombre, termino: cfg.termS }, negocio: { nombre: c.session.business_name, slug: c.session.business_slug }, usuario: { email: c.session.email }, settings, cursos, avisos });
  });

  r.get('/api/alumno/calendario', 'alumno', async (c) => {
    const q = c.url.searchParams;
    const desde = DATE.test(q.get('desde') || '') ? q.get('desde') : today(), hasta = DATE.test(q.get('hasta') || '') ? q.get('hasta') : addDays(desde, 6);
    if (dias(desde, hasta) > 62) throw new HttpError(400, 'El rango es muy largo');
    const [clases, repos] = await Promise.all([
      all(c.env, `SELECT i.id AS matricula_id, k.id AS curso_id, cl.n, cl.fecha, cl.ini, cl.fin, cl.tema, cl.virtual, k.nombre AS curso, k.num_clases, a.color, p.nombre AS profesional, s.estado AS asistencia
        FROM ac_inscripciones i JOIN ac_cursos k ON k.id = i.curso_id AND k.business_id = i.business_id
        JOIN ac_clases cl ON cl.curso_id = k.id AND cl.business_id = k.business_id
        LEFT JOIN ac_areas a ON a.id = k.area_id AND a.business_id = k.business_id LEFT JOIN ac_profesionales p ON p.id = k.profesional_id AND p.business_id = k.business_id
        LEFT JOIN ac_asistencia s ON s.inscripcion_id = i.id AND s.clase_n = cl.n AND s.business_id = i.business_id
        WHERE i.business_id = ? AND i.estudiante_id = ? AND i.estado = 'activa' AND k.activo = 1 AND cl.fecha BETWEEN ? AND ? ORDER BY cl.fecha, cl.ini`, c.businessId, c.estudiante.id, desde, hasta),
      all(c.env, `SELECT i.id AS matricula_id, r.clase_n, r.modo, r.estado, e.fecha, e.ini, e.fin, k.nombre AS curso, a.color
        FROM ac_reposiciones r JOIN ac_inscripciones i ON i.id = r.inscripcion_id AND i.business_id = r.business_id
        JOIN ac_espacios e ON e.id = r.espacio_id AND e.business_id = r.business_id JOIN ac_cursos k ON k.id = i.curso_id AND k.business_id = i.business_id
        LEFT JOIN ac_areas a ON a.id = k.area_id AND a.business_id = k.business_id
        WHERE r.business_id = ? AND i.estudiante_id = ? AND r.estado IN ('agendada','hecha') AND e.fecha BETWEEN ? AND ? ORDER BY e.fecha, e.ini`, c.businessId, c.estudiante.id, desde, hasta),
    ]);
    // Las evaluaciones se manejan por clase: cada clase del calendario dice si tiene examen y cómo va (pendiente, enviado o con nota)
    if (clases.length) {
      const evs = await all(c.env, `SELECT e.id, e.curso_id, e.clase_n, e.nombre, e.tipo, i.id AS matricula_id, x.enviado_at, n.nota FROM ac_evaluaciones e JOIN ac_inscripciones i ON i.curso_id = e.curso_id AND i.business_id = e.business_id
        LEFT JOIN ac_examenes x ON x.evaluacion_id = e.id AND x.inscripcion_id = i.id AND x.business_id = e.business_id LEFT JOIN ac_notas n ON n.evaluacion_id = e.id AND n.inscripcion_id = i.id AND n.business_id = e.business_id
        WHERE e.business_id = ? AND i.estudiante_id = ? AND i.estado = 'activa' AND e.clase_n IS NOT NULL`, c.businessId, c.estudiante.id);
      for (const cl of clases) cl.evaluaciones = evs.filter((e) => e.matricula_id === cl.matricula_id && e.clase_n === cl.n)
        .map((e) => ({ id: e.id, nombre: e.nombre, estado: e.nota != null ? 'nota' : e.enviado_at ? 'enviado' : cl.fecha < today() ? 'vencida' : 'pendiente', nota: e.nota ?? null }));
    }
    return json({ desde, hasta, hoy: today(), clases, reposiciones: repos });
  });

  r.get('/api/alumno/curso/:id', 'alumno', async (c) => {
    const i = (await matriculas(c, c.estudiante.id)).find((m) => m.id === Number(c.params.id));
    if (!i) throw new HttpError(404, 'No encontrado');
    const [cfg, clases, marcas, evs, notas, repos, cuotas, pag, comprobantes] = await Promise.all([
      getConfig(c.env, c.businessId),
      all(c.env, 'SELECT n, fecha, ini, fin, tema, virtual, enlace, grabacion FROM ac_clases WHERE business_id = ? AND curso_id = ? ORDER BY n', c.businessId, i.curso_id),
      all(c.env, 'SELECT clase_n, estado FROM ac_asistencia WHERE business_id = ? AND inscripcion_id = ?', c.businessId, i.id),
      all(c.env, 'SELECT id, nombre, peso, clase_n FROM ac_evaluaciones WHERE business_id = ? AND curso_id = ? ORDER BY id', c.businessId, i.curso_id),
      all(c.env, 'SELECT evaluacion_id, nota FROM ac_notas WHERE business_id = ? AND inscripcion_id = ?', c.businessId, i.id),
      all(c.env, 'SELECT clase_n, estado FROM ac_reposiciones WHERE business_id = ? AND inscripcion_id = ?', c.businessId, i.id),
      all(c.env, 'SELECT n, etiqueta, vence, valor FROM ac_cuotas WHERE business_id = ? AND inscripcion_id = ? ORDER BY vence, n', c.businessId, i.id),
      one(c.env, "SELECT COALESCE(SUM(valor), 0) s FROM ac_pagos WHERE business_id = ? AND inscripcion_id = ? AND tipo = 'cuota' AND anulado = 0", c.businessId, i.id),
      comprobantesDe(c, i.id),
    ]);
    const asis = resumenAsis(marcas, new Set(repos.filter((x) => x.estado === 'hecha').map((x) => x.clase_n))), nts = resumenNotas(notas, evs);
    const enviados = new Set((await all(c.env, 'SELECT evaluacion_id FROM ac_examenes WHERE business_id = ? AND inscripcion_id = ? AND enviado_at IS NOT NULL', c.businessId, i.id)).map((x) => x.evaluacion_id));
    const total = i.valor - i.descuento, saldo = Math.max(0, total - pag.s);
    return json({ matricula: { id: i.id, curso: i.curso, nivel: i.nivel, color: i.color, profesional: i.profesional },
      pagos: { total, pagado: pag.s, saldo, cuotas: estadoCuotas(cuotas, pag.s), comprobantes, finanzas: (await activeModuleIds(c.env, c.businessId)).includes('finanzas') && cfg.cuentaCobro !== false }, hoy: today(), escala: cfg.escala, notaMin: cfg.notaMin, asisMin: cfg.asisMin,
      clases: clases.map((x) => ({ ...x, asistencia: marcas.find((m) => m.clase_n === x.n)?.estado || null, reposicion: repos.find((m) => m.clase_n === x.n)?.estado || null })),
      evaluaciones: evs.map((x) => ({ ...x, nota: notas.find((n) => n.evaluacion_id === x.id)?.nota ?? null, enviado: enviados.has(x.id) })),
      asistencia: asis, notas: nts, academico: estadoAcad(asis, nts, cfg) });
  });

  // Su cuenta de cobro (se actualiza con el plan de cuotas) y sus recibos, tal como están en Finanzas.
  const suya = async (c) => {
    const i = (await matriculas(c, c.estudiante.id)).find((m) => m.id === Number(c.params.id));
    if (!i) throw new HttpError(404, 'No encontrado');
    return i;
  };
  r.get('/api/alumno/curso/:id/cuenta-de-cobro', 'alumno', async (c) => {
    const i = await suya(c);
    const cuenta = await cuentaDeMatricula(c, i.id);
    if (!cuenta) throw new HttpError(409, 'Tu cuenta de cobro aún no está disponible. Escríbele a la academia.');
    return finanzasPagina(c, `/api/finanzas/invoices/${cuenta.id}/pdf`);
  });
  r.get('/api/alumno/curso/:id/recibos', 'alumno', async (c) => {
    const i = await suya(c);
    const { pagos } = await pagosDeFinanzas(c, i.id).catch(() => ({ pagos: [] }));
    return json({ recibos: pagos.filter((p) => p.recibo && !p.anulado).map((p) => ({ num: p.num, recibo: p.recibo, fecha: p.fecha, valor: p.valor, metodo: p.metodo, concepto: p.concepto })) });
  });
  r.get('/api/alumno/curso/:id/recibos/:num', 'alumno', async (c) => {
    const i = await suya(c);
    const p = (await pagosDeFinanzas(c, i.id)).pagos.find((x) => x.num === Number(c.params.num));
    if (!p || !p.recibo_id || p.anulado) throw new HttpError(404, 'Recibo no encontrado');
    return finanzasPagina(c, `/api/finanzas/receipts/${p.recibo_id}/pdf`);
  });
}
