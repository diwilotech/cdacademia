// Inicio = el módulo Dashboard de Diwilo Modulos (saludo con la marca, alertas, resúmenes de Finanzas, Marketing…, accesos directos).
// Aquí se registra lo PROPIO de la academia: a la izquierda el Asistente IA (abre el chat) y a su lado una tarjeta pequeña por módulo
// (dos filas de cuatro, bajan si son más). Al tocar un módulo, tenga agente o no, se ven sus estadísticas y gráficas; luego va el calendario.
window.DwSinFigura = true;    // sin «Así funciona tu negocio»
window.DwSinComoVa = true;    // sin las tarjetas de «Cómo va»
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
    // gráficas por módulo (claves de /api/academia/graficas): serie = columnas de 6 meses, rank = barras por grupo
    const GRAFICAS = {
      estudiantes: [{ k: 'estudiantes_mes', t: 'Estudiantes nuevos', s: 'Últimos 6 meses' }, { k: 'matriculas_mes', t: 'Matrículas nuevas', s: 'Últimos 6 meses' }, { k: 'matriculas_estado', t: 'Matrículas por estado', s: 'Todas', tipo: 'rank' }],
      cursos: [{ k: 'asistencia_mes', t: 'Asistencia', s: 'Por mes', fmt: 'pct' }, { k: 'clases_mes', t: 'Clases programadas', s: 'Por mes' }, { k: 'por_curso', t: 'Estudiantes por curso', s: 'Matrículas activas', tipo: 'rank' }, { k: 'notas_curso', t: 'Promedio de notas', s: 'Por curso', tipo: 'rank' }],
      reposiciones: [{ k: 'repos_estado', t: 'Reposiciones por estado', s: 'Todas', tipo: 'rank' }],
      cuotas: [{ k: 'recaudo_mes', t: 'Recaudo', s: 'Últimos 6 meses', fmt: 'money' }, { k: 'cartera_estado', t: 'Por cobrar', s: 'Vencida y por vencer', tipo: 'rank', fmt: 'money' }, { k: 'cartera_curso', t: 'Por cobrar por curso', s: 'Mayores saldos', tipo: 'rank', fmt: 'money' }],
    };
    const ir = (ruta) => { if (ruta) location.href = ruta; };
    let sel = null, met = { tiles: [], serie: [] }, wid = [], gr = {}, AG = { agentes: [] };
    const puedeCrear = me.role === 'owner' || me.role === 'admin';
    const hace = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
    const agenteDe = (m) => AG.agentes.find((a) => a.herramientas.length && a.herramientas.filter((n) => n.startsWith(`${m.id}.`)).length * 2 > a.herramientas.length) || null;

    host.innerHTML = `<style>
        .ac-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:16px}
        .ac-core{grid-column:1/-1}
        @media (min-width:992px){.ac-grid{grid-template-columns:repeat(5,minmax(0,1fr))}.ac-core{grid-column:span 2;grid-row:span 2}}
        .ac-core{--c:#A78BFA;display:flex;flex-direction:column;gap:10px;text-align:left;width:100%;padding:20px;border-radius:16px;border:1px solid color-mix(in srgb,var(--c) 45%,transparent);background:linear-gradient(160deg,color-mix(in srgb,var(--c) 16%,var(--bs-body-bg)),var(--bs-body-bg) 65%);color:inherit;cursor:pointer;transition:transform .12s}
        .ac-core:hover{transform:translateY(-2px)}
        .ac-core .ic{width:64px;height:64px;border-radius:18px;display:grid;place-items:center;font-size:2rem;color:var(--c);background:color-mix(in srgb,var(--c) 15%,transparent);border:1px solid color-mix(in srgb,var(--c) 40%,transparent)}
        .ac-mod{--c:var(--dw-p,#6d28d9);display:flex;flex-direction:column;gap:2px;text-align:left;width:100%;padding:12px;border-radius:14px;border:1px solid var(--bs-border-color);background:var(--bs-body-bg);color:inherit;cursor:pointer;transition:transform .12s,border-color .12s,opacity .12s}
        .ac-mod:hover{transform:translateY(-2px);border-color:var(--c)}.ac-mod.on{border-color:var(--c);box-shadow:0 0 0 1px var(--c)}.ac-grid.sel .ac-mod:not(.on){opacity:.5}
        .ac-mod .ic{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;font-size:1.15rem;color:var(--c);background:color-mix(in srgb,var(--c) 15%,transparent);margin-bottom:6px}
        .ac-mod .n{font-weight:600}.ac-mod .v{font-size:.8rem;color:var(--bs-secondary-color)}
        .ac-det{--c:var(--dw-p,#6d28d9);margin-bottom:16px}
        .ac-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px}
        .ac-kpi{display:block;padding:14px;border-radius:14px;border:1px solid var(--bs-border-color);border-top:3px solid var(--c);background:var(--bs-body-bg);color:inherit;text-decoration:none}
        .ac-kpi .v{font-size:1.7rem;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}.ac-kpi .l{font-size:.85rem;color:var(--bs-secondary-color)}.ac-kpi .d{font-size:.78rem;color:var(--bs-secondary-color)}
        .ac-charts{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-top:16px}
        .ac-ch{padding:14px;border-radius:14px;border:1px solid var(--bs-border-color)}
        .ac-cols{display:flex;align-items:flex-end;gap:8px;height:130px}.ac-cols>div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;min-width:0}
        .ac-cols i{display:block;width:100%;max-width:36px;border-radius:6px 6px 3px 3px;background:var(--c)}.ac-cols small{font-size:.7rem;color:var(--bs-secondary-color);white-space:nowrap}
        .ac-ag{padding:14px;border-radius:14px;border:1px solid var(--bs-border-color);background:color-mix(in srgb,var(--c) 6%,transparent)}
        .ac-ag .pt{width:9px;height:9px;border-radius:50%;background:#34D399;display:inline-block}.ac-ag .pt.pend{background:#f59e0b}.ac-ag .pt.error{background:#dc3545}
        .ac-ch .progress-bar{background:var(--c)}
        @media (prefers-reduced-motion:reduce){.ac-core,.ac-mod{transition:none}}
      </style>
      <div class="ac-grid" data-mods>${ia ? `<button type="button" class="ac-core" data-ia><span class="ic"><i class="bi bi-cpu"></i></span><span><span class="d-block small fw-bold" style="color:var(--c);letter-spacing:.12em">ASISTENTE IA</span><span class="d-block h4 fw-bold mb-1">Pregúntale a tu academia</span><span class="d-block text-body-secondary small">Abre el chat: te responde con los datos de todos tus módulos y hace tareas por ti.</span></span><span class="mt-auto small fw-semibold" style="color:var(--c)">Abrir el chat <i class="bi bi-arrow-right"></i></span></button>` : ''}</div>
      <div data-det></div>
      <section class="mt-4" data-sec-semana hidden><h2 class="h6 mb-3">Esta semana</h2><div data-semana></div></section>`;
    const $ = (s) => host.querySelector(s);

    const indicadores = (m) => {
      const ids = TILES[m.id];
      const propios = ids ? met.tiles.filter((t) => ids.includes(t.id)) : [];
      return propios.length ? propios : wid.filter((w) => w.modulo === m.id).map((w) => ({ titulo: w.titulo, valor: w.valor, detalle: w.detalle, icono: w.icono, ruta: w.ruta }));
    };
    const kpi = (t) => `<${t.ruta ? 'a' : 'div'} class="ac-kpi" ${t.ruta ? `href="${esc(t.ruta)}"` : ''}><div class="l"><i class="bi ${esc(t.icono || 'bi-graph-up')} me-1"></i>${esc(t.titulo)}</div><div class="v">${esc((FMT[t.fmt] || String)(t.valor))}</div>${t.detalle ? `<div class="d">${esc(t.detalle)}</div>` : ''}</${t.ruta ? 'a' : 'div'}>`;

    function agenteHtml(m) {
      const a = agenteDe(m);
      if (!a) return `<div class="ac-ag mb-3 d-flex flex-wrap align-items-center gap-2"><i class="bi bi-robot fs-4" style="color:var(--c)"></i><div class="flex-grow-1"><div class="fw-semibold">Aún sin agente</div><div class="small text-body-secondary">Un agente revisa ${esc(m.nombre)} por ti y te propone qué hacer.</div></div>${puedeCrear ? `<button type="button" class="btn btn-sm btn-primary" data-crear="${esc(m.id)}"><i class="bi bi-plus-lg"></i> Crear agente</button>` : ''}</div>`;
      const mx = Math.max(...a.semana, 1);
      return `<div class="ac-ag mb-3"><div class="d-flex flex-wrap align-items-center gap-2"><span class="pt ${a.pendientes ? 'pend' : a.estado === 'error' ? 'error' : ''}"></span><div class="flex-grow-1"><div class="fw-semibold">${esc(a.nombre)} <span class="badge text-bg-success">Funcionando</span></div><div class="small text-body-secondary">${a.autonomia === 'ejecutar' ? 'Actúa solo' : 'Tú apruebas'}${a.programacion !== 'manual' ? ` · ${esc(a.programacion)}` : ''} · ${a.total} ejecuciones · ${a.hechas} acciones · ${a.pendientes} por aprobar · ${a.errores} con error</div></div>
        <button type="button" class="btn btn-sm btn-primary" data-correr="${a.id}"><i class="bi bi-play-fill"></i> Ejecutar ahora</button>${ia ? '<button type="button" class="btn btn-sm btn-outline-secondary" data-ia>Abrir en IA</button>' : ''}</div>
        <div class="ac-cols mt-3" style="height:90px">${a.semana.map((v, k) => `<div title="${v}"><small>${v || ''}</small><i style="height:${Math.max(3, v / mx * 50)}px"></i><small>${['D', 'L', 'M', 'X', 'J', 'V', 'S'][new Date(`${a.dias[k]}T12:00:00Z`).getUTCDay()]}</small></div>`).join('')}</div>
        ${a.recientes.length ? `<ul class="list-unstyled small mt-2 mb-0">${a.recientes.map((r) => `<li class="d-flex justify-content-between gap-2 py-1 border-top"><span>${esc(r.texto || (r.estado === 'error' ? 'No pudo terminar' : r.estado === 'en_curso' ? 'Trabajando…' : 'Terminó sin novedades'))}</span><span class="text-body-secondary text-nowrap">${hace(r.cuando)}</span></li>`).join('')}</ul>` : '<div class="small text-body-secondary mt-2">Aún no ha trabajado esta semana. Pulsa «Ejecutar ahora».</div>'}</div>`;
    }
    async function cargarAgentes() { AG = await api('/api/dashboard/agentes').catch(() => ({ agentes: [] })); }
    async function crearAgente(btn) {
      const m = mods.find((x) => x.id === btn.dataset.crear);
      btn.disabled = true;
      try {
        const { herramientas } = await api('/api/ai/herramientas');
        const h = herramientas.filter((t) => t.modulo === m.id).map((t) => t.name);
        if (!h.length) throw new Error('Este módulo aún no tiene herramientas para un agente');
        await api('/api/ai/agentes', { method: 'POST', body: { nombre: `Agente de ${m.nombre}`.slice(0, 80), instrucciones: `Eres el agente de ${m.nombre}. Revisa ${m.nombre} del negocio con las herramientas de este módulo, resume lo importante y propón las acciones que haya que tomar. No inventes cifras. Si no hay nada por hacer, dilo en una línea.`, herramientas: h, programacion: 'manual', autonomia: 'proponer', activo: true } });
        window.App.toast?.(`Agente de ${m.nombre} creado`);
        await cargarAgentes(); pintar();
      } catch (x) { btn.disabled = false; window.App.toast?.(x.message, false); }
    }
    async function correrAgente(btn) {
      btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Trabajando…';
      try { await api(`/api/ai/agentes/${btn.dataset.correr}/ejecutar`, { method: 'POST', body: {} }); } catch (x) { window.App.toast?.(x.message, false); }
      await cargarAgentes(); pintar();
    }

    function pintar() {
      $('[data-mods]').classList.toggle('sel', !!sel);
      $('[data-mods]').querySelectorAll('.ac-mod').forEach((e) => e.remove());
      $('[data-mods]').insertAdjacentHTML('beforeend', mods.map((m) => {
        const p = indicadores(m)[0];
        return `<button type="button" class="ac-mod ${sel === m ? 'on' : ''}" style="--c:${m.color}" data-mod="${esc(m.id)}" aria-pressed="${sel === m}"><span class="ic"><i class="bi ${esc(m.icono || 'bi-grid')}"></i></span><span class="n">${esc(m.nombre)}</span><span class="v">${p ? `${esc((FMT[p.fmt] || String)(p.valor))} · ${esc(String(p.titulo).toLowerCase())}` : 'Ver estadísticas'}</span><span class="v"><i class="bi bi-circle-fill ${agenteDe(m) ? 'text-success' : 'text-secondary'}" style="font-size:.5rem"></i> ${agenteDe(m) ? `Agente activo · ${agenteDe(m).total} ${agenteDe(m).total === 1 ? 'tarea' : 'tareas'}` : 'Sin agente'}</span></button>`;
      }).join(''));

      const det = $('[data-det]');
      if (!sel) { det.innerHTML = ''; return; }
      const ks = indicadores(sel), gs = (GRAFICAS[sel.id] || []).filter((g) => gr[g.k]?.some?.((x) => x.n)), mes = (m) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString('es-CO', { month: 'short' });
      det.innerHTML = `<div class="dw-card ac-det" style="--c:${sel.color}"><div class="d-flex flex-wrap align-items-center gap-2 mb-3"><h2 class="h6 mb-0 flex-grow-1">Estadísticas · <span style="color:var(--c)">${esc(sel.nombre)}</span></h2><button type="button" class="btn btn-sm btn-outline-secondary" data-abrir>Abrir módulo <i class="bi bi-arrow-right"></i></button></div>
        ${agenteHtml(sel)}
        ${ks.length ? `<div class="ac-kpis">${ks.map(kpi).join('')}</div>` : '<div class="text-body-secondary small">Este módulo aún no tiene indicadores en el Inicio.</div>'}
        ${gs.length ? `<div class="ac-charts">${gs.map((g, n) => `<div class="ac-ch"><div class="fw-semibold small">${esc(g.t)}</div><div class="small text-body-secondary mb-2">${esc(g.s)}</div><div data-g="${n}"></div></div>`).join('')}</div>` : ''}</div>`;
      gs.forEach((g, n) => {
        const el = det.querySelector(`[data-g="${n}"]`), f = g.fmt === 'money' ? C.money : g.fmt === 'pct' ? (v) => `${v}%` : C.num;
        if (g.tipo === 'rank') C.rank(el, gr[g.k], f);
        else {
          const rows = gr[g.k], max = Math.max(1, ...rows.map((x) => x.n));
          el.innerHTML = `<div class="ac-cols" role="img" aria-label="${esc(g.t)}">${rows.map((x) => `<div title="${esc(mes(x.mes))}: ${esc(f(x.n))}"><small>${esc(f(x.n))}</small><i style="height:${Math.max(3, x.n / max * 90)}px"></i><small>${esc(mes(x.mes))}</small></div>`).join('')}</div>`;
        }
      });
    }

    host.addEventListener('click', (e) => {
      const cr = e.target.closest('[data-crear]'); if (cr) return crearAgente(cr);
      const co = e.target.closest('[data-correr]'); if (co) return correrAgente(co);
      if (e.target.closest('[data-ia]')) return ir(ia.ruta);
      if (e.target.closest('[data-abrir]')) return ir(sel?.ruta);
      const b = e.target.closest('[data-mod]');
      if (!b) return;
      const m = mods.find((x) => x.id === b.dataset.mod);
      sel = sel === m ? null : m;
      pintar();
    });

    pintar();
    const [m1, w1, g1] = await Promise.all([api('/api/academia/metricas').catch(() => null), api('/api/dashboard').catch(() => null), api('/api/academia/graficas').catch(() => null)]);
    if (m1) met = m1;
    if (g1) gr = g1;
    await cargarAgentes();
    if (w1) wid = w1.widgets || [];
    pintar();

    // calendario de la semana (necesita el módulo Cursos)
    if (me.modules.some((m) => m.id === 'cursos')) { $('[data-sec-semana]').hidden = false; window.AC.semana($('[data-semana]')); }
  },
});
