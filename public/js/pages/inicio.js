// Inicio = el módulo Dashboard de Diwilo Modulos (saludo con la marca, alertas, resúmenes de Finanzas, Marketing…, accesos directos).
// Aquí solo se registra lo PROPIO de la academia, que el Dashboard muestra entre esos resúmenes y los accesos:
// indicadores según los módulos activos y el rol, el calendario de la semana y los últimos 6 meses.
(window.DwDashboard = window.DwDashboard || []).push({
  id: 'academia',
  titulo: 'Tu academia',
  async mount(host, { me }) {
    const { api, esc, empty } = window.App;
    const C = window.App.Crud;
    const FMT = { money: (v) => C.money(v), num: (v) => C.num(v), pct: (v) => (v == null ? '—' : `${v}%`), nota: (v) => (v == null ? '—' : Number(v).toFixed(1)) };
    const tile = (t) => `<${t.ruta ? 'a' : 'div'} class="dw-card dw-kpi ${t.tono ? `dw-kpi--${t.tono}` : ''}" ${t.ruta ? `href="${esc(t.ruta)}"` : ''}><span class="dw-kpi__icon"><i class="bi ${esc(t.icono || 'bi-graph-up')}"></i></span>
      <span><span class="dw-kpi__v d-block">${esc((FMT[t.fmt] || String)(t.valor))}</span><span class="dw-kpi__l d-block">${esc(t.titulo)}</span>${t.detalle ? `<span class="dw-kpi__d d-block">${esc(t.detalle)}</span>` : ''}</span></${t.ruta ? 'a' : 'div'}>`;
    host.innerHTML = `<div class="dw-grid" data-metricas><div class="dw-card placeholder-glow"><span class="placeholder col-8"></span></div></div>
      <section class="mt-4" data-sec-semana hidden><h2 class="h6 mb-3">Esta semana</h2><div data-semana></div></section>
      <section class="mt-4" data-sec-serie hidden><h2 class="h6 mb-3">Últimos 6 meses</h2><div class="dw-card"><div data-serie></div></div></section>`;
    const $ = (s) => host.querySelector(s);

    // 1) indicadores propios de la academia
    api('/api/academia/metricas').then((d) => {
      $('[data-metricas]').innerHTML = d.tiles.length ? d.tiles.map(tile).join('') : `<div class="dw-card" style="grid-column:1/-1">${empty('bi-grid', 'Aún no hay indicadores para mostrar.')}</div>`;
      if (d.serie?.some((x) => x.matriculas || x.recaudo)) {
        $('[data-sec-serie]').hidden = false;
        C.bars($('[data-serie]'), d.serie.map((x) => ({ label: new Date(`${x.mes}-01T12:00:00Z`).toLocaleDateString('es-CO', { month: 'short' }), recaudo: x.recaudo, matriculas: x.matriculas })),
          { a: 'recaudo', b: 'matriculas', la: 'Recaudo', lb: 'Matrículas nuevas', fmt: (v) => (v >= 1000 ? C.money(v) : String(v)), separate: true });
      }
    }).catch((x) => { $('[data-metricas]').innerHTML = `<div class="dw-card text-danger" style="grid-column:1/-1">${esc(x.message)}</div>`; });

    // 2) calendario de la semana (necesita el módulo Cursos)
    if (me.modules.some((m) => m.id === 'cursos')) { $('[data-sec-semana]').hidden = false; window.AC.semana($('[data-semana]')); }
  },
});
