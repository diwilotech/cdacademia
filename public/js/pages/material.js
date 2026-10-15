// Material de estudio: biblioteca por área y nivel con bloques de texto, enlaces, videos y archivos (fotos, PDF…).
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, confirm, modal } = window.App;
  const C = window.App.Crud;
  const view = document.querySelector('[data-view]');
  const areas = await AC.listas.areas();
  const RO = me.business.readOnly;
  const nombreArea = (id) => areas.find((a) => a.id === id)?.nombre;
  const archivoUrl = (k, dl) => `/api/material/archivos/${encodeURIComponent(k)}${dl ? '?dl=1' : ''}`;
  const yt = (u) => u.match(/(?:youtu\.be\/|v=|shorts\/)([\w-]{11})/)?.[1];
  view.innerHTML = '<div data-tabla></div>';

  function ver(m) {
    const bloque = (b) => {
      const t = b.titulo ? `<h3 class="h6 mt-3">${esc(b.titulo)}</h3>` : '';
      if (b.tipo === 'texto') return `${t}<p style="white-space:pre-wrap">${esc(b.texto)}</p>`;
      if (b.tipo === 'video' && yt(b.url)) return `${t}<div class="ratio ratio-16x9 rounded-3 overflow-hidden"><iframe src="https://www.youtube-nocookie.com/embed/${yt(b.url)}" title="${esc(b.titulo || 'Video')}" allowfullscreen loading="lazy"></iframe></div>`;
      if (b.tipo === 'enlace' || b.tipo === 'video') return `${t}<a href="${esc(b.url)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right me-1"></i>${esc(b.url)}</a>`;
      if (/^image\//.test(b.tipoArchivo)) return `${t}<img src="${archivoUrl(b.key)}" alt="${esc(b.nombre)}" class="img-fluid rounded-3" loading="lazy">`;
      return `${t}<a class="btn btn-sm btn-outline-primary" href="${archivoUrl(b.key)}" target="_blank" rel="noopener"><i class="bi bi-file-earmark me-1"></i>${esc(b.nombre)}</a>`;
    };
    modal(`<div class="modal-header border-0 pb-0"><div><h2 class="modal-title h5 mb-0">${esc(m.titulo)}</h2><div class="small text-body-secondary">${[nombreArea(m.area_id), m.nivel].filter(Boolean).map(esc).join(' · ')}</div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body">${m.descripcion ? `<p class="text-body-secondary">${esc(m.descripcion)}</p>` : ''}${m.bloques.map(bloque).join('') || '<p class="text-body-secondary">Este material aún no tiene contenido.</p>'}</div>`, { size: 'modal-lg' });
  }

  async function editar(row, changed) {
    if (RO) return;
    const m = row || { bloques: [] };
    let bloques = m.bloques.map((b) => ({ ...b }));
    const { el, m: mm } = modal(`<form><div class="modal-header border-0 pb-0"><h2 class="modal-title h5">${row ? 'Editar material' : 'Nuevo material'}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><div class="row g-2">
        <div class="col-12"><label class="form-label small mb-1" for="mt">Título</label><input class="form-control" id="mt" name="titulo" value="${esc(m.titulo || '')}" required></div>
        <div class="col-sm-6"><label class="form-label small mb-1" for="ma">Área</label><select class="form-select" id="ma" name="area_id">${AC.opts(areas, 'Sin área').map(([v, l]) => `<option value="${v}" ${String(v) === String(m.area_id ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="col-sm-6"><label class="form-label small mb-1" for="mn">Nivel</label><select class="form-select" id="mn" name="nivel"><option value="">Todos</option>${AC.NIVELES.map((n) => `<option ${m.nivel === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="col-12"><label class="form-label small mb-1" for="md">Descripción</label><textarea class="form-control" id="md" name="descripcion" rows="2">${esc(m.descripcion || '')}</textarea></div>
        <div class="col-12"><div class="form-label small mb-1">Contenido</div><div data-bloques></div>
          <div class="d-flex flex-wrap gap-2 mt-2">${[['texto', 'bi-text-paragraph', 'Texto'], ['enlace', 'bi-link-45deg', 'Enlace'], ['video', 'bi-youtube', 'Video'], ['archivo', 'bi-paperclip', 'Archivo']].map(([t, i, l]) => `<button type="button" class="btn btn-sm btn-outline-primary" data-add="${t}"><i class="bi ${i} me-1"></i>${l}</button>`).join('')}
          <input type="file" hidden data-file></div></div>
      </div><div class="small text-danger mt-2" data-err></div></div>
      <div class="modal-footer border-0 pt-0 justify-content-between"><span>${row && me.canManage ? '<button type="button" class="btn btn-outline-danger btn-sm" data-del><i class="bi bi-trash me-1"></i>Borrar</button>' : ''}</span>
        <span><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button> <button class="btn btn-primary">Guardar</button></span></div></form>`, { size: 'modal-lg' });
    const box = el.querySelector('[data-bloques]'), err = el.querySelector('[data-err]'), file = el.querySelector('[data-file]');
    const draw = () => {
      box.innerHTML = bloques.map((b, i) => `<div class="border rounded-3 p-2 mb-2" data-i="${i}"><div class="d-flex gap-2 align-items-center mb-1"><span class="badge text-bg-light">${AC.cap(b.tipo)}</span>
          <input class="form-control form-control-sm" data-k="titulo" value="${esc(b.titulo || '')}" placeholder="Título (opcional)">
          <button type="button" class="btn btn-sm btn-light" data-up aria-label="Subir"><i class="bi bi-arrow-up"></i></button><button type="button" class="btn btn-sm btn-light" data-x aria-label="Quitar"><i class="bi bi-x-lg"></i></button></div>
        ${b.tipo === 'texto' ? `<textarea class="form-control form-control-sm" data-k="texto" rows="3">${esc(b.texto || '')}</textarea>`
          : b.tipo === 'archivo' ? `<div class="small"><i class="bi bi-paperclip me-1"></i>${esc(b.nombre)}</div>`
          : `<input class="form-control form-control-sm" data-k="url" value="${esc(b.url || '')}" placeholder="https://…">`}</div>`).join('') || '<p class="small text-body-secondary mb-0">Agrega texto, enlaces, videos o archivos.</p>';
    };
    draw();
    box.addEventListener('input', (e) => { const i = e.target.closest('[data-i]')?.dataset.i; if (i != null && e.target.dataset.k) bloques[i][e.target.dataset.k] = e.target.value; });
    box.addEventListener('click', (e) => {
      const i = +e.target.closest('[data-i]')?.dataset.i;
      if (e.target.closest('[data-x]')) { bloques.splice(i, 1); draw(); }
      if (e.target.closest('[data-up]') && i > 0) { [bloques[i - 1], bloques[i]] = [bloques[i], bloques[i - 1]]; draw(); }
    });
    el.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.add === 'archivo') return file.click();
      bloques.push({ tipo: b.dataset.add }); draw();
    }));
    file.addEventListener('change', async () => {
      const fl = file.files[0]; if (!fl) return;
      if (fl.size > 20 * 1024 * 1024) { err.textContent = 'El archivo supera los 20 MB'; return; }
      err.textContent = 'Subiendo…';
      try {
        const r = await fetch(`/api/material/archivos?nombre=${encodeURIComponent(fl.name)}`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': fl.type || 'application/octet-stream', 'x-app': '1' }, body: fl });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || 'No se pudo subir');
        bloques.push({ tipo: 'archivo', titulo: '', ...d }); draw(); err.textContent = '';
      } catch (x) { err.textContent = x.message; }
      file.value = '';
    });
    el.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!(await confirm({ title: `¿Borrar «${row.titulo}»?`, text: 'Se borran también sus archivos.' }))) return;
      try { await api(`/api/material/material/${row.id}`, { method: 'DELETE' }); mm.hide(); toast('Borrado'); changed(); } catch (x) { err.textContent = x.message; }
    });
    const f = el.querySelector('form');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const body = { titulo: f.titulo.value, area_id: f.area_id.value, nivel: f.nivel.value, descripcion: f.descripcion.value, bloques };
      try { await api(row ? `/api/material/material/${row.id}` : '/api/material/material', { method: row ? 'PATCH' : 'POST', body }); mm.hide(); toast('Guardado'); changed(); }
      catch (x) { err.textContent = x.message; }
    };
  }

  const ICON = { texto: 'bi-text-paragraph', enlace: 'bi-link-45deg', video: 'bi-youtube', archivo: 'bi-paperclip' };
  C.table({ el: view.querySelector('[data-tabla]'), base: '/api/material', entity: 'material', title: 'material', newText: 'Nuevo material', emptyIcon: 'bi-journal-richtext', empty: 'Aún no hay material de estudio.',
    readOnly: RO, onOpen: ver, onEdit: editar,
    filters: [{ k: 'area_id', options: [['', 'Todas las áreas'], ...areas.map((a) => [a.id, a.nombre])] }, { k: 'nivel', options: [['', 'Todos los niveles'], ...AC.NIVELES.map((n) => [n, n])] }],
    columns: [
      { label: 'Material', main: true, html: (r) => `${esc(r.titulo)}${r.descripcion ? `<div class="small text-body-secondary fw-normal text-truncate" style="max-width:420px">${esc(r.descripcion)}</div>` : ''}` },
      { label: 'Área', html: (r) => esc(nombreArea(r.area_id) || '—') }, { label: 'Nivel', html: (r) => esc(r.nivel || 'Todos') },
      { label: 'Contenido', html: (r) => r.bloques.map((b) => `<i class="bi ${ICON[b.tipo]} me-1" title="${esc(b.tipo)}"></i>`).join('') || '—' }],
    rowActions: () => `<button class="btn btn-sm btn-outline-primary" data-act="ver"><i class="bi bi-eye me-1"></i>Ver</button>`,
    onAction: (a, r) => ver(r),
  }).load();
});
