// Reposiciones: fallas por reponer (ausente o con excusa), agendar en un espacio con cupos o en modo virtual,
// marcar hecha, cobrar (queda en los pagos con recibo) o exonerar del cobro; y los espacios disponibles.
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, modal, table, empty } = window.App;
  const C = window.App.Crud;
  const RO = me.business.readOnly;
  const profs = await AC.listas.profesionales();
  const EST = { pendiente: ['soon', 'Por agendar'], agendada: ['free', 'Agendada'], hecha: ['ok', 'Hecha'] };
  const MARCA = { A: 'Ausente', J: 'Con excusa' };

  AC.vistas([['fallas', 'Fallas por reponer', 'bi-arrow-repeat'], ['espacios', 'Espacios', 'bi-calendar-plus']], async (k, view) => {
    if (k === 'espacios') {
      view.innerHTML = '<p class="small text-body-secondary">Horarios en los que se puede reponer, con cupos. Al agendar, cada estudiante ocupa un cupo.</p><div data-tabla></div>';
      C.table({ el: view.querySelector('[data-tabla]'), base: '/api/reposiciones', entity: 'espacios', title: 'espacio', newText: 'Nuevo espacio', readOnly: RO || !me.canManage, emptyIcon: 'bi-calendar-plus',
        empty: 'Aún no hay espacios para reponer.', defaults: () => ({ fecha: C.todayCo(), ini: '09:00', fin: '11:00', cupos: 4 }),
        fields: [{ k: 'fecha', label: 'Fecha', type: 'date', required: true }, { k: 'cupos', label: 'Cupos', type: 'int', required: true }, { k: 'ini', label: 'Desde (HH:MM)', required: true, placeholder: '09:00' },
          { k: 'fin', label: 'Hasta (HH:MM)', required: true, placeholder: '11:00' }, { k: 'profesional_id', label: 'Profesional', type: 'select', options: AC.opts(profs.filter((p) => p.activo), 'Sin asignar') }, { k: 'notas', label: 'Notas', full: true }],
        columns: [{ label: 'Fecha', main: true, html: (r) => `${C.day(r.fecha)} · ${esc(r.ini)}–${esc(r.fin)}` },
          { label: 'Profesional', html: (r) => esc(profs.find((p) => p.id === r.profesional_id)?.nombre || '—') },
          { label: 'Cupos', html: (r) => `${r.ocupados} de ${r.cupos}${C.meter(r.ocupados, r.cupos)}` }, { label: 'Notas', html: (r) => esc(r.notas || '') }] }).load();
      return;
    }
    view.innerHTML = `<div class="dw-grid dw-grid--kpi mb-3" data-kpis></div><div class="d-flex gap-2 mb-2"><select class="form-select w-auto" data-f aria-label="Filtro"><option value="pendientes">Por reponer</option><option value="pendiente">Por agendar</option><option value="agendada">Agendadas</option><option value="hecha">Hechas</option><option value="todas">Todas</option></select></div>
      <div class="dw-card p-0 p-md-2" data-lista></div>`;
    let d;
    const load = async () => {
      d = await api(`/api/reposiciones?estado=${view.querySelector('[data-f]').value}`);
      C.kpis(view.querySelector('[data-kpis]'), [['Por agendar', C.num(d.totales.pendiente), '', 'bi-hourglass-split'], ['Agendadas', C.num(d.totales.agendada), '', 'bi-calendar-check'], ['Hechas', C.num(d.totales.hecha), '', 'bi-check2-circle'],
        ['Valor por reposición', d.valor ? C.money(d.valor) : 'Sin cobro', d.valorVirtual ? `virtual ${C.money(d.valorVirtual)}` : '', 'bi-cash-coin']]);
      view.querySelector('[data-lista]').innerHTML = d.rows.length ? table([
        { label: 'Estudiante', main: true, html: (r) => `${esc(r.estudiante)}<div class="small text-body-secondary fw-normal">${esc(r.curso)}</div>` },
        { label: 'Clase', html: (r) => `Clase ${r.clase_n}${r.clase_fecha ? ` · ${C.day(r.clase_fecha)}` : ''}<div class="small text-body-secondary">${esc(MARCA[r.marca])}${r.tema ? ` · ${esc(r.tema)}` : ''}</div>` },
        { label: 'Reposición', html: (r) => `${C.chip(...EST[r.estado])}${r.espacio_fecha ? `<div class="small">${C.day(r.espacio_fecha)} ${esc(r.espacio_ini)}</div>` : r.modo === 'virtual' && r.id ? '<div class="small">Virtual</div>' : ''}` },
        { label: 'Cobro', html: (r) => (r.exonerada ? C.chip('free', 'Exonerada') : r.pago_id ? C.chip('ok', 'Cobrada') : d.valor ? '<span class="small text-body-secondary">Pendiente</span>' : '—') },
        { label: '', cls: 'text-end text-nowrap', html: (r, i) => (RO ? '' : `<span data-i="${d.rows.indexOf(r)}">${r.estado !== 'hecha' ? '<button class="btn btn-sm btn-outline-primary" data-act="agendar">Agendar</button> ' : ''}
          <div class="dropdown d-inline-block"><button class="btn btn-sm btn-light" data-bs-toggle="dropdown" aria-label="Más acciones"><i class="bi bi-three-dots"></i></button><ul class="dropdown-menu dropdown-menu-end">
          ${r.estado !== 'hecha' ? '<li><button class="dropdown-item" data-act="hecha">Marcar hecha</button></li>' : '<li><button class="dropdown-item" data-act="pendiente">Volver a por reponer</button></li>'}
          ${!r.exonerada && !r.pago_id ? '<li><button class="dropdown-item" data-act="cobrar">Cobrar</button></li>' : ''}
          ${me.canManage ? `<li><button class="dropdown-item" data-act="exonerar">${r.exonerada ? 'Quitar exoneración' : 'Exonerar del cobro'}</button></li>` : ''}</ul></div></span>`) }], d.rows)
        : empty('bi-emoji-smile', 'No hay fallas con este filtro.');
    };
    // Las acciones sobre una falla sin reposición creada primero la crean (pendiente).
    const asegurar = async (r) => r.id || (await api('/api/reposiciones', { method: 'POST', body: { inscripcion_id: r.inscripcion_id, clase_n: r.clase_n } })).id;
    async function agendar(r) {
      const esp = (await api(`/api/reposiciones/espacios?limit=200`)).rows.filter((s) => s.fecha >= C.todayCo()).sort((a, b) => (a.fecha + a.ini).localeCompare(b.fecha + b.ini));
      const { el, m } = modal(`<form><div class="modal-header border-0 pb-0"><div><h2 class="modal-title h5 mb-0">Agendar reposición</h2><div class="small text-body-secondary">${esc(r.estudiante)} · clase ${r.clase_n} de ${esc(r.curso)}</div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
        <div class="modal-body"><div class="list-group">${esp.map((s) => { const lleno = s.ocupados >= s.cupos && s.id !== r.espacio_id; return `<label class="list-group-item d-flex gap-2 ${lleno ? 'text-body-secondary' : ''}"><input class="form-check-input" type="radio" name="esp" value="${s.id}" ${s.id === r.espacio_id ? 'checked' : ''} ${lleno ? 'disabled' : ''}>
            <span class="flex-grow-1">${C.day(s.fecha)} · ${esc(s.ini)}–${esc(s.fin)}<span class="d-block small text-body-secondary">${esc(profs.find((p) => p.id === s.profesional_id)?.nombre || 'Sin profesional')} · ${s.cupos - s.ocupados} cupos libres</span></span></label>`; }).join('')}
          <label class="list-group-item d-flex gap-2"><input class="form-check-input" type="radio" name="esp" value="virtual" ${r.modo === 'virtual' && !r.espacio_id ? 'checked' : ''}><span>Virtual<span class="d-block small text-body-secondary">Sin espacio: la hace por su cuenta${d.valorVirtual ? ` · ${C.money(d.valorVirtual)}` : ''}</span></span></label></div>
          ${esp.length ? '' : `<p class="small text-body-secondary mt-2 mb-0">No hay espacios próximos.${me.canManage ? ' Créalos en la pestaña Espacios.' : ''}</p>`}<div class="small text-danger mt-2" data-err></div></div>
        <div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary">Agendar</button></div></form>`);
      el.querySelector('form').onsubmit = async (e) => {
        e.preventDefault();
        const v = e.target.esp.value; if (!v) return;
        try { await api('/api/reposiciones', { method: 'POST', body: { inscripcion_id: r.inscripcion_id, clase_n: r.clase_n, ...(v === 'virtual' ? { modo: 'virtual' } : { espacio_id: v }) } }); m.hide(); toast('Reposición agendada'); load(); }
        catch (x) { el.querySelector('[data-err]').textContent = x.message; }
      };
    }
    async function cobrar(r) {
      const id = await asegurar(r);
      const valor = r.modo === 'virtual' ? d.valorVirtual : d.valor;
      const { el, m } = modal(`<form><div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Cobrar reposición</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
        <div class="modal-body"><p class="small text-body-secondary">${esc(r.estudiante)} · clase ${r.clase_n}</p><div class="row g-2">
          <div class="col-6"><label class="form-label small mb-1" for="cv">Valor</label><input class="form-control" id="cv" name="valor" type="number" min="1" value="${valor || ''}" required></div>
          <div class="col-6"><label class="form-label small mb-1" for="cm">Medio</label><select class="form-select" id="cm" name="metodo">${AC.METODOS_PAGO.map((x) => `<option>${x}</option>`).join('')}</select></div></div>
          <div class="small text-danger mt-2" data-err></div></div>
        <div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary">Cobrar</button></div></form>`);
      el.querySelector('form').onsubmit = async (e) => {
        e.preventDefault();
        try { const p = await api(`/api/reposiciones/${id}/cobrar`, { method: 'POST', body: { valor: e.target.valor.value, metodo: e.target.metodo.value } }); m.hide(); load(); AC.reciboListo(p); }
        catch (x) { el.querySelector('[data-err]').textContent = x.message; }
      };
    }
    view.querySelector('[data-f]').addEventListener('change', load);
    view.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const r = d.rows[+b.closest('[data-i]').dataset.i], a = b.dataset.act;
      try {
        if (a === 'agendar') return await agendar(r);
        if (a === 'cobrar') return await cobrar(r);
        const id = await asegurar(r);
        await api(`/api/reposiciones/${id}`, { method: 'PATCH', body: a === 'exonerar' ? { exonerada: !r.exonerada } : { estado: a } });
        toast('Guardado'); load();
      } catch (x) { toast(x.message, false); }
    });
    await load();
  });
});
