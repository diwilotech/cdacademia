// Inicio: indicadores de la academia (según los módulos activos y el rol), el calendario de la semana y, aparte,
// los resúmenes de los módulos compartidos (Finanzas, Marketing…), que no se mezclan con los indicadores de la academia.
DW.ready.then(async (me) => {
  const { api, esc, kpi, empty } = window.App;
  const C = window.App.Crud;
  const $ = (s) => document.querySelector(s);
  const h = new Date(Date.now() - 5 * 3600000).getUTCHours();
  $('[data-hola]').textContent = `${h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'}, ${(me.user.name || '').split(' ')[0] || 'bienvenido'}`;

  const FMT = { money: (v) => C.money(v), num: (v) => C.num(v), pct: (v) => (v == null ? '—' : `${v}%`), nota: (v) => (v == null ? '—' : Number(v).toFixed(1)) };
  const tile = (t) => `<${t.ruta ? 'a' : 'div'} class="dw-card dw-kpi ${t.tono ? `dw-kpi--${t.tono}` : ''}" ${t.ruta ? `href="${esc(t.ruta)}"` : ''}><span class="dw-kpi__icon"><i class="bi ${esc(t.icono || 'bi-graph-up')}"></i></span>
    <span><span class="dw-kpi__v d-block">${esc((FMT[t.fmt] || String)(t.valor))}</span><span class="dw-kpi__l d-block">${esc(t.titulo)}</span>${t.detalle ? `<span class="dw-kpi__d d-block">${esc(t.detalle)}</span>` : ''}</span></${t.ruta ? 'a' : 'div'}>`;

  // 1) indicadores propios de la academia
  const metricas = $('[data-metricas]');
  api('/api/academia/metricas').then((d) => {
    metricas.innerHTML = d.tiles.length ? d.tiles.map(tile).join('') : `<div class="dw-card" style="grid-column:1/-1">${empty('bi-grid', 'Aún no hay indicadores para mostrar.')}</div>`;
    if (d.serie?.some((x) => x.matriculas || x.recaudo)) {
      $('[data-sec-serie]').hidden = false;
      C.bars($('[data-serie]'), d.serie.map((x) => ({ label: new Date(`${x.mes}-01T12:00:00Z`).toLocaleDateString('es-CO', { month: 'short' }), recaudo: x.recaudo, matriculas: x.matriculas })),
        { a: 'recaudo', b: 'matriculas', la: 'Recaudo', lb: 'Matrículas nuevas', fmt: (v) => (v >= 1000 ? C.money(v) : String(v)), separate: true });
    }
  }).catch((x) => { metricas.innerHTML = `<div class="dw-card text-danger" style="grid-column:1/-1">${esc(x.message)}</div>`; });

  // 2) calendario de la semana (necesita el módulo Cursos)
  if (me.modules.some((m) => m.id === 'cursos')) { $('[data-sec-semana]').hidden = false; AC.semana($('[data-semana]')); }

  // 3) resúmenes de los módulos compartidos
  const widgets = me.modules.filter((m) => m.tipo === 'compartido').flatMap((m) => (m.widgets || []).map((w) => ({ ...w, modulo: m })));
  if (widgets.length) {
    $('[data-sec-otros]').hidden = false;
    const cards = await Promise.all(widgets.map((w) => api(w.api).then((d) => kpi({ ruta: w.modulo.ruta, icono: w.modulo.icono, ...d }))
      .catch(() => kpi({ titulo: w.modulo.nombre, valor: '—', detalle: 'No se pudo cargar', icono: 'bi-exclamation-circle' }))));
    $('[data-widgets]').innerHTML = cards.join('');
  }
});
