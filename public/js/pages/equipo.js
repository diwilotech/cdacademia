// Equipo: todas las personas de la academia en un solo lugar — personal con acceso a la app (propietario, administradores,
// personal) y profesionales (docentes). El propietario y los administradores invitan, cambian el rol, eligen los módulos
// que ve cada persona del personal y quitan gente. El propietario solo lo cambia Diwilo.
DW.ready.then(async (me) => {
  const { api, esc, toast, confirm, modal, empty, table } = window.App;
  const ROLE = { owner: 'Propietario', admin: 'Administrador', staff: 'Personal' };
  const list = document.querySelector('[data-list]');
  const canManage = me.canManage && !me.business.readOnly;
  const inviteBtn = document.querySelector('[data-invite]'), profBtn = document.querySelector('[data-nuevo-prof]');
  inviteBtn.hidden = !me.canManage;
  profBtn.hidden = !canManage;
  let users = [], profs = [], catalogo = [], areas = [], datos = new Map(), docencia = { profesionales: [] };
  const key = (s) => String(s || '').trim().toLowerCase();

  function showLink(url, who) {
    const { el } = modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Link para ${esc(who)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><p class="small text-body-secondary">Envíaselo por WhatsApp o correo. Sirve una sola vez para crear o restablecer su contraseña.</p>
      <div class="input-group"><input class="form-control" readonly value="${esc(url)}"><button class="btn btn-primary" data-copy><i class="bi bi-clipboard"></i></button></div></div>`);
    el.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Link copiado'); } catch { el.querySelector('input').select(); } };
  }
  const modBoxes = (sel) => catalogo.map((m, i) => `<div class="col-6"><div class="form-check"><input class="form-check-input" type="checkbox" id="mod${i}" data-mod="${esc(m.id)}" ${(sel || catalogo.filter((x) => x.defecto).map((x) => x.id)).includes(m.id) ? 'checked' : ''}><label class="form-check-label" for="mod${i}">${esc(m.nombre)}</label></div></div>`).join('');
  const picked = (el) => [...el.querySelectorAll('[data-mod]:checked')].map((c) => c.dataset.mod);

  const personaKey = (r) => (r.user ? `u:${r.user.id}` : `p:${r.prof.id}`);
  // Personas = usuarios con acceso + profesionales (se unen por correo; los que no tienen acceso salen como «Sin acceso»).
  const rows = () => {
    const byMail = new Map(profs.filter((p) => p.email).map((p) => [key(p.email), p]));
    const out = users.map((u) => ({ user: u, prof: byMail.get(key(u.email)) || null }));
    const used = new Set(out.map((r) => r.prof?.id).filter(Boolean));
    profs.filter((p) => !used.has(p.id)).forEach((p) => out.push({ user: null, prof: p }));
    return out;
  };

  async function load() {
    const [t, p, pn] = await Promise.all([api('/api/team'), api('/api/profesionales/profesionales?limit=500').catch(() => ({ rows: [] })), me.canManage ? api('/api/team/personas').catch(() => ({ personas: [] })) : Promise.resolve({ personas: [] })]);
    docencia = await api('/api/team/docencia').catch(() => ({ profesionales: [] }));
    users = t.users; catalogo = t.catalogo; profs = p.rows || []; datos = new Map(pn.personas.map((x) => [x.key, x]));
    areas = await AC.listas.areas().catch(() => []);
    const nombreArea = (id) => areas.find((a) => a.id === id)?.nombre || '—';
    const all = rows();
    list.innerHTML = kpisDocencia(all) + docGrid(all) + (all.length ? table([
      { label: 'Nombre', main: true, html: (r) => { const n = r.user?.name || r.prof?.nombre || r.user?.email; const e = r.user?.email || r.prof?.email || '';
        return `<div>${esc(n)}</div><div class="small text-body-secondary fw-normal">${esc(e)}</div>`; } },
      ...(me.canManage ? [{ label: 'Documento y celular', html: (r) => { const d = datos.get(personaKey(r)), tel = d?.celular || r.prof?.telefono;
        return d?.documento || tel ? `${d?.documento ? `<div><span class="badge text-bg-light">${esc(d.tipo_documento || 'CC')}</span> ${esc(d.documento)}</div>` : ''}${tel ? `<div class="small text-body-secondary">Cel ${esc(tel)}</div>` : ''}` : '<span class="text-body-secondary">—</span>'; } }] : []),
      { label: 'Rol', html: (r) => {
        const rol = !r.user ? '<span class="badge text-bg-secondary">Sin acceso a la app</span>'
          : (r.user.role === 'owner' || !canManage ? `<span class="badge text-bg-light">${ROLE[r.user.role] || esc(r.user.role)}</span>`
            : `<select class="form-select form-select-sm w-auto d-inline-block" data-role="${esc(r.user.id)}" aria-label="Rol"><option value="staff" ${r.user.role === 'staff' ? 'selected' : ''}>Personal</option><option value="admin" ${r.user.role === 'admin' ? 'selected' : ''}>Administrador</option></select>`);
        return `${rol}${r.prof ? ' <span class="badge text-bg-info">Profesional</span>' : ''}`; } },
      { label: 'Detalle', html: (r) => {
        const mods = r.user?.modulos ? `<div class="small">Módulos: ${r.user.modulos.length ? r.user.modulos.map((id) => esc(catalogo.find((m) => m.id === id)?.nombre || id)).join(', ') : 'ninguno'}</div>` : (r.user && r.user.role !== 'staff' ? '<div class="small text-body-secondary">Todos los módulos</div>' : '');
        const ars = r.prof ? `<div class="small">${r.prof.areas.map((a) => esc(nombreArea(a.area_id))).join(', ') || 'Sin áreas'}${r.prof.activo ? '' : ' · inactivo'}</div>` : '';
        const st = r.user?.status === 'invited' ? '<span class="badge text-bg-warning">Invitación pendiente</span>' : '';
        return mods + ars + st; } },
      { label: '', cls: 'text-end text-nowrap', html: (r) => {
        const u = r.user, id = esc(u?.id || '');
        return [
          me.canManage ? `<button class="btn btn-sm btn-outline-primary" data-editar="${esc(personaKey(r))}" title="Info: datos${r.prof ? ', áreas, niveles y horario' : ' y si es profesional'}" aria-label="Info de la persona"><i class="bi bi-mortarboard"></i></button>` : '',
          u && u.role === 'staff' && canManage ? `<button class="btn btn-sm btn-outline-secondary" data-mods="${id}" title="Módulos que puede abrir"><i class="bi bi-grid"></i></button>` : '',
          !u && r.prof && me.canManage ? `<button class="btn btn-sm btn-primary" data-dar="${r.prof.id}" title="Invitarlo a la app con su correo"><i class="bi bi-person-plus me-1"></i>Dar acceso</button>` : '',
          u && u.role !== 'owner' && canManage ? `<button class="btn btn-sm btn-outline-secondary" data-link="${id}" data-email="${esc(u.email)}" title="Link para crear o restablecer su contraseña"><i class="bi bi-key"></i></button>
            <button class="btn btn-sm btn-outline-danger" data-del="${id}" data-email="${esc(u.email)}" title="Quitar del equipo"><i class="bi bi-trash"></i></button>` : '',
        ].join(' '); } },
    ], all) : empty('bi-people', 'Aún no hay nadie en el equipo.'));
  }


  /* ---------- Docencia: cuántas clases han dado y qué cursos tienen (visual) ---------- */
  const fechaCorta = (f) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
  const docDe = (r) => (r.prof ? docencia.profesionales.find((x) => x.profesional_id === r.prof.id) : null);
  const iniciales = (n) => String(n || '?').split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
  function docCard(r) {
    const d = docDe(r), nombre = r.user?.name || r.prof?.nombre || r.user?.email;
    const stat = (n, l, tono = '') => `<div class="eq-stat ${tono}"><b>${n}</b><span>${l}</span></div>`;
    const cursos = d?.cursos || [];
    return `<div class="eq-card"><div class="eq-head"><span class="eq-av">${esc(iniciales(nombre))}</span><div class="flex-grow-1" style="min-width:0"><b class="d-block text-truncate">${esc(nombre)}</b>
        <span class="small text-body-secondary">${cursos.length ? `${cursos.length} ${cursos.length === 1 ? 'curso' : 'cursos'}` : 'Sin cursos asignados'}${d?.proxima ? ` · próxima ${esc(fechaCorta(d.proxima.fecha))}${d.proxima.ini ? ` ${esc(d.proxima.ini)}` : ''}` : ''}</span></div></div>
      ${d ? `<div class="eq-stats">${stat(d.mes_dictadas, 'dadas este mes', 'eq-ok')}${stat(d.mes_faltan, 'por dar')}${stat(d.dictadas, 'en total')}${d.horas_mes ? stat(`${d.horas_mes} h`, 'este mes') : ''}</div>` : ''}
      ${cursos.map((k) => { const pct = k.total ? Math.min(100, Math.round((k.dictadas / k.total) * 100)) : 0, col = /^#[0-9a-f]{3,8}$/i.test(k.color || '') ? `;background:${k.color}` : '';
        return `<div class="eq-curso"><div class="d-flex justify-content-between gap-2"><span class="text-truncate">${esc(k.nombre)}</span><span class="text-body-secondary text-nowrap small">${k.dictadas} de ${k.total} clases</span></div>
          <div class="progress" style="height:8px" role="progressbar" aria-label="Avance de ${esc(k.nombre)}" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar" style="width:${pct}%${col}"></div></div>
          <div class="eq-sub">${k.proxima ? `Próxima: ${esc(fechaCorta(k.proxima.fecha))}${k.proxima.ini ? ` · ${esc(k.proxima.ini)}` : ''} · clase ${k.proxima.n}` : 'Curso dictado completo'}</div></div>`; }).join('')}</div>`;
  }
  function docGrid(all) {
    const prof = all.filter((r) => r.prof).sort((x, y) => (docDe(y)?.mes_dictadas || 0) - (docDe(x)?.mes_dictadas || 0));
    return prof.length ? `<h2 class="h6 mb-2"><i class="bi bi-mortarboard me-1"></i>Docencia</h2><div class="eq-grid mb-4">${prof.map(docCard).join('')}</div><h2 class="h6 mb-2"><i class="bi bi-people me-1"></i>Personas</h2>` : '';
  }
  function kpisDocencia(all) {
    const ds = all.map(docDe).filter(Boolean);
    if (!ds.length) return '';
    const tot = (k) => ds.reduce((a, d) => a + d[k], 0), cursos = ds.reduce((a, d) => a + d.cursos.length, 0);
    const card = (n, l, ic) => `<div class="dw-card dw-kpi"><span class="dw-kpi__icon"><i class="bi ${ic}"></i></span><span><span class="dw-kpi__v d-block">${n}</span><span class="dw-kpi__l d-block">${l}</span></span></div>`;
    return `<div class="dw-grid dw-grid--kpi mb-3">${card(ds.length, 'Profesionales con cursos', 'bi-mortarboard')}${card(cursos, 'Cursos en marcha', 'bi-journal-bookmark')}${card(tot('mes_dictadas'), 'Clases dadas este mes', 'bi-check2-circle')}${card(tot('mes_faltan'), 'Por dar este mes', 'bi-calendar-event')}</div>`;
  }
  // Trae a todo el equipo al módulo Nómina (sin duplicar): quien cobra por clase u hora entra como contratista. Solo propietario y administradores, con Nómina activa.
  async function pasarANomina() {
    if (!canManage || !me.modules.some((m) => m.id === 'nomina')) return;
    try { const r = await api('/api/team/nomina/sincronizar', { method: 'POST' }); if (r.creados) toast(`${r.creados} ${r.creados === 1 ? 'persona pasó' : 'personas pasaron'} a Nómina: confirma su contrato y valor allá`); } catch { /* Nómina es opcional */ }
  }

  function invitar(pre = {}, profId = null) {
    const { el, m } = modal(`<form class="needs-validation" novalidate><div class="modal-header border-0 pb-0"><h2 class="modal-title h5">${pre.name ? `Dar acceso a ${esc(pre.name)}` : 'Invitar a alguien'}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body d-grid gap-2"><input class="form-control" type="email" name="email" placeholder="Correo" value="${esc(pre.email || '')}" required>
        <input class="form-control" name="name" placeholder="Nombre (opcional)" maxlength="100" value="${esc(pre.name || '')}">
        <select class="form-select" name="role" aria-label="Rol"><option value="staff">Personal</option><option value="admin">Administrador</option></select>
        <div data-modbox><div class="form-label small mb-1">Módulos que puede abrir</div><div class="row g-1">${modBoxes()}</div></div></div>
      <div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary">Invitar</button></div></form>`);
    const f = el.querySelector('form'), box = el.querySelector('[data-modbox]');
    f.role.onchange = () => { box.hidden = f.role.value !== 'staff'; };
    f.onsubmit = async (e) => {
      e.preventDefault(); f.classList.add('was-validated'); if (!f.checkValidity()) return;
      try { const r = await api('/api/team', { method: 'POST', body: { email: f.email.value, name: f.name.value, role: f.role.value, modulos: picked(el) } }); m.hide();
        // El correo queda también en la ficha del profesional para que sigan unidos.
        if (profId && !pre.email) await api(`/api/profesionales/profesionales/${profId}`, { method: 'PATCH', body: { email: f.email.value } }).catch(() => {});
        await load(); showLink(r.invite_url, f.email.value); }
      catch (ex) { toast(ex.message, false); }
    };
  }
  /* ---------- Editar persona: sus datos y su nómina (lo que se le paga, los ítems del mes y el pago) ---------- */
  const TIPOS_DOC = { CC: 'Cédula de ciudadanía', NIT: 'NIT', CE: 'Cédula de extranjería', PA: 'Pasaporte' };
  function editarPersona(r) {
    const k = personaKey(r), d0 = { ...(datos.get(k) || {}) };
    const nombre = r.user?.name || r.prof?.nombre || r.user?.email || '';
    const mo = document.createElement('div');
    mo.className = 'modal fade'; mo.tabIndex = -1;
    mo.innerHTML = `<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-xl"><div class="modal-content">
      <div class="modal-header"><div class="flex-grow-1"><h2 class="modal-title h5 mb-0">Info · ${esc(nombre)}</h2><div class="small text-body-secondary">${esc(d0.detalle || '')}</div></div><button type="button" class="btn-close" data-cerrar aria-label="Cerrar"></button></div>
      <div class="modal-body"><div data-panel></div></div>
      <div class="modal-footer justify-content-between" data-pie></div></div></div>`;
    document.body.appendChild(mo);
    const m_ = new bootstrap.Modal(mo, { backdrop: 'static', keyboard: false });
    mo.addEventListener('hidden.bs.modal', () => { mo.remove(); load(); });
    const panel = mo.querySelector('[data-panel]'), pie = mo.querySelector('[data-pie]');
    let sucio = false;
    const cerrar = async () => { if (sucio && !(await confirm({ title: 'Hay cambios sin guardar', text: 'Si cierras, se pierden.', ok: 'Cerrar sin guardar' }))) return; m_.hide(); };
    mo.addEventListener('click', (e) => { if (e.target.closest('[data-cerrar]')) cerrar(); });
    /* -- Info: datos y, si es profesional, sus áreas, niveles y horario (van juntos; sin marcar no lo es) -- */
    function pestanaDatos() {
      panel.innerHTML = `<form class="row g-3" data-form><div class="col-md-6"><label class="form-label small mb-1">Nombre</label><input class="form-control" name="nombre" value="${esc(nombre)}" maxlength="100" required></div>
        <div class="col-md-6"><label class="form-label small mb-1">Correo</label><input class="form-control" value="${esc(r.user?.email || r.prof?.email || '')}" disabled></div>
        <div class="col-md-4"><label class="form-label small mb-1">Tipo de documento</label><select class="form-select" name="tipo_documento">${Object.entries(TIPOS_DOC).map(([v, l]) => `<option value="${v}" ${v === (d0.tipo_documento || 'CC') ? 'selected' : ''}>${v} · ${l}</option>`).join('')}</select></div>
        <div class="col-md-4"><label class="form-label small mb-1">Número (cédula o NIT)</label><input class="form-control" name="documento" value="${esc(d0.documento || '')}" maxlength="40" placeholder="Ej.: 1020304050"></div>
        <div class="col-md-4"><label class="form-label small mb-1">Celular</label><input class="form-control" name="celular" type="tel" value="${esc(d0.celular || '')}" maxlength="30" placeholder="Ej.: 300 123 4567"></div></form>
        <div class="form-check form-switch mt-3"><input class="form-check-input" type="checkbox" id="esprof" data-esprof ${r.prof ? 'checked' : ''}><label class="form-check-label" for="esprof">Es profesional (docente)</label></div>
        <div class="mt-2" data-prof ${r.prof ? '' : 'hidden'}></div>`;
      const getC = AC.profCampos(panel.querySelector('[data-prof]'), r.prof || { areas: [], horario: [] }, areas);
      panel.querySelector('[data-esprof]').addEventListener('change', (e) => { panel.querySelector('[data-prof]').hidden = !e.target.checked; sucio = true; });
      panel.addEventListener('change', () => { sucio = true; });
      pie.innerHTML = `<span></span><span class="d-flex gap-2"><button type="button" class="btn btn-light" data-cerrar>Cerrar</button><button type="button" class="btn btn-primary" data-guardar-datos>Guardar datos</button></span>`;
      panel.querySelector('[data-form]').addEventListener('input', () => { sucio = true; });
      pie.querySelector('[data-guardar-datos]').onclick = async () => {
        const f = panel.querySelector('[data-form]'); if (!f.checkValidity()) return f.reportValidity();
        const esProf = panel.querySelector('[data-esprof]').checked;
        if (!esProf && r.prof && !(await confirm({ title: `¿Quitar a ${nombre} como profesional?`, text: 'Conserva su acceso a la app. Los cursos que dicta quedan sin profesional.', ok: 'Quitar' }))) return;
        try {
          await api(`/api/team/persona/${encodeURIComponent(k)}`, { method: 'PUT', body: { nombre: f.elements.nombre.value, tipo_documento: f.elements.tipo_documento.value, documento: f.elements.documento.value, celular: f.elements.celular.value } });
          if (esProf) {
            const body = { ...getC(), nombre: f.elements.nombre.value, email: r.user?.email || r.prof?.email || '', telefono: r.prof?.telefono || f.elements.celular.value, activo: true };
            if (r.prof) await api(`/api/profesionales/profesionales/${r.prof.id}`, { method: 'PATCH', body: { ...body, telefono: r.prof.telefono || f.elements.celular.value, activo: !!r.prof.activo } });
            else await api('/api/profesionales/profesionales', { method: 'POST', body });
          } else if (r.prof) await api(`/api/profesionales/profesionales/${r.prof.id}`, { method: 'DELETE' });
          sucio = false; toast('Guardado'); m_.hide();
        } catch (ex) { toast(ex.message, false); }
      };
    }

    m_.show();
    pestanaDatos();
  }

  inviteBtn.onclick = () => invitar();
  profBtn.onclick = () => AC.fichaProfesional({ row: null, areas, changed: load });

  list.addEventListener('change', async (e) => {
    const s = e.target.closest('[data-role]'); if (!s) return;
    try { await api(`/api/team/${s.dataset.role}`, { method: 'PATCH', body: { role: s.value } }); toast('Rol actualizado'); load(); } catch (ex) { toast(ex.message, false); load(); }
  });
  list.addEventListener('click', async (e) => {
    const l = e.target.closest('[data-link]'), d = e.target.closest('[data-del]'), mo = e.target.closest('[data-mods]'), fi = e.target.closest('[data-ficha]'), da = e.target.closest('[data-dar]');
    const ed = e.target.closest('[data-editar]');
    if (ed) { const r_ = rows().find((x) => personaKey(x) === ed.dataset.editar); if (r_) editarPersona(r_); return; }
    try {
      if (fi) AC.fichaProfesional({ row: profs.find((p) => p.id === +fi.dataset.ficha), areas, changed: load });
      if (da) { const p = profs.find((x) => x.id === +da.dataset.dar); invitar({ email: p.email, name: p.nombre }, p.id); }
      if (mo) {
        const u = users.find((x) => x.id === mo.dataset.mods);
        const { el, m } = modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Módulos de ${esc(u.name || u.email)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
          <div class="modal-body"><p class="small text-body-secondary">Marca lo que esta persona puede abrir.</p><div class="row g-1">${modBoxes(u.modulos)}</div></div>
          <div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary" data-ok>Guardar</button></div>`);
        el.querySelector('[data-ok]').onclick = async () => { try { await api(`/api/team/${u.id}`, { method: 'PATCH', body: { modulos: picked(el) } }); m.hide(); toast('Módulos guardados'); load(); } catch (ex) { toast(ex.message, false); } };
      }
      if (l) { const r = await api(`/api/team/${l.dataset.link}/invite`, { method: 'POST' }); showLink(r.invite_url, l.dataset.email); }
      if (d && await confirm({ title: `¿Quitar a ${d.dataset.email} del equipo?`, text: 'Ya no podrá entrar a este negocio.', ok: 'Quitar' })) {
        await api(`/api/team/${d.dataset.del}`, { method: 'DELETE' }); toast('Quitado del equipo'); load();
      }
    } catch (ex) { toast(ex.message, false); }
  });
  load().then(() => pasarANomina());
});
