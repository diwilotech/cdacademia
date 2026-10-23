// Asesorías: procesos por pasos (estudiar o trabajar en el exterior, visas, becas…). Cada negocio define sus tipos (plantillas de pasos y documentos);
// cada proceso lleva su paso actual, documentos por paso, historial, próxima acción y cobro.
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, confirm, modal } = window.App;
  const C = window.App.Crud;
  const RO = me.business.readOnly, CAN = me.canManage && !RO;
  const [estudiantes, profesionales] = await Promise.all([AC.listas.estudiantes(), AC.listas.profesionales()]);
  const EST = { activo: ['ok', 'Activo'], pausado: ['soon', 'Pausado'], terminado: ['free', 'Terminado'], cancelado: ['bad', 'Cancelado'] };
  const DOC = { pendiente: ['free', 'Pendiente'], recibido: ['soon', 'Recibido'], aprobado: ['ok', 'Aprobado'] };
  const fechaHora = (t) => new Date(t).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  /* ---- detalle de un proceso ---- */
  async function detalle(a, changed) {
    const { el } = modal('<div data-d><div class="modal-body text-body-secondary">Cargando…</div></div>', { size: 'modal-xl' });
    el.addEventListener('hidden.bs.modal', changed);
    const host = el.querySelector('[data-d]');
    const sube = async (url, file) => {
      const r = await fetch(`${url}?nombre=${encodeURIComponent(file.name)}`, { method: 'POST', credentials: 'same-origin', headers: { 'x-app': '1' }, body: file });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'No se pudo subir');
    };
    async function draw() {
      const { asesoria: p, docs, avances } = await api(`/api/asesorias/asesorias/${a.id}/detalle`);
      const cerrado = ['terminado', 'cancelado'].includes(p.estado);
      host.innerHTML = `<div class="modal-header border-0 pb-0"><div><h2 class="modal-title h5">${esc(p.nombre)}</h2><div class="small text-body-secondary">${esc(a.tipo || '')} · ${C.chip(...(EST[p.estado] || EST.activo))}${a.asesor ? ` · Asesor/a: ${esc(a.asesor)}` : ''}</div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
        <div class="modal-body">
        <div class="d-flex gap-1 mb-3">${p.pasos.map((s, i) => `<div class="flex-fill text-center"><div class="progress" style="height:8px"><div class="progress-bar" style="width:${i < p.paso || p.estado === 'terminado' ? 100 : i === p.paso ? 50 : 0}%"></div></div>
          <div class="small mt-1 ${i === p.paso && p.estado !== 'terminado' ? 'fw-bold text-primary' : 'text-body-secondary'}">${esc(s.nombre)}</div></div>`).join('')}</div>
        ${!RO && !cerrado ? `<div class="d-flex flex-wrap gap-2 align-items-center mb-3"><input class="form-control" style="max-width:320px" data-texto placeholder="Nota del avance (opcional)">
          <button class="btn btn-outline-secondary" data-paso="retroceder" ${p.paso === 0 ? 'disabled' : ''}><i class="bi bi-arrow-left"></i></button>
          <button class="btn btn-primary" data-paso="avanzar">${p.paso >= p.pasos.length - 1 ? 'Terminar proceso' : 'Avanzar'} <i class="bi bi-arrow-right"></i></button>
          <button class="btn btn-outline-primary ms-auto" data-cobro><i class="bi bi-cash me-1"></i>Cobro · ${AC.chipCobro(a.cobro).replace(/<[^>]+>/g, '')}</button></div>` : ''}
        <div class="row g-3"><div class="col-lg-7"><h6>Documentos</h6>
          ${p.pasos.map((s, i) => { const ds = docs.filter((d) => d.paso === i); return `<div class="border rounded-3 p-2 mb-2 ${i === p.paso ? 'border-primary' : ''}"><div class="d-flex justify-content-between"><b class="small">${i + 1}. ${esc(s.nombre)}</b>${RO ? '' : `<button class="btn btn-sm btn-light" data-adddoc="${i}"><i class="bi bi-plus"></i></button>`}</div>
            ${ds.map((d) => `<div class="d-flex flex-wrap align-items-center gap-2 py-1 border-top small"><span class="flex-grow-1">${esc(d.nombre)}${d.nota ? `<div class="text-body-secondary">${esc(d.nota)}</div>` : ''}</span>
              ${RO ? C.chip(...DOC[d.estado]) : `<select class="form-select form-select-sm w-auto" data-doc="${d.id}">${Object.entries(DOC).map(([v, [, l]]) => `<option value="${v}" ${v === d.estado ? 'selected' : ''}>${l}</option>`).join('')}</select>`}
              ${d.tiene ? `<a class="btn btn-sm btn-light" target="_blank" href="/api/asesorias/docs/${d.id}/archivo" title="${esc(d.archivo || '')}"><i class="bi bi-paperclip"></i></a>` : ''}
              ${RO ? '' : `<label class="btn btn-sm btn-light mb-0"><i class="bi bi-upload"></i><input type="file" hidden accept="image/*,.pdf" data-up="${d.id}"></label><button class="btn btn-sm btn-light text-danger" data-deldoc="${d.id}"><i class="bi bi-trash"></i></button>`}</div>`).join('') || '<div class="small text-body-secondary border-top pt-1">Sin documentos</div>'}</div>`; }).join('')}</div>
        <div class="col-lg-5"><h6>Historial</h6>${RO ? '' : '<form class="d-flex gap-2 mb-2" data-nota><input class="form-control form-control-sm" name="t" placeholder="Agregar nota…" maxlength="500" required><button class="btn btn-sm btn-outline-primary">Agregar</button></form>'}
          <div class="small" style="max-height:340px;overflow:auto">${avances.map((v) => `<div class="border-start ps-2 mb-2"><div class="text-body-secondary">${fechaHora(v.created_at)}${v.usuario ? ` · ${esc(v.usuario)}` : ''}</div>${esc(v.texto)}</div>`).join('')}</div></div></div>
        <div class="small text-danger mt-2" data-err></div></div>`;
      const err = (x) => { host.querySelector('[data-err]').textContent = x.message; };
      host.querySelectorAll('[data-paso]').forEach((b) => b.addEventListener('click', async () => {
        try { await api(`/api/asesorias/asesorias/${a.id}/paso`, { method: 'POST', body: { accion: b.dataset.paso, texto: host.querySelector('[data-texto]').value } }); toast('Listo'); await draw(); } catch (x) { err(x); }
      }));
      host.querySelector('[data-cobro]')?.addEventListener('click', () => AC.cobros({ base: '/api/asesorias/asesorias', id: a.id, titulo: `${p.nombre} · ${a.tipo}`, changed: () => {} }));
      host.querySelector('[data-nota]')?.addEventListener('submit', async (e) => { e.preventDefault(); try { await api(`/api/asesorias/asesorias/${a.id}/avances`, { method: 'POST', body: { texto: e.target.t.value } }); await draw(); } catch (x) { err(x); } });
      host.querySelectorAll('[data-doc]').forEach((s) => s.addEventListener('change', async () => { try { await api(`/api/asesorias/docs/${s.dataset.doc}`, { method: 'PATCH', body: { estado: s.value } }); await draw(); } catch (x) { err(x); } }));
      host.querySelectorAll('[data-up]').forEach((i) => i.addEventListener('change', async () => { try { await sube(`/api/asesorias/docs/${i.dataset.up}/archivo`, i.files[0]); toast('Documento guardado de forma privada'); await draw(); } catch (x) { err(x); } }));
      host.querySelectorAll('[data-deldoc]').forEach((b) => b.addEventListener('click', async () => {
        if (!(await confirm({ title: '¿Quitar este documento?', text: 'Si tiene archivo, también se borra.' }))) return;
        try { await api(`/api/asesorias/docs/${b.dataset.deldoc}`, { method: 'DELETE' }); await draw(); } catch (x) { err(x); }
      }));
      host.querySelectorAll('[data-adddoc]').forEach((b) => b.addEventListener('click', async () => {
        const out = await C.form({ title: 'Nuevo documento', fields: [{ k: 'nombre', label: 'Documento', type: 'text', required: true, full: true }], base: '/api/asesorias' });
        if (!out || out === 'deleted') return;
        try { await api(`/api/asesorias/asesorias/${a.id}/docs`, { method: 'POST', body: { paso: Number(b.dataset.adddoc), nombre: out.nombre } }); await draw(); } catch (x) { err(x); }
      }));
    }
    await draw().catch((x) => { host.innerHTML = `<div class="modal-body text-danger">${esc(x.message)}</div>`; });
  }

  const V = AC.vistas([['procesos', 'Procesos'], ['tipos', 'Tipos de asesoría']], async (k, host) => {
    const tipos = (await api('/api/asesorias/tipos?limit=500')).rows;
    if (k === 'procesos') {
      const t = C.table({ el: host, base: '/api/asesorias', entity: 'asesorias', title: 'proceso', newText: 'Nuevo proceso', readOnly: RO, emptyIcon: 'bi-airplane',
        empty: tipos.length ? 'Aún no hay procesos.' : 'Primero crea un tipo de asesoría en la pestaña «Tipos de asesoría».',
        defaults: () => ({ estado: 'activo' }),
        filters: [{ k: 'estado', options: [['', 'Todos'], ...Object.entries(EST).map(([a, [, l]]) => [a, l])] }, { k: 'tipo_id', options: [['', 'Todos los tipos'], ...tipos.map((x) => [x.id, x.nombre])] }],
        fields: [{ k: 'tipo_id', label: 'Tipo de asesoría', type: 'select', options: tipos.filter((x) => x.activo).map((x) => [x.id, x.nombre]), required: true, full: true },
          { k: 'estudiante_id', label: 'Estudiante', type: 'select', options: AC.opts(estudiantes, 'Otra persona'), hint: 'o escribe los datos' }, { k: 'asesor_id', label: 'Asesor/a', type: 'select', options: AC.opts(profesionales, '—') },
          { k: 'nombre', label: 'Nombre', type: 'text' }, { k: 'telefono', label: 'Celular', type: 'text' }, { k: 'email', label: 'Correo', type: 'email' }, { k: 'precio', label: 'Precio', type: 'money', hint: 'vacío = el del tipo' },
          { k: 'estado', label: 'Estado', type: 'select', options: Object.entries(EST).map(([a, [, l]]) => [a, l]) }, { k: 'prox_fecha', label: 'Próxima acción · fecha', type: 'date' }, { k: 'prox_texto', label: 'Próxima acción · qué', type: 'text' }, { k: 'notas', label: 'Notas', type: 'long' }],
        columns: [{ label: 'Persona', main: true, html: (r) => `${esc(r.nombre)}<div class="small text-body-secondary fw-normal">${esc([r.telefono, r.email].filter(Boolean).join(' · '))}</div>` },
          { label: 'Tipo', html: (r) => `${esc(r.tipo || '')}<div class="small text-body-secondary">${esc(r.asesor || '')}</div>` },
          { label: 'Paso', html: (r) => `<div class="small">${r.estado === 'terminado' ? 'Terminado' : `${r.paso + 1}/${r.total_pasos} · ${esc(r.paso_nombre || '')}`}</div>${C.meter(r.estado === 'terminado' ? r.total_pasos : r.paso, r.total_pasos)}${r.docs_paso ? `<div class="small text-body-secondary">Docs ${r.docs_ok}/${r.docs_paso}</div>` : ''}` },
          { label: 'Próxima acción', html: (r) => (r.prox_fecha ? `<span class="${r.estado === 'activo' && r.prox_fecha < C.todayCo() ? 'text-danger' : ''}">${C.day(r.prox_fecha)}</span><div class="small text-body-secondary">${esc(r.prox_texto || '')}</div>` : '—') },
          { label: 'Pago', html: (r) => AC.chipCobro(r.cobro) },
          { label: 'Estado', html: (r) => `${C.chip(...(EST[r.estado] || EST.activo))}${r.estado === 'activo' && r.dias_sin_avance >= 14 ? `<div class="small text-warning">${r.dias_sin_avance} días sin avance</div>` : ''}` }],
        rowActions: () => '<button class="btn btn-sm btn-outline-primary" data-act="abrir"><i class="bi bi-list-check"></i> Abrir</button>',
        onAction: (a, r) => detalle(r, () => t.load()) });
      t.load();
      return;
    }
    // Tipos: un paso por línea → «Nombre del paso: documento 1; documento 2»
    const aTxt = (e) => ({ ...e, pasos_txt: (e.pasos || []).map((p) => `${p.nombre}${p.docs?.length ? `: ${p.docs.join('; ')}` : ''}`).join('\n') });
    const t = C.table({ el: host, base: '/api/asesorias', entity: 'tipos', title: 'tipo de asesoría', newText: 'Nuevo tipo', readOnly: !CAN, emptyIcon: 'bi-diagram-3', empty: 'Aún no hay tipos de asesoría.',
      columns: [{ label: 'Tipo', main: true, html: (r) => `${esc(r.nombre)}<div class="small text-body-secondary fw-normal">${esc(r.descripcion || '')}</div>` },
        { label: 'Pasos', html: (r) => `<span class="small">${r.pasos.map((p, i) => `${i + 1}. ${esc(p.nombre)}`).join(' → ')}</span>` }, { label: 'Precio', html: (r) => C.money(r.precio) },
        { label: 'Estado', html: (r) => (r.activo ? C.chip('ok', 'Activo') : C.chip('free', 'Inactivo')) }],
      onEdit: async (row, changed) => {
        if (!CAN) return;
        const out = await C.form({ title: row ? 'Editar tipo de asesoría' : 'Nuevo tipo de asesoría', base: '/api/asesorias', values: row ? aTxt(row) : { activo: 1, pasos_txt: 'Diagnóstico\nPlan\nDocumentos\nSolicitud\nViaje' },
          fields: [{ k: 'nombre', label: 'Nombre', type: 'text', required: true, full: true }, { k: 'descripcion', label: 'Descripción', type: 'long' }, { k: 'precio', label: 'Precio base', type: 'money' }, { k: 'activo', label: 'Estado', type: 'bool', check: 'Activo' },
            { k: 'pasos_txt', label: 'Pasos', type: 'long', required: true, hint: 'uno por línea; después de «:» los documentos separados por «;»', placeholder: 'Documentos: Pasaporte; Diploma traducido; Certificado de idioma' }],
          onDelete: row ? () => api(`/api/asesorias/tipos/${row.id}`, { method: 'DELETE' }) : null });
        if (out === 'deleted') { toast('Borrado'); V.reload(); return; }
        if (!out) return;
        const pasos = out.pasos_txt.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [n, d] = l.split(/:(.*)/s); return { nombre: n.trim(), docs: (d || '').split(';').map((x) => x.trim()).filter(Boolean) }; });
        const { pasos_txt, ...resto } = out;
        try { await api(row ? `/api/asesorias/tipos/${row.id}` : '/api/asesorias/tipos', { method: row ? 'PATCH' : 'POST', body: { ...resto, pasos } }); toast('Guardado'); V.reload(); } catch (x) { toast(x.message, false); }
      } });
    t.load();
  });
});
