// Cursos: lista y calendario de la semana; el detalle de cada curso (?id=) tiene inscritos con su avance, asistencia,
// notas, clases (tema, contenido, mover fecha), evaluaciones y cupones. Crear y configurar: propietario y administrador.
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, confirm, modal, table, empty } = window.App;
  const C = window.App.Crud;
  const RO = me.business.readOnly, MANAGE = me.canManage && !RO;
  const $ = (s, el = document) => el.querySelector(s);
  const [cfg, areas, profs] = await Promise.all([AC.cfg(), AC.listas.areas(), AC.listas.profesionales()]);
  const S = cfg.termS, P = cfg.termP;
  const ESTADO = { 'En curso': 'ok', 'Por iniciar': 'soon', 'Finalizado': 'free', 'Sin programar': 'free' };
  const ASIS = [['P', 'Presente', 'success'], ['T', 'Tarde', 'warning'], ['J', 'Excusa', 'info'], ['A', 'Ausente', 'danger']];
  const METODOS = ['Clase magistral', 'Demostración', 'Práctica guiada', 'Práctica en modelo', 'Taller', 'Evaluación teórica', 'Evaluación práctica', 'Virtual'];
  const id = new URLSearchParams(location.search).get('id');

  /* ---------- crear / editar curso ---------- */
  async function editarCurso(k, done) {
    const c = k || { activo: 1, festivos: 1, horario: [], num_clases: 8 };
    const sel = (name, rows, v, empty) => `<select class="form-select" id="k_${name}" name="${name}">${AC.opts(rows, empty).map(([o, l]) => `<option value="${o}" ${String(o) === String(v ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const { el, m } = modal(`<form><div class="modal-header border-0 pb-0"><h2 class="modal-title h5">${k ? 'Editar curso' : 'Nuevo curso'}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><div class="row g-2">
        <div class="col-12"><label class="form-label small mb-1" for="k_nombre">Nombre</label><input class="form-control" id="k_nombre" name="nombre" value="${esc(c.nombre || '')}" required></div>
        <div class="col-sm-4"><label class="form-label small mb-1" for="k_area_id">Área</label>${sel('area_id', areas, c.area_id, 'Sin área')}</div>
        <div class="col-sm-4"><label class="form-label small mb-1" for="k_nivel">Nivel</label><select class="form-select" id="k_nivel" name="nivel"><option value="">—</option>${AC.NIVELES.map((n) => `<option ${c.nivel === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="col-sm-4"><label class="form-label small mb-1" for="k_profesional_id">Profesional</label>${sel('profesional_id', profs.filter((p) => p.activo || p.id === c.profesional_id), c.profesional_id, 'Sin asignar')}</div>
        <div class="col-sm-4"><label class="form-label small mb-1" for="k_precio">Precio</label><input class="form-control" id="k_precio" name="precio" type="number" min="0" step="1000" value="${c.precio ?? ''}"></div>
        <div class="col-sm-4"><label class="form-label small mb-1" for="k_jornada">Jornada</label><input class="form-control" id="k_jornada" name="jornada" value="${esc(c.jornada || '')}" placeholder="Mañana, noche, sábados…"></div>
        <div class="col-sm-4"><label class="form-label small mb-1" for="k_num_clases">N.º de clases</label><input class="form-control" id="k_num_clases" name="num_clases" type="number" min="0" max="300" value="${c.num_clases ?? ''}"></div>
        <div class="col-sm-4"><label class="form-label small mb-1" for="k_inicio">Fecha de inicio</label><input class="form-control" id="k_inicio" name="inicio" type="date" value="${esc(c.inicio || '')}"></div>
        <div class="col-sm-8 d-flex align-items-end gap-3 flex-wrap"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="k_festivos" name="festivos" ${c.festivos ? 'checked' : ''}><label class="form-check-label" for="k_festivos">Saltar festivos de Colombia</label></div>
          <div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="k_activo" name="activo" ${c.activo ? 'checked' : ''}><label class="form-check-label" for="k_activo">Activo</label></div></div>
        <div class="col-12"><div class="form-label small mb-1">Horario semanal <span class="text-body-secondary">· cada franja es una clase; las fechas se calculan solas</span></div><div data-horario></div></div>
        <div class="col-12"><label class="form-label small mb-1" for="k_descripcion">Descripción</label><textarea class="form-control" id="k_descripcion" name="descripcion" rows="2">${esc(c.descripcion || '')}</textarea></div>
      </div><div class="small text-danger mt-2" data-err></div></div>
      <div class="modal-footer border-0 pt-0 justify-content-between"><span>${k ? '<button type="button" class="btn btn-outline-danger btn-sm" data-del><i class="bi bi-trash me-1"></i>Borrar</button>' : ''}</span>
        <span><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button> <button class="btn btn-primary">Guardar</button></span></div></form>`, { size: 'modal-lg' });
    const getH = AC.horarioEditor($('[data-horario]', el), c.horario);
    const f = $('form', el), err = $('[data-err]', el);
    $('[data-del]', el)?.addEventListener('click', async () => {
      if (!(await confirm({ title: `¿Borrar «${k.nombre}»?`, text: 'Se borran sus clases, evaluaciones y cupones. Si tiene matrículas, márcalo como inactivo.' }))) return;
      try { await api(`/api/cursos/cursos/${k.id}`, { method: 'DELETE' }); m.hide(); toast('Curso borrado'); location.href = '/staff/cursos.html'; } catch (x) { err.textContent = x.message; }
    });
    f.onsubmit = async (e) => {
      e.preventDefault();
      const body = { nombre: f.nombre.value, area_id: f.area_id.value, nivel: f.nivel.value, profesional_id: f.profesional_id.value, precio: f.precio.value, jornada: f.jornada.value,
        num_clases: f.num_clases.value, inicio: f.inicio.value, festivos: f.festivos.checked, activo: f.activo.checked, descripcion: f.descripcion.value, horario: getH() };
      try { const r = await api(k ? `/api/cursos/cursos/${k.id}` : '/api/cursos/cursos', { method: k ? 'PATCH' : 'POST', body }); m.hide(); toast('Guardado'); done(k ? k.id : r.id); }
      catch (x) { err.textContent = x.message; }
    };
  }

  /* ---------- lista y calendario ---------- */
  if (!id) {
    if (MANAGE) $('[data-acciones]').innerHTML = '<button class="btn btn-primary" data-nuevo><i class="bi bi-plus-lg me-1"></i>Nuevo curso</button>';
    $('[data-nuevo]')?.addEventListener('click', () => editarCurso(null, (nid) => { location.href = `/staff/cursos.html?id=${nid}`; }));
    const REPO = me.modules.some((x) => x.id === 'reposiciones');
    AC.vistas([['cursos', 'Cursos', 'bi-mortarboard'], ['calendario', 'Calendario', 'bi-calendar-week'], ...(REPO ? [['reposiciones', 'Reposiciones', 'bi-arrow-repeat']] : [])], async (k, view) => {
      if (k === 'calendario') return calendario(view);
      if (k === 'reposiciones') return AC.reposiciones(me).todo(view);
      view.innerHTML = `<div class="d-flex flex-wrap gap-2 mb-3"><input class="form-control" data-q placeholder="Buscar curso…" style="max-width:240px" aria-label="Buscar">
        <select class="form-select w-auto" data-act aria-label="Estado"><option value="1">Activos</option><option value="0">Inactivos</option><option value="">Todos</option></select></div><div class="dw-grid" data-lista></div>`;
      const load = async () => {
        const qs = new URLSearchParams({ q: $('[data-q]', view).value.trim() });
        if ($('[data-act]', view).value) qs.set('f_activo', $('[data-act]', view).value);
        const { rows } = await api(`/api/cursos/cursos?${qs}`);
        const hoy = C.todayCo();
        $('[data-lista]', view).innerHTML = rows.length ? rows.map((c) => {
          const area = areas.find((a) => a.id === c.area_id), prof = profs.find((p) => p.id === c.profesional_id);
          const est = !c.inicio ? 'Sin programar' : hoy < c.inicio ? 'Por iniciar' : 'En curso';
          return `<a class="dw-card text-reset text-decoration-none d-block" href="/staff/cursos.html?id=${c.id}"><div class="d-flex gap-2 align-items-start"><b class="flex-grow-1">${esc(c.nombre)}</b>${c.activo ? C.chip(ESTADO[est], est) : C.chip('free', 'Inactivo')}</div>
            <div class="small text-body-secondary mt-1">${[area?.nombre, c.nivel, c.jornada].filter(Boolean).map(esc).join(' · ') || '&nbsp;'}</div>
            <div class="small mt-2"><i class="bi bi-clock me-1"></i>${esc(AC.horario(c.horario))}</div>
            <div class="small"><i class="bi bi-calendar me-1"></i>${c.inicio ? `Inicia ${C.day(c.inicio)}` : 'Sin fecha'} · ${c.num_clases || 0} clases</div>
            <div class="d-flex small mt-2"><span class="flex-grow-1"><i class="bi bi-person-badge me-1"></i>${esc(prof?.nombre || 'Sin profesional')}</span>${me.canManage ? `<b>${C.money(c.precio)}</b>` : ''}</div></a>`;
        }).join('') : `<div style="grid-column:1/-1">${empty('bi-mortarboard', MANAGE ? 'Aún no hay cursos. Crea el primero.' : 'Aún no hay cursos.')}</div>`;
      };
      let t;
      $('[data-q]', view).addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
      $('[data-act]', view).addEventListener('change', load);
      await load();
    });
    return;
  }

  async function calendario(view) {
    let desde = C.todayCo();
    const lunes = (iso) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
    const mas = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
    desde = lunes(desde);
    view.innerHTML = `<div class="d-flex align-items-center gap-2 mb-3"><button class="btn btn-light" data-prev aria-label="Semana anterior"><i class="bi bi-chevron-left"></i></button>
      <b class="flex-grow-1 text-center" data-rango></b><button class="btn btn-light" data-hoy>Hoy</button><button class="btn btn-light" data-next aria-label="Semana siguiente"><i class="bi bi-chevron-right"></i></button></div><div class="dw-grid" data-dias></div>`;
    const load = async () => {
      const hasta = mas(desde, 6), d = await api(`/api/cursos/calendario?desde=${desde}&hasta=${hasta}`), hoy = C.todayCo();
      $('[data-rango]', view).textContent = `${C.day(desde)} – ${C.day(hasta)}`;
      $('[data-dias]', view).innerHTML = Array.from({ length: 7 }, (_, i) => mas(desde, i)).map((f) => {
        const cl = d.clases.filter((x) => x.fecha === f), es = d.espacios.filter((x) => x.fecha === f);
        return `<div class="dw-card ${f === hoy ? 'border-primary border-2' : ''}"><div class="fw-semibold mb-2">${AC.DIAS[new Date(f + 'T12:00:00Z').getUTCDay()]} ${+f.slice(8)}</div>
          ${cl.map((x) => `<a class="d-block text-reset text-decoration-none border-start border-3 border-${esc(x.color || 'primary')} ps-2 mb-2" href="/staff/cursos.html?id=${x.curso_id}#asistencia"><div class="small fw-semibold">${esc(x.ini || '')} ${esc(x.curso)}</div>
            <div class="small text-body-secondary">Clase ${x.n} de ${x.num_clases}${x.tema ? ` · ${esc(x.tema)}` : ''}${x.virtual ? ' · virtual' : ''}</div></a>`).join('')}
          ${es.map((x) => `<a class="d-block text-reset text-decoration-none border-start border-3 border-secondary ps-2 mb-2" href="/staff/reposiciones.html#espacios"><div class="small fw-semibold">${esc(x.ini)} Reposiciones</div><div class="small text-body-secondary">${x.ocupados}/${x.cupos} cupos${x.profesional ? ` · ${esc(x.profesional)}` : ''}</div></a>`).join('')}
          ${cl.length || es.length ? '' : '<div class="small text-body-secondary">Sin clases</div>'}</div>`;
      }).join('');
    };
    $('[data-prev]', view).onclick = () => { desde = mas(desde, -7); load(); };
    $('[data-next]', view).onclick = () => { desde = mas(desde, 7); load(); };
    $('[data-hoy]', view).onclick = () => { desde = lunes(C.todayCo()); load(); };
    await load();
  }

  /* ---------- detalle del curso ---------- */
  let D;
  const cargar = async () => { D = await api(`/api/cursos/${id}/detalle`); return D; };
  try { await cargar(); } catch (x) { $('[data-view]').innerHTML = `<div class="dw-card text-danger">${esc(x.message)}</div>`; return; }
  const k = D.curso;
  $('[data-h1]').innerHTML = `${esc(k.nombre)} ${C.chip(ESTADO[k.estado] || 'free', k.estado)}`;
  $('[data-acciones]').innerHTML = `<a class="btn btn-light" href="/staff/cursos.html"><i class="bi bi-arrow-left me-1"></i>Cursos</a>${MANAGE ? '<button class="btn btn-outline-primary" data-editar><i class="bi bi-pencil me-1"></i>Editar</button>' : ''}${MANAGE && me.modules.some((m) => m.id === 'matriculas') ? `<a class="btn btn-primary" href="/staff/matriculas.html?curso=${k.id}"><i class="bi bi-person-plus me-1"></i>Matrículas</a>` : ''}`;
  $('[data-editar]')?.addEventListener('click', () => editarCurso({ ...k }, () => location.reload()));
  document.title = `${k.nombre} · ${document.title}`;
  const sub = `<p class="small text-body-secondary">${[k.area, k.nivel, k.profesional && `Profesional: ${k.profesional}`, AC.horario(k.horario), k.inicio && `${C.day(k.inicio)} – ${C.day(k.fin)}`, `${k.dictadas} de ${k.num_clases} clases dictadas`].filter(Boolean).map(esc).join(' · ')}</p>`;
  const proxClase = () => { const hoy = C.todayCo(); const c = D.clases.filter((x) => x.fecha && x.fecha <= hoy).pop() || D.clases[0]; return c?.n || 1; };

  const tabs = [['inscritos', AC.cap(P), 'bi-people'], ['asistencia', 'Asistencia', 'bi-check2-square'], ['notas', 'Notas', 'bi-star'], ['clases', 'Clases', 'bi-list-ol']];
  if (me.modules.some((x) => x.id === 'reposiciones')) tabs.push(['reposiciones', 'Reposiciones', 'bi-arrow-repeat']);
  if (me.canManage) tabs.push(['evaluaciones', 'Evaluaciones y cupones', 'bi-ui-checks']);
  const V = AC.vistas(tabs, async (t, view) => {
    await cargar();
    if (t === 'inscritos') {
      view.innerHTML = sub + (D.inscritos.length ? `<div class="dw-card p-0 p-md-2">${table([
        { label: AC.cap(S), main: true, html: (i) => `${esc(i.nombre)}${i.estado !== 'activa' ? ` ${C.chip('free', AC.cap(i.estado))}` : ''}` },
        { label: 'Asistencia', html: (i) => `${i.resumen_asistencia.pct == null ? '—' : `${i.resumen_asistencia.pct}%`}${i.resumen_asistencia.por_reponer ? `<div class="small text-body-secondary">${i.resumen_asistencia.por_reponer} por reponer</div>` : ''}` },
        { label: 'Promedio', html: (i) => `${i.resumen_notas.prom ?? '—'}<div class="small text-body-secondary">${i.resumen_notas.evaluado}% evaluado</div>` },
        { label: 'Estado', html: (i) => C.chip(...i.academico) },
        { label: '', cls: 'text-end', html: (i) => `<button class="btn btn-sm btn-outline-primary" data-ficha="${i.estudiante_id}"><i class="bi bi-person-vcard me-1"></i>Ficha</button>` }], D.inscritos)}</div>`
        : empty('bi-people', `Aún no hay ${P} matriculados en este curso.`));
      view.addEventListener('click', (e) => { const b = e.target.closest('[data-ficha]'); if (b) AC.ficha(b.dataset.ficha, me).catch((x) => toast(x.message, false)); });
      return;
    }
    if (t === 'asistencia') {
      if (!D.clases.length) { view.innerHTML = empty('bi-calendar-x', 'El curso no tiene clases: pon el número de clases, la fecha de inicio y el horario.'); return; }
      const n0 = proxClase();
      view.innerHTML = `<div class="d-flex flex-wrap gap-2 align-items-center mb-3"><select class="form-select w-auto" data-clase aria-label="Clase">${D.clases.map((c) => `<option value="${c.n}" ${c.n === n0 ? 'selected' : ''}>Clase ${c.n}${c.fecha ? ` · ${C.day(c.fecha)}` : ''}${c.tema ? ` · ${esc(c.tema)}` : ''}</option>`).join('')}</select>
        ${RO ? '' : '<button class="btn btn-light btn-sm" data-todos>Todos presentes</button>'}</div><div class="dw-card" data-lista></div>`;
      const draw = () => {
        const n = +$('[data-clase]', view).value;
        const act = D.inscritos.filter((i) => i.estado === 'activa');
        $('[data-lista]', view).innerHTML = act.length ? `${act.map((i) => `<div class="d-flex flex-wrap align-items-center gap-2 py-2 border-bottom" data-ins="${i.id}"><span class="flex-grow-1 fw-semibold">${esc(i.nombre)}</span>
          <div class="btn-group btn-group-sm" role="group" aria-label="Asistencia de ${esc(i.nombre)}">${ASIS.map(([v, l, c]) => `<input type="radio" class="btn-check" name="a${i.id}" id="a${i.id}${v}" value="${v}" ${i.asistencia[n] === v ? 'checked' : ''} ${RO ? 'disabled' : ''}><label class="btn btn-outline-${c}" for="a${i.id}${v}">${l}</label>`).join('')}</div></div>`).join('')}
          ${RO ? '' : '<div class="mt-3"><button class="btn btn-primary" data-guardar><i class="bi bi-check-lg me-1"></i>Guardar asistencia</button></div>'}` : empty('bi-people', `No hay ${P} activos en el curso.`);
      };
      draw();
      $('[data-clase]', view).addEventListener('change', draw);
      $('[data-todos]', view)?.addEventListener('click', () => view.querySelectorAll('[data-ins]').forEach((r) => { if (!r.querySelector('input:checked')) r.querySelector('input[value="P"]').checked = true; }));
      view.addEventListener('click', async (e) => {
        if (!e.target.closest('[data-guardar]')) return;
        const marcas = [...view.querySelectorAll('[data-ins]')].map((r) => ({ inscripcion_id: +r.dataset.ins, estado: r.querySelector('input:checked')?.value || '' }));
        try { await api(`/api/cursos/${id}/asistencia`, { method: 'POST', body: { clase_n: +$('[data-clase]', view).value, marcas } }); await cargar(); toast('Asistencia guardada'); } catch (x) { toast(x.message, false); }
      });
      return;
    }
    if (t === 'notas') {
      if (!D.evaluaciones.length) { view.innerHTML = empty('bi-star', me.canManage ? 'Crea las evaluaciones del curso en la pestaña «Evaluaciones y cupones».' : 'El curso aún no tiene evaluaciones.'); return; }
      view.innerHTML = `<div class="d-flex flex-wrap gap-2 align-items-center mb-3"><select class="form-select w-auto" data-ev aria-label="Evaluación">${D.evaluaciones.map((e) => `<option value="${e.id}">${esc(e.nombre)} · ${e.peso}%</option>`).join('')}</select>
        <span class="small text-body-secondary">Escala 0 a ${D.config.escala} · aprueba con ${D.config.notaMin}</span></div><div class="dw-card" data-lista></div>`;
      const draw = () => {
        const ev = +$('[data-ev]', view).value, act = D.inscritos.filter((i) => i.estado === 'activa');
        $('[data-lista]', view).innerHTML = act.length ? `${act.map((i) => `<div class="d-flex align-items-center gap-2 py-2 border-bottom" data-ins="${i.id}"><label class="flex-grow-1 fw-semibold" for="n${i.id}">${esc(i.nombre)}</label>
          <input class="form-control" style="width:96px" id="n${i.id}" type="number" min="0" max="${D.config.escala}" step="0.1" inputmode="decimal" value="${i.notas[ev] ?? ''}" ${RO ? 'disabled' : ''}></div>`).join('')}
          ${RO ? '' : '<div class="mt-3"><button class="btn btn-primary" data-guardar><i class="bi bi-check-lg me-1"></i>Guardar notas</button></div>'}` : empty('bi-people', `No hay ${P} activos en el curso.`);
      };
      draw();
      $('[data-ev]', view).addEventListener('change', draw);
      view.addEventListener('click', async (e) => {
        if (!e.target.closest('[data-guardar]')) return;
        const notas = [...view.querySelectorAll('[data-ins]')].map((r) => ({ inscripcion_id: +r.dataset.ins, nota: r.querySelector('input').value }));
        try { await api(`/api/cursos/${id}/notas`, { method: 'POST', body: { evaluacion_id: +$('[data-ev]', view).value, notas } }); await cargar(); toast('Notas guardadas'); } catch (x) { toast(x.message, false); }
      });
      return;
    }
    if (t === 'reposiciones') return AC.reposiciones(me, k.id).todo(view);
    if (t === 'clases') {
      view.innerHTML = D.clases.length ? `<div class="dw-card p-0 p-md-2">${table([
        { label: 'Clase', main: true, html: (c) => `Clase ${c.n}${c.tema ? `<div class="small fw-normal">${esc(c.tema)}</div>` : ''}` },
        { label: 'Fecha', html: (c) => `${c.fecha ? C.day(c.fecha) : '—'}${c.ini ? ` · ${esc(c.ini)}–${esc(c.fin)}` : ''}${c.movida ? ` ${C.chip('soon', 'Movida')}` : ''}` },
        { label: 'Métodos', html: (c) => `<span class="small">${c.metodos.map(esc).join(', ') || '—'}</span>${c.virtual ? ` ${C.chip('free', 'Virtual')}` : ''}` },
        { label: '', cls: 'text-end', html: (c) => (RO ? '' : `<button class="btn btn-sm btn-outline-primary" data-clase="${c.n}"><i class="bi bi-pencil me-1"></i>Editar</button>`) }], D.clases)}</div>`
        : empty('bi-calendar-x', 'El curso no tiene clases: pon el número de clases, la fecha de inicio y el horario.');
      view.addEventListener('click', (e) => { const b = e.target.closest('[data-clase]'); if (b) editarClase(D.clases.find((c) => c.n === +b.dataset.clase), () => V.reload()); });
      return;
    }
    // evaluaciones y cupones
    view.innerHTML = '<h2 class="h6">Evaluaciones <span class="small text-body-secondary fw-normal">· los pesos deberían sumar 100%</span></h2><div data-ev class="mb-4"></div><h2 class="h6">Cupones de descuento</h2><div data-cup></div>';
    C.table({ el: $('[data-ev]', view), base: '/api/cursos', entity: 'evaluaciones', title: 'evaluación', newText: 'Nueva evaluación', fixed: { curso_id: k.id }, readOnly: RO, emptyIcon: 'bi-ui-checks', empty: 'Sin evaluaciones.',
      fields: [{ k: 'nombre', label: 'Nombre', required: true, placeholder: 'Parcial, práctica final…' }, { k: 'peso', label: 'Peso (%)', type: 'int', required: true },
        { k: 'clase_n', label: 'En la clase', type: 'select', options: [['', '—'], ...D.clases.map((c) => [c.n, `Clase ${c.n}${c.fecha ? ` · ${C.day(c.fecha)}` : ''}`])] }],
      columns: [{ label: 'Evaluación', main: true, html: (r) => esc(r.nombre) }, { label: 'Peso', html: (r) => `${r.peso}%` }, { label: 'Clase', html: (r) => (r.clase_n ? `Clase ${r.clase_n}` : '—') }] }).load();
    C.table({ el: $('[data-cup]', view), base: '/api/cursos', entity: 'cupones', title: 'cupón', newText: 'Nuevo cupón', fixed: { curso_id: k.id }, readOnly: RO, emptyIcon: 'bi-ticket-perforated', empty: 'Sin cupones.',
      fields: [{ k: 'codigo', label: 'Código', required: true, placeholder: 'AMIGA10' }, { k: 'tipo', label: 'Tipo', type: 'select', options: [['pct', 'Porcentaje'], ['valor', 'Valor fijo']] },
        { k: 'valor', label: 'Descuento', type: 'money', required: true, hint: '% o pesos' }, { k: 'hasta', label: 'Válido hasta', type: 'date' }, { k: 'max', label: 'Usos máximos', type: 'int', hint: 'vacío = sin límite' }],
      columns: [{ label: 'Código', main: true, html: (r) => `<code>${esc(r.codigo)}</code>` }, { label: 'Descuento', html: (r) => (r.tipo === 'pct' ? `${r.valor}%` : C.money(r.valor)) },
        { label: 'Vigencia', html: (r) => (r.hasta ? `Hasta ${C.day(r.hasta)}` : 'Sin fecha') }, { label: 'Usos', html: (r) => `${r.usos}${r.max ? ` de ${r.max}` : ''}` }] }).load();
  });

  async function editarClase(c, done) {
    const mats = await api('/api/material/material?limit=500').then((d) => d.rows).catch(() => []);
    const { el, m } = modal(`<form><div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Clase ${c.n}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><div class="row g-2">
        <div class="col-12"><label class="form-label small mb-1" for="c_tema">Tema</label><input class="form-control" id="c_tema" name="tema" value="${esc(c.tema || '')}"></div>
        <div class="col-12"><label class="form-label small mb-1" for="c_detalle">Contenido</label><textarea class="form-control" id="c_detalle" name="detalle" rows="3">${esc(c.detalle || '')}</textarea></div>
        <div class="col-12"><div class="form-label small mb-1">Métodos</div><div class="d-flex flex-wrap gap-3 small">${METODOS.map((x, i) => `<label><input type="checkbox" class="form-check-input me-1" name="metodos" value="${esc(x)}" ${c.metodos.includes(x) ? 'checked' : ''}>${esc(x)}</label>`).join('')}</div></div>
        <div class="col-12"><label class="form-label small mb-1" for="c_materiales">Materiales que deben traer</label><input class="form-control" id="c_materiales" name="materiales" value="${esc(c.materiales || '')}"></div>
        <div class="col-sm-8"><label class="form-label small mb-1" for="c_material">Material de estudio</label><select class="form-select" id="c_material" name="material_id">${AC.opts(mats, 'Ninguno', 'titulo').map(([v, l]) => `<option value="${v}" ${String(v) === String(c.material_id ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="col-sm-4 d-flex align-items-end"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="c_virtual" name="virtual" ${c.virtual ? 'checked' : ''}><label class="form-check-label" for="c_virtual">Virtual</label></div></div>
        ${me.canManage ? `<div class="col-12"><h3 class="h6 mt-2 mb-0">Mover la clase</h3></div>
          <div class="col-sm-4"><label class="form-label small mb-1" for="c_fecha">Fecha</label><input class="form-control" id="c_fecha" name="fecha" type="date" value="${esc(c.fecha || '')}"></div>
          <div class="col-sm-4"><label class="form-label small mb-1" for="c_ini">Desde</label><input class="form-control" id="c_ini" name="ini" type="time" value="${esc(c.ini || '')}"></div>
          <div class="col-sm-4"><label class="form-label small mb-1" for="c_fin">Hasta</label><input class="form-control" id="c_fin" name="fin" type="time" value="${esc(c.fin || '')}"></div>` : ''}
      </div><div class="small text-danger mt-2" data-err></div></div>
      <div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary">Guardar</button></div></form>`, { size: 'modal-lg' });
    const f = $('form', el);
    f.onsubmit = async (e) => {
      e.preventDefault();
      const body = { tema: f.tema.value, detalle: f.detalle.value, materiales: f.materiales.value, virtual: f.virtual.checked, material_id: f.material_id.value,
        metodos: [...f.querySelectorAll('[name=metodos]:checked')].map((x) => x.value) };
      if (me.canManage && (f.fecha.value !== (c.fecha || '') || f.ini.value !== (c.ini || '') || f.fin.value !== (c.fin || ''))) Object.assign(body, { fecha: f.fecha.value, ini: f.ini.value, fin: f.fin.value });
      try { await api(`/api/cursos/${id}/clases/${c.n}`, { method: 'PATCH', body }); m.hide(); toast('Clase guardada'); done(); } catch (x) { $('[data-err]', el).textContent = x.message; }
    };
  }
});
