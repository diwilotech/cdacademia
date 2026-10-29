// Inicio = el módulo Dashboard de Diwilo Modulos (saludo con la marca, alertas, resúmenes de Finanzas, Marketing…, accesos directos).
// Aquí solo se registra lo PROPIO de la academia: una tarjeta por área (Estudiantes, Cursos, Reposiciones, Pagos); al tocarla se ven
// sus indicadores y sus gráficas (recaudo y matrículas de los últimos 6 meses, calendario de la semana). Sin selección: todos los indicadores y el calendario.
window.DwSinFigura = true;   // sin «Así funciona tu negocio» en la academia
(window.DwDashboard = window.DwDashboard || []).push({
  id: 'academia',
  titulo: 'Tu academia',
  async mount(host, { me }) {
    const { api, esc, empty } = window.App;
    const C = window.App.Crud;
    const FMT = { money: (v) => C.money(v), num: (v) => C.num(v), pct: (v) => (v == null ? '—' : `${v}%`), nota: (v) => (v == null ? '—' : Number(v).toFixed(1)) };
    const tile = (t) => `<${t.ruta ? 'a' : 'div'} class="dw-card dw-kpi ${t.tono ? `dw-kpi--${t.tono}` : ''}" ${t.ruta ? `href="${esc(t.ruta)}"` : ''}><span class="dw-kpi__icon"><i class="bi ${esc(t.icono || 'bi-graph-up')}"></i></span>
      <span><span class="dw-kpi__v d-block">${esc((FMT[t.fmt] || String)(t.valor))}</span><span class="dw-kpi__l d-block">${esc(t.titulo)}</span>${t.detalle ? `<span class="dw-kpi__d d-block">${esc(t.detalle)}</span>` : ''}</span></${t.ruta ? 'a' : 'div'}>`;

    // Áreas: qué indicadores (ids de /api/academia/metricas) y qué gráficas lleva cada una
    const AREAS = [
      { id: 'estudiantes', nombre: 'Estudiantes', icono: 'bi-people', color: '#22D3EE', tiles: ['estudiantes', 'matriculas'], serie: 'matriculas' },
      { id: 'cursos', nombre: 'Cursos', icono: 'bi-mortarboard', color: '#A78BFA', tiles: ['cursos', 'clases_hoy', 'asistencia', 'riesgo', 'notas'], semana: true },
      { id: 'reposiciones', nombre: 'Reposiciones', icono: 'bi-arrow-repeat', color: '#F472B6', tiles: ['reposiciones'] },
      { id: 'pagos', nombre: 'Pagos', icono: 'bi-cash-stack', color: '#34D399', tiles: ['recaudo', 'por_cobrar', 'vencido'], serie: 'recaudo' },
    ];
    const hayCursos = me.modules.some((m) => m.id === 'cursos');
    let datos = null, sel = null;

    host.innerHTML = `<style>
        .ac-areas{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:10px;margin-bottom:16px}
        .ac-area{--c:var(--dw-p,#6d28d9);display:flex;flex-direction:column;gap:2px;text-align:left;width:100%;padding:12px;border-radius:14px;border:1px solid var(--bs-border-color);background:var(--bs-body-bg);color:inherit;cursor:pointer;transition:transform .12s,border-color .12s,opacity .12s}
        .ac-area:hover{transform:translateY(-2px);border-color:var(--c)}.ac-area.on{border-color:var(--c);box-shadow:0 0 0 1px var(--c)}.ac-areas.sel .ac-area:not(.on){opacity:.5}
        .ac-area .ic{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;font-size:1.15rem;color:var(--c);background:color-mix(in srgb,var(--c) 15%,transparent);margin-bottom:6px}
        .ac-area .n{font-weight:600}.ac-area .v{font-size:.8rem;color:var(--bs-secondary-color)}
        @media (prefers-reduced-motion:reduce){.ac-area{transition:none}}
      </style>
      <div class="ac-areas" data-areas></div>
      <div class="dw-grid" data-metricas><div class="dw-card placeholder-glow"><span class="placeholder col-8"></span></div></div>
      <section class="mt-4" data-sec-serie hidden><h2 class="h6 mb-3" data-serie-t></h2><div class="dw-card"><div data-serie></div></div></section>
      <section class="mt-4" data-sec-semana hidden><h2 class="h6 mb-3">Esta semana</h2><div data-semana></div></section>`;
    const $ = (s) => host.querySelector(s);

    const visibles = () => (datos ? datos.tiles : []).filter((t) => !sel || sel.tiles.includes(t.id));
    function pintar() {
      const hay = (a) => datos.tiles.some((t) => a.tiles.includes(t.id));
      const areas = AREAS.filter(hay);
      $('[data-areas]').classList.toggle('sel', !!sel);
      $('[data-areas]').innerHTML = areas.map((a) => {
        const ts = datos.tiles.filter((t) => a.tiles.includes(t.id)), p = ts[0];
        return `<button type="button" class="ac-area ${sel === a ? 'on' : ''}" style="--c:${a.color}" data-area="${a.id}" aria-pressed="${sel === a}"><span class="ic"><i class="bi ${a.icono}"></i></span><span class="n">${a.nombre}</span><span class="v">${p ? `${esc((FMT[p.fmt] || String)(p.valor))} · ${esc(p.titulo.toLowerCase())}` : ''}</span></button>`;
      }).join('');
      const v = visibles();
      $('[data-metricas]').innerHTML = v.length ? v.map(tile).join('') : `<div class="dw-card" style="grid-column:1/-1">${empty('bi-grid', 'Aún no hay indicadores para mostrar.')}</div>`;
      // gráfica de 6 meses: solo al elegir Pagos o Estudiantes
      const ser = datos.serie, ver = sel?.serie && ser?.some((x) => x.matriculas || x.recaudo);
      $('[data-sec-serie]').hidden = !ver;
      if (ver) {
        const rows = ser.map((x) => ({ label: new Date(`${x.mes}-01T12:00:00Z`).toLocaleDateString('es-CO', { month: 'short' }), recaudo: x.recaudo, matriculas: x.matriculas }));
        $('[data-serie-t]').textContent = sel.serie === 'recaudo' ? 'Recaudo y matrículas · 6 meses' : 'Matrículas nuevas · 6 meses';
        C.bars($('[data-serie]'), rows, { a: 'recaudo', b: 'matriculas', la: 'Recaudo', lb: 'Matrículas nuevas', fmt: (x) => (x >= 1000 ? C.money(x) : String(x)), separate: true });
      }
      // calendario de la semana: sin selección o con Cursos
      const sem = hayCursos && (!sel || sel.semana);
      $('[data-sec-semana]').hidden = !sem;
      if (sem && !$('[data-semana]').childElementCount) window.AC.semana($('[data-semana]'));
    }

    host.addEventListener('click', (e) => {
      const b = e.target.closest('[data-area]');
      if (!b || !datos) return;
      const a = AREAS.find((x) => x.id === b.dataset.area);
      sel = sel === a ? null : a;
      pintar();
    });

    api('/api/academia/metricas').then((d) => { datos = d; pintar(); })
      .catch((x) => { $('[data-metricas]').innerHTML = `<div class="dw-card text-danger" style="grid-column:1/-1">${esc(x.message)}</div>`; });
  },
});
