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

  /* ---------- crear / editar / duplicar curso ---------- */
  // Cuatro pasos en una ventana: datos, docente y horario (con «Calcular clases y revisar choques»), módulos (material por clases) y cupones.
  async function editarCurso(k, done, { duplicar = false } = {}) {
    const nuevo = !k || duplicar;
    const c = { activo: 1, festivos: 1, horario: [], num_clases: 8, inicial: 0, ...(k || {}) };
    if (duplicar) { c.nombre = `${c.nombre} (copia)`; c.inicio = ''; }
    const det = k ? await api(`/api/cursos/${k.id}/detalle`).catch(() => null) : null;
    const mats = await api('/api/material/material?limit=500').then((d) => d.rows).catch(() => []);
    let cursoId = nuevo ? null : k.id;
    const clasesAntes = new Map((det?.clases || []).map((x) => [x.n, x]));
    // módulos = rangos de clases con el mismo material
    const modulos = [];
    if (!duplicar || det) for (const cl of det?.clases || []) {
      if (!cl.material_id) continue;
      const u = modulos.at(-1);
      if (u && u.material_id === cl.material_id && u.hasta === cl.n - 1) u.hasta = cl.n; else modulos.push({ material_id: cl.material_id, desde: cl.n, hasta: cl.n });
    }
    const cupones = (det?.cupones || []).map((x) => ({ id: duplicar ? null : x.id, codigo: x.codigo, tipo: x.tipo, valor: x.valor, hasta: x.hasta || '', max: x.max || '', usos: duplicar ? 0 : x.usos }));
    const quitados = [];
    const sel = (name, rows, v, empty) => `<select class="form-select" id="k_${name}" name="${name}">${AC.opts(rows, empty).map(([o, l]) => `<option value="${o}" ${String(o) === String(v ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const lbl = (id, t) => `<label class="form-label small mb-1" for="k_${id}">${t}</label>`;
    const { el, m } = modal(`<form><div class="modal-header border-0 pb-0"><h2 class="modal-title h5">${duplicar ? 'Duplicar curso para otro grupo' : k ? 'Editar curso' : 'Nuevo curso'}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><div class="d-flex flex-column gap-3">
        <section class="dw-paso"><h3><span class="n">1</span>Datos del curso</h3><div class="row g-2">
          <div class="col-md-8">${lbl('nombre', 'Nombre')}<input class="form-control" id="k_nombre" name="nombre" maxlength="120" value="${esc(c.nombre || '')}" required></div>
          <div class="col-md-4">${lbl('precio', 'Precio')}<input class="form-control" id="k_precio" name="precio" type="number" min="0" step="1000" value="${c.precio ?? 0}"></div>
          <div class="col-md-4">${lbl('nivel', 'Nivel')}<select class="form-select" id="k_nivel" name="nivel"><option value="">—</option>${AC.NIVELES.map((n) => `<option ${c.nivel === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <div class="col-md-4">${lbl('area_id', 'Área')}${sel('area_id', areas, c.area_id, 'Sin área')}</div>
          <div class="col-md-4">${lbl('inicial', 'Cuota inicial')}<input class="form-control" id="k_inicial" name="inicial" type="number" min="0" step="1000" value="${c.inicial || 0}"><div class="form-text">Se propone al matricular; puede ser 0.</div></div>
          <div class="col-12">${lbl('descripcion', 'Descripción')}<textarea class="form-control" id="k_descripcion" name="descripcion" rows="2" placeholder="Qué aprende la persona, a quién va dirigido…">${esc(c.descripcion || '')}</textarea></div>
        </div></section>

        <section class="dw-paso"><h3><span class="n">2</span>Profesional y horario semanal</h3><div class="row g-2">
          <div class="col-md-4">${lbl('profesional_id', 'Profesional')}${sel('profesional_id', profs.filter((p) => p.activo || p.id === c.profesional_id), c.profesional_id, 'Sin asignar')}</div>
          <div class="col-md-4">${lbl('jornada', 'Jornada')}<select class="form-select" id="k_jornada" name="jornada"><option value="">—</option>${['Mañana', 'Tarde', 'Noche', 'Sabatina', 'Dominical'].map((j) => `<option ${c.jornada === j ? 'selected' : ''}>${j}</option>`).join('')}</select></div>
          <div class="col-md-4">${lbl('inicio', 'Primera clase')}<input class="form-control" id="k_inicio" name="inicio" type="date" value="${esc(c.inicio || '')}"></div>
          <div class="col-6 col-md-4">${lbl('num_clases', 'Total de clases')}<input class="form-control" id="k_num_clases" name="num_clases" type="number" min="0" max="300" value="${c.num_clases ?? 0}"></div>
          <div class="col-md-8 d-flex align-items-end gap-4 flex-wrap"><div class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" id="k_festivos" name="festivos" ${c.festivos ? 'checked' : ''}><label class="form-check-label small" for="k_festivos">Saltar festivos de Colombia</label></div>
            <div class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" id="k_activo" name="activo" ${c.activo ? 'checked' : ''}><label class="form-check-label small" for="k_activo">Curso activo</label></div></div>
          <div class="col-12"><div class="form-label small mb-1">Clases de la semana <span class="text-body-secondary">· cada franja es una clase; el resto de semanas se llena solo</span></div><div data-horario></div></div>
          <div class="col-12"><div class="dw-resumen small" data-resumen>—</div></div>
          <div class="col-12"><button type="button" class="btn btn-sm btn-outline-secondary" data-calcular><i class="bi bi-calculator me-1"></i>Calcular clases y revisar choques</button>
            <span class="small text-body-secondary ms-2">Arma todas las fechas, las puedes ajustar una a una y revisa si chocan con otras clases del área o del profesional.</span></div>
          <div class="col-12" data-calculo hidden></div>
        </div></section>

        <section class="dw-paso"><h3><span class="n">3</span>Módulos <span class="small fw-normal text-body-secondary">· el material de estudio de cada clase</span>
            <button type="button" class="btn btn-sm btn-outline-secondary ms-auto" data-add-mod><i class="bi bi-plus-lg me-1"></i>Agregar módulo</button></h3>
          <div data-mods></div>
          <div class="form-check mt-2 small"><input class="form-check-input" type="checkbox" id="k_otras" data-otras><label class="form-check-label" for="k_otras">Incluir módulos de otras áreas</label></div>
          <div class="form-text">Un módulo puede estar en varios cursos. Se crean y editan en <a href="/staff/material.html">Material</a>.</div></section>

        <section class="dw-paso"><h3><span class="n">4</span>Cupones de descuento
            <button type="button" class="btn btn-sm btn-outline-secondary ms-auto" data-add-cup><i class="bi bi-plus-lg me-1"></i>Agregar cupón</button></h3>
          <div data-cups></div>
          <div class="form-text">Se escriben al matricular. Pueden ser un porcentaje o un valor fijo, con vencimiento y límite de usos.</div></section>
      </div><div class="small text-danger mt-2" data-err></div></div>
      <div class="modal-footer border-0 pt-0 justify-content-between"><span>${k && !duplicar ? '<button type="button" class="btn btn-outline-danger btn-sm" data-del><i class="bi bi-trash me-1"></i>Borrar</button>' : ''}</span>
        <span><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button> <button class="btn btn-primary">Guardar curso</button></span></div></form>`, { size: 'modal-xl modal-dialog-scrollable' });

    const f = $('form', el), err = $('[data-err]', el);
    const getH = AC.horarioEditor($('[data-horario]', el), c.horario);
    const N = () => Math.max(0, Math.min(300, +f.num_clases.value || 0));

    /* --- cálculo de clases y choques --- */
    let calc = null, base = [], abierta = false, primera = true;
    const datos = (conClases) => ({ inicio: f.inicio.value, num_clases: f.num_clases.value, festivos: f.festivos.checked, horario: getH(), profesional_id: f.profesional_id.value, area_id: f.area_id.value, curso_id: nuevo ? 0 : k.id,
      ...(conClases && calc ? { clases: calc.clases.map(({ fecha, ini, fin }) => ({ fecha, ini, fin })) } : {}) });
    const resumen = $('[data-resumen]', el), caja = $('[data-calculo]', el);
    const pintarResumen = () => {
      if (!calc) return;
      const ch = calc.clases.filter((x) => x.choques.length).length, fu = calc.clases.filter((x) => x.fuera).length;
      resumen.innerHTML = calc.clases.some((x) => x.fecha)
        ? `<i class="bi bi-calendar-range me-1"></i>Primera clase <b>${C.day(calc.inicio)}</b> · última <b>${C.day(calc.fin)}</b> · ${calc.clases.length} clases${ch ? ` · <span class="text-danger fw-semibold">${ch} con choque</span>` : ''}${fu ? ` · <span class="text-warning-emphasis fw-semibold">${fu} fuera del horario del profesional</span>` : ''}`
        : 'Pon la fecha de la primera clase, el total y al menos una franja para calcular las fechas.';
    };
    const pintarTabla = () => {
      if (!calc || !calc.clases.length) { caja.innerHTML = '<div class="small text-body-secondary">No hay clases que calcular.</div>'; return; }
      caja.innerHTML = `<div class="table-responsive" style="max-height:340px;overflow:auto"><table class="table table-sm align-middle mb-1"><thead><tr><th>Clase</th><th>Fecha</th><th>Desde</th><th>Hasta</th><th></th></tr></thead><tbody>${calc.clases.map((x, i) => `
        <tr class="${x.choques.length ? 'table-danger' : x.fuera ? 'table-warning' : ''}" data-i="${i}"><td>${x.n}</td>
          <td><input class="form-control form-control-sm" type="date" data-k="fecha" value="${esc(x.fecha || '')}" aria-label="Fecha de la clase ${x.n}"></td>
          <td><input class="form-control form-control-sm" type="time" data-k="ini" value="${esc(x.ini || '')}" aria-label="Hora de inicio"></td>
          <td><input class="form-control form-control-sm" type="time" data-k="fin" value="${esc(x.fin || '')}" aria-label="Hora de fin"></td>
          <td class="small">${x.choques.map((h) => `<div class="text-danger"><i class="bi bi-exclamation-triangle me-1"></i>Se cruza con «${esc(h.curso)}» (clase ${h.n}) · mismo ${h.motivo}</div>`).join('')}${x.fuera ? '<div class="text-warning-emphasis"><i class="bi bi-person-x me-1"></i>Fuera de la disponibilidad del profesional</div>' : ''}</td></tr>`).join('')}</tbody></table></div>
        <button type="button" class="btn btn-sm btn-light" data-revisar><i class="bi bi-arrow-repeat me-1"></i>Revisar choques con mis cambios</button>`;
    };
    const refresh = async (conClases) => {
      try {
        const antes = calc;
        calc = await api('/api/cursos/calcular', { method: 'POST', body: datos(conClases) });
        if (!conClases) {
          base = calc.clases.map((x) => ({ fecha: x.fecha, ini: x.ini, fin: x.fin }));
          if (primera && det && !duplicar) calc.clases.forEach((x) => { const o = clasesAntes.get(x.n); if (o?.movida) { x.fecha = o.fecha; x.ini = o.ini; x.fin = o.fin; } });   // las movidas a mano se conservan
        } else if (antes) calc.clases.forEach((x, i) => { Object.assign(x, { fecha: antes.clases[i]?.fecha ?? x.fecha, ini: antes.clases[i]?.ini ?? x.ini, fin: antes.clases[i]?.fin ?? x.fin }); });
        primera = false;
        pintarResumen(); if (abierta) pintarTabla();
      } catch (x) { resumen.textContent = x.message; }
    };
    let tc;
    const cambioHorario = () => { clearTimeout(tc); tc = setTimeout(() => refresh(false), 400); };
    ['inicio', 'num_clases', 'festivos', 'profesional_id', 'area_id'].forEach((n) => f[n].addEventListener('input', cambioHorario));
    $('[data-horario]', el).addEventListener('input', cambioHorario);
    $('[data-horario]', el).addEventListener('click', () => setTimeout(cambioHorario, 0));
    $('[data-calcular]', el).addEventListener('click', async () => { abierta = true; caja.hidden = false; await refresh(false); pintarTabla(); });
    caja.addEventListener('input', (e) => { const r = e.target.closest('[data-i]'); if (r && e.target.dataset.k) calc.clases[+r.dataset.i][e.target.dataset.k] = e.target.value; });
    caja.addEventListener('click', async (e) => { if (e.target.closest('[data-revisar]')) { await refresh(true); } });
    refresh(false);

    /* --- módulos (material por clases) --- */
    const modsBox = $('[data-mods]', el);
    const opcionesMat = (actual) => {
      const area = f.area_id.value, otras = $('[data-otras]', el).checked;
      const lista = mats.filter((x) => otras || !area || !x.area_id || String(x.area_id) === area || x.id === +actual);
      return `<option value="">Elige el módulo…</option>${lista.map((x) => `<option value="${x.id}" ${x.id === +actual ? 'selected' : ''}>${esc(x.titulo)}${x.area_id ? ` · ${esc(areas.find((a) => a.id === x.area_id)?.nombre || '')}` : ''}</option>`).join('')}`;
    };
    const pintarMods = () => {
      modsBox.innerHTML = modulos.length ? modulos.map((r, i) => `<div class="d-flex flex-wrap gap-2 align-items-center mb-2" data-m="${i}">
          <select class="form-select" style="flex:1 1 240px" data-k="material_id" aria-label="Módulo">${opcionesMat(r.material_id)}</select>
          <span class="small">Clases</span><input class="form-control" style="width:78px" type="number" min="1" data-k="desde" value="${r.desde}" aria-label="Desde la clase"><span class="small">a</span><input class="form-control" style="width:78px" type="number" min="1" data-k="hasta" value="${r.hasta}" aria-label="Hasta la clase">
          <button type="button" class="btn btn-sm btn-light" data-quitar-mod aria-label="Quitar módulo"><i class="bi bi-x-lg"></i></button></div>`).join('')
        : '<div class="small text-body-secondary">Aún no hay módulos en este curso. Agrega uno y dile en qué clases va.</div>';
    };
    pintarMods();
    $('[data-add-mod]', el).addEventListener('click', () => { const u = modulos.at(-1), d = Math.min(Math.max(1, N()), (u ? u.hasta : 0) + 1); modulos.push({ material_id: '', desde: d, hasta: d }); pintarMods(); });
    $('[data-otras]', el).addEventListener('change', pintarMods);
    f.area_id.addEventListener('change', pintarMods);
    modsBox.addEventListener('input', (e) => { const r = e.target.closest('[data-m]'); if (r && e.target.dataset.k) modulos[+r.dataset.m][e.target.dataset.k] = e.target.dataset.k === 'material_id' ? e.target.value : Math.max(1, +e.target.value || 1); });
    modsBox.addEventListener('click', (e) => { const q = e.target.closest('[data-quitar-mod]'); if (q) { modulos.splice(+q.closest('[data-m]').dataset.m, 1); pintarMods(); } });

    /* --- cupones --- */
    const cupBox = $('[data-cups]', el);
    const pintarCups = () => {
      cupBox.innerHTML = cupones.length ? cupones.map((x, i) => `<div class="row g-2 align-items-end mb-2" data-c="${i}">
          <div class="col-6 col-md-3"><label class="form-label small mb-1">Código</label><input class="form-control text-uppercase" data-k="codigo" value="${esc(x.codigo)}" placeholder="AMIGA10"></div>
          <div class="col-6 col-md-2"><label class="form-label small mb-1">Tipo</label><select class="form-select" data-k="tipo"><option value="pct" ${x.tipo === 'pct' ? 'selected' : ''}>Porcentaje</option><option value="valor" ${x.tipo === 'valor' ? 'selected' : ''}>Valor fijo</option></select></div>
          <div class="col-4 col-md-2"><label class="form-label small mb-1">Descuento</label><input class="form-control" type="number" min="0" data-k="valor" value="${x.valor ?? ''}"></div>
          <div class="col-4 col-md-2"><label class="form-label small mb-1">Válido hasta</label><input class="form-control" type="date" data-k="hasta" value="${esc(x.hasta || '')}"></div>
          <div class="col-3 col-md-2"><label class="form-label small mb-1">Usos máx.</label><input class="form-control" type="number" min="0" data-k="max" value="${x.max ?? ''}" placeholder="∞"></div>
          <div class="col-1 text-end"><button type="button" class="btn btn-sm btn-light" data-quitar-cup aria-label="Quitar cupón"><i class="bi bi-x-lg"></i></button></div>
          ${x.usos ? `<div class="col-12 small text-body-secondary">Usado ${x.usos} ${x.usos === 1 ? 'vez' : 'veces'}</div>` : ''}</div>`).join('') : '<div class="small text-body-secondary">Sin cupones.</div>';
    };
    pintarCups();
    $('[data-add-cup]', el).addEventListener('click', () => { cupones.push({ id: null, codigo: '', tipo: 'pct', valor: 10, hasta: '', max: '', usos: 0 }); pintarCups(); });
    cupBox.addEventListener('input', (e) => { const r = e.target.closest('[data-c]'); if (r && e.target.dataset.k) cupones[+r.dataset.c][e.target.dataset.k] = e.target.dataset.k === 'codigo' ? e.target.value.toUpperCase() : e.target.value; });
    cupBox.addEventListener('click', (e) => { const q = e.target.closest('[data-quitar-cup]'); if (!q) return; const i = +q.closest('[data-c]').dataset.c; if (cupones[i].id) quitados.push(cupones[i].id); cupones.splice(i, 1); pintarCups(); });

    $('[data-del]', el)?.addEventListener('click', async () => {
      if (!(await confirm({ title: `¿Borrar «${k.nombre}»?`, text: 'Se borran sus clases, evaluaciones y cupones. Si tiene matrículas, márcalo como inactivo.' }))) return;
      try { await api(`/api/cursos/cursos/${k.id}`, { method: 'DELETE' }); m.hide(); toast('Curso borrado'); location.href = '/staff/cursos.html'; } catch (x) { err.textContent = x.message; }
    });

    f.onsubmit = async (e) => {
      e.preventDefault(); err.textContent = '';
      const body = { nombre: f.nombre.value, area_id: f.area_id.value, nivel: f.nivel.value, profesional_id: f.profesional_id.value, precio: f.precio.value, inicial: f.inicial.value, jornada: f.jornada.value,
        num_clases: f.num_clases.value, inicio: f.inicio.value, festivos: f.festivos.checked, activo: f.activo.checked, descripcion: f.descripcion.value, horario: getH() };
      const vacios = modulos.filter((r) => !r.material_id);
      if (vacios.length) { err.textContent = 'Elige el módulo de cada fila o quita las filas vacías.'; return; }
      if (modulos.some((r) => r.hasta < r.desde)) { err.textContent = 'En un módulo, la clase final no puede ser antes que la inicial.'; return; }
      if (cupones.some((x) => !String(x.codigo).trim())) { err.textContent = 'Escribe el código de cada cupón o quítalo.'; return; }
      const btn = f.querySelector('button.btn-primary'); btn.disabled = true;
      try {
        const r = await api(cursoId ? `/api/cursos/cursos/${cursoId}` : '/api/cursos/cursos', { method: cursoId ? 'PATCH' : 'POST', body });
        if (!cursoId) cursoId = r.id;
        // fechas ajustadas a mano en «Calcular clases»
        if (abierta && calc) for (const [i, x] of calc.clases.entries()) {
          const b0 = base[i]; if (!b0 || !x.fecha) continue;
          if (x.fecha !== b0.fecha || x.ini !== b0.ini || x.fin !== b0.fin) await api(`/api/cursos/${cursoId}/clases/${x.n}`, { method: 'PATCH', body: { fecha: x.fecha, ini: x.ini, fin: x.fin } });
        }
        // módulos: el material de cada clase
        const quiere = {}; for (const r2 of modulos) for (let n = r2.desde; n <= Math.min(r2.hasta, N()); n++) quiere[n] = +r2.material_id;
        for (let n = 1; n <= N(); n++) {
          const antes = nuevo ? null : (clasesAntes.get(n)?.material_id || null), ahora = quiere[n] || null;
          if (antes !== ahora) await api(`/api/cursos/${cursoId}/clases/${n}`, { method: 'PATCH', body: { material_id: ahora || '' } });
        }
        // cupones
        for (const id of quitados) await api(`/api/cursos/cupones/${id}`, { method: 'DELETE' });
        quitados.length = 0;
        for (const x of cupones) {
          const cb = { codigo: x.codigo, tipo: x.tipo, valor: x.valor || 0, hasta: x.hasta || '', max: x.max || '' };
          if (x.id) await api(`/api/cursos/cupones/${x.id}`, { method: 'PATCH', body: cb });
          else { const nuevoC = await api('/api/cursos/cupones', { method: 'POST', body: { curso_id: cursoId, ...cb } }); x.id = nuevoC.id; }
        }
        m.hide(); toast('Curso guardado'); done(cursoId);
      } catch (x) { err.textContent = `${x.message}${cursoId && nuevo ? ' (el curso ya quedó creado; corrige y vuelve a guardar)' : ''}`; btn.disabled = false; }
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
        if ($('[data-act]', view).value) qs.set('activo', $('[data-act]', view).value);
        const { rows } = await api(`/api/cursos/tarjetas?${qs}`);
        $('[data-lista]', view).innerHTML = rows.length ? rows.map((c) => {
          const N = c.num_clases || 0, pct = N ? Math.min(100, Math.round(c.dictadas / N * 100)) : 0;
          return `<div class="dw-card d-flex flex-column" data-id="${c.id}">
            <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
              <div class="d-flex flex-wrap gap-1">${c.nivel ? `<span class="badge text-bg-primary">${esc(c.nivel)}</span>` : ''}${c.jornada ? `<span class="badge text-bg-light border">${esc(c.jornada)}</span>` : ''}${c.area ? `<span class="badge text-bg-light border">${esc(c.area)}</span>` : ''}${c.activo ? '' : C.chip('free', 'Inactivo')}</div>
              ${me.canManage ? `<b class="text-nowrap">${C.money(c.precio)}</b>` : ''}</div>
            <h3 class="h5 mb-1">${esc(c.nombre)}</h3>
            <div class="small text-body-secondary mb-2"><i class="bi bi-person-badge me-1"></i>${esc(c.profesional || 'Sin profesional asignado')}</div>
            <div class="small d-grid gap-1 mb-3 flex-grow-1">
              <span><i class="bi bi-clock me-1" style="color:var(--dw-p)"></i>${esc(AC.horario(c.horario))}</span>
              <span><i class="bi bi-calendar-range me-1" style="color:var(--dw-p)"></i>${c.inicio ? `${C.day(c.inicio)}${c.fin ? ` → ${C.day(c.fin)}` : ''}` : 'Fechas por definir'}</span>
              <span><i class="bi bi-people me-1" style="color:var(--dw-p)"></i>${c.inscritos} ${c.inscritos === 1 ? S : P} · ${N} clases</span></div>
            <div class="d-flex justify-content-between small text-body-secondary mb-1"><span>${esc(c.estado)}</span><span>${c.dictadas}/${N} clases</span></div>
            ${C.meter(c.dictadas, N)}
            <div class="d-flex gap-2 mt-3"><a class="btn btn-sm btn-primary flex-grow-1" href="/staff/cursos.html?id=${c.id}">Abrir curso</a>
              ${MANAGE ? `<button class="btn btn-sm btn-outline-secondary" data-edit title="Editar" aria-label="Editar"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-secondary" data-dup title="Duplicar para otro grupo" aria-label="Duplicar"><i class="bi bi-copy"></i></button>` : ''}</div></div>`;
        }).join('') : `<div style="grid-column:1/-1">${empty('bi-mortarboard', MANAGE ? 'Aún no hay cursos. Crea el primero.' : 'Aún no hay cursos.')}</div>`;
        $('[data-lista]', view).rows = rows;
      };
      view.addEventListener('click', (e) => {
        const b = e.target.closest('[data-edit],[data-dup]'); if (!b) return;
        const k = $('[data-lista]', view).rows.find((x) => String(x.id) === b.closest('[data-id]').dataset.id);
        editarCurso(k, (nid) => { if (b.hasAttribute('data-dup')) location.href = `/staff/cursos.html?id=${nid}`; else load(); }, { duplicar: b.hasAttribute('data-dup') });
      });
      let t;
      $('[data-q]', view).addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
      $('[data-act]', view).addEventListener('change', load);
      await load();
    });
    return;
  }

  function calendario(view) { return AC.calendario(view); }   // declarada como función: se usa más arriba, en la lista

  /* ---------- detalle del curso ---------- */
  let D;
  const cargar = async () => { D = await api(`/api/cursos/${id}/detalle`); return D; };
  try { await cargar(); } catch (x) { $('[data-view]').innerHTML = `<div class="dw-card text-danger">${esc(x.message)}</div>`; return; }
  const k = D.curso;
  const parseEx = (x) => { if (!x) return null; if (typeof x === 'object') return x; try { return JSON.parse(x); } catch { return null; } };
  const preguntasDe = (ev) => parseEx(ev.examen)?.preguntas || [];
  $('[data-h1]').innerHTML = `${esc(k.nombre)} ${C.chip(ESTADO[k.estado] || 'free', k.estado)}`;
  $('[data-acciones]').innerHTML = `<a class="btn btn-light" href="/staff/cursos.html"><i class="bi bi-arrow-left me-1"></i>Cursos</a>${MANAGE ? '<button class="btn btn-outline-primary" data-editar><i class="bi bi-pencil me-1"></i>Editar</button><button class="btn btn-outline-secondary" data-duplicar><i class="bi bi-copy me-1"></i>Duplicar</button>' : ''}${MANAGE && me.modules.some((m) => m.id === 'matriculas') ? `<a class="btn btn-primary" href="/staff/matriculas.html?curso=${k.id}"><i class="bi bi-person-plus me-1"></i>Matrículas</a>` : ''}`;
  $('[data-editar]')?.addEventListener('click', () => editarCurso({ ...k }, () => location.reload()));
  $('[data-duplicar]')?.addEventListener('click', () => editarCurso({ ...k }, (nid) => { location.href = `/staff/cursos.html?id=${nid}`; }, { duplicar: true }));
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
    const activos = () => D.inscritos.filter((i) => i.estado === 'activa');
    const celdaNombre = (i) => `<td class="dw-sticky"><div class="fw-semibold">${esc(i.nombre)}</div><div class="small text-body-secondary">${i.documento ? `CC ${esc(i.documento)}` : 'Sin documento'}</div></td>`;
    if (t === 'asistencia') {
      if (!D.clases.length) { view.innerHTML = empty('bi-calendar-x', 'El curso no tiene clases: pon el número de clases, la fecha de inicio y el horario.'); return; }
      const ORDEN = ['', 'P', 'T', 'J', 'A'], info = Object.fromEntries(ASIS.map(([v, l, c]) => [v, { l, c }]));
      let editando = false;
      const marcas = {}; for (const i of D.inscritos) marcas[i.id] = { ...i.asistencia };
      const cambios = new Set();   // `${ins}:${n}`
      const orig = (insId, n) => D.inscritos.find((i) => i.id === insId)?.asistencia[n] || '';
      const pct = (i) => {
        const m = Object.values(marcas[i.id]).filter(Boolean); if (!m.length) return '—';
        return cambios.size ? `${Math.round((m.length - m.filter((x) => x === 'A').length) / m.length * 100)}%` : (i.resumen_asistencia.pct == null ? '—' : `${i.resumen_asistencia.pct}%`);
      };
      const pinta = () => {
        const act = activos();
        view.innerHTML = `<div class="d-flex flex-wrap gap-2 align-items-center mb-2">
            ${RO ? '' : editando ? '<button class="btn btn-primary btn-sm" data-guardar><i class="bi bi-check-lg me-1"></i>Guardar asistencia</button><button class="btn btn-light btn-sm" data-cancelar>Cancelar</button>'
              : '<button class="btn btn-outline-primary btn-sm" data-editar-as><i class="bi bi-pencil me-1"></i>Editar</button>'}
            <span class="small text-body-secondary ms-auto">${ASIS.map(([v, l, c]) => `<span class="me-2"><span class="dw-as dw-as--${v}">${v}</span> ${l}</span>`).join('')}</span></div>
          ${editando ? '<div class="small text-body-secondary mb-2"><i class="bi bi-hand-index me-1"></i>Toca una casilla para cambiar entre presente, tarde, excusa y ausente. Toca el número de una clase para marcar presentes a todos los que no tienen marca.</div>' : ''}
          ${act.length ? `<div class="table-responsive dw-matriz ${editando ? 'dw-matriz--edit' : ''}"><table class="table align-middle mb-0"><thead><tr><th class="dw-sticky">${esc(AC.cap(S))}</th>
            ${D.clases.map((c) => `<th class="text-center"><${editando ? 'button type="button" class="btn btn-link p-0 text-reset text-decoration-none" data-col="' + c.n + '"' : 'span'}>${c.n}</${editando ? 'button' : 'span'}><div class="small fw-normal text-body-secondary">${c.fecha ? C.day(c.fecha).replace(/ de /g, ' ').replace(/\s\d{4}$/, '') : ''}</div></th>`).join('')}<th class="text-center">Asistencia</th></tr></thead>
            <tbody>${act.map((i) => `<tr data-ins="${i.id}">${celdaNombre(i)}${D.clases.map((c) => { const v = marcas[i.id][c.n] || '';
              return `<td class="text-center"><button type="button" class="dw-as ${v ? `dw-as--${v}` : 'dw-as--vacia'} ${cambios.has(`${i.id}:${c.n}`) ? 'dw-as--cambio' : ''}" data-cel="${c.n}" ${editando ? '' : 'tabindex="-1"'} aria-label="${esc(i.nombre)}, clase ${c.n}: ${v ? info[v].l : 'sin marca'}">${v || '·'}</button></td>`; }).join('')}
              <td class="text-center fw-semibold">${pct(i)}</td></tr>`).join('')}</tbody></table></div>` : empty('bi-people', `No hay ${P} activos en el curso.`)}`;
      };
      pinta();
      view.addEventListener('click', async (e) => {
        if (e.target.closest('[data-editar-as]')) { editando = true; pinta(); return; }
        if (e.target.closest('[data-cancelar]')) { for (const i of D.inscritos) marcas[i.id] = { ...i.asistencia }; cambios.clear(); editando = false; pinta(); return; }
        const col = e.target.closest('[data-col]');
        if (col && editando) { const n = +col.dataset.col; activos().forEach((i) => { if (!marcas[i.id][n]) { marcas[i.id][n] = 'P'; cambios.add(`${i.id}:${n}`); } }); pinta(); return; }
        const cel = e.target.closest('[data-cel]');
        if (cel && editando) {
          const insId = +cel.closest('[data-ins]').dataset.ins, n = +cel.dataset.cel;
          const sig = ORDEN[(ORDEN.indexOf(marcas[insId][n] || '') + 1) % ORDEN.length];
          if (sig) marcas[insId][n] = sig; else delete marcas[insId][n];
          if ((sig || '') === orig(insId, n)) cambios.delete(`${insId}:${n}`); else cambios.add(`${insId}:${n}`);
          pinta(); return;
        }
        if (e.target.closest('[data-guardar]')) {
          const porClase = {};
          for (const k2 of cambios) { const [insId, n] = k2.split(':').map(Number); (porClase[n] ||= []).push({ inscripcion_id: insId, estado: marcas[insId][n] || '' }); }
          try {
            for (const [n, ms] of Object.entries(porClase)) await api(`/api/cursos/${id}/asistencia`, { method: 'POST', body: { clase_n: +n, marcas: ms } });
            await cargar(); toast(cambios.size ? 'Asistencia guardada' : 'No había cambios'); V.reload();
          } catch (x) { toast(x.message, false); }
        }
      });
      return;
    }
    if (t === 'notas') {
      if (!D.evaluaciones.length) { view.innerHTML = empty('bi-star', me.canManage ? 'Crea las evaluaciones del curso en la pestaña «Evaluaciones y cupones».' : 'El curso aún no tiene evaluaciones.'); return; }
      const exStat = new Map(((await api(`/api/cursos/${id}/examenes`).catch(() => ({ rows: [] }))).rows).map((x) => [`${x.inscripcion_id}-${x.evaluacion_id}`, x]));
      const botonEx = (i, e) => {
        const x = exStat.get(`${i.id}-${e.id}`), n = e.examen?.preguntas?.length || 0;
        if (e.tipo === 'multiple') {
          if (!n) return `<span class="text-body-secondary small" title="Primero crea las preguntas en «Evaluaciones y cupones»"><i class="bi bi-card-checklist"></i></span>`;
          return `<button type="button" class="btn btn-sm ${x?.respondidas ? 'btn-outline-primary' : 'btn-outline-secondary'}" data-examen="${e.id}" title="${x?.respondidas ? 'Ver o corregir las respuestas del examen' : 'Responder el examen de selección múltiple'}" aria-label="Examen de ${esc(i.nombre)}"><i class="bi bi-eye"></i></button>`;
        }
        return `<button type="button" class="btn btn-sm ${x?.archivos ? 'btn-outline-primary' : 'btn-outline-secondary'}" data-examen="${e.id}" title="${x?.archivos ? `Ver el examen subido (${x.archivos})` : 'Subir la foto o el PDF del examen'}" aria-label="Examen de ${esc(i.nombre)}"><i class="bi ${x?.archivos ? 'bi-file-earmark-check-fill' : 'bi-upload'}"></i></button>`;
      };
      const act = activos(), pesoTotal = D.evaluaciones.reduce((a, e) => a + e.peso, 0) || 100;
      view.innerHTML = `<div class="d-flex flex-wrap gap-2 align-items-center mb-2">${RO ? '' : '<button class="btn btn-primary btn-sm" data-guardar><i class="bi bi-check-lg me-1"></i>Guardar notas</button>'}
          <span class="small text-body-secondary">Escala 0 a ${D.config.escala} · aprueba con ${D.config.notaMin}</span></div>
        ${act.length ? `<div class="table-responsive dw-matriz"><table class="table align-middle mb-0"><thead><tr><th class="dw-sticky">${esc(AC.cap(S))}</th>
          ${D.evaluaciones.map((e) => `<th class="text-center">${esc(e.nombre)}${RO || !me.canManage ? '' : ` <button type="button" class="btn btn-sm btn-link p-0 ms-1" data-editev="${e.id}" title="Editar la evaluación o cambiar su tipo" aria-label="Editar ${esc(e.nombre)}"><i class="bi bi-pencil"></i></button>`}<div class="small fw-normal text-body-secondary">${e.peso}%${e.clase_n ? ` · clase ${e.clase_n}` : ''} · ${e.tipo === 'multiple' ? 'selección' : 'examen subido'}</div></th>`).join('')}<th class="text-center">Promedio<div class="small fw-normal text-body-secondary">evaluado</div></th></tr></thead>
          <tbody>${act.map((i) => `<tr data-ins="${i.id}">${celdaNombre(i)}${D.evaluaciones.map((e) => `<td><div class="d-flex gap-1 align-items-center justify-content-center">${botonEx(i, e)}
            <input class="form-control form-control-sm" style="width:74px" type="number" min="0" max="${D.config.escala}" step="0.1" inputmode="decimal" data-nota="${e.id}" value="${i.notas[e.id] ?? ''}" ${RO ? 'disabled' : ''} aria-label="${esc(e.nombre)} de ${esc(i.nombre)}"></div></td>`).join('')}
            <td class="text-center" data-res></td></tr>`).join('')}</tbody></table></div>` : empty('bi-people', `No hay ${P} activos en el curso.`)}`;
      const resumen = (tr) => {
        let suma = 0, pesos = 0;
        for (const e of D.evaluaciones) { const v = tr.querySelector(`[data-nota="${e.id}"]`).value; if (v !== '' && !Number.isNaN(+v)) { suma += +v * e.peso; pesos += e.peso; } }
        const prom = pesos ? Math.round(suma / pesos * 100) / 100 : null, ev = Math.round(pesos / pesoTotal * 100);
        tr.querySelector('[data-res]').innerHTML = `<div class="fw-semibold ${prom !== null && prom < D.config.notaMin ? 'text-danger' : ''}">${prom === null ? '—' : prom.toFixed(1)}</div><div class="small text-body-secondary">${ev}% evaluado</div>${C.meter(ev, 100)}`;
      };
      view.querySelectorAll('tbody tr').forEach(resumen);
      view.addEventListener('input', (e) => { const tr = e.target.closest('tr[data-ins]'); if (tr && e.target.dataset.nota !== undefined) resumen(tr); });
      view.addEventListener('click', async (e) => {
        const ed = e.target.closest('[data-editev]');
        if (ed) return editarEvaluacion(D.evaluaciones.find((x) => x.id === +ed.dataset.editev));
        const b = e.target.closest('[data-examen]');
        if (b) {
          const ev = D.evaluaciones.find((x) => x.id === +b.dataset.examen), ins = D.inscritos.find((i) => String(i.id) === b.closest('[data-ins]').dataset.ins);
          AC.examen.abrir({ cursoId: id, ev, ins, ro: RO }, async () => { await cargar(); V.reload(); }).catch((x) => toast(x.message, false));
          return;
        }
        if (!e.target.closest('[data-guardar]')) return;
        try {
          let n = 0;
          for (const ev of D.evaluaciones) {   // solo las notas que cambiaron, evaluación por evaluación
            const notas = [...view.querySelectorAll('tbody tr[data-ins]')].map((r) => ({ inscripcion_id: +r.dataset.ins, nota: r.querySelector(`[data-nota="${ev.id}"]`).value }))
              .filter((x) => String(D.inscritos.find((i) => i.id === x.inscripcion_id).notas[ev.id] ?? '') !== String(x.nota));
            if (notas.length) { await api(`/api/cursos/${id}/notas`, { method: 'POST', body: { evaluacion_id: ev.id, notas } }); n += notas.length; }
          }
          await cargar(); toast(n ? 'Notas guardadas' : 'No había cambios'); V.reload();
        } catch (x) { toast(x.message, false); }
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
        { k: 'tipo', label: 'Tipo', type: 'select', options: [['examen', 'Examen (foto o PDF de cada estudiante)'], ['multiple', 'Selección múltiple (preguntas en la app)']] },
        { k: 'clase_n', label: 'En la clase', type: 'select', options: [['', '—'], ...D.clases.map((c) => [c.n, `Clase ${c.n}${c.fecha ? ` · ${C.day(c.fecha)}` : ''}`])] }],
      columns: [{ label: 'Evaluación', main: true, html: (r) => esc(r.nombre) }, { label: 'Peso', html: (r) => `${r.peso}%` }, { label: 'Clase', html: (r) => (r.clase_n ? `Clase ${r.clase_n}` : '—') },
        { label: 'Tipo', html: (r) => { const n = preguntasDe(r).length; return r.tipo === 'multiple' ? `Selección múltiple<div>${n ? C.chip('ok', `Creado · ${n} ${n === 1 ? 'pregunta' : 'preguntas'}`) : C.chip('soon', 'Por crear')}</div>` : 'Examen<div class="small text-body-secondary">se sube en Notas</div>'; } }],
      rowActions: (r) => (r.tipo === 'multiple' && !RO ? `<button class="btn btn-sm ${preguntasDe(r).length ? 'btn-outline-secondary' : 'btn-primary'}" data-act="preguntas"><i class="bi bi-card-checklist me-1"></i>${preguntasDe(r).length ? 'Editar preguntas' : 'Crear preguntas'}</button>` : ''),
      onAction: async (a, r) => {
        if (a !== 'preguntas') return;
        const mats = await api('/api/material/material?limit=500').then((d) => d.rows).catch(() => []);
        const temas = [...new Set([...D.clases.map((c) => c.tema), ...D.clases.map((c) => mats.find((x) => x.id === c.material_id)?.titulo)].filter(Boolean))].slice(0, 40);
        AC.examen.editarPreguntas({ id: r.id, nombre: r.nombre, examen: parseEx(r.examen) }, { curso: k.nombre, area: k.area, nivel: k.nivel, temas }, () => V.reload());
      } }).load();
    C.table({ el: $('[data-cup]', view), base: '/api/cursos', entity: 'cupones', title: 'cupón', newText: 'Nuevo cupón', fixed: { curso_id: k.id }, readOnly: RO, emptyIcon: 'bi-ticket-perforated', empty: 'Sin cupones.',
      fields: [{ k: 'codigo', label: 'Código', required: true, placeholder: 'AMIGA10' }, { k: 'tipo', label: 'Tipo', type: 'select', options: [['pct', 'Porcentaje'], ['valor', 'Valor fijo']] },
        { k: 'valor', label: 'Descuento', type: 'money', required: true, hint: '% o pesos' }, { k: 'hasta', label: 'Válido hasta', type: 'date' }, { k: 'max', label: 'Usos máximos', type: 'int', hint: 'vacío = sin límite' }],
      columns: [{ label: 'Código', main: true, html: (r) => `<code>${esc(r.codigo)}</code>` }, { label: 'Descuento', html: (r) => (r.tipo === 'pct' ? `${r.valor}%` : C.money(r.valor)) },
        { label: 'Vigencia', html: (r) => (r.hasta ? `Hasta ${C.day(r.hasta)}` : 'Sin fecha') }, { label: 'Usos', html: (r) => `${r.usos}${r.max ? ` de ${r.max}` : ''}` }] }).load();
  });

  // Editar una evaluación desde Notas: nombre, peso, clase y tipo (examen subido ⇄ selección múltiple) y sus preguntas.
  function editarEvaluacion(ev) {
    const { el, m } = modal(`<form><div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Editar ${esc(ev.nombre)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><div class="row g-2">
        <div class="col-sm-8"><label class="form-label small mb-1" for="ev_n">Nombre</label><input class="form-control" id="ev_n" name="nombre" value="${esc(ev.nombre)}" required></div>
        <div class="col-sm-4"><label class="form-label small mb-1" for="ev_p">Peso (%)</label><input class="form-control" id="ev_p" name="peso" type="number" min="0" max="100" value="${ev.peso}" required></div>
        <div class="col-12"><label class="form-label small mb-1" for="ev_t">Tipo de examen</label><select class="form-select" id="ev_t" name="tipo">
          <option value="examen" ${ev.tipo === 'multiple' ? '' : 'selected'}>Examen: se sube la foto o el PDF de cada estudiante</option>
          <option value="multiple" ${ev.tipo === 'multiple' ? 'selected' : ''}>Selección múltiple: preguntas dentro de la app</option></select>
          <div class="form-text">Al cambiar el tipo no se borra lo ya cargado (archivos o respuestas); solo cambia cómo se califica de aquí en adelante.</div></div>
      </div><div class="small text-danger mt-2" data-err></div></div>
      <div class="modal-footer border-0 pt-0 justify-content-between"><span data-preg></span>
        <span><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button> <button class="btn btn-primary">Guardar</button></span></div></form>`);
    const f = el.querySelector('form'), err = el.querySelector('[data-err]');
    const preg = el.querySelector('[data-preg]');
    const pinta = () => { preg.innerHTML = f.tipo.value === 'multiple' ? `<button type="button" class="btn btn-outline-secondary" data-preguntas><i class="bi bi-card-checklist me-1"></i>${preguntasDe(ev).length ? 'Editar preguntas' : 'Crear preguntas'}</button>` : ''; };
    pinta(); f.tipo.onchange = pinta;
    preg.addEventListener('click', async (e) => {
      if (!e.target.closest('[data-preguntas]')) return;
      try {
        if (ev.tipo !== 'multiple') { await api(`/api/cursos/evaluaciones/${ev.id}`, { method: 'PATCH', body: { tipo: 'multiple' } }); ev.tipo = 'multiple'; }
        const mats = await api('/api/material/material?limit=500').then((d) => d.rows).catch(() => []);
        const temas = [...new Set([...D.clases.map((c) => c.tema), ...D.clases.map((c) => mats.find((x) => x.id === c.material_id)?.titulo)].filter(Boolean))].slice(0, 40);
        m.hide();
        AC.examen.editarPreguntas({ id: ev.id, nombre: ev.nombre, examen: ev.examen }, { curso: k.nombre, area: k.area, nivel: k.nivel, temas }, () => V.reload());
      } catch (x) { err.textContent = x.message; }
    });
    f.onsubmit = async (e) => {
      e.preventDefault();
      try { await api(`/api/cursos/evaluaciones/${ev.id}`, { method: 'PATCH', body: { nombre: f.nombre.value, peso: +f.peso.value, tipo: f.tipo.value } }); m.hide(); toast('Evaluación guardada'); V.reload(); }
      catch (x) { err.textContent = x.message; }
    };
  }

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
