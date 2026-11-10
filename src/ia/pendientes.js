// Pendientes de la academia para la IA proactiva (botón «IA Diwilo» → «Lo de hoy»). Los pide el módulo central de IA por ctx.propias.pendientes()
// (src/lib/central.js) y los muestra junto a las alertas de Finanzas, Marketing y Mensajes. Sin IA: son consultas a la base.
// Cada uno: { id, nivel: mala|aviso|info, icono, texto, ruta, pregunta } — `pregunta` es lo que la persona le pediría a la IA para atenderlo.
import { cartera } from '../api/cuotas.js';
import { fallas } from '../api/reposiciones.js';
import { all, one, today } from '../lib/crud.js';

const peso = (n) => `$${Math.round(n || 0).toLocaleString('es-CO')}`;
const pl = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export async function pendientesDe(c, activos, alcanza) {
  const out = [], seguro = async (f) => { try { await f(); } catch (e) { console.error('pendientes', e.message); } };
  const tiene = (m, rol = 'staff') => activos.has(m) && alcanza(rol);
  if (tiene('cuotas', 'admin')) {
    await seguro(async () => {
      const venc = (await cartera(c)).filter((q) => q.estado === 'vencida');
      if (venc.length) out.push({ id: 'ac-cuotas', nivel: 'mala', icono: 'bi-calendar-x', texto: `${pl(venc.length, 'cuota vencida', 'cuotas vencidas')} por ${peso(venc.reduce((s, q) => s + q.falta, 0))}`, ruta: '/staff/cuotas.html', pregunta: '¿A quién le cobro primero y qué le digo?' });
    });
    await seguro(async () => {
      const n = (await one(c.env, "SELECT COUNT(*) n FROM ac_comprobantes WHERE business_id = ? AND estado = 'pendiente'", c.businessId)).n;
      if (n) out.push({ id: 'ac-comprobantes', nivel: 'aviso', icono: 'bi-receipt', texto: `${pl(n, 'comprobante de pago espera', 'comprobantes de pago esperan')} revisión`, ruta: '/staff/estudiantes.html', pregunta: 'Muéstrame los comprobantes por revisar' });
    });
  }
  if (tiene('reposiciones')) await seguro(async () => {
    const n = (await fallas(c)).filter((x) => x.estado === 'pendiente').length;
    if (n) out.push({ id: 'ac-reposiciones', nivel: 'aviso', icono: 'bi-arrow-repeat', texto: pl(n, 'falla sin reposición agendada', 'fallas sin reposición agendada'), ruta: '/staff/reposiciones.html', pregunta: '¿A quién le agendo reposición primero?' });
  });
  if (tiene('cursos')) await seguro(async () => {
    const h = await all(c.env, `SELECT cl.ini, k.nombre FROM ac_clases cl JOIN ac_cursos k ON k.id = cl.curso_id AND k.business_id = cl.business_id
      WHERE cl.business_id = ? AND cl.fecha = ? AND k.activo = 1 ORDER BY cl.ini`, c.businessId, today());
    if (h.length) out.push({ id: 'ac-clases', nivel: 'info', icono: 'bi-journal-bookmark', texto: `Hoy hay ${pl(h.length, 'clase', 'clases')}: ${h.slice(0, 2).map((x) => `${x.ini || ''} ${x.nombre}`.trim()).join(' · ')}`, ruta: '/staff/cursos.html', pregunta: '¿Qué clases hay hoy y quién falta por pagar?' });
  });
  return out;
}
