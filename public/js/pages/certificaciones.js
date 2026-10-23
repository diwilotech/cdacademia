// Certificaciones: exámenes oficiales externos (ÖSD, DELE, TOEFL…). Convocatorias con sus candidatos (cobro, documento, hoja escaneada, puntos y resultado)
// y el catálogo de exámenes con sus reglas (partes, puntos máximos y mínimos), ligado al curso que prepara para cada uno.
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, modal } = window.App;
  const C = window.App.Crud;
  const RO = me.business.readOnly, CAN = me.canManage && !RO;
  const [cursos, estudiantes] = await Promise.all([AC.listas.cursos(), AC.listas.estudiantes()]);
  const RES = { pendiente: ['free', 'Pendiente'], aprobado: ['ok', 'Aprobó'], no_aprobado: ['bad', 'No aprobó'] };
  const ESTV = { abierta: ['ok', 'Abierta'], cerrada: ['soon', 'Cerrada'], realizada: ['free', 'Realizada'], cancelada: ['bad', 'Cancelada'] };
  const si = (b) => (b ? '<i class="bi bi-check-circle-fill text-success"></i>' : '<i class="bi bi-circle text-secondary"></i>');
  const refresh = () => V.reload();

  /* ---- puntos de un candidato ---- */
  function puntos(k, changed) {
    if (!k.partes.length) { toast('Este examen no tiene partes configuradas: agrégalas en la pestaña Exámenes', false); return; }
    const val = (o, n) => (o && o[n] != null ? o[n] : '');
    const { el, m } = modal(`<form><div class="modal-header border-0 pb-0"><div><h2 class="modal-title h5">Puntos · ${esc(k.nombre)}</h2><div class="small text-body-secondary">${esc(k.examen)} · ${Object.entries(k.minimos).map(([g, v]) => `mínimo ${esc(g)}: ${v}`).join(' · ')}</div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Parte</th><th>Evaluador 1</th><th>Evaluador 2</th><th>Tercero</th><th>Final</th></tr></thead><tbody>
      ${k.partes.map((p, i) => `<tr><td>${esc(p.n)} <span class="small text-body-secondary">/ ${p.max}${p.g !== 'total' ? ` · ${esc(p.g)}` : ''}</span></td>
        ${['eval1', 'eval2', 'tercero', 'puntos'].map((c) => `<td><input class="form-control form-control-sm" type="number" min="0" max="${p.max}" step="0.5" name="${c}_${i}" value="${esc(val(k[c], p.n))}" ${c === 'puntos' ? 'required' : ''}></td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="small text-body-secondary">Si dos evaluadores califican por separado, acuerden la nota y escríbanla en «Final»; si no coinciden, decide el tercero. La app solo suma y compara con los mínimos.</div>
      <div class="small text-danger mt-2" data-err></div></div>
      <div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary">Guardar y calcular</button></div></form>`, { size: 'modal-lg' });
    el.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target, body = {};
      for (const c of ['eval1', 'eval2', 'tercero', 'puntos']) { body[c] = {}; k.partes.forEach((p, i) => { const v = f.elements[`${c}_${i}`].value; if (v !== '') body[c][p.n] = Number(v); }); }
      try { const r = await api(`/api/certificaciones/candidatos/${k.id}/calcular`, { method: 'POST', body }); m.hide(); toast(`${RES[r.resultado]?.[1] || r.resultado} · ${r.detalle}`, r.resultado !== 'no_aprobado'); changed(); } catch (x) { el.querySelector('[data-err]').textContent = x.message; }
    };
  }

  async function subirHoja(k, file, changed) {
    if (!file) return;
    const r = await fetch(`/api/certificaciones/candidatos/${k.id}/hoja?nombre=${encodeURIComponent(file.name)}`, { method: 'POST', credentials: 'same-origin', headers: { 'x-app': '1' }, body: file });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'No se pudo subir');
    toast('Hoja guardada de forma privada'); changed();
  }

  /* ---- inscribir estudiantes del curso que prepara el examen ---- */
  async function elegibles(v, changed) {
    const d = await api(`/api/certificaciones/elegibles?convocatoria_id=${v.id}`);
    if (!d.curso) { toast('Este examen no tiene un curso asociado: asócialo en la pestaña Exámenes', false); return; }
    if (!d.rows.length) { toast('No hay estudiantes pendientes de inscribir en ese curso'); return; }
    const { el, m } = modal(`<form><div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Estudiantes del curso</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body">${d.rows.map((s) => `<div class="form-check"><input class="form-check-input" type="checkbox" id="s${s.id}" value="${s.id}" checked><label class="form-check-label" for="s${s.id}">${esc(s.nombre)} <span class="small text-body-secondary">${esc(s.documento || '')}</span></label></div>`).join('')}
      <div class="small text-danger mt-2" data-err></div></div><div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary">Inscribir</button></div></form>`);
    el.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      let n = 0, err = '';
      for (const i of el.querySelectorAll('input:checked')) { try { await api('/api/certificaciones/candidatos', { method: 'POST', body: { convocatoria_id: v.id, estudiante_id: i.value, modalidad: v.modalidad === 'Digital' ? 'Digital' : 'Papel' } }); n++; } catch (x) { err = x.message; break; } }
      if (err) el.querySelector('[data-err]').textContent = `${n} inscritos; luego: ${err}`; else { m.hide(); toast(`${n} inscritos`); }
      changed();
    };
  }

  /* ---- candidatos de una convocatoria ---- */
  function candidatos(v, changed) {
    const { el } = modal(`<div class="modal-header border-0 pb-0"><div><h2 class="modal-title h5">${esc(v.examen)}</h2><div class="small text-body-secondary">${C.day(v.fecha)} · ${esc(v.modalidad)} · ${C.money(v.precio_final)}${v.cupo ? ` · cupo ${v.cupo}` : ''}</div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><div data-t></div><div class="small text-body-secondary mt-2">Solo se admite con pago completo y documento con foto vigente. Quien llega después de empezar el examen no puede entrar. La hoja escaneada es privada; la app no guarda claves de respuesta oficiales.</div></div>`, { size: 'modal-xl' });
    el.addEventListener('hidden.bs.modal', changed);
    const t = C.table({ el: el.querySelector('[data-t]'), base: '/api/certificaciones', entity: 'candidatos', title: 'candidato', newText: 'Inscribir candidato', readOnly: RO, fixed: { convocatoria_id: v.id }, emptyIcon: 'bi-person-vcard', empty: 'Aún no hay candidatos.',
      defaults: () => ({ modalidad: v.modalidad === 'Digital' ? 'Digital' : 'Papel' }),
      extraButtons: RO ? '' : '<button class="btn btn-outline-primary" data-el><i class="bi bi-mortarboard me-1"></i>Del curso</button>',
      fields: [{ k: 'estudiante_id', label: 'Estudiante', type: 'select', options: AC.opts(estudiantes, 'Otra persona'), hint: 'o escribe los datos' }, { k: 'nombre', label: 'Nombre completo', type: 'text' }, { k: 'documento', label: 'Documento', type: 'text' }, { k: 'telefono', label: 'Celular', type: 'text' },
        { k: 'email', label: 'Correo', type: 'email' }, { k: 'modalidad', label: 'Modalidad', type: 'select', options: [['Papel', 'Papel'], ['Digital', 'Digital']] },
        { k: 'doc_foto', label: 'Documento con foto', type: 'bool', check: 'Recibido y vigente' }, { k: 'acepta', label: 'Condiciones', type: 'bool', check: 'Acepta el reglamento del examen, las condiciones del centro y la política de datos' },
        { k: 'certificado_fecha', label: 'Certificado entregado', type: 'date' }, { k: 'notas', label: 'Notas', type: 'long' }],
      columns: [{ label: 'Candidato', main: true, html: (r) => `${esc(r.nombre)}<div class="small text-body-secondary fw-normal">${esc(r.documento || '')} ${r.modalidad === 'Digital' ? '· digital' : ''}</div>` },
        { label: 'Pago', html: (r) => AC.chipCobro(r.cobro) }, { label: 'Requisitos', html: (r) => `<span title="Documento con foto">${si(r.doc_foto)}</span> <span title="Condiciones aceptadas">${si(r.acepta)}</span> <span title="Hoja escaneada">${si(r.hoja)}</span>` },
        { label: 'Resultado', html: (r) => `${C.chip(...(RES[r.resultado] || RES.pendiente))}${r.detalle ? `<div class="small text-body-secondary">${esc(r.detalle)}</div>` : ''}` }],
      rowActions: (r) => `<button class="btn btn-sm btn-outline-primary" data-act="cobro"><i class="bi bi-cash"></i></button> <button class="btn btn-sm btn-outline-primary" data-act="puntos"><i class="bi bi-calculator"></i> Puntos</button>
        ${r.hoja ? `<a class="btn btn-sm btn-light" target="_blank" href="/api/certificaciones/candidatos/${r.id}/hoja" title="Ver hoja"><i class="bi bi-file-earmark-text"></i></a>` : ''}
        ${RO ? '' : `<label class="btn btn-sm btn-light mb-0" title="Subir hoja escaneada"><i class="bi bi-upload"></i><input type="file" hidden accept="image/*,.pdf" data-hoja="${r.id}"></label>`}`,
      onAction: (a, r) => {
        if (a === 'cobro') AC.cobros({ base: '/api/certificaciones/candidatos', id: r.id, titulo: `${r.nombre} · ${v.examen}`, changed: () => t.load() });
        if (a === 'puntos') puntos(r, () => t.load());
      } });
    el.addEventListener('change', async (e) => { const i = e.target.closest('[data-hoja]'); if (!i) return; try { await subirHoja({ id: i.dataset.hoja }, i.files[0], () => t.load()); } catch (x) { toast(x.message, false); } });
    el.addEventListener('click', (e) => { if (e.target.closest('[data-el]')) elegibles(v, () => t.load()); });
    t.load();
  }

  const examenes = async () => (await api('/api/certificaciones/examenes?limit=500')).rows;
  const V = AC.vistas([['conv', 'Convocatorias'], ['exam', 'Exámenes']], async (k, host) => {
    const ex = await examenes();
    if (k === 'conv') {
      const t = C.table({ el: host, base: '/api/certificaciones', entity: 'convocatorias', title: 'convocatoria', newText: 'Nueva convocatoria', readOnly: !CAN, emptyIcon: 'bi-patch-check',
        empty: ex.length ? 'Aún no hay convocatorias.' : 'Primero crea un examen en la pestaña «Exámenes».',
        defaults: () => ({ modalidad: 'Papel', estado: 'abierta' }),
        filters: [{ k: 'estado', options: [['', 'Todas'], ...Object.entries(ESTV).map(([a, [, l]]) => [a, l])] }],
        fields: [{ k: 'examen_id', label: 'Examen', type: 'select', options: ex.map((e) => [e.id, e.nombre]), required: true, full: true }, { k: 'fecha', label: 'Fecha del examen', type: 'date', required: true }, { k: 'cierre', label: 'Cierre de inscripción', type: 'date' },
          { k: 'cupo', label: 'Cupo', type: 'int', hint: '0 = sin límite' }, { k: 'precio', label: 'Precio', type: 'money', hint: 'vacío = el del examen' }, { k: 'modalidad', label: 'Modalidad', type: 'select', options: [['Papel', 'Papel'], ['Digital', 'Digital'], ['Ambas', 'Ambas']] },
          { k: 'estado', label: 'Estado', type: 'select', options: Object.entries(ESTV).map(([a, [, l]]) => [a, l]) }, { k: 'lugar', label: 'Lugar', type: 'text', full: true }, { k: 'nota', label: 'Nota', type: 'long' }],
        columns: [{ label: 'Examen', main: true, html: (r) => `${esc(r.examen || '—')}<div class="small text-body-secondary fw-normal">${esc(r.lugar || '')}</div>` },
          { label: 'Fecha', html: (r) => `${C.day(r.fecha)}${r.cierre ? `<div class="small text-body-secondary">cierre ${C.day(r.cierre)}</div>` : ''}` }, { label: 'Modalidad', html: (r) => esc(r.modalidad) },
          { label: 'Candidatos', html: (r) => `${r.candidatos}/${r.cupo || '∞'}` }, { label: 'Precio', html: (r) => C.money(r.precio_final) }, { label: 'Estado', html: (r) => C.chip(...(ESTV[r.estado] || ESTV.abierta)) }],
        rowActions: () => '<button class="btn btn-sm btn-outline-primary" data-act="cand"><i class="bi bi-people"></i> Candidatos</button>',
        onAction: (a, r) => candidatos(r, () => t.load()) });
      t.load();
      return;
    }
    // Catálogo de exámenes: partes «Nombre, puntos, grupo» una por línea; mínimos «grupo = puntos».
    const aTxt = (e) => ({ ...e, partes_txt: (e.partes || []).map((p) => `${p.n}, ${p.max}, ${p.g}`).join('\n'), minimos_txt: Object.entries(e.minimos || {}).map(([g, v]) => `${g} = ${v}`).join('\n') });
    const t = C.table({ el: host, base: '/api/certificaciones', entity: 'examenes', title: 'examen', newText: 'Nuevo examen', readOnly: !CAN, emptyIcon: 'bi-clipboard-check', empty: 'Aún no hay exámenes.',
      extraButtons: CAN ? '<button class="btn btn-outline-secondary" data-ej title="Crea ÖSD A1, A2 y B2"><i class="bi bi-magic me-1"></i>Cargar ejemplos ÖSD</button>' : '',
      columns: [{ label: 'Examen', main: true, html: (r) => `${esc(r.nombre)}<div class="small text-body-secondary fw-normal">${esc(r.entidad)}${r.nivel ? ` · ${esc(r.nivel)}` : ''}</div>` },
        { label: 'Curso que prepara', html: (r) => esc(r.curso || '—') }, { label: 'Partes', html: (r) => `<span class="small">${r.partes.map((p) => `${esc(p.n)} ${p.max}`).join(' · ') || '—'}</span>` },
        { label: 'Mínimos', html: (r) => `<span class="small">${Object.entries(r.minimos).map(([g, v]) => `${esc(g)} ${v}`).join(' · ') || '—'}</span>` }, { label: 'Precio', html: (r) => C.money(r.precio) },
        { label: 'Estado', html: (r) => (r.activo ? C.chip('ok', 'Activo') : C.chip('free', 'Inactivo')) }],
      onEdit: async (row, changed) => {
        if (!CAN) return;
        const out = await C.form({ title: row ? 'Editar examen' : 'Nuevo examen', base: '/api/certificaciones', values: row ? aTxt(row) : { entidad: 'ÖSD', activo: 1 },
          fields: [{ k: 'entidad', label: 'Entidad', type: 'text', required: true, placeholder: 'ÖSD, DELE, TOEFL…' }, { k: 'nombre', label: 'Nombre', type: 'text', required: true }, { k: 'nivel', label: 'Nivel', type: 'text', placeholder: 'B1' },
            { k: 'curso_id', label: 'Curso que prepara', type: 'select', options: AC.opts(cursos, '—') }, { k: 'precio', label: 'Precio base', type: 'money' }, { k: 'activo', label: 'Estado', type: 'bool', check: 'Activo' },
            { k: 'partes_txt', label: 'Partes', type: 'long', hint: 'una por línea: nombre, puntos máximos, grupo', placeholder: 'Lesen, 30, escrita\nHören, 30, escrita\nSchreiben, 15, escrita\nSprechen, 25, oral' },
            { k: 'minimos_txt', label: 'Mínimos para aprobar', type: 'long', hint: 'uno por línea: grupo = puntos', placeholder: 'escrita = 38\noral = 12' }, { k: 'reglas', label: 'Reglas de la entidad (texto)', type: 'long' }],
          onDelete: row ? () => api(`/api/certificaciones/examenes/${row.id}`, { method: 'DELETE' }) : null });
        if (out === 'deleted') { toast('Borrado'); V.reload(); return; }
        if (!out) return;
        const partes = out.partes_txt.split('\n').map((l) => l.split(',').map((x) => x.trim())).filter((a) => a[0]).map(([n, max, g]) => ({ n, max: Number(max), g: g || 'total' }));
        const minimos = Object.fromEntries(out.minimos_txt.split('\n').map((l) => l.split('=').map((x) => x.trim())).filter((a) => a[0] && a[1] !== undefined).map(([g, v]) => [g, Number(v)]));
        const { partes_txt, minimos_txt, ...resto } = out;
        try { await api(row ? `/api/certificaciones/examenes/${row.id}` : '/api/certificaciones/examenes', { method: row ? 'PATCH' : 'POST', body: { ...resto, partes, minimos } }); toast('Guardado'); V.reload(); } catch (x) { toast(x.message, false); }
      } });
    t.load();
    host.addEventListener('click', async (e) => {
      if (!e.target.closest('[data-ej]')) return;
      try { const r = await api('/api/certificaciones/cargar-ejemplos', { method: 'POST', body: {} }); toast(r.creados ? `${r.creados} exámenes creados: verifica los puntos con la versión vigente de la entidad` : 'Los ejemplos ya estaban'); V.reload(); } catch (x) { toast(x.message, false); }
    });
  });
});
