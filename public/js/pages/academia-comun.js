// Piezas comunes de las pantallas de CD Academia: datos de la academia y listas para selectores, vistas con pestañas,
// editor de horario semanal, ventana de pago (con recibo) y ficha del estudiante. Se carga antes de la página.
window.AC = (function () {
  const { api, esc, toast, modal } = window.App;
  const C = window.App.Crud;
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const NIVELES = ['Básico', 'Intermedio', 'Avanzado', 'Profesional'];
  const METODOS_PAGO = ['Efectivo', 'Transferencia', 'Nequi', 'Daviplata', 'Tarjeta', 'Bre-B', 'Otro'];
  const CUOTA = { pagada: ['ok', 'Pagada'], vencida: ['bad', 'Vencida'], hoy: ['soon', 'Vence hoy'], parcial: ['soon', 'Abonada'], pendiente: ['free', 'Pendiente'] };
  const $ = (s, el = document) => el.querySelector(s);

  let cfgP;
  const cfg = (force) => (cfgP && !force ? cfgP : (cfgP = api('/api/academia/config')));
  const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
  const listas = {
    cursos: () => api('/api/cursos/lista').then((d) => d.cursos).catch(() => []),
    estudiantes: () => api('/api/estudiantes/lista').then((d) => d.estudiantes).catch(() => []),
    areas: () => api('/api/academia/areas-lista').then((d) => d.areas).catch(() => []),
    profesionales: () => api('/api/profesionales/lista').then((d) => d.profesionales).catch(() => []),
  };
  const opts = (rows, empty = '—', label = 'nombre') => [['', empty], ...rows.map((r) => [r.id, r[label]])];
  const horario = (h) => (h || []).map((x) => `${DIAS[x.dia]} ${x.ini}–${x.fin}`).join(' · ') || '—';

  // Vistas de una página con pestañas (y #vista en la dirección para volver a la misma).
  function vistas(items, render) {
    const seg = $('[data-seg]'), view = $('[data-view]');
    const ok = items.map((x) => x[0]);
    let cur = ok.includes(location.hash.slice(1)) ? location.hash.slice(1) : ok[0];
    const go = (k) => { cur = k; history.replaceState(null, '', `#${k}`); // cada vista recibe un contenedor nuevo (sin eventos de la vista anterior)
      const host = document.createElement('div'); host.innerHTML = '<div class="dw-card text-body-secondary">Cargando…</div>'; view.replaceChildren(host);
      Promise.resolve(render(k, host)).catch((x) => { host.innerHTML = `<div class="dw-card text-danger">${esc(x.message)}</div>`; }); };
    if (items.length > 1) { seg.hidden = false; C.seg(seg, items, go, cur); }
    go(cur);
    return { reload: () => go(cur) };
  }

  // Editor de franjas semanales [{ dia, ini, fin }] dentro de un formulario.
  function horarioEditor(el, inicial = []) {
    let rows = inicial.map((x) => ({ ...x }));
    const draw = () => {
      el.innerHTML = `${rows.map((r, i) => `<div class="d-flex gap-2 mb-2 align-items-center" data-i="${i}">
          <select class="form-select form-select-sm" data-k="dia" aria-label="Día">${DIAS.map((d, j) => `<option value="${j}" ${+r.dia === j ? 'selected' : ''}>${d}</option>`).join('')}</select>
          <input type="time" class="form-control form-control-sm" data-k="ini" value="${esc(r.ini)}" aria-label="Desde">
          <input type="time" class="form-control form-control-sm" data-k="fin" value="${esc(r.fin)}" aria-label="Hasta">
          <button type="button" class="btn btn-sm btn-light" data-quitar aria-label="Quitar franja"><i class="bi bi-x-lg"></i></button></div>`).join('')}
        <button type="button" class="btn btn-sm btn-outline-primary" data-mas><i class="bi bi-plus-lg me-1"></i>Agregar franja</button>`;
    };
    el.addEventListener('input', (e) => { const row = e.target.closest('[data-i]'); if (row && e.target.dataset.k) rows[row.dataset.i][e.target.dataset.k] = e.target.value; });
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-mas]')) { const last = rows[rows.length - 1]; rows.push({ dia: last ? (+last.dia + 2) % 7 : 1, ini: last?.ini || '08:00', fin: last?.fin || '10:00' }); draw(); }
      const q = e.target.closest('[data-quitar]'); if (q) { rows.splice(+q.closest('[data-i]').dataset.i, 1); draw(); }
    });
    draw();
    return () => rows.filter((r) => r.ini && r.fin).map((r) => ({ dia: +r.dia, ini: r.ini, fin: r.fin }));
  }

  // Ventana para registrar un pago de cuotas; al guardar ofrece el recibo.
  function pagar(m, onDone) {
    const { el, m: mm } = modal(`<form><div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Registrar pago</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><p class="small text-body-secondary mb-2">${esc(m.estudiante)} · ${esc(m.curso)}${m.saldo != null ? ` · saldo <b>${C.money(m.saldo)}</b>` : ''}</p>
        <div class="row g-2"><div class="col-sm-6"><label class="form-label small mb-1" for="pv">Valor</label><input class="form-control" id="pv" name="valor" type="number" min="1" step="1" inputmode="numeric" value="${m.sugerido || ''}" required></div>
        <div class="col-sm-6"><label class="form-label small mb-1" for="pm">Medio de pago</label><select class="form-select" id="pm" name="metodo">${METODOS_PAGO.map((x) => `<option>${x}</option>`).join('')}</select></div>
        <div class="col-sm-6"><label class="form-label small mb-1" for="pf">Fecha</label><input class="form-control" id="pf" name="fecha" type="date" value="${C.todayCo()}" required></div>
        <div class="col-sm-6"><label class="form-label small mb-1" for="pc">Concepto</label><input class="form-control" id="pc" name="concepto" placeholder="Abono a cuotas"></div></div>
        <div class="small text-danger mt-2" data-err></div></div>
      <div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary"><i class="bi bi-cash-coin me-1"></i>Registrar</button></div></form>`);
    const f = $('form', el);
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const p = await api('/api/cuotas/pagos', { method: 'POST', body: { inscripcion_id: m.inscripcion_id, valor: f.valor.value, metodo: f.metodo.value, fecha: f.fecha.value, concepto: f.concepto.value } });
        mm.hide(); onDone?.();
        reciboListo(p);
      } catch (x) { $('[data-err]', el).textContent = x.message; }
    };
  }
  function reciboListo(p) {
    const { el, m } = modal(`<div class="modal-body text-center p-4"><i class="bi bi-check-circle text-success" style="font-size:2.4rem"></i><h2 class="h5 mt-2">Pago registrado</h2><p class="text-body-secondary">Recibo N.º ${esc(p.num)}</p>
      <div class="d-flex gap-2 justify-content-center"><button class="btn btn-light" data-bs-dismiss="modal">Cerrar</button><a class="btn btn-primary" href="/api/cuotas/pagos/${esc(p.id)}/recibo?imprimir=1" target="_blank" rel="noopener"><i class="bi bi-printer me-1"></i>Ver recibo</a></div></div>`);
    $('a', el).addEventListener('click', () => m.hide());
  }

  // Ficha del estudiante: matrículas con avance, saldo y pagos.
  // Acceso del estudiante a su inicio en la app: invitar por correo (enlace para crear su contraseña), reenviar o quitar.
  async function accesoApp(host, e) {
    const ESTADO = { sin_acceso: ['free', 'Sin acceso'], invitado: ['soon', 'Invitado (aún no crea su contraseña)'], activo: ['ok', 'Con acceso'] };
    const pintar = (a, enlace) => {
      const [tono, txt] = ESTADO[a.estado];
      host.innerHTML = `<div class="d-flex flex-wrap gap-2 align-items-center">${C.chip(tono, txt)}${a.email ? `<span>${esc(a.email)}</span>` : ''}
        <span class="flex-grow-1"></span><button type="button" class="btn btn-sm btn-outline-primary" data-dar>${a.estado === 'sin_acceso' ? '<i class="bi bi-envelope-plus me-1"></i>Dar acceso' : (a.estado === 'activo' ? '<i class="bi bi-key me-1"></i>Cambiar contraseña' : '<i class="bi bi-send me-1"></i>Enviar enlace de nuevo')}</button>
        ${a.estado !== 'sin_acceso' ? '<button type="button" class="btn btn-sm btn-outline-danger" data-quitar><i class="bi bi-person-x me-1"></i>Quitar acceso</button>' : ''}</div>
        ${a.estado === 'sin_acceso' && !a.email ? '<div class="mt-2"><input class="form-control form-control-sm" type="email" data-mail placeholder="Correo del estudiante"></div>' : ''}
        ${enlace ? `<div class="mt-2">Envíale este enlace para que cree su nueva contraseña:<div class="input-group input-group-sm mt-1"><input class="form-control" readonly value="${esc(enlace)}" data-enlace><button class="btn btn-outline-secondary" type="button" data-copiar>Copiar</button></div></div>` : ''}`;
      host.querySelector('[data-dar]').onclick = async () => {
        if (a.estado === 'activo' && !await window.App.confirm({ title: 'Cambiar contraseña', text: 'Se genera un enlace nuevo para que cree otra contraseña.', ok: 'Cambiar' })) return;
        try { const r = await api(`/api/estudiantes/${e.id}/acceso`, { method: 'POST', body: { email: host.querySelector('[data-mail]')?.value || a.email || undefined } }); pintar(r, r.invite_url); }
        catch (x) { window.App.toast(x.message, false); }
      };
      const q = host.querySelector('[data-quitar]');
      if (q) q.onclick = async () => { if (!await window.App.confirm({ title: 'Quitar acceso', text: 'Ya no podrá entrar a la app.', ok: 'Quitar', danger: true })) return; try { await api(`/api/estudiantes/${e.id}/acceso`, { method: 'DELETE' }); pintar({ estado: 'sin_acceso', email: e.email }); } catch (x) { window.App.toast(x.message, false); } };
      const cp = host.querySelector('[data-copiar]');
      if (cp) cp.onclick = () => { navigator.clipboard?.writeText(host.querySelector('[data-enlace]').value); window.App.toast('Enlace copiado'); };
    };
    try { pintar(await api(`/api/estudiantes/${e.id}/acceso`)); } catch (x) { host.textContent = x.message; }
  }

  // Botones con icono para dar acceso, restablecer contraseña y quitar acceso (lista de estudiantes y de un curso). Solo propietario/administrador.
  const botonesAcceso = (estado, id) => {
    const b = (acc, tono, icono, titulo) => `<button class="btn btn-outline-${tono}" data-acc="${acc}" data-eid="${id}" title="${titulo}" aria-label="${titulo}"><i class="bi ${icono}"></i></button>`;
    return `<span class="btn-group btn-group-sm" role="group" aria-label="Acceso a la app">${estado === 'activo' ? b('reset', 'secondary', 'bi-key', 'Cambiar contraseña') + b('quitar', 'danger', 'bi-person-x', 'Quitar acceso')
      : estado === 'invitado' ? b('dar', 'primary', 'bi-send', 'Enviar enlace de nuevo (aún no crea su contraseña)') + b('quitar', 'danger', 'bi-person-x', 'Quitar acceso')
      : b('dar', 'success', 'bi-person-check', 'Dar acceso a la app')}</span>`;
  };
  async function accionAcceso(accion, id, nombre) {
    const { api, toast, confirm, modal } = window.App;
    if (accion === 'quitar') {
      if (!await confirm({ title: 'Quitar acceso', text: `${nombre} ya no podrá entrar a la app.`, ok: 'Quitar', danger: true })) return false;
      await api(`/api/estudiantes/${id}/acceso`, { method: 'DELETE' }); toast('Acceso quitado'); return true;
    }
    if (accion === 'reset' && !await confirm({ title: 'Cambiar contraseña', text: `Se genera un enlace nuevo para que ${nombre} cree otra contraseña.`, ok: 'Cambiar' })) return false;
    let r;
    try { r = await api(`/api/estudiantes/${id}/acceso`, { method: 'POST', body: {} }); }
    catch (x) {
      if (!/correo|email/i.test(x.message)) throw x;
      const mail = await new Promise((ok) => { const { el, m } = modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Correo de ${esc(nombre)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div><div class="modal-body"><input class="form-control" type="email" data-mail placeholder="correo@ejemplo.com"><button class="btn btn-primary mt-3" data-ok>Continuar</button></div>`); el.addEventListener('hidden.bs.modal', () => ok(null)); el.querySelector('[data-ok]').onclick = () => { ok(el.querySelector('[data-mail]').value.trim()); m.hide(); }; });
      if (!mail) return false;
      r = await api(`/api/estudiantes/${id}/acceso`, { method: 'POST', body: { email: mail } });
    }
    const { el } = modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">${accion === 'reset' ? 'Cambiar contraseña' : 'Enlace de acceso'} · ${esc(nombre)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body small">Envíale este enlace para que cree su contraseña:<div class="input-group input-group-sm mt-2"><input class="form-control" readonly value="${esc(r.invite_url)}" data-enlace><button class="btn btn-outline-secondary" type="button" data-copiar>Copiar</button></div></div>`);
    el.querySelector('[data-copiar]').onclick = () => { navigator.clipboard?.writeText(r.invite_url); toast('Enlace copiado'); };
    return true;
  }

  async function ficha(id, me) {
    const [f, c] = await Promise.all([api(`/api/estudiantes/${id}/ficha`), cfg()]);
    const e = f.estudiante, dinero = me.canManage;
    const ac = (a) => C.chip(a[0], a[1]);
    const { el: fichaEl } = modal(`<div class="modal-header border-0 pb-0"><div><h2 class="modal-title h5 mb-0">${esc(e.nombre)}</h2><div class="small text-body-secondary">${[e.documento && `Doc. ${esc(e.documento)}`, e.telefono && `<a href="https://wa.me/57${esc(String(e.telefono).replace(/\D/g, '').slice(-10))}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> ${esc(e.telefono)}</a>`, e.email && esc(e.email)].filter(Boolean).join(' · ')}</div></div>
      <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body">
        <h3 class="h6">Cursos</h3>
        ${f.matriculas.length ? f.matriculas.map((m) => `<div class="dw-card mb-2"><div class="d-flex flex-wrap gap-2 align-items-center"><b class="flex-grow-1">${esc(m.curso)}</b>${ac(m.academico)}${m.estado !== 'activa' ? C.chip('free', cap(m.estado)) : ''}</div>
          <div class="row small mt-2 g-2"><div class="col-6 col-md-3">Asistencia<br><b>${m.asistencia.pct == null ? '—' : m.asistencia.pct + '%'}</b>${m.asistencia.por_reponer ? ` · ${m.asistencia.por_reponer} por reponer` : ''}</div>
          <div class="col-6 col-md-3">Promedio<br><b>${m.notas.prom ?? '—'}</b> / ${c.escala} · ${m.notas.evaluado}% evaluado</div>
          ${dinero ? `<div class="col-6 col-md-3">Pagado<br><b>${C.money(m.pagado)}</b> de ${C.money(m.total)}</div><div class="col-6 col-md-3">Saldo<br><b class="${m.vencido ? 'text-danger' : ''}">${C.money(m.saldo)}</b>${m.vencido ? ` · vencido ${C.money(m.vencido)}` : ''}</div>` : ''}</div>
          ${dinero && me.modules.some((x) => x.id === 'cuotas') ? `<button type="button" class="btn btn-sm btn-outline-primary mt-2" data-pagos="${m.id}" data-curso="${esc(m.curso)}"><i class="bi bi-receipt me-1"></i>Ver pagos y recibos</button>` : ''}</div>`).join('')
        : '<p class="text-body-secondary small">Aún no está matriculado en ningún curso.</p>'}
        ${e.notas ? `<h3 class="h6 mt-3">Notas</h3><p class="small mb-0" style="white-space:pre-wrap">${esc(e.notas)}</p>` : ''}
        ${me.canManage ? '<h3 class="h6 mt-3">Acceso a la app</h3><div data-acceso class="small text-body-secondary">Cargando…</div>' : ''}
      </div>`, { size: 'modal-lg' });
    if (me.canManage) accesoApp(fichaEl.querySelector('[data-acceso]'), e);
    fichaEl.addEventListener('click', (ev) => { const b = ev.target.closest('[data-pagos]'); if (b) verPagos({ id: b.dataset.pagos, estudiante: e.nombre, curso: b.dataset.curso }); });
  }

  // Calendario de la semana (lunes a domingo) por momentos del día: Mañana, Tarde y Noche. Muestra las clases de los cursos activos y los
  // espacios de reposición; cada clase abre su curso. Lo usan Inicio y la pestaña Calendario de Cursos.
  function semana(host) {
    const lunes = (iso) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
    const mas = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
    const MOM = [['Mañana', 'bi-sunrise', (h) => h < '12:00'], ['Tarde', 'bi-sun', (h) => h >= '12:00' && h < '18:00'], ['Noche', 'bi-moon-stars', (h) => h >= '18:00']];
    const h12 = (h) => { if (!h) return ''; const [a, b] = h.split(':').map(Number); return `${a % 12 || 12}:${String(b).padStart(2, '0')} ${a < 12 ? 'a. m.' : 'p. m.'}`; };
    let desde = lunes(C.todayCo());
    host.innerHTML = `<div class="d-flex align-items-center gap-2 mb-3"><button class="btn btn-light" data-prev aria-label="Semana anterior"><i class="bi bi-chevron-left"></i></button>
      <b class="flex-grow-1 text-center" data-rango></b><button class="btn btn-light" data-hoy>Hoy</button><button class="btn btn-light" data-next aria-label="Semana siguiente"><i class="bi bi-chevron-right"></i></button></div><div data-tabla></div>`;
    // Una clase con evaluación (parcial) se pinta de otro color y dice cuál es
    const evEstilo = (x) => (x.evaluaciones?.length ? ' dw-ev--parcial' : '');
    const evColor = (x) => (!x.evaluaciones?.length && /^#[0-9a-f]{3,8}$/i.test(x.color || '') ? `style="--ev:${esc(x.color)}"` : '');
    const evClase = (x) => `<a class="dw-ev${evEstilo(x)}" ${evColor(x)} href="/staff/cursos.html?id=${x.curso_id}" title="${esc(x.curso)}">
        <b>${esc(h12(x.ini))}${x.fin ? ` – ${esc(h12(x.fin))}` : ''}</b><span class="d-block text-truncate">${esc(x.curso)}</span>
        <span class="text-body-secondary">Clase ${x.n} de ${x.num_clases}${x.tema ? ` · ${esc(x.tema)}` : ''}${x.virtual ? ' · virtual' : ''}</span>
        ${x.evaluaciones?.length ? `<span class="d-block fw-semibold"><i class="bi bi-pencil-square me-1"></i>${x.evaluaciones.map((e) => esc(e.nombre)).join(', ')}</span>` : ''}</a>`;
    const evRepo = (x) => `<a class="dw-ev dw-ev--repo" href="/staff/cursos.html#reposiciones" title="Espacio de reposición"><b>${esc(h12(x.ini))} – ${esc(h12(x.fin))}</b>
        <span class="d-block"><i class="bi bi-arrow-repeat me-1"></i>Reposición</span><span class="text-body-secondary">${x.ocupados} de ${x.cupos} cupos${x.profesional ? ` · ${esc(x.profesional)}` : ''}</span></a>`;
    const load = async () => {
      const hasta = mas(desde, 6), hoy = C.todayCo();
      $('[data-rango]', host).textContent = `${C.day(desde)} – ${C.day(hasta)}`;
      let d; try { d = await api(`/api/cursos/calendario?desde=${desde}&hasta=${hasta}`); } catch (x) { $('[data-tabla]', host).innerHTML = `<div class="dw-card text-danger">${esc(x.message)}</div>`; return; }
      const dias = Array.from({ length: 7 }, (_, i) => mas(desde, i));
      const ev = (f, m) => [...d.clases.filter((x) => x.fecha === f && m[2](x.ini || '00:00')).map((x) => ({ h: x.ini || '', html: evClase(x) })),
        ...d.espacios.filter((x) => x.fecha === f && m[2](x.ini)).map((x) => ({ h: x.ini, html: evRepo(x) }))].sort((p, q) => p.h.localeCompare(q.h)).map((x) => x.html).join('');
      const vacia = !d.clases.length && !d.espacios.length;
      $('[data-tabla]', host).innerHTML = `<table class="dw-semana"><thead><tr><th class="mom"></th>${dias.map((f) => `<th class="${f === hoy ? 'hoy' : ''}">${DIAS[new Date(`${f}T12:00:00Z`).getUTCDay()]} ${+f.slice(8)}</th>`).join('')}</tr></thead>
        <tbody>${MOM.map((m) => `<tr><th class="mom"><i class="bi ${m[1]} me-1"></i>${m[0]}</th>${dias.map((f) => `<td class="${f === hoy ? 'hoy' : ''}" data-dia="${DIAS[new Date(`${f}T12:00:00Z`).getUTCDay()]} ${+f.slice(8)}">${ev(f, m)}</td>`).join('')}</tr>`).join('')}</tbody></table>
        ${vacia ? '<div class="small text-body-secondary mt-2">No hay clases ni reposiciones esta semana.</div>' : ''}`;
    };
    $('[data-prev]', host).onclick = () => { desde = mas(desde, -7); load(); };
    $('[data-next]', host).onclick = () => { desde = mas(desde, 7); load(); };
    $('[data-hoy]', host).onclick = () => { desde = lunes(C.todayCo()); load(); };
    return load();
  }

  // Calendario del mes completo (semanas de lunes a domingo). Cada día lista sus clases y reposiciones; con más de 3, «+N más» las abre.
  function mes(host) {
    const lunes = (iso) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
    const mas = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
    const mesMas = (ym, n) => { const d = new Date(`${ym}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
    let ym = C.todayCo().slice(0, 7);
    host.innerHTML = `<div class="d-flex align-items-center gap-2 mb-3"><button class="btn btn-light" data-prev aria-label="Mes anterior"><i class="bi bi-chevron-left"></i></button>
      <b class="flex-grow-1 text-center text-capitalize" data-rango></b><button class="btn btn-light" data-hoy>Hoy</button><button class="btn btn-light" data-next aria-label="Mes siguiente"><i class="bi bi-chevron-right"></i></button></div><div data-tabla></div>`;
    const hhmm = (h) => h || '';
    const load = async () => {
      const hoy = C.todayCo(), primero = `${ym}-01`, ultimo = mas(`${mesMas(ym, 1)}-01`, -1);
      const desde = lunes(primero), hasta = mas(lunes(ultimo), 6);
      $('[data-rango]', host).textContent = new Date(`${primero}T12:00:00Z`).toLocaleDateString('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      let d; try { d = await api(`/api/cursos/calendario?desde=${desde}&hasta=${hasta}`); } catch (x) { $('[data-tabla]', host).innerHTML = `<div class="dw-card text-danger">${esc(x.message)}</div>`; return; }
      const semanas = Math.round((Date.parse(hasta) - Date.parse(desde)) / 864e5 + 1) / 7;
      const celda = (f) => {
        const ev = [...d.clases.filter((x) => x.fecha === f).map((x) => ({ h: x.ini || '', html: `<a class="dw-ev dw-ev--mini${evEstilo(x)}" ${evColor(x)} href="/staff/cursos.html?id=${x.curso_id}" title="${esc(x.curso)} · clase ${x.n} de ${x.num_clases}${x.tema ? ` · ${esc(x.tema)}` : ''}${x.evaluaciones?.length ? ` · ${esc(x.evaluaciones.map((e) => e.nombre).join(', '))}` : ''}"><b>${esc(hhmm(x.ini))}</b> ${x.evaluaciones?.length ? '<i class="bi bi-pencil-square"></i> ' : ''}${esc(x.curso)}</a>` })),
          ...d.espacios.filter((x) => x.fecha === f).map((x) => ({ h: x.ini, html: `<a class="dw-ev dw-ev--mini dw-ev--repo" href="/staff/cursos.html#reposiciones" title="Espacio de reposición · ${x.ocupados} de ${x.cupos} cupos"><b>${esc(hhmm(x.ini))}</b> <i class="bi bi-arrow-repeat"></i> Reposición</a>` }))]
          .sort((p, q) => p.h.localeCompare(q.h));
        const fuera = !f.startsWith(ym);
        return `<td class="${f === hoy ? 'hoy' : ''} ${fuera ? 'fuera' : ''} ${ev.length ? '' : 'vacio'}" data-dia="${AC.DIAS[new Date(`${f}T12:00:00Z`).getUTCDay()]} ${+f.slice(8)}${fuera ? ' ' + new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CO', { month: 'short', timeZone: 'UTC' }) : ''}">
          <div class="dw-mes-n">${+f.slice(8)}</div>${ev.map((x) => x.html).join('')}${ev.length > 3 ? `<button type="button" class="dw-mas btn btn-link btn-sm p-0" data-mas>+${ev.length - 3} más</button>` : ''}</td>`;
      };
      $('[data-tabla]', host).innerHTML = `<table class="dw-semana dw-mes"><thead><tr>${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((x) => `<th>${x}</th>`).join('')}</tr></thead>
        <tbody>${Array.from({ length: semanas }, (_, w) => `<tr>${Array.from({ length: 7 }, (_, i) => celda(mas(desde, w * 7 + i))).join('')}</tr>`).join('')}</tbody></table>
        ${!d.clases.length && !d.espacios.length ? '<div class="small text-body-secondary mt-2">No hay clases ni reposiciones este mes.</div>' : ''}`;
    };
    host.addEventListener('click', (e) => { const b = e.target.closest('[data-mas]'); if (b) { const td = b.closest('td'); td.classList.toggle('abierto'); b.textContent = td.classList.contains('abierto') ? 'Ver menos' : `+${td.querySelectorAll('.dw-ev').length - 3} más`; } });
    $('[data-prev]', host).onclick = () => { ym = mesMas(ym, -1); load(); };
    $('[data-next]', host).onclick = () => { ym = mesMas(ym, 1); load(); };
    $('[data-hoy]', host).onclick = () => { ym = C.todayCo().slice(0, 7); load(); };
    return load();
  }

  // Calendario con selector Mes / Semana (el mes completo por defecto).
  function calendario(host, vista = 'mes') {
    host.innerHTML = '<div class="btn-group mb-3" role="group" aria-label="Vista del calendario"><button type="button" class="btn btn-sm btn-outline-primary" data-v="mes">Mes</button><button type="button" class="btn btn-sm btn-outline-primary" data-v="semana">Semana</button></div><div data-cal></div>';
    const ir = (v) => {
      host.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('active', b.dataset.v === v));
      const sub = document.createElement('div'); host.querySelector('[data-cal]').replaceChildren(sub);
      return v === 'mes' ? mes(sub) : semana(sub);
    };
    host.querySelector('.btn-group').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) ir(b.dataset.v); });
    return ir(vista);
  }

  // Pagos y recibos de una matrícula: salen de Finanzas (ahí está el libro). m = { id, estudiante, curso }
  async function verPagos(m) {
    const { api, esc, modal, toast, table, empty } = window.App;
    const C = window.App.Crud;
    let d;
    try { d = await api(`/api/matriculas/${m.id}/pagos`); } catch (x) { toast(x.message, false); return; }
    modal(`<div class="modal-header border-0 pb-0"><div><h2 class="modal-title h5 mb-0">Pagos y recibos de caja</h2><div class="small text-body-secondary">${esc(d.estudiante)} · ${esc(d.curso)} · desde Finanzas</div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body">${d.pagos.length ? `${table([
        { label: 'Recibo', main: true, html: (p) => `${esc(p.recibo || `Pago N.º ${p.num}`)}${p.anulado ? ' ' + C.chip('bad', 'Anulado') : ''}${p.en_finanzas ? '' : ' ' + C.chip('soon', 'Sin enviar')}${p.recibo ? `<div class="small text-body-secondary fw-normal">Pago N.º ${esc(p.num)}</div>` : ''}` },
        { label: 'Fecha', html: (p) => C.day(p.fecha) },
        { label: 'Concepto', html: (p) => `${esc(p.concepto || p.categoria || '')}<div class="small text-body-secondary">${esc(p.metodo || '')}</div>` },
        { label: 'Valor', cls: 'text-end', html: (p) => `<span class="${p.anulado ? 'text-decoration-line-through text-body-secondary' : ''}">${C.money(p.valor)}</span>` },
        { label: '', cls: 'text-end', html: (p) => (p.en_finanzas ? `<a class="btn btn-sm btn-outline-primary" href="/api/matriculas/${m.id}/pagos/${p.num}/recibo" target="_blank" rel="noopener"><i class="bi bi-printer me-1"></i>Recibo de caja</a>` : '') }], d.pagos)}
        <div class="d-flex mt-3"><span class="flex-grow-1 text-body-secondary small">${d.pagos.length} ${d.pagos.length === 1 ? 'pago' : 'pagos'}</span><span>Total pagado <b>${C.money(d.total)}</b></span></div>
        ${d.cuenta_cobro ? `<div class="mt-2"><a class="btn btn-sm btn-outline-secondary" href="/api/matriculas/${m.id}/cuenta-de-cobro" target="_blank" rel="noopener"><i class="bi bi-file-earmark-text me-1"></i>Cuenta de cobro</a></div>` : ''}
        ${d.faltan ? `<div class="small text-warning-emphasis mt-2"><i class="bi bi-exclamation-triangle me-1"></i>${d.faltan} ${d.faltan === 1 ? 'pago aún no está' : 'pagos aún no están'} en Finanzas: usa «Enviar pagos a Finanzas» en Matrículas.</div>` : ''}`
        : empty('bi-receipt', 'Todavía no hay pagos de esta matrícula.')}</div>
      <div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cerrar</button></div>`, { size: 'modal-lg' });
  }

  return { verPagos, DIAS, NIVELES, METODOS_PAGO, CUOTA, cfg, cap, listas, opts, horario, vistas, horarioEditor, pagar, reciboListo, ficha, botonesAcceso, accionAcceso, semana, mes, calendario };
})();
