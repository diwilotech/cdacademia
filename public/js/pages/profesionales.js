// Profesionales (docentes): datos, áreas con niveles y si reponen clases, y horario semanal de disponibilidad.
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, confirm, modal } = window.App;
  const C = window.App.Crud;
  const view = document.querySelector('[data-view]');
  view.innerHTML = '<div data-tabla></div>';
  let areas = await AC.listas.areas();
  const RO = me.business.readOnly || !me.canManage;

  const editar = (row, changed) => { if (!RO) AC.fichaProfesional({ row, areas, changed }); };

  const nombreArea = (id) => areas.find((a) => a.id === id)?.nombre || '—';
  C.table({ el: view.querySelector('[data-tabla]'), base: '/api/profesionales', entity: 'profesionales', title: 'profesional', newText: 'Nuevo profesional', readOnly: RO, emptyIcon: 'bi-person-badge',
    empty: 'Aún no hay profesionales.', onEdit: editar,
    columns: [
      { label: 'Nombre', main: true, html: (r) => `${esc(r.nombre)}${r.email ? `<div class="small text-body-secondary fw-normal">${esc(r.email)}</div>` : ''}` },
      { label: 'Áreas', html: (r) => r.areas.map((a) => `<span class="badge text-bg-light me-1">${esc(nombreArea(a.area_id))}${a.niveles.length ? ` · ${a.niveles.map((n) => n[0]).join('')}` : ''}${a.reponer ? ' · repone' : ''}</span>`).join('') || '—' },
      { label: 'Disponibilidad', html: (r) => `<span class="small">${esc(AC.horario(r.horario))}</span>` },
      { label: 'Estado', html: (r) => (r.activo ? C.chip('ok', 'Activo') : C.chip('free', 'Inactivo')) }],
    onOpen: () => {},
  }).load();
});
