// Matrículas: inscribir a un curso con su plan de cuotas (inicial, número de cuotas, frecuencia), cupón o descuento;
// ver cuotas, registrar pagos, marcar terminada o retirada.
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, confirm, modal, table, empty } = window.App;
  const C = window.App.Crud;
  const view = document.querySelector('[data-view]');
  const RO = me.business.readOnly;
  const [cfg, cursos] = await Promise.all([AC.cfg(), AC.listas.cursos()]);
  const S = cfg.termS;
  const EST = { activa: ['ok', 'Activa'], terminada: ['free', 'Terminada'], retirada: ['bad', 'Retirada'] };
  const st = { q: '', curso_id: new URLSearchParams(location.search).get('curso') || '', estado: 'activa' };

  document.querySelector('[data-acciones]').innerHTML = RO ? '' : '<button class="btn btn-primary" data-nueva><i class="bi bi-person-plus me-1"></i>Nueva matrícula</button>';
  view.innerHTML = `<div class="d-flex flex-wrap gap-2 mb-2"><input class="form-control" data-q placeholder="Buscar ${esc(S)} o curso…" style="max-width:260px" aria-label="Buscar">
      <select class="form-select w-auto" data-curso aria-label="Curso"><option value="">Todos los cursos</option>${cursos.map((k) => `<option value="${k.id}" ${String(k.id) === st.curso_id ? 'selected' : ''}>${esc(k.nombre)}</option>`).join('')}</select>
      <select class="form-select w-auto" data-estado aria-label="Estado"><option value="activa">Activas</option><option value="terminada">Terminadas</option><option value="retirada">Retiradas</option><option value="">Todas</option></select></div>
    <div class="dw-grid dw-grid--kpi mb-3" data-kpis></div><div class="dw-card p-0 p-md-2" data-lista></div>`;

  async function load() {
    const qs = new URLSearchParams(Object.entries(st).filter(([, v]) => v));
    const { rows } = await api(`/api/matriculas?${qs}`);
    const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
    C.kpis(view.querySelector('[data-kpis]'), [['Matrículas', C.num(rows.length), '', 'bi-person-plus'], ['Valor total', C.money(sum('total')), '', 'bi-cash-stack'],
      ['Recaudado', C.money(sum('pagado')), '', 'bi-check2-circle'], ['Vencido', `<span class="${sum('vencido') ? 'text-danger' : ''}">${C.money(sum('vencido'))}</span>`, `saldo ${C.money(sum('saldo'))}`, 'bi-exclamation-circle']]);
    view.querySelector('[data-lista]').innerHTML = rows.length ? table([
      { label: AC.cap(S), main: true, html: (r) => `${esc(r.estudiante)}<div class="small text-body-secondary fw-normal">${esc(r.curso)} · ${C.day(r.fecha)}</div>` },
      { label: 'Valor', html: (r) => `${C.money(r.total)}${r.descuento ? `<div class="small text-body-secondary">desc. ${C.money(r.descuento)}${r.cupon ? ` (${esc(r.cupon)})` : ''}</div>` : ''}` },
      { label: 'Pagado', html: (r) => `${C.money(r.pagado)}${C.meter(r.pagado, r.total)}` },
      { label: 'Próxima cuota', html: (r) => (r.proxima ? `${C.chip(...AC.CUOTA[r.proxima.estado])} <span class="small">${C.money(r.proxima.falta)} · ${C.day(r.proxima.vence)}</span>` : C.chip('ok', 'Al día')) },
      { label: 'Estado', html: (r) => C.chip(...EST[r.estado]) },
      { label: '', cls: 'text-end text-nowrap', html: (r) => `<div data-id="${r.id}">${!RO && r.saldo > 0 ? '<button class="btn btn-sm btn-primary" data-act="pagar"><i class="bi bi-cash-coin me-1"></i>Pagar</button> ' : ''}<button class="btn btn-sm btn-outline-primary" data-act="cuotas">Cuotas</button>
        ${RO ? '' : `<div class="dropdown d-inline-block"><button class="btn btn-sm btn-light" data-bs-toggle="dropdown" aria-label="Más acciones"><i class="bi bi-three-dots"></i></button><ul class="dropdown-menu dropdown-menu-end">
          ${r.estado !== 'activa' ? '<li><button class="dropdown-item" data-act="activa">Marcar activa</button></li>' : ''}${r.estado !== 'terminada' ? '<li><button class="dropdown-item" data-act="terminada">Marcar terminada</button></li>' : ''}${r.estado !== 'retirada' ? '<li><button class="dropdown-item" data-act="retirada">Marcar retirada</button></li>' : ''}
          <li><button class="dropdown-item" data-act="plan">Cambiar plan de cuotas</button></li><li><hr class="dropdown-divider"></li><li><button class="dropdown-item text-danger" data-act="borrar">Borrar</button></li></ul></div>`}</div>` }], rows)
      : empty('bi-person-plus', 'No hay matrículas con este filtro.');
    view.querySelector('[data-lista]').rows = rows;
  }

  // Cuotas como en el servidor: redondeadas a miles, la última absorbe la diferencia.
  const sumar = (iso, fr, k) => {
    const [y, m, d] = iso.split('-').map(Number);
    if (fr === 'mensual') { const b = new Date(Date.UTC(y, m - 1 + k, 1)); b.setUTCDate(Math.min(d, new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 0)).getUTCDate())); return b.toISOString().slice(0, 10); }
    return new Date(Date.UTC(y, m - 1, d + (fr === 'semanal' ? 7 : 15) * k)).toISOString().slice(0, 10);
  };
  function cuotas(total, p, fecha) {
    const out = []; let resto = Math.max(0, Math.round(total)); const ini = Math.min(Math.round(+p.inicial || 0), resto);
    if (ini > 0) { out.push({ etiqueta: 'Inicial', vence: fecha, valor: ini }); resto -= ini; }
    const n = Math.max(1, Math.min(48, +p.n || 1)), base = Math.floor(resto / n / 1000) * 1000;
    if (resto > 0) for (let k = 0; k < n; k++) out.push({ etiqueta: n === 1 ? 'Pago único' : `Cuota ${k + 1} de ${n}`, vence: sumar(p.primera || fecha, p.frecuencia, k), valor: k === n - 1 ? resto - base * (n - 1) : base });
    return out;
  }
  const planHtml = (p = {}) => `<div class="col-sm-3 col-6"><label class="form-label small mb-1" for="pi">Cuota inicial</label><input class="form-control" id="pi" name="inicial" type="number" min="0" step="1000" value="${p.inicial ?? 0}"></div>
    <div class="col-sm-3 col-6"><label class="form-label small mb-1" for="pn">N.º de cuotas</label><input class="form-control" id="pn" name="n" type="number" min="1" max="48" value="${p.n ?? 1}"></div>
    <div class="col-sm-3 col-6"><label class="form-label small mb-1" for="pfr">Frecuencia</label><select class="form-select" id="pfr" name="frecuencia">${['mensual', 'quincenal', 'semanal'].map((x) => `<option value="${x}" ${p.frecuencia === x ? 'selected' : ''}>${AC.cap(x)}</option>`).join('')}</select></div>
    <div class="col-sm-3 col-6"><label class="form-label small mb-1" for="pp">Primera cuota</label><input class="form-control" id="pp" name="primera" type="date" value="${p.primera || C.todayCo()}"></div>
    <div class="col-12"><div class="small" data-prev></div></div>`;
  const preview = (el, total, f, fecha) => {
    const q = cuotas(total, { inicial: f.inicial.value, n: f.n.value, frecuencia: f.frecuencia.value, primera: f.primera.value }, fecha);
    el.querySelector('[data-prev]').innerHTML = `<div class="dw-card p-2 mt-1"><div class="fw-semibold mb-1">Total ${C.money(total)}</div>${q.map((x) => `<div class="d-flex"><span class="flex-grow-1">${x.etiqueta} · ${C.day(x.vence)}</span><b>${C.money(x.valor)}</b></div>`).join('')}</div>`;
  };

  async function nueva() {
    const ests = await AC.listas.estudiantes();
    const { el, m } = modal(`<form><div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Nueva matrícula</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><div class="row g-2">
        <div class="col-12"><label class="form-label small mb-1" for="me">${esc(AC.cap(S))}</label>
          <input class="form-control" id="me" list="me_l" placeholder="Escribe el nombre o documento" autocomplete="off" required><datalist id="me_l">${ests.map((e) => `<option value="${esc(e.nombre)}${e.documento ? ` · ${esc(e.documento)}` : ''}"></option>`).join('')}</datalist>
          <div class="form-text" data-nuevo hidden><i class="bi bi-info-circle me-1"></i>No existe: se registrará como ${esc(S)} nuevo. <input class="form-control form-control-sm mt-1" name="tel" placeholder="Teléfono (opcional)"></div></div>
        <div class="col-sm-6"><label class="form-label small mb-1" for="mc">Curso</label><select class="form-select" id="mc" name="curso_id" required><option value="">Elige el curso</option>${cursos.filter((k) => k.activo).map((k) => `<option value="${k.id}">${esc(k.nombre)} · ${C.money(k.precio)}</option>`).join('')}</select></div>
        <div class="col-sm-6"><label class="form-label small mb-1" for="mf">Fecha</label><input class="form-control" id="mf" name="fecha" type="date" value="${C.todayCo()}" required></div>
        <div class="col-sm-4"><label class="form-label small mb-1" for="mv">Valor del curso</label><input class="form-control" id="mv" name="valor" type="number" min="0" step="1000"></div>
        <div class="col-sm-4"><label class="form-label small mb-1" for="mcu">Cupón</label><input class="form-control text-uppercase" id="mcu" name="cupon" placeholder="Opcional"></div>
        <div class="col-sm-4"><label class="form-label small mb-1" for="md">Descuento adicional</label><input class="form-control" id="md" name="descuento" type="number" min="0" step="1000" value="0"></div>
        <div class="col-12"><h3 class="h6 mt-2 mb-0">Plan de pagos</h3><div class="small text-body-secondary">El cupón se valida al guardar.</div></div>${planHtml()}
      </div><div class="small text-danger mt-2" data-err></div></div>
      <div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary">Matricular</button></div></form>`, { size: 'modal-lg' });
    const f = el.querySelector('form'), err = el.querySelector('[data-err]'), inpE = el.querySelector('#me');
    const buscar = () => ests.find((e) => `${e.nombre}${e.documento ? ` · ${e.documento}` : ''}` === inpE.value.trim());
    const upd = () => { el.querySelector('[data-nuevo]').hidden = !inpE.value.trim() || !!buscar(); preview(el, Math.max(0, (+f.valor.value || 0) - (+f.descuento.value || 0)), f, f.fecha.value); };
    f.curso_id.addEventListener('change', () => { const k = cursos.find((x) => String(x.id) === f.curso_id.value); if (k) f.valor.value = k.precio; upd(); });
    f.addEventListener('input', upd); upd();
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        let est = buscar();
        if (!est) est = await api('/api/estudiantes/estudiantes', { method: 'POST', body: { nombre: inpE.value.trim(), telefono: f.tel.value } });
        await api('/api/matriculas', { method: 'POST', body: { estudiante_id: est.id, curso_id: f.curso_id.value, fecha: f.fecha.value, valor: f.valor.value, cupon: f.cupon.value, descuento: f.descuento.value,
          plan: { inicial: f.inicial.value, n: f.n.value, frecuencia: f.frecuencia.value, primera: f.primera.value } } });
        m.hide(); toast('Matrícula creada'); load();
      } catch (x) { err.textContent = x.message; }
    };
  }

  async function verCuotas(r) {
    const d = await api(`/api/matriculas/${r.id}/cuotas`);
    const { el, m } = modal(`<div class="modal-header border-0 pb-0"><div><h2 class="modal-title h5 mb-0">Cuotas</h2><div class="small text-body-secondary">${esc(r.estudiante)} · ${esc(r.curso)}</div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body">${table([{ label: 'Cuota', main: true, html: (q) => esc(q.etiqueta) }, { label: 'Vence', html: (q) => C.day(q.vence) }, { label: 'Valor', html: (q) => C.money(q.valor) },
        { label: 'Abonado', html: (q) => C.money(q.abonado) }, { label: 'Estado', html: (q) => `${C.chip(...AC.CUOTA[q.estado])}${q.dias_mora ? ` <span class="small text-danger">${q.dias_mora} días</span>` : ''}` }], d.cuotas)}
        <div class="d-flex mt-3"><span class="flex-grow-1">Pagado <b>${C.money(d.pagado)}</b> de ${C.money(d.total)}</span>${!RO && d.total > d.pagado ? '<button class="btn btn-primary btn-sm" data-pagar><i class="bi bi-cash-coin me-1"></i>Registrar pago</button>' : ''}</div></div>`, { size: 'modal-lg' });
    el.querySelector('[data-pagar]')?.addEventListener('click', () => { m.hide(); pagar(r); });
  }
  const pagar = (r) => AC.pagar({ inscripcion_id: r.id, estudiante: r.estudiante, curso: r.curso, saldo: r.saldo, sugerido: r.proxima?.falta }, load);

  async function plan(r) {
    const { el, m } = modal(`<form><div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Cambiar plan de cuotas</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><p class="small text-body-secondary">Se rehacen las cuotas; lo ya pagado se respeta y se reparte de nuevo.</p><div class="row g-2">
      <div class="col-12"><label class="form-label small mb-1" for="pd">Descuento total</label><input class="form-control" id="pd" name="descuento" type="number" min="0" step="1000" value="${r.descuento}"></div>${planHtml(r.plan || {})}</div>
      <div class="small text-danger mt-2" data-err></div></div>
      <div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary">Guardar</button></div></form>`, { size: 'modal-lg' });
    const f = el.querySelector('form');
    const upd = () => preview(el, Math.max(0, r.valor - (+f.descuento.value || 0)), f, r.fecha);
    f.addEventListener('input', upd); upd();
    f.onsubmit = async (e) => {
      e.preventDefault();
      try { await api(`/api/matriculas/${r.id}`, { method: 'PATCH', body: { descuento: f.descuento.value, plan: { inicial: f.inicial.value, n: f.n.value, frecuencia: f.frecuencia.value, primera: f.primera.value } } }); m.hide(); toast('Plan actualizado'); load(); }
      catch (x) { el.querySelector('[data-err]').textContent = x.message; }
    };
  }

  view.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const r = view.querySelector('[data-lista]').rows.find((x) => String(x.id) === b.closest('[data-id]').dataset.id);
    const a = b.dataset.act;
    try {
      if (a === 'pagar') pagar(r);
      else if (a === 'cuotas') await verCuotas(r);
      else if (a === 'plan') await plan(r);
      else if (a === 'borrar') { if (await confirm({ title: '¿Borrar la matrícula?', text: 'Se borran sus cuotas, asistencia y notas. Si tiene pagos, márcala como retirada.' })) { await api(`/api/matriculas/${r.id}`, { method: 'DELETE' }); toast('Borrada'); load(); } }
      else { await api(`/api/matriculas/${r.id}`, { method: 'PATCH', body: { estado: a } }); toast('Guardado'); load(); }
    } catch (x) { toast(x.message, false); }
  });
  document.querySelector('[data-nueva]')?.addEventListener('click', nueva);
  let t;
  view.querySelector('[data-q]').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value.trim(); load(); }, 250); });
  view.querySelector('[data-curso]').addEventListener('change', (e) => { st.curso_id = e.target.value; load(); });
  view.querySelector('[data-estado]').addEventListener('change', (e) => { st.estado = e.target.value; load(); });
  load().catch((x) => toast(x.message, false));
});
