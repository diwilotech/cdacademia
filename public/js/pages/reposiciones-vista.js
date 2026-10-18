// Reposiciones (componente): fallas por reponer (ausente o con excusa), agendar en un espacio con cupos o en modo virtual,
// marcar hecha, cobrar (queda en los pagos con recibo) o exonerar del cobro; y los espacios disponibles.
// AC.reposiciones(me, cursoId?) devuelve la vista (k, host) para AC.vistas; con cursoId solo muestra ese curso.
// `.todo(host)` pinta fallas y espacios uno debajo del otro (pestaña de cada curso).
window.AC.reposiciones = function (me, cursoId) {
  const { api, esc, toast, modal, table, empty } = window.App;
  const C = window.App.Crud;
  const RO = me.business.readOnly;
  const EST = { pendiente: ['soon', 'Por agendar'], agendada: ['free', 'Agendada'], hecha: ['ok', 'Hecha'] };
  const MARCA = { A: 'Ausente', J: 'Con excusa' };
  const cq = cursoId ? `&curso_id=${cursoId}` : '';

  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const mb = (n) => (n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1048576))} MB`);

  // Sube el archivo por partes de 8 MB (cada una se reintenta) y lo deja listo. onProgreso(0..1)
  async function subirVideo(file, { titulo, curso_id, clase_n }, onProgreso) {
    const dur = await new Promise((res) => { const el = document.createElement('video'); el.preload = 'metadata'; el.onloadedmetadata = () => { URL.revokeObjectURL(el.src); res(el.duration || 0); }; el.onerror = () => res(0); el.src = URL.createObjectURL(file); });
    const v = await api('/api/videos', { method: 'POST', body: { titulo, curso_id, clase_n, mime: file.type, bytes: file.size, duracion_s: Math.round(dur) } });
    try {
      for (let n = 1, off = 0; off < file.size; n++, off += v.parte) {
        let ok = false, ultimo = '';
        for (let intento = 0; intento < 3 && !ok; intento++) {
          const r = await fetch(`/api/videos/${v.id}/partes/${n}`, { method: 'PUT', credentials: 'same-origin', headers: { 'x-app': '1', 'content-type': 'application/octet-stream' }, body: file.slice(off, off + v.parte) }).catch((e) => ({ ok: false, statusText: e.message }));
          ok = r.ok; if (!ok) ultimo = (await r.json?.().catch(() => ({})))?.error || r.statusText;
        }
        if (!ok) throw new Error(`No se pudo subir la parte ${n}: ${ultimo || 'sin conexión'}`);
        onProgreso(Math.min(1, (off + v.parte) / file.size));
      }
      await api(`/api/videos/${v.id}/completar`, { method: 'POST' });
    } catch (x) { await api(`/api/videos/${v.id}`, { method: 'DELETE' }).catch(() => {}); throw x; }
  }

  const vista = async (k, view) => {
    const profs = await AC.listas.profesionales();
    if (k === 'grabadas') {
      view.innerHTML = `<div class="alert alert-light border small"><i class="bi bi-camera-video me-1"></i>Sube la <b>clase grabada</b> y, cuando alguien falte, envíale su enlace desde <b>Fallas por reponer</b>. El enlace es personal y vence, el video lleva su nombre como marca de agua, no se puede descargar y se ve desde un solo lugar a la vez.
        Al verla completa (90 % del tiempo) la reposición queda hecha. <span class="text-body-secondary">Ningún sitio web puede impedir que alguien grabe la pantalla con otro aparato: la marca de agua y el registro dejan rastro de quién la vio.</span></div>
        ${me.canManage && !RO ? '<div class="mb-3"><button class="btn btn-primary" data-up><i class="bi bi-cloud-arrow-up me-1"></i>Subir clase grabada</button></div>' : ''}<div class="dw-card p-0 p-md-2" data-lista></div>`;
      const lista = view.querySelector('[data-lista]');
      const cargar = async () => {
        const rows = (await api(`/api/videos${cursoId ? `?curso_id=${cursoId}` : ''}`)).rows;
        lista.innerHTML = rows.length ? table([
          { label: 'Clase grabada', main: true, html: (r) => `${esc(r.titulo)}<div class="small text-body-secondary fw-normal">${esc(r.curso || '')} · clase ${r.clase_n}</div>` },
          { label: 'Duración', html: (r) => (r.duracion_s ? mmss(r.duracion_s) : '—') }, { label: 'Tamaño', html: (r) => mb(r.bytes) },
          { label: 'Enlaces', html: (r) => `${r.enlaces} · ${r.vistas} vistas` },
          { label: '', cls: 'text-end', html: (r) => (me.canManage && !RO ? `<button class="btn btn-sm btn-outline-danger" data-del="${r.id}" data-t="${esc(r.titulo)}"><i class="bi bi-trash"></i></button>` : '') }], rows)
          : empty('bi-camera-video', 'Aún no hay clases grabadas.');
      };
      lista.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-del]'); if (!b) return;
        if (!(await window.App.confirm({ title: `¿Borrar «${b.dataset.t}»?`, text: 'Se borra el video y los enlaces que ya enviaste dejan de funcionar.', ok: 'Borrar' }))) return;
        try { await api(`/api/videos/${b.dataset.del}`, { method: 'DELETE' }); toast('Clase grabada borrada'); cargar(); } catch (x) { toast(x.message, false); }
      });
      view.querySelector('[data-up]')?.addEventListener('click', async () => {
        const cursos = (await AC.listas.cursos()).filter((q) => q.activo !== 0);
        const { el, m } = modal(`<form><div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Subir clase grabada</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
          <div class="modal-body"><div class="row g-2"><div class="col-12"><label class="form-label small mb-1">Curso</label><select class="form-select" name="curso" required ${cursoId ? 'disabled' : ''}>${cursos.map((q) => `<option value="${q.id}" ${q.id === cursoId ? 'selected' : ''}>${esc(q.nombre)}</option>`).join('')}</select></div>
            <div class="col-12"><label class="form-label small mb-1">Clase</label><select class="form-select" name="clase" required></select></div>
            <div class="col-12"><label class="form-label small mb-1">Título</label><input class="form-control" name="titulo" maxlength="120" required></div>
            <div class="col-12"><label class="form-label small mb-1">Video (MP4, WEBM o MOV, hasta 3 GB)</label><input class="form-control" type="file" name="file" accept="video/mp4,video/webm,video/quicktime" required></div></div>
            <div class="progress mt-3" style="height:8px;display:none" data-prog><div class="progress-bar" style="width:0"></div></div><div class="small text-danger mt-2" data-err></div></div>
          <div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary">Subir</button></div></form>`);
        const f = el.querySelector('form');
        const clases = async () => {
          const id = Number(f.curso.value); if (!id) return;
          const det = await api(`/api/cursos/${id}/detalle`).catch(() => ({ clases: [] }));
          f.clase.innerHTML = det.clases.map((c) => `<option value="${c.n}">Clase ${c.n}${c.fecha ? ` · ${C.day(c.fecha)}` : ''}${c.tema ? ` — ${esc(c.tema)}` : ''}</option>`).join('');
          f.titulo.value = `Clase ${f.clase.value} · ${cursos.find((q) => q.id === id)?.nombre || ''}`;
        };
        f.curso.addEventListener('change', clases); f.clase.addEventListener('change', () => { f.titulo.value = `Clase ${f.clase.value} · ${cursos.find((q) => q.id === Number(f.curso.value))?.nombre || ''}`; });
        clases();
        f.onsubmit = async (e) => {
          e.preventDefault();
          const file = f.file.files[0]; if (!file) return;
          const btn = f.querySelector('.btn-primary'), pr = el.querySelector('[data-prog]'); btn.disabled = true; pr.style.display = '';
          try {
            await subirVideo(file, { titulo: f.titulo.value.trim(), curso_id: Number(f.curso.value), clase_n: Number(f.clase.value) }, (p) => { pr.firstElementChild.style.width = `${Math.round(p * 100)}%`; btn.textContent = `Subiendo ${Math.round(p * 100)}%`; });
            m.hide(); toast('Clase grabada lista'); cargar();
          } catch (x) { el.querySelector('[data-err]').textContent = x.message; btn.disabled = false; btn.textContent = 'Subir'; pr.style.display = 'none'; }
        };
      });
      await cargar();
      return;
    }
    if (k === 'espacios') {
      view.innerHTML = '<p class="small text-body-secondary">Horarios en los que se puede reponer, con cupos. Al agendar, cada estudiante ocupa un cupo.</p><div data-tabla></div>';
      C.table({ el: view.querySelector('[data-tabla]'), fixed: cursoId ? { curso_id: cursoId } : undefined, base: '/api/reposiciones', entity: 'espacios', title: 'espacio', newText: 'Nuevo espacio', readOnly: RO || !me.canManage, emptyIcon: 'bi-calendar-plus',
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
      d = await api(`/api/reposiciones?estado=${view.querySelector('[data-f]').value}${cq}`);
      C.kpis(view.querySelector('[data-kpis]'), [['Por agendar', C.num(d.totales.pendiente), '', 'bi-hourglass-split'], ['Agendadas', C.num(d.totales.agendada), '', 'bi-calendar-check'], ['Hechas', C.num(d.totales.hecha), '', 'bi-check2-circle'],
        ['Valor por reposición', d.valor ? C.money(d.valor) : 'Sin cobro', d.valorVirtual ? `virtual ${C.money(d.valorVirtual)}` : '', 'bi-cash-coin']]);
      view.querySelector('[data-lista]').innerHTML = d.rows.length ? table([
        { label: 'Estudiante', main: true, html: (r) => `${esc(r.estudiante)}<div class="small text-body-secondary fw-normal">${esc(r.curso)}</div>` },
        { label: 'Clase', html: (r) => `Clase ${r.clase_n}${r.clase_fecha ? ` · ${C.day(r.clase_fecha)}` : ''}<div class="small text-body-secondary">${esc(MARCA[r.marca])}${r.tema ? ` · ${esc(r.tema)}` : ''}</div>` },
        { label: 'Reposición', html: (r) => `${C.chip(...EST[r.estado])}${r.espacio_fecha ? `<div class="small">${C.day(r.espacio_fecha)} ${esc(r.espacio_ini)}</div>` : r.modo === 'virtual' && r.id ? '<div class="small">Virtual</div>' : ''}` },
        { label: 'Clase grabada', html: (r) => (r.enlace ? (r.enlace.completado ? C.chip('ok', 'La vio completa') : r.enlace.revocado ? C.chip('free', 'Enlace revocado') : r.enlace.vencido ? C.chip('bad', 'Enlace vencido') : C.chip('soon', `Vista ${r.enlace.pct}%`)) : r.video ? '<span class="small text-body-secondary">Disponible</span>' : '<span class="text-body-secondary">—</span>') },
        { label: 'Cobro', html: (r) => (r.exonerada ? C.chip('free', 'Exonerada') : r.pago_id ? C.chip('ok', 'Cobrada') : d.valor ? '<span class="small text-body-secondary">Pendiente</span>' : '—') },
        { label: '', cls: 'text-end text-nowrap', html: (r, i) => (RO ? '' : `<span data-i="${d.rows.indexOf(r)}">${r.estado !== 'hecha' ? '<button class="btn btn-sm btn-outline-primary" data-act="agendar">Agendar</button> ' : ''}
          <div class="dropdown d-inline-block"><button class="btn btn-sm btn-light" data-bs-toggle="dropdown" aria-label="Más acciones"><i class="bi bi-three-dots"></i></button><ul class="dropdown-menu dropdown-menu-end">
          ${r.video && r.estado !== 'hecha' ? '<li><button class="dropdown-item" data-act="video"><i class="bi bi-camera-video me-1"></i>Enviar clase grabada</button></li>' : ''}
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
    // Enlace personal de la clase grabada: se crea aquí (y se muestra una sola vez) y se manda por WhatsApp o se copia
    async function videoLink(r) {
      const id = await asegurar(r);
      const { el, m } = modal(`<div class="modal-header border-0 pb-0"><div><h2 class="modal-title h5 mb-0">Clase grabada</h2><div class="small text-body-secondary">${esc(r.estudiante)} · clase ${r.clase_n} de ${esc(r.curso)}</div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
        <div class="modal-body"><p class="small mb-2"><b>${esc(r.video.titulo)}</b></p>
          <p class="small text-body-secondary">Crea un enlace personal de ${esc(r.estudiante)}: vence, se ve desde un solo lugar a la vez, lleva su nombre sobre el video y no se puede descargar. Al verlo completo la reposición queda hecha.</p>
          <div class="d-flex gap-2 align-items-end mb-3"><div><label class="form-label small mb-1" for="vd">Vence en (días)</label><input class="form-control" id="vd" type="number" min="1" max="60" value="7" style="width:110px"></div><button class="btn btn-primary" data-crear><i class="bi bi-link-45deg me-1"></i>Crear enlace</button></div>
          <div data-nuevo></div><div class="small text-danger" data-err></div><h3 class="h6 mt-3">Enlaces anteriores</h3><div data-ant><span class="text-body-secondary small">Cargando…</span></div></div>`);
      const ant = async () => {
        const rows = (await api(`/api/reposiciones/${id}/video-links`).catch(() => ({ rows: [] }))).rows;
        el.querySelector('[data-ant]').innerHTML = rows.length ? rows.map((a) => `<div class="d-flex align-items-center gap-2 border-top py-2 small"><span class="flex-grow-1">…${esc(a.prefijo)} · ${C.day(new Date(a.created_at).toISOString().slice(0, 10))} · ${a.vistas} vistas · ${a.pct}%${a.completado_at ? ' · <b>completa</b>' : ''}</span>
          ${a.revocado ? '<span class="badge text-bg-secondary">Revocado</span>' : a.expira < Date.now() ? '<span class="badge text-bg-danger">Vencido</span>' : `<button class="btn btn-sm btn-outline-danger" data-rev="${a.id}">Revocar</button>`}</div>`).join('') : '<span class="text-body-secondary small">Aún no has enviado enlaces.</span>';
      };
      el.addEventListener('click', async (e) => {
        const rv = e.target.closest('[data-rev]');
        if (rv) { try { await api(`/api/video-accesos/${rv.dataset.rev}`, { method: 'DELETE' }); toast('Enlace revocado'); ant(); load(); } catch (x) { toast(x.message, false); } return; }
        if (!e.target.closest('[data-crear]')) return;
        const b = e.target.closest('[data-crear]'); b.disabled = true;
        try {
          const d = await api(`/api/reposiciones/${id}/video-link`, { method: 'POST', body: { video_id: r.video.id, dias: el.querySelector('#vd').value } });
          const msg = `Hola ${r.estudiante.split(' ')[0]}, esta es la clase grabada de la clase ${r.clase_n} de ${r.curso}. Es un enlace personal (no lo compartas), vence en ${d.dias} días y debes verla completa para que cuente como reposición: ${d.url}`;
          const tel = String(r.telefono || '').replace(/[^\d]/g, '');
          el.querySelector('[data-nuevo]').innerHTML = `<div class="alert alert-success small"><div class="mb-1">Copia el enlace ahora: no se vuelve a mostrar.</div><div class="input-group mb-2"><input class="form-control form-control-sm font-monospace" readonly value="${esc(d.url)}"><button class="btn btn-sm btn-primary" data-copiar><i class="bi bi-clipboard"></i></button></div>
            <a class="btn btn-sm btn-success" target="_blank" rel="noopener" href="https://wa.me/${tel}?text=${encodeURIComponent(msg)}"><i class="bi bi-whatsapp me-1"></i>Enviar por WhatsApp</a></div>`;
          el.querySelector('[data-copiar]').onclick = async () => { try { await navigator.clipboard.writeText(d.url); toast('Enlace copiado'); } catch { el.querySelector('input.font-monospace').select(); } };
          ant(); load();
        } catch (x) { el.querySelector('[data-err]').textContent = x.message; }
        b.disabled = false;
      });
      ant();
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
        if (a === 'video') return await videoLink(r);
        if (a === 'cobrar') return await cobrar(r);
        const id = await asegurar(r);
        await api(`/api/reposiciones/${id}`, { method: 'PATCH', body: a === 'exonerar' ? { exonerada: !r.exonerada } : { estado: a } });
        toast('Guardado'); load();
      } catch (x) { toast(x.message, false); }
    });
    await load();
  };
  vista.todo = async (host) => {
    host.innerHTML = '<div data-fallas></div><h2 class="h6 mt-4">Espacios para reponer</h2><div data-esp></div><h2 class="h6 mt-4">Clases grabadas</h2><div data-grab></div>';
    await Promise.all([vista('fallas', host.querySelector('[data-fallas]')), vista('espacios', host.querySelector('[data-esp]')), vista('grabadas', host.querySelector('[data-grab]'))]);
  };
  return vista;
};
