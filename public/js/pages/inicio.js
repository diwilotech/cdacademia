// Inicio = el módulo Dashboard de Diwilo Modulos (saludo con la marca, alertas, resúmenes de Finanzas, Marketing…, accesos directos).
// Aquí se registra lo PROPIO de la academia: a la izquierda el Asistente IA (abre el chat) y a su lado una tarjeta pequeña por módulo
// (dos filas de cuatro, bajan si son más). Al tocar un módulo, tenga agente o no, se ven sus estadísticas y gráficas; luego va el calendario.
window.DwSinFigura = true;    // sin «Así funciona tu negocio»
window.DwSinAgentes = true;   // la sección de agentes la pinta este archivo
(window.DwDashboard = window.DwDashboard || []).push({
  id: 'academia',
  titulo: 'Tu academia',
  async mount(host, { me }) {
    const { api, esc } = window.App;
    const C = window.App.Crud;
    const FMT = { money: (v) => C.money(v), num: (v) => C.num(v), pct: (v) => (v == null ? '—' : `${v}%`), nota: (v) => (v == null ? '—' : Number(v).toFixed(1)) };
    const BASES = new Set(['dashboard', 'inicio', 'ai', 'marca', 'academia']);
    const COLORES = ['#22D3EE', '#A78BFA', '#34D399', '#FBBF24', '#F472B6', '#FB7185', '#60A5FA', '#A3E635'];
    // indicadores propios (ids de /api/academia/metricas) que corresponden a cada módulo
    const TILES = { estudiantes: ['estudiantes', 'matriculas'], cursos: ['cursos', 'clases_hoy', 'asistencia', 'riesgo', 'notas'], reposiciones: ['reposiciones'], cuotas: ['recaudo', 'por_cobrar', 'vencido'] };
    const mods = me.modules.filter((m) => m.ruta && !m.oculto && !BASES.has(m.id)).map((m, i) => ({ ...m, color: COLORES[i % COLORES.length] }));
    const ia = me.modules.find((m) => m.id === 'ai');
    const ir = (ruta) => { if (ruta) location.href = ruta; };
    let sel = null, met = { tiles: [], serie: [] }, wid = [];

    host.innerHTML = `<style>
        .ac-top{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;margin-bottom:16px}
        @media (min-width:992px){.ac-top{grid-template-columns:minmax(0,4fr) minmax(0,8fr)}}
        .ac-core{--c:#A78BFA;display:flex;flex-direction:column;gap:10px;text-align:left;width:100%;padding:20px;border-radius:16px;border:1px solid color-mix(in srgb,var(--c) 45%,transparent);background:linear-gradient(160deg,color-mix(in srgb,var(--c) 16%,var(--bs-body-bg)),var(--bs-body-bg) 65%);color:inherit;cursor:pointer;transition:transform .12s}
        .ac-core:hover{transform:translateY(-2px)}
        .ac-core .ic{width:64px;height:64px;border-radius:18px;display:grid;place-items:center;font-size:2rem;color:var(--c);background:color-mix(in srgb,var(--c) 15%,transparent);border:1px solid color-mix(in srgb,var(--c) 40%,transparent)}
        .ac-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-content:start}
        @media (min-width:768px){.ac-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
        .ac-mod{--c:var(--dw-p,#6d28d9);display:flex;flex-direction:column;gap:2px;text-align:left;width:100%;padding:12px;border-radius:14px;border:1px solid var(--bs-border-color);background:var(--bs-body-bg);color:inherit;cursor:pointer;transition:transform .12s,border-color .12s,opacity .12s}
        .ac-mod:hover{transform:translateY(-2px);border-color:var(--c)}.ac-mod.on{border-color:var(--c);box-shadow:0 0 0 1px var(--c)}.ac-grid.sel .ac-mod:not(.on){opacity:.5}
        .ac-mod .ic{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;font-size:1.15rem;color:var(--c);background:color-mix(in srgb,var(--c) 15%,transparent);margin-bottom:6px}
        .ac-mod .n{font-weight:600}.ac-mod .v{font-size:.8rem;color:var(--bs-secondary-color)}
        .ac-det{--c:var(--dw-p,#6d28d9);margin-bottom:16px}
        .ac-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px}
        .ac-kpi{display:block;padding:14px;border-radius:14px;border:1px solid var(--bs-border-color);border-top:3px solid var(--c);background:var(--bs-body-bg);color:inherit;text-decoration:none}
        .ac-kpi .v{font-size:1.7rem;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}.ac-kpi .l{font-size:.85rem;color:var(--bs-secondary-color)}.ac-kpi .d{font-size:.78rem;color:var(--bs-secondary-color)}
        @media (prefers-reduced-motion:reduce){.ac-core,.ac-mod{transition:none}}
      </style>
      <div class="ac-top"><div>${ia ? `<button type="button" class="ac-core h-100" data-ia><span class="ic"><i class="bi bi-cpu"></i></span><span><span class="d-block small fw-bold" style="color:var(--c);letter-spacing:.12em">ASISTENTE IA</span><span class="d-block h4 fw-bold mb-1">Pregúntale a tu academia</span><span class="d-block text-body-secondary small">Abre el chat: te responde con los datos de todos tus módulos y hace tareas por ti.</span></span><span class="mt-auto small fw-semibold" style="color:var(--c)">Abrir el chat <i class="bi bi-arrow-right"></i></span></button>` : ''}</div>
        <div class="ac-grid" data-mods></div></div>
      <div data-det></div>
      <section class="mt-4" data-sec-semana hidden><h2 class="h6 mb-3">Esta semana</h2><div data-semana></div></section>`;
    const $ = (s) => host.querySelector(s);

    const indicadores = (m) => {
      const ids = TILES[m.id];
      const propios = ids ? met.tiles.filter((t) => ids.includes(t.id)) : [];
      return propios.length ? propios : wid.filter((w) => w.modulo === m.id).map((w) => ({ titulo: w.titulo, valor: w.valor, detalle: w.detalle, icono: w.icono, ruta: w.ruta }));
    };
    const kpi = (t) => `<${t.ruta ? 'a' : 'div'} class="ac-kpi" ${t.ruta ? `href="${esc(t.ruta)}"` : ''}><div class="l"><i class="bi ${esc(t.icono || 'bi-graph-up')} me-1"></i>${esc(t.titulo)}</div><div class="v">${esc((FMT[t.fmt] || String)(t.valor))}</div>${t.detalle ? `<div class="d">${esc(t.detalle)}</div>` : ''}</${t.ruta ? 'a' : 'div'}>`;

    function pintar() {
      $('[data-mods]').classList.toggle('sel', !!sel);
      $('[data-mods]').innerHTML = mods.map((m) => {
        const p = indicadores(m)[0];
        return `<button type="button" class="ac-mod ${sel === m ? 'on' : ''}" style="--c:${m.color}" data-mod="${esc(m.id)}" aria-pressed="${sel === m}"><span class="ic"><i class="bi ${esc(m.icono || 'bi-grid')}"></i></span><span class="n">${esc(m.nombre)}</span><span class="v">${p ? `${esc((FMT[p.fmt] || String)(p.valor))} · ${esc(String(p.titulo).toLowerCase())}` : 'Ver estadísticas'}</span></button>`;
      }).join('');

      const det = $('[data-det]');
      if (!sel) det.innerHTML = '';
      else {
        const ks = indicadores(sel);
        const serie = sel.id === 'cuotas' || sel.id === 'estudiantes' ? met.serie : null, verSerie = serie?.some((x) => x.matriculas || x.recaudo);
        det.innerHTML = `<div class="dw-card ac-det" style="--c:${sel.color}"><div class="d-flex flex-wrap align-items-center gap-2 mb-3"><h2 class="h6 mb-0 flex-grow-1">Estadísticas · <span style="color:var(--c)">${esc(sel.nombre)}</span></h2><button type="button" class="btn btn-sm btn-outline-secondary" data-abrir>Abrir módulo <i class="bi bi-arrow-right"></i></button></div>
          ${ks.length ? `<div class="ac-kpis">${ks.map(kpi).join('')}</div>` : '<div class="text-body-secondary small">Este módulo aún no tiene indicadores en el Inicio.</div>'}
          ${verSerie ? `<h3 class="h6 mt-4 mb-2">${sel.id === 'cuotas' ? 'Recaudo y matrículas · últimos 6 meses' : 'Matrículas nuevas · últimos 6 meses'}</h3><div data-serie></div>` : ''}</div>`;
        if (verSerie) C.bars(det.querySelector('[data-serie]'), serie.map((x) => ({ label: new Date(`${x.mes}-01T12:00:00Z`).toLocaleDateString('es-CO', { month: 'short' }), recaudo: x.recaudo, matriculas: x.matriculas })),
          { a: 'recaudo', b: 'matriculas', la: 'Recaudo', lb: 'Matrículas nuevas', fmt: (v) => (v >= 1000 ? C.money(v) : String(v)), separate: true });
      }
    }

    host.addEventListener('click', (e) => {
      if (e.target.closest('[data-ia]')) return ir(ia.ruta);
      if (e.target.closest('[data-abrir]')) return ir(sel?.ruta);
      const b = e.target.closest('[data-mod]');
      if (!b) return;
      const m = mods.find((x) => x.id === b.dataset.mod);
      sel = sel === m ? null : m;
      pintar();
    });

    pintar();
    const [m1, w1] = await Promise.all([api('/api/academia/metricas').catch(() => null), api('/api/dashboard').catch(() => null)]);
    if (m1) met = m1;
    if (w1) wid = w1.widgets || [];
    pintar();

    // calendario de la semana (necesita el módulo Cursos)
    if (me.modules.some((m) => m.id === 'cursos')) { $('[data-sec-semana]').hidden = false; window.AC.semana($('[data-semana]')); }
  },
});
