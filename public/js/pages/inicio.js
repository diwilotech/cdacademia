// Inicio (dashboard): cada módulo activo aporta sus widgets (declarados en modulos.app.json / modulo.json),
// ordenados como el menú. Un widget es un GET que devuelve { titulo, valor, detalle?, icono?, ruta? }.
DW.ready.then(async (me) => {
  const { api, esc, kpi, empty } = window.App;
  const h = new Date(Date.now() - 5 * 3600000).getUTCHours();
  document.querySelector('[data-hola]').textContent = `${h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'}, ${(me.user.name || '').split(' ')[0] || 'bienvenido'}`;
  const box = document.querySelector('[data-widgets]');
  const widgets = me.modules.flatMap((m) => (m.widgets || []).map((w) => ({ ...w, modulo: m })));
  if (!widgets.length) { box.outerHTML = `<div class="dw-card">${empty('bi-grid', 'Aún no hay módulos con resumen para mostrar.')}</div>`; return; }
  const cards = await Promise.all(widgets.map((w) => api(w.api).then((d) => kpi({ ruta: w.modulo.ruta, icono: w.modulo.icono, ...d }))
    .catch(() => kpi({ titulo: w.modulo.nombre, valor: '—', detalle: 'No se pudo cargar', icono: 'bi-exclamation-circle' }))));
  box.innerHTML = cards.join('');
});
