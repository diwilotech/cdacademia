// Eventos: lista con cupo y precio, asistentes por evento (con lista de espera y cobro) y enlace a la página pública de inscripción.
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, modal } = window.App;
  const C = window.App.Crud;
  const view = document.querySelector('[data-view]');
  const RO = me.business.readOnly;
  const [cursos, estudiantes] = await Promise.all([AC.listas.cursos(), AC.listas.estudiantes()]);
  const publico = `${location.origin}/${me.business.slug}/eventos`;
  const TIPOS = ['General', 'Semanal', 'Cultural', 'Charla', 'Taller', 'Feria'];
  const ESTADO = { inscrito: ['ok', 'Inscrito'], espera: ['soon', 'En espera'], asistio: ['ok', 'Asistió'], no_asistio: ['free', 'No asistió'] };

  view.innerHTML = '<div data-kpis class="row g-2 mb-3"></div><div data-tabla></div>';
  api('/api/eventos/resumen').then((s) => C.kpis(view.querySelector('[data-kpis]'), [
    ['Eventos próximos', s.eventos_proximos, '', 'bi-calendar-event'], ['Inscritos próximos', s.inscritos_proximos, '', 'bi-people'],
    ['Asistencias del mes', s.asistencias_mes, '', 'bi-check2-circle'], ['En lista de espera', s.en_espera, '', 'bi-hourglass-split']])).catch(() => {});

  function asistentes(ev, changed) {
    const { el } = modal(`<div class="modal-header border-0 pb-0"><div><h2 class="modal-title h5">${esc(ev.titulo)}</h2><div class="small text-body-secondary">${C.day(ev.fecha)}${ev.hora_ini ? ` · ${esc(ev.hora_ini)}` : ''} · cupo ${ev.cupo || 'sin límite'}</div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><div data-t></div></div>`, { size: 'modal-xl' });
    el.addEventListener('hidden.bs.modal', changed);
    const t = C.table({ el: el.querySelector('[data-t]'), base: '/api/eventos', entity: 'asistentes', title: 'asistente', newText: 'Inscribir', readOnly: RO, fixed: { evento_id: ev.id }, emptyIcon: 'bi-people', empty: 'Aún no hay inscritos.',
      defaults: () => ({ evento_id: ev.id }),
      filters: [{ k: 'estado', options: [['', 'Todos'], ['inscrito', 'Inscritos'], ['espera', 'En espera'], ['asistio', 'Asistieron'], ['no_asistio', 'No asistieron']] }],
      fields: [{ k: 'estudiante_id', label: 'Estudiante', type: 'select', options: AC.opts(estudiantes, 'Otra persona'), hint: 'o escribe los datos' }, { k: 'nombre', label: 'Nombre', type: 'text' }, { k: 'telefono', label: 'Celular', type: 'text' }, { k: 'email', label: 'Correo', type: 'email' },
        { k: 'estado', label: 'Estado', type: 'select', options: Object.entries(ESTADO).map(([v, [, l]]) => [v, l]) }, { k: 'nota', label: 'Nota', type: 'long' }],
      columns: [{ label: 'Nombre', main: true, html: (r) => `${esc(r.nombre)}<div class="small text-body-secondary fw-normal">${esc([r.telefono, r.email].filter(Boolean).join(' · '))}</div>` },
        { label: 'Estado', html: (r) => C.chip(...(ESTADO[r.estado] || ESTADO.inscrito)) }, { label: 'Pago', html: (r) => (ev.precio > 0 ? `${AC.chipCobro(r.cobro)}` : '<span class="text-body-secondary">Gratis</span>') }],
      rowActions: (r) => `${r.estado !== 'asistio' ? `<button class="btn btn-sm btn-light" data-act="asistio" title="Marcar asistencia"><i class="bi bi-check2-circle"></i></button>` : ''}${ev.precio > 0 && !RO ? ` <button class="btn btn-sm btn-outline-primary" data-act="cobro"><i class="bi bi-cash"></i> Cobro</button>` : ''}`,
      onAction: async (a, r) => {
        if (a === 'asistio') { try { await api(`/api/eventos/asistentes/${r.id}`, { method: 'PATCH', body: { estado: 'asistio' } }); t.load(); } catch (x) { toast(x.message, false); } }
        if (a === 'cobro') AC.cobros({ base: '/api/eventos/asistentes', id: r.id, titulo: `${r.nombre} · ${ev.titulo}`, changed: () => t.load() });
      } });
    t.load();
  }

  const tabla = C.table({ el: view.querySelector('[data-tabla]'), base: '/api/eventos', entity: 'eventos', title: 'evento', newText: 'Nuevo evento', readOnly: RO, emptyIcon: 'bi-calendar-event', empty: 'Aún no hay eventos.',
    defaults: () => ({ tipo: 'General', publico: true, fecha: C.todayCo() }),
    filters: [{ k: 'estado', options: [['', 'Todos'], ['abierto', 'Abiertos'], ['cancelado', 'Cancelados']] }],
    extraButtons: `<button class="btn btn-outline-secondary" data-pub title="Copiar la dirección de la página pública"><i class="bi bi-link-45deg me-1"></i>Página pública</button>`,
    fields: [{ k: 'titulo', label: 'Título', type: 'text', required: true, full: true }, { k: 'tipo', label: 'Tipo', type: 'select', options: TIPOS.map((x) => [x, x]) }, { k: 'fecha', label: 'Fecha', type: 'date', required: true },
      { k: 'hora_ini', label: 'Hora de inicio', type: 'text', placeholder: '18:30' }, { k: 'hora_fin', label: 'Hora de fin', type: 'text', placeholder: '20:00' }, { k: 'lugar', label: 'Lugar', type: 'text' }, { k: 'enlace', label: 'Enlace (si es virtual)', type: 'url' },
      { k: 'cupo', label: 'Cupo', type: 'int', hint: '0 = sin límite' }, { k: 'precio', label: 'Precio', type: 'money', hint: '0 = gratis' }, { k: 'curso_id', label: 'Curso (opcional)', type: 'select', options: AC.opts(cursos, '—') },
      { k: 'estado', label: 'Estado', type: 'select', options: [['abierto', 'Abierto'], ['cancelado', 'Cancelado']] }, { k: 'repetir_semanas', label: 'Repetir cada semana', type: 'int', hint: 'cuántas semanas más (solo al crear)' },
      { k: 'publico', label: 'Visible', type: 'bool', check: 'Aparece en la página pública' }, { k: 'descripcion', label: 'Descripción', type: 'long' }],
    columns: [
      { label: 'Evento', main: true, html: (r) => `${esc(r.titulo)} <span class="badge text-bg-light">${esc(r.tipo)}</span><div class="small text-body-secondary fw-normal">${esc(r.lugar || (r.enlace ? 'Virtual' : ''))}</div>` },
      { label: 'Cuándo', html: (r) => `${C.day(r.fecha)}<div class="small text-body-secondary">${esc([r.hora_ini, r.hora_fin].filter(Boolean).join('–'))}</div>` },
      { label: 'Cupo', html: (r) => `${r.inscritos}/${r.cupo || '∞'}${r.espera ? ` <span class="badge text-bg-warning">${r.espera} en espera</span>` : ''}` },
      { label: 'Precio', html: (r) => (r.precio > 0 ? C.money(r.precio) : 'Gratis') },
      { label: 'Estado', html: (r) => (r.estado === 'cancelado' ? C.chip('bad', 'Cancelado') : C.chip('ok', 'Abierto')) }],
    rowActions: () => '<button class="btn btn-sm btn-outline-primary" data-act="asis"><i class="bi bi-people"></i> Asistentes</button>',
    onAction: (a, r) => asistentes(r, () => tabla.load()),
  });
  tabla.load();
  view.addEventListener('click', (e) => { if (e.target.closest('[data-pub]')) navigator.clipboard?.writeText(publico).then(() => toast('Dirección copiada: ' + publico)).catch(() => toast(publico)); });
});
