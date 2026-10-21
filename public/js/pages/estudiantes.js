// Estudiantes (o alumnas, aprendices… según el rubro): lista, buscar, crear y editar; la ficha muestra sus cursos, avance y pagos.
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { esc } = window.App;
  const C = window.App.Crud;
  const cfg = await AC.cfg();
  const S = cfg.termS, P = AC.cap(cfg.termP);
  document.querySelector('[data-h1]').textContent = P;
  document.querySelector('[data-view]').innerHTML = '<div data-tabla></div>';
  const T = C.table({ el: document.querySelector('[data-tabla]'), base: '/api/estudiantes', entity: 'estudiantes', title: S, newText: `Nuevo ${S}`, emptyIcon: 'bi-people', empty: `Aún no hay ${cfg.termP}. Registra el primero.`,
    filters: [{ k: 'activo', options: [['', 'Todos'], ['1', 'Activos'], ['0', 'Inactivos']] }],
    fields: [{ k: 'nombre', label: 'Nombre completo', required: true, full: true }, { k: 'documento', label: 'Documento' }, { k: 'telefono', label: 'Teléfono / WhatsApp' },
      { k: 'email', label: 'Correo', type: 'email' }, { k: 'origen', label: '¿Cómo nos conoció?', placeholder: 'Instagram, referido…' }, { k: 'notas', label: 'Notas', type: 'long' },
      { k: 'activo', label: 'Estado', type: 'bool', check: 'Activo', default: true }],
    columns: [
      { label: 'Nombre', main: true, html: (r) => `${esc(r.nombre)}${r.documento ? `<div class="text-body-secondary fw-normal" style="font-size:.75rem">CC ${esc(r.documento)}</div>` : ''}${r.en_mora ? ` <div class="mt-1">${C.chip('bad', `En mora${r.mora_dias ? ` · ${r.mora_dias} d` : ''}`)}${r.baja_asistencia ? ` ${C.chip('soon', `Asistencia ${r.asistencia_pct}%`)}` : ''}</div>` : (r.baja_asistencia ? ` <div class="mt-1">${C.chip('soon', `Asistencia ${r.asistencia_pct}%`)}</div>` : '')}` },
      { label: 'Teléfono', html: (r) => (r.telefono ? `<a href="https://wa.me/57${esc(String(r.telefono).replace(/\D/g, '').slice(-10))}" target="_blank" rel="noopener"><i class="bi bi-whatsapp me-1"></i>${esc(r.telefono)}</a>` : '—') },
      { label: 'Origen', html: (r) => esc(r.origen || '—') },
      { label: 'Estado', html: (r) => (r.activo ? C.chip('ok', 'Activo') : C.chip('free', 'Inactivo')) }],
    rowActions: (r) => `${me.canManage ? `${AC.botonesAcceso(r.acceso, r.id).replace(/data-acc="(\w+)"/g, 'data-act="acc-$1"')} ` : ''}<button class="btn btn-sm btn-outline-primary" data-act="ficha" title="Ficha" aria-label="Ficha"><i class="bi bi-person-vcard"></i></button>`,
    onAction: (a, r) => {
      if (a.startsWith('acc-')) return AC.accionAcceso(a.slice(4), r.id, r.nombre).then((hecho) => hecho && T.load()).catch((x) => window.App.toast(x.message, false));
      AC.ficha(r.id, me).catch((x) => window.App.toast(x.message, false));
    },
  });
  T.load();
});
