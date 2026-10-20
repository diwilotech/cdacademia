// Inicio del estudiante: calendario semana por semana, avisos, instalación y seguimiento de sus cursos.
// Un solo curso → entra directo a él. Varios → calendario general con todos; al tocar uno se abre su seguimiento.
// Si el curso aún no empieza, el calendario abre en la semana del primer día y marca cuántos días faltan.
(function () {
  const { api, esc, toast, empty, changePassword } = window.App;
  const C = window.App.Crud;
  const $ = (s, el = document) => el.querySelector(s);
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const MOM = [['Mañana', 'bi-sunrise', (h) => h < '12:00'], ['Tarde', 'bi-sun', (h) => h >= '12:00' && h < '18:00'], ['Noche', 'bi-moon-stars', (h) => h >= '18:00']];
  const ASIS = { P: ['ok', 'Asististe'], A: ['bad', 'Faltaste'], T: ['soon', 'Llegaste tarde'], J: ['free', 'Excusa'] };
  const lunes = (iso) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
  const mas = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  const h12 = (h) => { if (!h) return ''; const [a, b] = h.split(':').map(Number); return `${a % 12 || 12}:${String(b).padStart(2, '0')} ${a < 12 ? 'a. m.' : 'p. m.'}`; };
  const dia = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const faltan = (n) => (n === 0 ? 'Empieza hoy' : n === 1 ? 'Falta 1 día' : `Faltan ${n} días`);
  const colorOk = (c) => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? ` style="--ev:${esc(c)}"` : '');

  let D = null;           // /api/alumno/inicio
  let instalar = null;    // evento beforeinstallprompt

  function tema(s) {
    document.documentElement.setAttribute('data-dw-tema', s.tema); document.documentElement.setAttribute('data-bs-theme', s.modo);
    try { localStorage.setItem('dw_tema', JSON.stringify({ tema: s.tema, modo: s.modo })); } catch (_) {}
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = s.modo === 'dark' ? '#171a23' : getComputedStyle(document.documentElement).getPropertyValue('--dw-p').trim() || '#be185d';
  }

  /* ---------- encabezado: marca, avisos y usuario ---------- */
  function encabezado() {
    const n = D.estudiante.nombre, ini = n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
    const logo = D.settings.logo ? `<img src="${esc(D.settings.logo)}" alt="">` : esc((D.negocio.nombre.trim()[0] || 'D').toUpperCase());
    const av = D.avisos;
    $('[data-top]').innerHTML = `<a class="dw-brand" href="/${esc(D.negocio.slug)}"><span class="dw-brand__logo">${logo}</span><span class="dw-brand__name">${esc(D.negocio.nombre)}</span></a>
      <span class="dw-top__spacer"></span>
      <div class="dropdown"><button class="dw-iconbtn position-relative" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Avisos"><i class="bi bi-bell"></i>${av.length ? `<span class="dw-dot"></span>` : ''}</button>
        <div class="dropdown-menu dropdown-menu-end p-0" style="width:320px;max-width:calc(100vw - 24px)"><div class="px-3 py-2 fw-semibold border-bottom">Avisos</div>
          ${av.length ? av.map((a) => `<div class="px-3 py-2 d-flex gap-2 border-bottom small"><i class="bi ${esc(a.icono)} text-${{ bad: 'danger', soon: 'warning' }[a.tono] || 'primary'}"></i><span>${esc(a.texto)}</span></div>`).join('') : '<div class="px-3 py-3 small text-body-secondary text-center">No tienes avisos.</div>'}</div></div>
      <div class="dropdown"><button class="dw-user" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Menú de usuario"><span class="dw-avatar">${esc(ini)}</span><i class="bi bi-chevron-down small d-none d-sm-inline"></i></button>
        <ul class="dropdown-menu dropdown-menu-end shadow-sm"><li class="px-3 py-2"><div class="fw-semibold">${esc(n)}</div><div class="small text-body-secondary">${esc(D.usuario.email)}</div></li><li><hr class="dropdown-divider"></li>
          <li><button class="dropdown-item" data-pass><i class="bi bi-key me-2"></i>Cambiar contraseña</button></li>
          <li><a class="dropdown-item" href="/privacidad" target="_blank" rel="noopener"><i class="bi bi-shield-check me-2"></i>Política de datos</a></li><li><hr class="dropdown-divider"></li>
          <li><button class="dropdown-item text-danger" data-logout><i class="bi bi-box-arrow-right me-2"></i>Cerrar sesión</button></li></ul></div>`;
    $('[data-pass]').onclick = changePassword;
    $('[data-logout]').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); location.replace('/'); };
    document.title = `Mi academia · ${D.negocio.nombre}`;
  }

  /* ---------- instalación como app ---------- */
  function bannerInstalar() {
    const host = $('[data-instalar]');
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    let cerrado = false; try { cerrado = localStorage.getItem('dw_alumno_instalar') === '1'; } catch (_) {}
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (standalone || cerrado || (!instalar && !ios)) { host.hidden = true; return; }
    host.hidden = false;
    host.innerHTML = `<div class="dw-card d-flex align-items-center gap-3 mb-3 py-2"><i class="bi bi-phone fs-4 text-primary"></i>
      <div class="flex-grow-1 small"><b>Instala la app en tu celular</b><div class="text-body-secondary">${instalar ? 'Ábrela como cualquier app, sin buscar el enlace.' : 'Toca <i class="bi bi-box-arrow-up"></i> Compartir y luego «Añadir a pantalla de inicio».'}</div></div>
      ${instalar ? '<button class="btn btn-sm btn-primary" data-inst>Instalar</button>' : ''}<button class="btn-close" data-no aria-label="Ocultar"></button></div>`;
    const b = $('[data-inst]', host); if (b) b.onclick = async () => { instalar.prompt(); await instalar.userChoice.catch(() => {}); instalar = null; bannerInstalar(); };
    $('[data-no]', host).onclick = () => { try { localStorage.setItem('dw_alumno_instalar', '1'); } catch (_) {} host.hidden = true; };
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); instalar = e; if (D) bannerInstalar(); });

  /* ---------- calendario (semana o mes; todos los cursos o uno) ---------- */
  // opts: { matricula (id o null = todos), ancla (fecha dentro del periodo inicial), inicios: [{fecha, curso}], abrir(id), clase(matricula, n) }
  function calendario(host, opts) {
    let modo = 'semana', ref = opts.ancla || D.hoy;
    const primeroMes = (iso) => `${iso.slice(0, 7)}-01`;
    const mesNombre = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    host.innerHTML = `<div class="d-flex align-items-center gap-2 mb-3 flex-wrap"><div class="btn-group" role="group" aria-label="Vista"><button class="btn btn-outline-primary" data-modo="semana">Semana</button><button class="btn btn-outline-primary" data-modo="mes">Mes</button></div>
      <button class="btn btn-light ms-auto" data-prev aria-label="Anterior"><i class="bi bi-chevron-left"></i></button><b class="text-center" style="min-width:9rem" data-rango></b><button class="btn btn-light" data-next aria-label="Siguiente"><i class="bi bi-chevron-right"></i></button><button class="btn btn-light" data-hoy>Hoy</button></div><div data-tabla></div>`;
    let datos = { clases: [], reposiciones: [] };
    const evClase = (x, corto) => `<a class="dw-ev ${x.fecha === D.hoy ? 'dw-ev--hoy' : ''}" ${colorOk(x.color)} href="#" data-clase="${x.matricula_id}:${x.n}"><b>${esc(h12(x.ini))}${!corto && x.fin ? ` – ${esc(h12(x.fin))}` : ''}</b>
        <span class="d-block text-truncate">${esc(x.curso)}</span>${corto ? '' : `<span class="text-body-secondary">Clase ${x.n} de ${x.num_clases}${x.tema ? ` · ${esc(x.tema)}` : ''}${x.virtual ? ' · virtual' : ''}</span>
        ${x.asistencia && ASIS[x.asistencia] ? `<span class="d-block">${C.chip(...ASIS[x.asistencia])}</span>` : ''}`}</a>`;
    const evRepo = (x, corto) => `<a class="dw-ev dw-ev--repo" href="#" data-curso="${x.matricula_id}"><b>${esc(h12(x.ini))}${corto ? '' : ` – ${esc(h12(x.fin))}`}</b><span class="d-block text-truncate"><i class="bi bi-arrow-repeat me-1"></i>Reposición · ${esc(x.curso)}</span>${corto ? '' : `<span class="text-body-secondary">Clase ${x.clase_n}${x.modo === 'virtual' ? ' · virtual' : ''}</span>`}</a>`;
    const marcaInicio = (f) => (opts.inicios || []).filter((x) => x.fecha === f).map((x) => `<div class="dw-ev dw-ev--inicio"><i class="bi bi-flag-fill me-1"></i><b>Inicio</b> · ${esc(x.curso)}<span class="d-block">${faltan(Math.round((Date.parse(f) - Date.parse(D.hoy)) / 864e5))}</span></div>`).join('');
    const filtro = (l) => l.filter((x) => !opts.matricula || x.matricula_id === opts.matricula);
    const del = (f, m, corto) => [...filtro(datos.clases).filter((x) => x.fecha === f && (!m || m[2](x.ini || '00:00'))).map((x) => ({ h: x.ini || '', html: evClase(x, corto) })),
      ...filtro(datos.reposiciones).filter((x) => x.fecha === f && (!m || m[2](x.ini))).map((x) => ({ h: x.ini, html: evRepo(x, corto) }))].sort((p, q) => p.h.localeCompare(q.h)).map((x) => x.html).join('');
    const cabeza = (f) => `${DIAS[new Date(`${f}T12:00:00Z`).getUTCDay()]} ${+f.slice(8)}`;

    const rango = () => {
      if (modo === 'semana') { const d = lunes(ref); return [d, mas(d, 6)]; }
      const ini = lunes(primeroMes(ref)), fin = mas(primeroMes(mas(primeroMes(ref), 35)), -1), ult = mas(lunes(fin), 6);   // semanas completas que tocan el mes
      return [ini, ult < mas(ini, 34) ? mas(ini, 34) : ult];
    };
    const pintaSemana = (desde) => {
      const hoy = D.hoy, dias = Array.from({ length: 7 }, (_, i) => mas(desde, i));
      const vacia = !filtro(datos.clases).length && !filtro(datos.reposiciones).length && !dias.some(marcaInicio);
      $('[data-tabla]', host).innerHTML = `
        <div class="d-none d-md-block"><table class="dw-semana"><thead><tr><th class="mom"></th>${dias.map((f) => `<th class="${f === hoy ? 'hoy' : ''}">${cabeza(f)}</th>`).join('')}</tr></thead>
          <tbody>${MOM.map((m, i) => `<tr><th class="mom"><i class="bi ${m[1]} me-1"></i>${m[0]}</th>${dias.map((f) => `<td class="${f === hoy ? 'hoy' : ''}">${i === 0 ? marcaInicio(f) : ''}${del(f, m)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <div class="d-md-none">${dias.map((f) => { const ev = marcaInicio(f) + del(f); return `<div class="dw-card mb-2 py-2 ${f === hoy ? 'border-primary' : ''}"><div class="fw-semibold small mb-1 ${f === hoy ? 'text-primary' : ''}">${esc(dia(f))}${f === hoy ? ' · hoy' : ''}</div>${ev || '<div class="small text-body-secondary">Sin clases</div>'}</div>`; }).join('')}</div>
        ${vacia ? '<div class="small text-body-secondary mt-2">No hay clases esta semana.</div>' : ''}`;
    };
    const pintaMes = (desde, hasta) => {
      const hoy = D.hoy, n = Math.round((Date.parse(hasta) - Date.parse(desde)) / 864e5 + 1), mes = ref.slice(0, 7);
      const celda = (f) => {
        const ev = del(f, null, true), hay = filtro(datos.clases).some((x) => x.fecha === f) || filtro(datos.reposiciones).some((x) => x.fecha === f);
        return `<td class="dw-dia ${f === hoy ? 'hoy' : ''} ${f.slice(0, 7) !== mes ? 'fuera' : ''}" data-dia="${f}"><div class="dw-dia__n">${+f.slice(8)}</div><div class="d-none d-md-block">${marcaInicio(f)}${ev}</div>${hay ? '<div class="d-md-none dw-punto"></div>' : ''}</td>`;
      };
      $('[data-tabla]', host).innerHTML = `<table class="dw-semana dw-mes"><thead><tr>${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((x) => `<th>${x}</th>`).join('')}</tr></thead>
        <tbody>${Array.from({ length: n / 7 }, (_, w) => `<tr>${Array.from({ length: 7 }, (_, i) => celda(mas(desde, w * 7 + i))).join('')}</tr>`).join('')}</tbody></table>`;
    };
    const load = async () => {
      const [desde, hasta] = rango();
      $('[data-rango]', host).textContent = modo === 'semana' ? `${C.day(desde)} – ${C.day(hasta)}` : cap(mesNombre(ref));
      host.querySelectorAll('[data-modo]').forEach((b) => b.classList.toggle('active', b.dataset.modo === modo));
      try { datos = await api(`/api/alumno/calendario?desde=${desde}&hasta=${hasta}`); } catch (x) { $('[data-tabla]', host).innerHTML = `<div class="dw-card text-danger">${esc(x.message)}</div>`; return; }
      if (modo === 'semana') pintaSemana(desde); else pintaMes(desde, hasta);
    };
    host.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-clase]'); if (a) { e.preventDefault(); const [m, n] = a.dataset.clase.split(':').map(Number); opts.clase?.(m, n); return; }
      const r = e.target.closest('a[data-curso]'); if (r) { e.preventDefault(); opts.abrir?.(Number(r.dataset.curso)); return; }
      const td = e.target.closest('td[data-dia]');
      if (td) {   // en celular, tocar el día muestra lo que hay ese día
        const f = td.dataset.dia, ev = marcaInicio(f) + del(f, null, false);
        const { el } = window.App.modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h6 text-capitalize">${esc(dia(f))}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div><div class="modal-body">${ev || '<div class="small text-body-secondary">Sin clases este día.</div>'}</div>`);
        el.addEventListener('click', (x) => { const l = x.target.closest('a[data-clase]'); if (l) { x.preventDefault(); bootstrap.Modal.getInstance(el)?.hide(); const [m, n] = l.dataset.clase.split(':').map(Number); opts.clase?.(m, n); } });
      }
    });
    host.querySelectorAll('[data-modo]').forEach((b) => { b.onclick = () => { modo = b.dataset.modo; load(); }; });
    $('[data-prev]', host).onclick = () => { ref = modo === 'semana' ? mas(ref, -7) : mas(primeroMes(ref), -1); load(); };
    $('[data-next]', host).onclick = () => { ref = modo === 'semana' ? mas(ref, 7) : mas(primeroMes(ref), 32); load(); };
    $('[data-hoy]', host).onclick = () => { ref = D.hoy; load(); };
    return load();
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- la clase: material del día, mi trabajo y evaluaciones ---------- */
  const fmtTam = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
  async function subirArchivo(url, file) {
    const blob = await preparar(file);
    if (blob.size > 20 * 1024 * 1024) throw new Error('El archivo supera los 20 MB');
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}nombre=${encodeURIComponent(file.name)}`, { method: 'POST', credentials: 'same-origin', headers: { 'x-app': '1', 'content-type': blob.type || file.type || 'application/octet-stream' }, body: blob });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Error ${res.status}`);
    return j;
  }
  const iconoMime = (m) => (/^image\//.test(m) ? 'bi-file-earmark-image' : m === 'application/pdf' ? 'bi-file-earmark-pdf' : /^video\//.test(m) ? 'bi-file-earmark-play' : /^audio\//.test(m) ? 'bi-file-earmark-music' : 'bi-file-earmark');

  async function claseModal(mat, n) {
    window.AC.doc.base = '/api/alumno/material/';
    const ruta = `/api/alumno/curso/${mat}`, curso = D.cursos.find((x) => x.id === mat);
    const { el, m } = window.App.modal(`<div class="modal-header border-0 pb-0"><div><h2 class="modal-title h5 mb-0" data-t>Clase ${n}</h2><div class="small text-body-secondary" data-s>${esc(curso?.curso || '')}</div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body" data-body><div class="placeholder-glow"><span class="placeholder col-8"></span></div></div>`, { size: 'modal-xl' });
    const body = $('[data-body]', el);
    let K = null;
    const cargar = async () => {
      try { K = await api(`${ruta}/clase/${n}`); } catch (x) { body.innerHTML = `<div class="text-danger">${esc(x.message)}</div>`; return; }
      pintar();
    };
    const pintar = () => {
      $('[data-t]', el).textContent = `Clase ${n}${K.tema ? ` · ${K.tema}` : ''}`;
      $('[data-s]', el).textContent = `${curso?.curso || ''} · ${K.fecha ? dia(K.fecha) : 'Sin fecha'}${K.ini ? ` · ${h12(K.ini)}${K.fin ? ` – ${h12(K.fin)}` : ''}` : ''}${K.virtual ? ' · virtual' : ''}`;
      if (K.bloqueada) { body.innerHTML = `<div class="alert alert-info mb-0"><i class="bi bi-lock me-1"></i>El material, la entrega de trabajos y las evaluaciones de esta clase se abren el día de la clase${K.fecha ? ` (${esc(dia(K.fecha))})` : ''}.</div>`; return; }
      const evs = K.evaluaciones.map((e) => {
        const est = e.enviado ? (e.nota != null ? C.chip('ok', `Nota ${Number(e.nota).toFixed(1)} / ${e.escala}`) : C.chip('soon', 'Enviada · en revisión')) : e.abierta ? C.chip('soon', 'Disponible hoy') : C.chip('bad', 'No presentada');
        return `<li class="list-group-item d-flex gap-2 align-items-center flex-wrap"><div class="flex-grow-1"><b>${esc(e.nombre)}</b><div class="small text-body-secondary">${e.peso}% del curso${e.resultado ? ` · ${e.resultado.obtenido} de ${e.resultado.total} puntos` : ''}</div></div>${est}
          ${e.abierta ? `<button class="btn btn-sm btn-primary" data-presentar="${e.id}"><i class="bi bi-pencil-square me-1"></i>${e.tipo === 'examen' ? 'Subir mi examen' : 'Presentar'}</button>` : ''}
          ${e.enviado && e.archivos.length ? e.archivos.map((a, k) => `<a class="btn btn-sm btn-light" href="/api/alumno/examen-archivo/${encodeURIComponent(a.key)}" target="_blank" rel="noopener" aria-label="Ver archivo ${k + 1}"><i class="bi bi-paperclip"></i></a>`).join('') : ''}</li>`;
      }).join('');
      body.innerHTML = `
        ${K.hoy ? '<div class="alert alert-success py-2"><i class="bi bi-calendar-check me-1"></i><b>Hoy es tu clase.</b> Aquí tienes el material y puedes subir tu trabajo o presentar la evaluación.</div>' : ''}
        ${K.detalle || K.materiales ? `<div class="dw-card mb-3 small">${K.detalle ? `<div>${esc(K.detalle)}</div>` : ''}${K.materiales ? `<div class="mt-1"><b>Qué traer:</b> ${esc(K.materiales)}</div>` : ''}</div>` : ''}
        ${K.material ? `<h3 class="h6">Material de la clase</h3><div class="dw-card mb-3 p-3" data-doc>${K.material.bloques.length ? window.AC.doc.html(K.material.bloques) : `<div class="small text-body-secondary">${esc(K.material.descripcion || 'Este material aún no tiene contenido.')}</div>`}</div>`
          : '<div class="small text-body-secondary mb-3">Esta clase no tiene material asignado.</div>'}
        ${K.evaluaciones.length ? `<h3 class="h6">Evaluaciones de esta clase</h3><ul class="list-group mb-3">${evs}</ul>` : ''}
        <h3 class="h6">Mi trabajo</h3><div class="dw-card mb-1" data-trabajo>
          ${K.entregas.length ? `<ul class="list-group list-group-flush mb-2">${K.entregas.map((x) => `<li class="list-group-item px-0 d-flex gap-2 align-items-center"><i class="bi ${iconoMime(x.mime)}"></i><a class="flex-grow-1 text-truncate" href="/api/alumno/entregas/${x.id}/archivo" target="_blank" rel="noopener">${esc(x.nombre)}</a>
            <small class="text-body-secondary">${fmtTam(x.size)}</small><button class="btn btn-sm btn-light text-danger" data-quitar="${x.id}" aria-label="Quitar"><i class="bi bi-trash"></i></button></li>`).join('')}</ul>` : '<div class="small text-body-secondary mb-2">Aún no has subido nada en esta clase.</div>'}
          <label class="btn btn-outline-primary mb-0"><i class="bi bi-upload me-1"></i>Subir archivos<input type="file" multiple hidden data-subir accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,video/mp4,video/webm,audio/*"></label>
          <span class="small text-body-secondary ms-2">Fotos, PDF, Office, video o audio · máx. 20 MB cada uno</span></div>`;
      const doc = $('[data-doc]', body);
      if (doc && K.material) doc.addEventListener('click', (e) => window.AC.doc.click(e, (i) => K.material.bloques[i]));
    };
    body.addEventListener('change', async (e) => {
      const inp = e.target.closest('[data-subir]'); if (!inp) return;
      inp.disabled = true;
      for (const f of [...inp.files]) { try { await subirArchivo(`${ruta}/clase/${n}/entregas`, f); toast(`«${f.name}» subido`); } catch (x) { toast(`${f.name}: ${x.message}`, false); } }
      await cargar();
    });
    body.addEventListener('click', async (e) => {
      const q = e.target.closest('[data-quitar]');
      if (q && await window.App.confirm({ title: 'Quitar archivo', text: 'Se borrará el archivo que subiste.', ok: 'Quitar', danger: true })) { try { await api(`/api/alumno/entregas/${q.dataset.quitar}`, { method: 'DELETE' }); await cargar(); } catch (x) { toast(x.message, false); } }
      const p = e.target.closest('[data-presentar]'); if (p) evaluacion(K.evaluaciones.find((x) => x.id === Number(p.dataset.presentar)));
    });

    /* ---- presentar una evaluación ---- */
    function evaluacion(ev) {
      const ex = ev.examen, resp = { ...(ev.resp || {}) };
      const vuelta = `<button class="btn btn-light btn-sm mb-3" data-volver><i class="bi bi-arrow-left me-1"></i>Volver a la clase</button>`;
      const enviar = async (btn) => {
        if (!await window.App.confirm({ title: 'Enviar evaluación', text: 'Después de enviarla no podrás cambiar tus respuestas.', ok: 'Enviar' })) return;
        btn.disabled = true;
        try { const r = await api(`${ruta}/evaluaciones/${ev.id}/enviar`, { method: 'POST', body: { resp } }); toast(r.evaluacion.nota != null ? `Enviada. Tu nota: ${Number(r.evaluacion.nota).toFixed(1)}` : 'Evaluación enviada. El docente la revisará.'); await cargar(); }
        catch (x) { toast(x.message, false); btn.disabled = false; }
      };
      if (!ex) {   // examen en papel: foto o PDF
        let arch = [...ev.archivos];
        const pintaP = () => {
          body.innerHTML = `${vuelta}<h3 class="h5">${esc(ev.nombre)}</h3><p class="small text-body-secondary">Resuelve tu examen en papel y sube una foto de cada hoja (o un PDF). Cuando termines, envíalo.</p>
            ${arch.length ? `<ul class="list-group mb-3">${arch.map((a) => `<li class="list-group-item d-flex gap-2"><i class="bi ${iconoMime(a.tipoArchivo)}"></i><a href="/api/alumno/examen-archivo/${encodeURIComponent(a.key)}" target="_blank" rel="noopener" class="flex-grow-1 text-truncate">${esc(a.nombre)}</a><small>${fmtTam(a.size)}</small></li>`).join('')}</ul>` : ''}
            <label class="btn btn-outline-primary"><i class="bi bi-camera me-1"></i>Agregar foto o PDF<input type="file" hidden multiple accept="image/*,application/pdf" data-ex></label>
            <button class="btn btn-primary ms-2" data-enviar ${arch.length ? '' : 'disabled'}>Enviar examen</button>`;
          $('[data-volver]', body).onclick = pintar;
          $('[data-enviar]', body).onclick = (e2) => enviar(e2.currentTarget);
          $('[data-ex]', body).onchange = async (e2) => { e2.target.disabled = true; for (const f of [...e2.target.files]) { try { const r = await subirArchivo(`${ruta}/evaluaciones/${ev.id}/archivo`, f); arch = r.archivos; } catch (x) { toast(`${f.name}: ${x.message}`, false); } } pintaP(); };
        };
        return pintaP();
      }
      let t = null;
      const guardar = () => { clearTimeout(t); t = setTimeout(() => api(`${ruta}/evaluaciones/${ev.id}`, { method: 'PUT', body: { resp } }).catch(() => {}), 600); };
      body.innerHTML = `${vuelta}<div class="examen-prot"><h3 class="h5">${esc(ev.nombre)}</h3>${ex.instrucciones ? `<p class="small text-body-secondary">${esc(ex.instrucciones)}</p>` : ''}
        <div class="small text-body-secondary mb-3"><i class="bi bi-info-circle me-1"></i>Tus respuestas se guardan solas. Al terminar, toca «Enviar». Solo se envía una vez.</div>
        ${ex.preguntas.map((q, k) => `<div class="dw-card mb-3" data-q="${esc(q.id)}"><div class="fw-semibold mb-2">${k + 1}. ${esc(q.enunciado)} <small class="text-body-secondary fw-normal">(${q.puntos} pts)</small></div>
          ${q.tipo === 'unica' ? q.opciones.map((o) => `<div class="form-check"><input class="form-check-input" type="radio" name="p${k}" id="p${k}_${esc(o.id)}" value="${esc(o.id)}" ${resp[q.id] === o.id ? 'checked' : ''}><label class="form-check-label" for="p${k}_${esc(o.id)}">${esc(o.texto)}</label></div>`).join('')
          : q.tipo === 'multiple' ? q.opciones.map((o) => `<div class="form-check"><input class="form-check-input" type="checkbox" id="p${k}_${esc(o.id)}" value="${esc(o.id)}" ${(resp[q.id] || []).includes(o.id) ? 'checked' : ''}><label class="form-check-label" for="p${k}_${esc(o.id)}">${esc(o.texto)}</label></div>`).join('')
          : q.tipo === 'vf' ? ['true', 'false'].map((v) => `<div class="form-check form-check-inline"><input class="form-check-input" type="radio" name="p${k}" id="p${k}_${v}" value="${v}" ${String(resp[q.id]) === v ? 'checked' : ''}><label class="form-check-label" for="p${k}_${v}">${v === 'true' ? 'Verdadero' : 'Falso'}</label></div>`).join('')
          : q.tipo === 'corta' ? `<input class="form-control" maxlength="500" value="${esc(resp[q.id] || '')}" aria-label="Respuesta">` : `<textarea class="form-control" rows="4" maxlength="4000" aria-label="Respuesta">${esc(resp[q.id] || '')}</textarea>`}</div>`).join('')}
        <button class="btn btn-primary" data-enviar>Enviar evaluación</button></div>`;
      $('[data-volver]', body).onclick = () => { clearTimeout(t); pintar(); };
      $('[data-enviar]', body).onclick = (e2) => { clearTimeout(t); enviar(e2.currentTarget); };
      body.querySelectorAll('[data-q]').forEach((box) => {
        const q = ex.preguntas.find((x) => x.id === box.dataset.q);
        box.addEventListener('input', () => {
          if (q.tipo === 'unica') resp[q.id] = box.querySelector('input:checked')?.value;
          else if (q.tipo === 'multiple') resp[q.id] = [...box.querySelectorAll('input:checked')].map((i) => i.value);
          else if (q.tipo === 'vf') { const v = box.querySelector('input:checked')?.value; if (v) resp[q.id] = v === 'true'; }
          else resp[q.id] = box.querySelector('input,textarea').value;
          guardar();
        });
      });
      body.scrollIntoView?.();
    }
    cargar();
  }

  // Tarjeta «Hoy»: si hay clase hoy, el acceso directo al material, a subir trabajo y a las evaluaciones.
  const tarjetaHoy = () => {
    const hoy = D.cursos.filter((c) => c.clase_hoy);
    return hoy.map((c) => `<div class="dw-card dw-hoy mb-3" ${colorOk(c.color)}><div class="d-flex flex-wrap align-items-center gap-3"><span class="dw-kpi__icon"><i class="bi bi-calendar-check"></i></span>
      <div class="flex-grow-1"><div class="small text-body-secondary">Hoy tienes clase${c.clase_hoy.ini ? ` · ${esc(h12(c.clase_hoy.ini))}${c.clase_hoy.fin ? ` – ${esc(h12(c.clase_hoy.fin))}` : ''}` : ''}</div><b>${esc(c.curso)}</b> · Clase ${c.clase_hoy.n}${c.clase_hoy.tema ? ` · ${esc(c.clase_hoy.tema)}` : ''}
        ${c.clase_hoy.pendientes.length ? `<div class="small text-warning-emphasis"><i class="bi bi-pencil-square me-1"></i>Evaluación disponible hoy: ${c.clase_hoy.pendientes.map(esc).join(', ')}</div>` : ''}</div>
      <button class="btn btn-primary" data-clase-hoy="${c.id}:${c.clase_hoy.n}"><i class="bi bi-folder2-open me-1"></i>Abrir la clase</button></div></div>`).join('');
  };
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-clase-hoy]'); if (b) { const [m, n] = b.dataset.claseHoy.split(':').map(Number); claseModal(m, n); } });

  /* ---------- piezas ---------- */
  const cuenta = (c) => (c.estado === 'por_iniciar' ? `<div class="alert alert-info d-flex align-items-center gap-2 py-2 mb-3"><i class="bi bi-hourglass-split fs-5"></i><div><b>${faltan(c.empieza_en)}</b> para que empiece ${esc(c.curso)}<div class="small">Primera clase: ${esc(dia(c.inicio))}</div></div></div>` : '');
  const tarjeta = (label, valor, icono) => `<div class="dw-card dw-kpi"><span class="dw-kpi__icon"><i class="bi ${icono}"></i></span><span><span class="dw-kpi__v d-block">${valor}</span><span class="dw-kpi__l d-block">${esc(label)}</span></span></div>`;
  const proxima = (c) => (c.proxima ? `${esc(dia(c.proxima.fecha))}${c.proxima.ini ? ` · ${esc(h12(c.proxima.ini))}` : ''}` : c.estado === 'terminado' ? 'Curso terminado' : 'Sin clases programadas');

  /* ---------- vista general (varios cursos) ---------- */
  function vistaGeneral() {
    const v = $('[data-vista]');
    const futuros = D.cursos.filter((c) => c.estado === 'por_iniciar').sort((a, b) => a.inicio.localeCompare(b.inicio));
    const enCurso = D.cursos.some((c) => c.estado === 'en_curso');
    const ancla = !enCurso && futuros.length ? futuros[0].inicio : D.hoy;
    v.innerHTML = `<div class="dw-page-head"><h1>Hola, ${esc(D.estudiante.nombre.split(' ')[0])}</h1></div>
      ${tarjetaHoy()}
      <div class="dw-grid mb-4">${D.cursos.map((c) => `<a href="#" class="dw-card dw-curso" ${colorOk(c.color)} data-abrir="${c.id}">
        <div class="d-flex justify-content-between align-items-start gap-2"><b>${esc(c.curso)}</b>${c.estado === 'por_iniciar' ? C.chip('soon', faltan(c.empieza_en)) : C.chip(c.academico[0], c.academico[1])}</div>
        <div class="small text-body-secondary mt-1">${esc(proxima(c))}</div>
        <div class="progress mt-2" style="height:6px"><div class="progress-bar" style="width:${c.total_clases ? Math.round((c.hechas / c.total_clases) * 100) : 0}%"></div></div>
        <div class="small text-body-secondary mt-1">${c.hechas} de ${c.total_clases} clases</div></a>`).join('')}</div>
      <h2 class="h5 mb-3">Mi calendario</h2><div data-sem></div>`;
    v.onclick = (e) => { const a = e.target.closest('[data-abrir]'); if (a) { e.preventDefault(); abrir(Number(a.dataset.abrir)); } };
    calendario($('[data-sem]'), { ancla, inicios: futuros.map((c) => ({ fecha: c.inicio, curso: c.curso })), abrir, clase: claseModal });
  }

  /* ---------- seguimiento de un curso ---------- */
  async function vistaCurso(id, conVolver) {
    const v = $('[data-vista]'), c = D.cursos.find((x) => x.id === id);
    v.innerHTML = '<div class="dw-card placeholder-glow"><span class="placeholder col-8"></span></div>';
    let d; try { d = await api(`/api/alumno/curso/${id}`); } catch (x) { v.innerHTML = `<div class="dw-card text-danger">${esc(x.message)}</div>`; return; }
    const prom = d.notas.prom == null ? '—' : Number(d.notas.prom).toFixed(1);
    const ant = d.clases.filter((x) => x.fecha && x.fecha < D.hoy);
    v.innerHTML = `<div class="dw-page-head">${conVolver ? '<button class="btn btn-light" data-volver aria-label="Volver"><i class="bi bi-arrow-left"></i></button>' : ''}<h1>${conVolver ? esc(c.curso) : `Hola, ${esc(D.estudiante.nombre.split(' ')[0])}`}</h1>${C.chip(c.academico[0], c.academico[1])}</div>
      ${conVolver ? '' : `<div class="text-body-secondary mb-3">${esc(c.curso)}${c.nivel ? ` · ${esc(c.nivel)}` : ''}</div>`}
      ${cuenta(c)}${tarjetaHoy()}
      <div class="dw-grid mb-4">
        ${tarjeta('Próxima clase', `<span class="fs-6">${proxima(c)}</span>`, 'bi-calendar-event')}
        ${tarjeta('Clases', `${c.hechas} / ${c.total_clases}`, 'bi-journal-bookmark')}
        ${tarjeta(`Asistencia (mín. ${d.asisMin}%)`, d.asistencia.pct == null ? '—' : `${d.asistencia.pct}%`, 'bi-check2-circle')}
        ${tarjeta(`Promedio (mín. ${d.notaMin})`, prom, 'bi-award')}
        ${c.saldo > 0 ? tarjeta(c.vencido > 0 ? `Saldo · vencido ${C.money(c.vencido)}` : c.proxima_cuota ? `Saldo · próxima cuota ${C.day(c.proxima_cuota.vence)}` : 'Saldo', `<span class="${c.vencido > 0 ? 'text-danger' : ''}">${C.money(c.saldo)}</span>`, 'bi-cash-coin') : ''}
        ${d.asistencia.por_reponer > 0 ? tarjeta('Clases por reponer', d.asistencia.por_reponer, 'bi-arrow-repeat') : ''}
      </div>
      <div data-pagos class="mb-4"></div>
      <h2 class="h5 mb-3">Calendario</h2><div data-sem class="mb-4"></div>
      <div class="row g-4"><div class="col-lg-7"><h2 class="h5 mb-3">Mis clases</h2><div class="dw-card p-0"><ul class="list-group list-group-flush">
        ${d.clases.map((x) => `<li class="list-group-item d-flex gap-2 align-items-center ${x.fecha === D.hoy ? 'bg-body-tertiary' : ''}" ${x.fecha && x.fecha <= D.hoy ? `role="button" data-clase-hoy="${id}:${x.n}"` : ''}><span class="text-body-secondary" style="width:2rem">${x.n}</span>
          <div class="flex-grow-1"><div class="small fw-semibold">${esc(x.tema || `Clase ${x.n}`)}${x.virtual ? ' · virtual' : ''}</div><div class="small text-body-secondary">${x.fecha ? `${esc(dia(x.fecha))}${x.ini ? ` · ${esc(h12(x.ini))}` : ''}` : 'Sin fecha'}</div></div>
          ${x.asistencia && ASIS[x.asistencia] ? C.chip(...ASIS[x.asistencia]) : x.fecha && x.fecha < D.hoy ? '' : x.fecha === D.hoy ? C.chip('soon', 'Hoy') : ''}
          ${x.reposicion ? C.chip(x.reposicion === 'hecha' ? 'ok' : 'soon', x.reposicion === 'hecha' ? 'Repuesta' : 'Reposición') : ''}${x.fecha && x.fecha <= D.hoy ? '<i class="bi bi-chevron-right text-body-secondary"></i>' : ''}</li>`).join('') || `<li class="list-group-item">${empty('bi-calendar-x', 'Aún no hay clases programadas.')}</li>`}
        </ul></div>${ant.length ? '' : ''}</div>
        <div class="col-lg-5"><h2 class="h5 mb-3">Mis notas</h2><div class="dw-card p-0"><ul class="list-group list-group-flush">
        ${d.evaluaciones.map((x) => `<li class="list-group-item d-flex justify-content-between align-items-center"><span>${esc(x.nombre)}<span class="small text-body-secondary d-block">${x.peso}% del curso</span></span>
          <b class="${x.nota != null && x.nota < d.notaMin ? 'text-danger' : ''}">${x.nota == null ? '—' : Number(x.nota).toFixed(1)}</b></li>`).join('') || `<li class="list-group-item small text-body-secondary">Este curso aún no tiene evaluaciones.</li>`}
        </ul></div></div></div>`;
    const volver = $('[data-volver]'); if (volver) volver.onclick = () => vistaGeneral();
    calendario($('[data-sem]'), { matricula: id, ancla: c.estado === 'por_iniciar' ? c.inicio : D.hoy, inicios: c.estado === 'por_iniciar' ? [{ fecha: c.inicio, curso: c.curso }] : [], abrir: null, clase: claseModal });
    pagos($('[data-pagos]'), id, d, c);
    window.scrollTo(0, 0);
  }

  /* ---------- pagos: cuotas, comprobante, cuenta de cobro y recibos ---------- */
  const CUOTA = { pagada: ['ok', 'Pagada'], vencida: ['bad', 'Vencida'], hoy: ['soon', 'Vence hoy'], parcial: ['soon', 'Abonada'], pendiente: ['free', 'Pendiente'] };
  const COMP = { pendiente: ['soon', 'En revisión'], aprobado: ['ok', 'Aprobado'], rechazado: ['bad', 'Rechazado'] };
  const MAXB = 5 * 1024 * 1024;

  // Las fotos del celular pesan mucho: se reducen antes de subirlas (el PDF y lo liviano pasan igual).
  async function preparar(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.5 * 1024 * 1024) return file;
    try {
      const bmp = await createImageBitmap(file), k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.85));
      return blob && blob.size < file.size ? blob : file;
    } catch (_) { return file; }
  }

  function pagos(host, id, d, c) {
    const p = d.pagos, ruta = `/api/alumno/curso/${id}`;
    host.innerHTML = `<h2 class="h5 mb-3">Pagos</h2><div class="dw-card">
      <div class="d-flex flex-wrap gap-2 align-items-center mb-3"><div class="flex-grow-1"><div class="small text-body-secondary">Pagado ${C.money(p.pagado)} de ${C.money(p.total)}</div><div class="fw-semibold ${c.vencido > 0 ? 'text-danger' : ''}">Saldo ${C.money(p.saldo)}</div></div>
        ${p.finanzas ? `<a class="btn btn-outline-secondary" href="${ruta}/cuenta-de-cobro" target="_blank" rel="noopener"><i class="bi bi-file-earmark-text me-1"></i>Cuenta de cobro</a>` : ''}
        ${p.saldo > 0 ? '<button class="btn btn-primary" data-subir><i class="bi bi-upload me-1"></i>Subir comprobante</button>' : ''}</div>
      ${p.cuotas.length ? `<div class="table-responsive"><table class="table table-sm align-middle mb-3"><thead><tr><th>Cuota</th><th>Vence</th><th class="text-end">Valor</th><th></th></tr></thead><tbody>
        ${p.cuotas.map((q) => `<tr><td>${esc(q.etiqueta || (q.n === 0 ? 'Cuota inicial' : `Cuota ${q.n}`))}</td><td>${C.day(q.vence)}</td><td class="text-end">${C.money(q.valor)}</td><td class="text-end">${C.chip(...(CUOTA[q.estado] || CUOTA.pendiente))}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <div data-comps></div>${p.finanzas ? '<div data-recibos></div>' : ''}</div>`;
    const comps = () => {
      $('[data-comps]', host).innerHTML = p.comprobantes.length ? `<h3 class="h6">Mis comprobantes</h3><ul class="list-group list-group-flush mb-3">${p.comprobantes.map((m) => `<li class="list-group-item px-0 d-flex gap-2 align-items-center flex-wrap">
        <div class="flex-grow-1"><b>${C.money(m.valor)}</b> · ${esc(m.metodo || '')} · ${C.day(m.fecha)}${m.estado === 'rechazado' && m.motivo ? `<div class="small text-danger">${esc(m.motivo)}</div>` : ''}${m.estado === 'aprobado' && m.pago_num ? `<div class="small text-body-secondary">Recibo de pago N.º ${m.pago_num}</div>` : ''}</div>
        ${C.chip(...COMP[m.estado])}<a class="btn btn-sm btn-light" href="/api/alumno/comprobantes/${m.id}/archivo" target="_blank" rel="noopener" aria-label="Ver archivo"><i class="bi bi-paperclip"></i></a></li>`).join('')}</ul>` : '';
    };
    comps();
    if (p.finanzas) api(`${ruta}/recibos`).then((r) => {
      $('[data-recibos]', host).innerHTML = r.recibos.length ? `<h3 class="h6">Mis recibos</h3><ul class="list-group list-group-flush">${r.recibos.map((x) => `<li class="list-group-item px-0 d-flex gap-2 align-items-center">
        <div class="flex-grow-1"><b>${esc(x.recibo)}</b> · ${C.money(x.valor)}<div class="small text-body-secondary">${C.day(x.fecha)}${x.metodo ? ` · ${esc(x.metodo)}` : ''}</div></div>
        <a class="btn btn-sm btn-outline-secondary" href="${ruta}/recibos/${x.num}" target="_blank" rel="noopener"><i class="bi bi-receipt me-1"></i>Ver</a></li>`).join('')}</ul>` : '<div class="small text-body-secondary">Cuando se confirme tu primer pago, aquí aparecerá tu recibo.</div>';
    }).catch(() => {});
    const subir = $('[data-subir]', host);
    if (subir) subir.onclick = () => {
      const { el, m } = window.App.modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Subir comprobante de pago</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
        <div class="modal-body"><p class="small text-body-secondary">Paga por transferencia, Nequi, Daviplata o Bre-B y sube la captura o el PDF. La academia lo revisa y te llega tu recibo.</p>
          <div class="row g-2"><div class="col-6"><label class="form-label small">Valor pagado</label><input class="form-control" type="number" min="1" max="${p.saldo}" step="1" value="${p.cuotas.find((q) => q.estado !== 'pagada')?.falta || p.saldo}" data-valor></div>
            <div class="col-6"><label class="form-label small">Fecha del pago</label><input class="form-control" type="date" max="${D.hoy}" value="${D.hoy}" data-fecha></div>
            <div class="col-12"><label class="form-label small">Medio de pago</label><select class="form-select" data-metodo>${['Transferencia', 'Nequi', 'Daviplata', 'Bre-B', 'Consignación', 'Tarjeta', 'Otro'].map((x) => `<option>${x}</option>`).join('')}</select></div>
            <div class="col-12"><label class="form-label small">Comprobante (foto o PDF, máx. 5 MB)</label><input class="form-control" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" data-archivo></div>
            <div class="col-12"><label class="form-label small">Nota (opcional)</label><input class="form-control" maxlength="300" data-nota placeholder="Ej.: pago de la cuota 2"></div></div></div>
        <div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button type="button" class="btn btn-primary" data-enviar>Enviar</button></div>`);
      const q = (s) => el.querySelector(s);
      q('[data-enviar]').onclick = async (ev) => {
        const btn = ev.currentTarget, f = q('[data-archivo]').files[0], valor = Number(q('[data-valor]').value);
        if (!(valor > 0)) return toast('Escribe el valor que pagaste', false);
        if (!f) return toast('Adjunta la foto o el PDF del comprobante', false);
        btn.disabled = true;
        try {
          const blob = await preparar(f);
          if (blob.size > MAXB) throw new Error('El archivo pesa más de 5 MB');
          const qs = new URLSearchParams({ valor, fecha: q('[data-fecha]').value, metodo: q('[data-metodo]').value, nota: q('[data-nota]').value, nombre: f.name });
          const res = await fetch(`${ruta}/comprobantes?${qs}`, { method: 'POST', credentials: 'same-origin', headers: { 'x-app': '1', 'content-type': blob.type || f.type }, body: blob });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(j.error || `Error ${res.status}`);
          m.hide(); toast('Comprobante enviado. Te avisamos cuando lo revisemos.');
          const nuevo = await api(`${ruta}/comprobantes`); p.comprobantes = nuevo.comprobantes; comps();
        } catch (x) { toast(x.message, false); btn.disabled = false; }
      };
    };
  }

  function abrir(id) { vistaCurso(id, D.cursos.length > 1); }

  /* ---------- arranque ---------- */
  api('/api/alumno/inicio').then((d) => {
    D = d; tema(D.settings); encabezado(); bannerInstalar();
    if (!D.cursos.length) {
      $('[data-vista]').innerHTML = `<div class="dw-page-head"><h1>Hola, ${esc(D.estudiante.nombre.split(' ')[0])}</h1></div><div class="dw-card">${empty('bi-mortarboard', 'Aún no tienes cursos activos. Cuando te matriculen, aparecerán aquí.')}</div>`;
    } else if (D.cursos.length === 1) abrir(D.cursos[0].id);
    else vistaGeneral();
  }).catch((e) => {
    if (e.status === 401 || e.status === 409) return location.replace('/');
    $('[data-vista]').innerHTML = `<div class="dw-card text-danger">${esc(e.message)}</div>`;
    toast(e.message, false);
  });
})();
