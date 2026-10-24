// Configuración: las reglas de la academia (escala de notas y mínimos, valor de las reposiciones, cuenta de cobro y recibo de pago).
// La identidad (rubro, cómo les dices a los estudiantes, áreas, descripción, logos, letra y tono) está en Marca.
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast } = window.App;
  const RO = me.business.readOnly;

  AC.vistas([['reglas', 'Notas y reposiciones', 'bi-sliders'], ['recibo', 'Cobros e impresión', 'bi-printer']], async (k, view) => {
    const c = await AC.cfg(true);
    const campo = (id, label, html, col = 'col-sm-6 col-lg-4', hint = '') => `<div class="${col}"><label class="form-label small mb-1" for="${id}">${label}${hint ? ` <span class="text-body-secondary">· ${hint}</span>` : ''}</label>${html}</div>`;
    const inp = (n, type = 'text', extra = '') => `<input class="form-control" id="c_${n}" name="${n}" type="${type}" value="${esc(c[n] ?? '')}" ${extra} ${RO ? 'disabled' : ''}>`;
    const guardar = !RO && me.canManage ? '<div class="col-12"><button class="btn btn-primary"><i class="bi bi-check-lg me-1"></i>Guardar</button></div>' : '';
    view.innerHTML = k === 'reglas' ? `<form class="dw-card"><div class="row g-3">
      <div class="col-12"><h2 class="h6 mb-0">Notas y asistencia</h2></div>
      ${campo('c_escala', 'Escala de notas', `<select class="form-select" id="c_escala" name="escala" ${RO ? 'disabled' : ''}><option value="5" ${c.escala == 5 ? 'selected' : ''}>0 a 5</option><option value="10" ${c.escala == 10 ? 'selected' : ''}>0 a 10</option></select>`)}
      ${campo('c_notaMin', 'Nota mínima para aprobar', inp('notaMin', 'number', 'step="0.1" min="0"'))}
      ${campo('c_asisMin', 'Asistencia mínima (%)', inp('asisMin', 'number', 'min="0" max="100"'))}
      <div class="col-12"><h2 class="h6 mb-0 mt-2">Reposiciones</h2></div>
      ${campo('c_valorRepo', 'Valor de reponer una clase', inp('valorRepo', 'number', 'min="0" step="1000"'), 'col-sm-6 col-lg-4', '0 = sin cobro')}
      ${campo('c_valorRepoVirtual', 'Valor de reposición virtual', inp('valorRepoVirtual', 'number', 'min="0" step="1000"'))}
      ${guardar}</div></form>` : `<form class="dw-card"><div class="row g-3">
      <div class="col-12"><h2 class="h6 mb-0">Cobros</h2></div>
      <div class="col-12"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="c_cuentaCobro" name="cuentaCobro" ${c.cuentaCobro ? 'checked' : ''} ${RO ? 'disabled' : ''}><label class="form-check-label" for="c_cuentaCobro">Crear una cuenta de cobro al matricular</label></div>
        <div class="form-text">Cada matrícula tiene su cuenta por cobrar en Finanzas y los pagos la abonan. Si lo apagas, cada pago genera solo un recibo de caja, sin cuenta de cobro.</div></div>
      <div class="col-12"><h2 class="h6 mb-0 mt-2">Recibo de pago e impresión</h2><div class="form-text">Los recibos y cuentas de cobro se imprimen con el color, la letra y el logo de <a href="/staff/marca.html#logos" target="_top">Marca</a>.</div></div>
      ${campo('c_recibo', 'Formato', `<select class="form-select" id="c_recibo" name="recibo" ${RO ? 'disabled' : ''}><option value="ticket" ${c.recibo === 'ticket' ? 'selected' : ''}>Tirilla (impresora térmica)</option><option value="carta" ${c.recibo === 'carta' ? 'selected' : ''}>Hoja carta</option></select>`)}
      ${campo('c_consecutivo', 'Siguiente número de recibo', inp('consecutivo', 'number', 'min="1"'), 'col-sm-6 col-lg-4', 'se usa el mayor entre este y el último')}
      ${campo('c_nit', 'NIT o documento', inp('nit'))}
      ${campo('c_tel', 'Teléfono', inp('tel'))}
      ${campo('c_dir', 'Dirección', inp('dir'), 'col-sm-6 col-lg-8')}
      ${campo('c_pie', 'Mensaje al pie del recibo', inp('pie'), 'col-12')}
      ${guardar}</div></form>`;
    const f = view.querySelector('form');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries([...new FormData(f)]);
      if (k === 'recibo') body.cuentaCobro = f.cuentaCobro.checked;
      try { await api('/api/academia/config', { method: 'PUT', body }); await AC.cfg(true); toast('Guardado'); } catch (x) { toast(x.message, false); }
    };
  });
});
