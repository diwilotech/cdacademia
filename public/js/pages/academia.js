// Mi academia: datos (rubro y cómo se llama a los estudiantes, escala de notas, mínimos, valor de las reposiciones,
// datos y formato del recibo, consecutivo) y áreas.
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, confirm } = window.App;
  const C = window.App.Crud;
  const RO = me.business.readOnly;

  AC.vistas([['datos', 'Datos de la academia', 'bi-building'], ['areas', 'Áreas', 'bi-tags']], async (k, view) => {
    if (k === 'areas') {
      view.innerHTML = '<div data-tabla></div>';
      C.table({ el: view.querySelector('[data-tabla]'), base: '/api/academia', entity: 'areas', title: 'área', newText: 'Nueva área', emptyIcon: 'bi-tags', empty: 'Crea las áreas que enseñas (por ejemplo: Maquillaje social, Uñas acrílicas).',
        fields: [{ k: 'nombre', label: 'Nombre', required: true }, { k: 'color', label: 'Color', type: 'select', options: [['', 'Sin color'], ['primary', 'Del tema'], ['success', 'Verde'], ['warning', 'Amarillo'], ['danger', 'Rojo'], ['info', 'Celeste'], ['secondary', 'Gris']] }],
        columns: [{ label: 'Área', main: true, html: (r) => `<span class="badge text-bg-${esc(r.color || 'light')} me-2">&nbsp;</span>${esc(r.nombre)}` }] }).load();
      return;
    }
    const c = await AC.cfg(true);
    const campo = (id, label, html, col = 'col-sm-6 col-lg-4', hint = '') => `<div class="${col}"><label class="form-label small mb-1" for="${id}">${label}${hint ? ` <span class="text-body-secondary">· ${hint}</span>` : ''}</label>${html}</div>`;
    const inp = (k, type = 'text', extra = '') => `<input class="form-control" id="c_${k}" name="${k}" type="${type}" value="${esc(c[k] ?? '')}" ${extra} ${RO ? 'disabled' : ''}>`;
    view.innerHTML = `<form class="dw-card"><div class="row g-3">
      <div class="col-12"><h2 class="h6 mb-0">Tu academia</h2></div>
      ${campo('c_rubro', 'Rubro', `<select class="form-select" id="c_rubro" name="rubro" ${RO ? 'disabled' : ''}>${Object.entries(c.rubros).map(([k2, r]) => `<option value="${k2}" ${c.rubro === k2 ? 'selected' : ''}>${esc(r.nombre)}</option>`).join('')}</select>`)}
      ${campo('c_termS', 'Cómo les dices (singular)', inp('termS'), 'col-sm-6 col-lg-4', 'estudiante, alumna…')}
      ${campo('c_termP', 'Plural', inp('termP'))}
      <div class="col-12"><h2 class="h6 mb-0 mt-2">Notas y asistencia</h2></div>
      ${campo('c_escala', 'Escala de notas', `<select class="form-select" id="c_escala" name="escala" ${RO ? 'disabled' : ''}><option value="5" ${c.escala == 5 ? 'selected' : ''}>0 a 5</option><option value="10" ${c.escala == 10 ? 'selected' : ''}>0 a 10</option></select>`)}
      ${campo('c_notaMin', 'Nota mínima para aprobar', inp('notaMin', 'number', 'step="0.1" min="0"'))}
      ${campo('c_asisMin', 'Asistencia mínima (%)', inp('asisMin', 'number', 'min="0" max="100"'))}
      <div class="col-12"><h2 class="h6 mb-0 mt-2">Reposiciones</h2></div>
      ${campo('c_valorRepo', 'Valor de reponer una clase', inp('valorRepo', 'number', 'min="0" step="1000"'), 'col-sm-6 col-lg-4', '0 = sin cobro')}
      ${campo('c_valorRepoVirtual', 'Valor de reposición virtual', inp('valorRepoVirtual', 'number', 'min="0" step="1000"'))}
      <div class="col-12"><h2 class="h6 mb-0 mt-2">Finanzas</h2></div>
      <div class="col-12"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="c_cuentaCobro" name="cuentaCobro" ${c.cuentaCobro ? 'checked' : ''} ${RO ? 'disabled' : ''}><label class="form-check-label" for="c_cuentaCobro">Crear una cuenta de cobro al matricular</label></div>
        <div class="form-text">Cada matrícula tiene su cuenta por cobrar en Finanzas y los pagos la abonan. Si lo apagas, cada pago genera solo un recibo de caja, sin cuenta de cobro.</div></div>
      <div class="col-12"><h2 class="h6 mb-0 mt-2">Recibo de pago</h2></div>
      ${campo('c_recibo', 'Formato', `<select class="form-select" id="c_recibo" name="recibo" ${RO ? 'disabled' : ''}><option value="ticket" ${c.recibo === 'ticket' ? 'selected' : ''}>Tirilla (impresora térmica)</option><option value="carta" ${c.recibo === 'carta' ? 'selected' : ''}>Hoja carta</option></select>`)}
      ${campo('c_consecutivo', 'Siguiente número de recibo', inp('consecutivo', 'number', 'min="1"'), 'col-sm-6 col-lg-4', 'se usa el mayor entre este y el último')}
      ${campo('c_nit', 'NIT o documento', inp('nit'))}
      ${campo('c_tel', 'Teléfono', inp('tel'))}
      ${campo('c_dir', 'Dirección', inp('dir'), 'col-sm-6 col-lg-8')}
      ${campo('c_pie', 'Mensaje al pie del recibo', inp('pie'), 'col-12')}
      ${RO || !me.canManage ? '' : '<div class="col-12"><button class="btn btn-primary"><i class="bi bi-check-lg me-1"></i>Guardar</button></div>'}
    </div></form>`;
    // Áreas a mano, sin salir de aquí: agregar con Enter y quitar con la x (el color se cambia en la pestaña Áreas).
    view.insertAdjacentHTML('afterbegin', `<div class="dw-card mb-3" data-areas><h2 class="h6">Áreas que enseñas</h2>
      <div class="d-flex flex-wrap gap-2 mb-2" data-chips></div>
      ${RO || !me.canManage ? '' : '<form class="d-flex gap-2" data-nueva-area style="max-width:420px"><input class="form-control" name="nombre" maxlength="80" placeholder="Nueva área: Maquillaje, Barbería…" aria-label="Nombre de la nueva área" required><button class="btn btn-primary text-nowrap"><i class="bi bi-plus-lg me-1"></i>Agregar</button></form>'}</div>`);
    const chips = view.querySelector('[data-chips]');
    const cargarAreas = async () => {
      const { areas } = await api('/api/academia/areas-lista');
      chips.innerHTML = areas.length ? areas.map((a) => `<span class="badge text-bg-${esc(a.color || 'light')} border d-inline-flex align-items-center gap-2 fs-6 fw-normal">${esc(a.nombre)}${RO || !me.canManage ? '' : `<button type="button" class="btn-close btn-close-sm" style="font-size:.6rem" data-quitar-area="${a.id}" aria-label="Quitar ${esc(a.nombre)}"></button>`}</span>`).join('')
        : '<span class="small text-body-secondary">Aún no hay áreas. Agrega la primera aquí abajo.</span>';
    };
    await cargarAreas();
    view.querySelector('[data-nueva-area]')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const inp = e.target.nombre;
      try { await api('/api/academia/areas', { method: 'POST', body: { nombre: inp.value.trim() } }); inp.value = ''; toast('Área agregada'); await cargarAreas(); } catch (x) { toast(x.message, false); }
    });
    chips.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-quitar-area]'); if (!b) return;
      if (!(await confirm({ title: '¿Quitar esta área?', text: 'Desaparece de la lista; los cursos, profesionales y materiales que la usaban pueden quedar sin área.', ok: 'Quitar' }))) return;
      try { await api(`/api/academia/areas/${b.dataset.quitarArea}`, { method: 'DELETE' }); toast('Área quitada'); await cargarAreas(); } catch (x) { toast(x.message, false); }
    });
    const f = view.querySelector('form:not([data-nueva-area])');
    f.rubro.addEventListener('change', () => { const r = c.rubros[f.rubro.value]; f.termS.value = r.s; f.termP.value = r.p; });
    f.onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries([...new FormData(f)]);
      body.cuentaCobro = f.cuentaCobro.checked;
      try { await api('/api/academia/config', { method: 'PUT', body }); await AC.cfg(true); toast('Datos guardados'); } catch (x) { toast(x.message, false); }
    };
  });
});
