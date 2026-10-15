// Cuotas y pagos: cartera (vencidas, de hoy, pendientes) con recordatorio por WhatsApp, pagos con recibo y anulación.
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, confirm, table, empty } = window.App;
  const C = window.App.Crud;
  const RO = me.business.readOnly;
  const negocio = me.business.name;
  const wa = (r) => {
    const tel = String(r.telefono || '').replace(/\D/g, '').slice(-10);
    if (!tel) return '';
    const txt = `Hola ${r.estudiante.split(' ')[0]}, te saludamos de ${negocio}. Te recordamos ${r.estado === 'vencida' ? 'que tienes pendiente' : 'el pago de'} la ${r.etiqueta.toLowerCase()} del curso ${r.curso} por ${C.money(r.falta)}${r.estado === 'vencida' ? `, vencida el ${C.day(r.vence)}` : `, que vence el ${C.day(r.vence)}`}. ¡Gracias!`;
    return `<a class="btn btn-sm btn-outline-success" href="https://wa.me/57${tel}?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener" aria-label="Recordar por WhatsApp"><i class="bi bi-whatsapp"></i></a>`;
  };

  const v = AC.vistas([['cartera', 'Cartera', 'bi-calendar-check'], ['pagos', 'Pagos y recibos', 'bi-receipt']], async (k, view) => {
    if (k === 'cartera') {
      view.innerHTML = `<div class="dw-grid dw-grid--kpi mb-3" data-kpis></div><div class="d-flex gap-2 mb-2"><select class="form-select w-auto" data-f aria-label="Filtro">
        <option value="pendientes">Pendientes</option><option value="vencida">Vencidas</option><option value="hoy">Vencen hoy</option><option value="todas">Todas (con pagadas)</option></select></div><div class="dw-card p-0 p-md-2" data-lista></div>`;
      const load = async () => {
        const d = await api(`/api/cuotas/cartera?estado=${view.querySelector('[data-f]').value}`);
        C.kpis(view.querySelector('[data-kpis]'), [['Vencido', `<span class="${d.totales.vencido ? 'text-danger' : ''}">${C.money(d.totales.vencido)}</span>`, '', 'bi-exclamation-circle'],
          ['Vence hoy', C.money(d.totales.hoy), '', 'bi-calendar-event'], ['Por cobrar este mes', C.money(d.totales.mes), '', 'bi-calendar-month'], ['Saldo total', C.money(d.totales.pendiente), '', 'bi-cash-stack']]);
        const box = view.querySelector('[data-lista]');
        box.rows = d.rows;
        box.innerHTML = d.rows.length ? table([
          { label: 'Estudiante', main: true, html: (r) => `${esc(r.estudiante)}<div class="small text-body-secondary fw-normal">${esc(r.curso)} · ${esc(r.etiqueta)}</div>` },
          { label: 'Vence', html: (r) => `${C.day(r.vence)}${r.dias_mora ? `<div class="small text-danger">${r.dias_mora} días de mora</div>` : ''}` },
          { label: 'Falta', html: (r) => `<b>${C.money(r.falta)}</b>${r.abonado ? `<div class="small text-body-secondary">abonado ${C.money(r.abonado)}</div>` : ''}` },
          { label: 'Estado', html: (r) => C.chip(...AC.CUOTA[r.estado]) },
          { label: '', cls: 'text-end text-nowrap', html: (r, i) => (r.falta > 0 ? `<span data-i="${d.rows.indexOf(r)}">${wa(r)} ${RO ? '' : '<button class="btn btn-sm btn-primary" data-pagar><i class="bi bi-cash-coin me-1"></i>Pagar</button>'}</span>` : '') }], d.rows)
          : empty('bi-emoji-smile', 'No hay cuotas con este filtro. ¡Todo al día!');
      };
      view.querySelector('[data-f]').addEventListener('change', load);
      view.addEventListener('click', (e) => {
        if (!e.target.closest('[data-pagar]')) return;
        const r = view.querySelector('[data-lista]').rows[+e.target.closest('[data-i]').dataset.i];
        AC.pagar({ inscripcion_id: r.inscripcion_id, estudiante: r.estudiante, curso: r.curso, sugerido: r.falta }, load);
      });
      await load();
      return;
    }
    const hoy = C.todayCo();
    view.innerHTML = `<div class="d-flex flex-wrap gap-2 mb-2 align-items-center"><input class="form-control" data-q placeholder="Buscar estudiante, curso o N.º" style="max-width:260px" aria-label="Buscar">
      <input class="form-control w-auto" type="date" data-desde value="${hoy.slice(0, 8)}01" aria-label="Desde"><input class="form-control w-auto" type="date" data-hasta value="${hoy}" aria-label="Hasta"></div>
      <div class="dw-grid dw-grid--kpi mb-3" data-kpis></div><div class="dw-card p-0 p-md-2" data-lista></div>`;
    const load = async () => {
      const qs = new URLSearchParams({ q: view.querySelector('[data-q]').value.trim(), desde: view.querySelector('[data-desde]').value, hasta: view.querySelector('[data-hasta]').value });
      const { rows } = await api(`/api/cuotas/pagos?${qs}`);
      const ok = rows.filter((p) => !p.anulado), porMetodo = {};
      ok.forEach((p) => { porMetodo[p.metodo] = (porMetodo[p.metodo] || 0) + p.valor; });
      C.kpis(view.querySelector('[data-kpis]'), [['Recaudado', C.money(ok.reduce((s, p) => s + p.valor, 0)), `${ok.length} pagos`, 'bi-cash-stack'],
        ...Object.entries(porMetodo).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m, n]) => [m, C.money(n), '', 'bi-wallet2'])]);
      view.querySelector('[data-lista]').innerHTML = rows.length ? table([
        { label: 'Recibo', main: true, html: (p) => `N.º ${esc(p.num)} ${p.anulado ? C.chip('bad', 'Anulado') : ''}<div class="small text-body-secondary fw-normal">${esc(p.estudiante)} · ${esc(p.curso)}</div>` },
        { label: 'Fecha', html: (p) => C.day(p.fecha) }, { label: 'Concepto', html: (p) => esc(p.concepto || '') }, { label: 'Medio', html: (p) => esc(p.metodo || '') },
        { label: 'Valor', cls: 'text-end', html: (p) => `<b class="${p.anulado ? 'text-decoration-line-through text-body-secondary' : ''}">${C.money(p.valor)}</b>` },
        { label: '', cls: 'text-end text-nowrap', html: (p) => `<a class="btn btn-sm btn-outline-primary" href="/api/cuotas/pagos/${p.id}/recibo" target="_blank" rel="noopener"><i class="bi bi-printer me-1"></i>Recibo</a>${!p.anulado && me.canManage && !RO ? ` <button class="btn btn-sm btn-light" data-anular="${p.id}" data-num="${p.num}" aria-label="Anular"><i class="bi bi-x-circle"></i></button>` : ''}` }], rows)
        : empty('bi-receipt', 'No hay pagos en estas fechas.');
    };
    let t;
    view.querySelector('[data-q]').addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
    view.querySelectorAll('[data-desde],[data-hasta]').forEach((x) => x.addEventListener('change', load));
    view.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-anular]'); if (!b) return;
      if (!(await confirm({ title: `¿Anular el recibo N.º ${b.dataset.num}?`, text: 'El valor vuelve a quedar como saldo pendiente. Queda en la bitácora.', ok: 'Anular' }))) return;
      try { await api(`/api/cuotas/pagos/${b.dataset.anular}/anular`, { method: 'POST' }); toast('Pago anulado'); load(); } catch (x) { toast(x.message, false); }
    });
    await load();
  });
});
