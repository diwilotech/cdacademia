// Material de estudio: biblioteca general (tarjetas) con filtros por área, nivel, curso y uso; cada material es un documento
// (texto con formato, imágenes con texto al lado, PDF, enlaces y videos) que se edita en una sola superficie como Notas.
// Un material vive una vez en la biblioteca y se enlaza desde las clases de uno o varios cursos.
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, confirm, modal } = window.App;
  const C = window.App.Crud;
  const view = document.querySelector('[data-view]');
  const areas = await AC.listas.areas();
  const RO = me.business.readOnly;
  const D = AC.doc;
  const abrirEditor = AC.editorMaterial({ me, areas });
  const area = (id) => areas.find((a) => a.id === id);
  let todos = [];
  const st = { q: '', area: '', nivel: '', curso: '', uso: '', arch: '' };

  document.querySelector('[data-acciones]').innerHTML = RO ? '' : '<button class="btn btn-primary" data-nuevo><i class="bi bi-plus-lg me-1"></i>Nuevo material</button>';
  document.querySelector('[data-nuevo]')?.addEventListener('click', () => abrirEditor(null, cargar));

  const archivos = (m) => m.bloques.filter((b) => b.tipo === 'archivo');
  const temas = (m) => m.bloques.filter((b) => b.tipo === 'titulo' || b.tipo === 'subtitulo').map((b) => b.texto.replace(/[*^~]+/g, '')).filter(Boolean);

  function pintar() {
    const lista = todos.filter((m) => {
      if (st.q && ![m.titulo, m.descripcion, ...temas(m)].join(' ').toLowerCase().includes(st.q.toLowerCase())) return false;
      if (st.area === '_sin' ? m.area_id : st.area && String(m.area_id) !== st.area) return false;
      if (st.nivel && m.nivel !== st.nivel) return false;
      const nu = m.cursos.length;
      if (st.uso === 'varios' ? nu < 2 : st.uso === 'uno' ? nu !== 1 : st.uso === 'ninguno' ? nu !== 0 : false) return false;
      if (st.curso === '_sin' ? nu : st.curso && !m.cursos.some((c) => String(c.id) === st.curso)) return false;
      if (st.arch === 'con' && !archivos(m).length) return false;
      if (st.arch === 'sin' && archivos(m).length) return false;
      return true;
    });
    view.querySelector('[data-cont]').textContent = `${lista.length} de ${todos.length} ${todos.length === 1 ? 'material' : 'materiales'}`;
    view.querySelector('[data-limpiar]').hidden = !(st.area || st.nivel || st.curso || st.uso || st.arch || st.q);
    view.querySelector('[data-grid]').innerHTML = lista.map((m) => {
      const ar = area(m.area_id), arc = archivos(m), tm = temas(m);
      return `<div class="col-md-6 col-xl-4"><div class="dw-card h-100 d-flex flex-column mat-card" data-id="${m.id}">
        <div class="d-flex justify-content-between align-items-start mb-1 gap-2">
          ${ar ? `<span class="badge text-bg-primary badge-area">${esc(ar.nombre)}</span>` : '<span class="badge text-bg-light border">Sin área</span>'}
          <span class="small text-body-secondary">${m.nivel ? `${esc(m.nivel)} · ` : ''}${arc.length} ${arc.length === 1 ? 'archivo' : 'archivos'}</span></div>
        <h3 class="h5 mb-1">${esc(m.titulo)}</h3>
        <div class="mb-2">${m.cursos.length > 1 ? `<span class="badge text-bg-info"><i class="bi bi-diagram-3 me-1"></i>En ${m.cursos.length} cursos</span>` : m.cursos.length === 1 ? '<span class="badge text-bg-secondary">Solo en 1 curso</span>' : '<span class="badge text-bg-warning">Sin usar en cursos</span>'}</div>
        ${m.descripcion ? `<p class="small text-body-secondary mb-2">${esc(m.descripcion)}</p>` : ''}
        ${tm.length ? `<div class="small mb-2">${tm.slice(0, 4).map((t) => `<div class="text-truncate"><i class="bi bi-dot"></i>${esc(t)}</div>`).join('')}${tm.length > 4 ? `<div class="text-body-secondary">+${tm.length - 4} más</div>` : ''}</div>` : ''}
        <div class="small flex-grow-1 mb-2">${arc.slice(0, 3).map((b) => `<div class="text-truncate"><i class="bi ${D.iconoArchivo(b)}" style="color:var(--dw-p)"></i> ${esc(b.nombre)}</div>`).join('')}</div>
        <div class="small text-body-secondary mb-2"><i class="bi bi-journal-bookmark"></i> ${m.cursos.length ? m.cursos.map((c) => esc(c.nombre)).join(' · ') : 'No está en ningún curso todavía'}</div>
        <div class="d-flex gap-2"><button class="btn btn-sm btn-primary flex-grow-1" data-act="${RO ? 'ver' : 'abrir'}">${RO ? 'Ver' : 'Abrir'}</button>
          ${RO ? '' : `<button class="btn btn-sm btn-outline-secondary" data-act="ver" title="Ver como lo verá el equipo" aria-label="Ver"><i class="bi bi-eye"></i></button>
          <button class="btn btn-sm btn-outline-secondary" data-act="duplicar" title="Duplicar" aria-label="Duplicar"><i class="bi bi-copy"></i></button>`}
          ${me.canManage && !RO ? '<button class="btn btn-sm btn-outline-danger" data-act="borrar" title="Eliminar" aria-label="Eliminar"><i class="bi bi-trash"></i></button>' : ''}</div></div></div>`;
    }).join('') || `<div class="col-12"><div class="dw-card text-body-secondary small">${todos.length ? 'Ningún material coincide con los filtros.' : 'Aún no hay material. Crea el primero con «Nuevo material»; luego podrás usarlo en las clases de cualquier curso.'}</div></div>`;
  }

  function ver(m) {
    const { el } = modal(`<div class="modal-header border-0 pb-0"><div><h2 class="modal-title h5 mb-0">${esc(m.titulo)}</h2><div class="small text-body-secondary">${[area(m.area_id)?.nombre, m.nivel].filter(Boolean).map(esc).join(' · ')}</div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body">${D.html(m.bloques)}</div>`, { size: 'modal-lg modal-dialog-scrollable' });
    el.addEventListener('click', (e) => D.click(e, (i) => m.bloques[+i]));
  }

  async function cargar() {
    const [{ rows }, { cursos }] = await Promise.all([api('/api/material/material?limit=500'), api('/api/cursos/lista')]);
    todos = rows;
    const sel = view.querySelector('[data-f-curso]'), v = sel.value;
    sel.innerHTML = `<option value="">Todos los cursos</option><option value="_sin">Sin curso</option>${(cursos || []).map((k) => `<option value="${k.id}">${esc(k.nombre)}</option>`).join('')}`;
    sel.value = v;
    pintar();
  }

  view.innerHTML = `<div class="d-flex flex-wrap gap-2 mb-2 align-items-center">
      <input class="form-control" data-q placeholder="Buscar material o tema…" style="max-width:240px" aria-label="Buscar">
      <select class="form-select w-auto" data-f-area aria-label="Área"><option value="">Todas las áreas</option>${areas.map((a) => `<option value="${a.id}">${esc(a.nombre)}</option>`).join('')}<option value="_sin">Sin área</option></select>
      <select class="form-select w-auto" data-f-nivel aria-label="Nivel"><option value="">Todos los niveles</option>${AC.NIVELES.map((n) => `<option>${n}</option>`).join('')}</select>
      <select class="form-select w-auto" data-f-curso aria-label="Curso"></select>
      <select class="form-select w-auto" data-f-uso aria-label="Uso"><option value="">Cualquier uso</option><option value="varios">En varios cursos</option><option value="uno">Solo en un curso</option><option value="ninguno">Sin usar</option></select>
      <select class="form-select w-auto" data-f-arch aria-label="Archivos"><option value="">Con o sin archivos</option><option value="con">Con archivos</option><option value="sin">Sin archivos</option></select>
      <button class="btn btn-link btn-sm" data-limpiar hidden>Quitar filtros</button><span class="small text-body-secondary ms-auto" data-cont></span></div>
    <div class="row g-3" data-grid></div>`;
  let t;
  view.querySelector('[data-q]').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value.trim(); pintar(); }, 200); });
  [['area', 'data-f-area'], ['nivel', 'data-f-nivel'], ['curso', 'data-f-curso'], ['uso', 'data-f-uso'], ['arch', 'data-f-arch']].forEach(([k, a]) => view.querySelector(`[${a}]`).addEventListener('change', (e) => { st[k] = e.target.value; pintar(); }));
  view.querySelector('[data-limpiar]').addEventListener('click', () => {
    Object.assign(st, { q: '', area: '', nivel: '', curso: '', uso: '', arch: '' });
    view.querySelectorAll('select').forEach((s) => { s.value = ''; }); view.querySelector('[data-q]').value = ''; pintar();
  });
  view.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const m = todos.find((x) => String(x.id) === b.closest('[data-id]').dataset.id), a = b.dataset.act;
    try {
      if (a === 'ver') ver(m);
      else if (a === 'abrir') abrirEditor(m, cargar);
      else if (a === 'duplicar') {
        const r = await api('/api/material/material', { method: 'POST', body: { titulo: `${m.titulo} (copia)`, area_id: m.area_id, nivel: m.nivel, descripcion: m.descripcion, bloques: m.bloques } });
        toast('Material duplicado'); await cargar(); abrirEditor(todos.find((x) => x.id === r.id), cargar);
      } else if (a === 'borrar') {
        if (!(await confirm({ title: `¿Borrar «${m.titulo}»?`, text: m.cursos.length ? `Está en ${m.cursos.length === 1 ? 'un curso' : `${m.cursos.length} cursos`}: se quitará de sus clases. Sus archivos se borran.` : 'Se borran también sus archivos.' }))) return;
        await api(`/api/material/material/${m.id}`, { method: 'DELETE' }); toast('Material borrado'); cargar();
      }
    } catch (x) { toast(x.message, false); }
  });
  await cargar().catch((x) => { view.querySelector('[data-grid]').innerHTML = `<div class="col-12 text-danger">${esc(x.message)}</div>`; });
});
