// Equipo: todas las personas de la academia en un solo lugar — personal con acceso a la app (propietario, administradores,
// personal) y profesionales (docentes). El propietario y los administradores invitan, cambian el rol, eligen los módulos
// que ve cada persona del personal y quitan gente. El propietario solo lo cambia Diwilo.
DW.ready.then(async (me) => {
  const { api, esc, toast, confirm, modal, empty, table } = window.App;
  const ROLE = { owner: 'Propietario', admin: 'Administrador', staff: 'Personal' };
  const list = document.querySelector('[data-list]');
  const canManage = me.canManage && !me.business.readOnly;
  const inviteBtn = document.querySelector('[data-invite]'), profBtn = document.querySelector('[data-nuevo-prof]');
  const nomBtn = document.querySelector('[data-nomina]');
  inviteBtn.hidden = !me.canManage;
  nomBtn.hidden = !me.canManage;
  profBtn.hidden = !canManage;
  let users = [], profs = [], catalogo = [], areas = [];
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
    const [t, p] = await Promise.all([api('/api/team'), api('/api/profesionales/profesionales?limit=500').catch(() => ({ rows: [] }))]);
    users = t.users; catalogo = t.catalogo; profs = p.rows || [];
    areas = await AC.listas.areas().catch(() => []);
    const nombreArea = (id) => areas.find((a) => a.id === id)?.nombre || '—';
    const all = rows();
    list.innerHTML = all.length ? table([
      { label: 'Persona', main: true, html: (r) => { const n = r.user?.name || r.prof?.nombre || r.user?.email; const e = r.user?.email || r.prof?.email || r.prof?.telefono || '';
        return `<div>${esc(n)}</div><div class="small text-body-secondary fw-normal">${esc(e)}</div>`; } },
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
          me.canManage ? `<button class="btn btn-sm btn-outline-success" data-pago="${esc(personaKey(r))}" title="Cuánto se le paga"><i class="bi bi-cash-stack me-1"></i>Pago</button>` : '',
          u && !r.prof && canManage ? `<button class="btn btn-sm btn-outline-info" data-hacerprof="${id}" title="Convertir en profesional (docente)"><i class="bi bi-mortarboard me-1"></i>Hacer profesional</button>` : '',
          u && r.prof && canManage ? `<button class="btn btn-sm btn-outline-warning" data-quitarprof="${r.prof.id}" title="Dejar de ser profesional (conserva su acceso a la app)"><i class="bi bi-person-dash"></i></button>` : '',
          r.prof && canManage ? `<button class="btn btn-sm btn-outline-secondary" data-ficha="${r.prof.id}" title="Ficha del profesional"><i class="bi bi-person-badge"></i></button>` : '',
          u && u.role === 'staff' && canManage ? `<button class="btn btn-sm btn-outline-secondary" data-mods="${id}" title="Módulos que puede abrir"><i class="bi bi-grid"></i></button>` : '',
          !u && r.prof && me.canManage ? `<button class="btn btn-sm btn-primary" data-dar="${r.prof.id}" title="Invitarlo a la app con su correo"><i class="bi bi-person-plus me-1"></i>Dar acceso</button>` : '',
          u && u.role !== 'owner' && canManage ? `<button class="btn btn-sm btn-outline-secondary" data-link="${id}" data-email="${esc(u.email)}" title="Link para crear o restablecer su contraseña"><i class="bi bi-key"></i></button>
            <button class="btn btn-sm btn-outline-danger" data-del="${id}" data-email="${esc(u.email)}" title="Quitar del equipo"><i class="bi bi-trash"></i></button>` : '',
        ].join(' '); } },
    ], all) : empty('bi-people', 'Aún no hay nadie en el equipo.');
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
  /* ---------- Nómina: cuánto se le paga a cada persona ---------- */
  const PER = { mensual: 'Mensual', quincenal: 'Quincenal', semanal: 'Semanal', clase: 'Por clase', hora: 'Por hora' };
  const aMes = { mensual: 1, quincenal: 2, semanal: 4.33 };   // por clase y por hora son variables: no suman al total mensual
  const pesos = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO');
  async function nomina(foco) {
    let guardada, centros = [];
    try { [guardada, centros] = await Promise.all([api('/api/team/nomina'), api('/api/finanzas/cost_centers?limit=200').then((r) => r.rows.map((x) => x.name)).catch(() => [])]); } catch (ex) { return toast(ex.message, false); }
    const personas = rows().map((r) => {
      const k = personaKey(r), g = guardada.rows.find((x) => x.persona === k) || (r.prof && guardada.rows.find((x) => x.persona === `p:${r.prof.id}`)) || {};
      return { k, nombre: r.user?.name || r.prof?.nombre || r.user?.email, detalle: r.user ? ROLE[r.user.role] || r.user.role : 'Profesional sin acceso', prof: !!r.prof,
        valor: g.valor || 0, periodicidad: g.periodicidad || 'mensual', centro: g.centro_costo || '', notas: g.notas || '', orig: JSON.stringify([g.valor || 0, g.periodicidad || 'mensual', g.centro_costo || '', g.notas || '']), existe: !!g.persona };
    });
    const mo = document.createElement('div');
    mo.className = 'modal fade'; mo.tabIndex = -1;
    mo.innerHTML = `<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-xl"><div class="modal-content">
      <div class="modal-header"><div><h2 class="modal-title h5 mb-0">Nómina del equipo</h2><div class="small text-body-secondary">Cuánto se le paga a cada persona. Solo lo ven el propietario y los administradores.</div></div><button type="button" class="btn-close" data-cerrar aria-label="Cerrar"></button></div>
      <div class="modal-body"><div class="row g-2 mb-3" data-resumen></div><datalist id="nomCentros">${centros.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        <div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>Persona</th><th style="min-width:150px">Se le paga</th><th style="min-width:140px">Cada</th><th class="text-end">Al mes (aprox.)</th><th style="min-width:160px">Centro de costo</th><th style="min-width:160px">Notas</th></tr></thead><tbody data-filas></tbody></table></div></div>
      <div class="modal-footer justify-content-between"><span class="small text-body-secondary" data-estado></span><span class="d-flex gap-2"><button type="button" class="btn btn-light" data-cerrar>Cerrar</button>${canManage ? '<button type="button" class="btn btn-primary" data-guardar disabled><i class="bi bi-check2-square me-1"></i>Guardar nómina</button>' : ''}</span></div></div></div>`;
    document.body.appendChild(mo);
    const modal_ = new bootstrap.Modal(mo, { backdrop: 'static', keyboard: false });
    mo.addEventListener('hidden.bs.modal', () => mo.remove());
    const sig = (p) => JSON.stringify([p.valor, p.periodicidad, p.centro, p.notas]), cambios = () => personas.filter((p) => sig(p) !== p.orig);
    const mensual = (p) => Math.round(p.valor * (aMes[p.periodicidad] || 0));
    const resumen = () => {
      const total = personas.reduce((a, p) => a + mensual(p), 0), variables = personas.filter((p) => p.valor > 0 && !aMes[p.periodicidad]).length, sin = personas.filter((p) => !p.valor).length, n = cambios().length;
      mo.querySelector('[data-resumen]').innerHTML = `<div class="col-6 col-md-4"><div class="dw-card py-2"><div class="small text-body-secondary">Total al mes (fijo)</div><b class="fs-5">${pesos(total)}</b></div></div>
        <div class="col-6 col-md-4"><div class="dw-card py-2"><div class="small text-body-secondary">Pago variable</div><b class="fs-5">${variables}</b> <span class="small text-body-secondary">por clase u hora</span></div></div>
        <div class="col-12 col-md-4"><div class="dw-card py-2"><div class="small text-body-secondary">Sin valor definido</div><b class="fs-5 ${sin ? 'text-warning-emphasis' : ''}">${sin}</b></div></div>`;
      mo.querySelector('[data-estado]').textContent = n ? `${n} cambio${n === 1 ? '' : 's'} sin guardar` : '';
      const g = mo.querySelector('[data-guardar]'); if (g) g.disabled = !n;
    };
    mo.querySelector('[data-filas]').innerHTML = personas.map((p, i) => `<tr data-i="${i}" class="${p.k === foco ? 'table-warning' : ''}"><td><b>${esc(p.nombre)}</b><div class="small text-body-secondary">${esc(p.detalle)}${p.prof ? ' · Profesional' : ''}</div></td>
      <td><div class="input-group input-group-sm"><span class="input-group-text">$</span><input class="form-control" type="number" min="0" step="1000" value="${p.valor || ''}" data-f="valor" aria-label="Valor" ${canManage ? '' : 'disabled'}></div></td>
      <td><select class="form-select form-select-sm" data-f="periodicidad" aria-label="Cada" ${canManage ? '' : 'disabled'}>${Object.entries(PER).map(([k, l]) => `<option value="${k}" ${k === p.periodicidad ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
      <td class="text-end fw-semibold" data-mes>${aMes[p.periodicidad] ? pesos(mensual(p)) : '<span class="text-body-secondary fw-normal small">variable</span>'}</td>
      <td><input class="form-control form-control-sm" list="nomCentros" maxlength="120" value="${esc(p.centro)}" data-f="centro" placeholder="Ej.: Maquillaje" aria-label="Centro de costo" ${canManage ? '' : 'disabled'}></td>
      <td><input class="form-control form-control-sm" maxlength="300" value="${esc(p.notas)}" data-f="notas" aria-label="Notas" ${canManage ? '' : 'disabled'}></td></tr>`).join('') || '<tr><td colspan="6" class="text-body-secondary">Aún no hay nadie en el equipo.</td></tr>';
    mo.addEventListener('input', (e) => {
      const tr = e.target.closest('[data-i]'), f = e.target.dataset?.f; if (!tr || !f) return;
      const p = personas[+tr.dataset.i]; p[f] = f === 'valor' ? Math.max(0, Math.round(Number(e.target.value) || 0)) : e.target.value;
      tr.querySelector('[data-mes]').innerHTML = aMes[p.periodicidad] ? pesos(mensual(p)) : '<span class="text-body-secondary fw-normal small">variable</span>';
      tr.classList.toggle('table-warning', sig(p) !== p.orig); resumen();
    });
    const cerrar = async () => { if (cambios().length && !(await confirm({ title: 'Hay cambios sin guardar', text: 'Si cierras, se pierden los valores que no guardaste.', ok: 'Cerrar sin guardar' }))) return; modal_.hide(); };
    mo.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', cerrar));
    mo.querySelector('[data-guardar]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget, lote = cambios(); btn.disabled = true; let mal = 0;
      for (const p of lote) {
        try {
          if (!p.valor && !p.centro && !p.notas) { if (p.existe) await api(`/api/team/nomina/${encodeURIComponent(p.k)}`, { method: 'DELETE' }); p.existe = false; }
          else { await api(`/api/team/nomina/${encodeURIComponent(p.k)}`, { method: 'PUT', body: { valor: p.valor, periodicidad: p.periodicidad, centro_costo: p.centro, notas: p.notas } }); p.existe = true; }
          p.orig = sig(p); mo.querySelector(`[data-i="${personas.indexOf(p)}"]`)?.classList.remove('table-warning');
        } catch (ex) { mal++; toast(`${p.nombre}: ${ex.message}`, false); }
      }
      resumen(); if (!mal) toast('Nómina guardada');
    });
    resumen(); modal_.show();
    if (foco) setTimeout(() => mo.querySelector('tr.table-warning input')?.focus(), 400);
  }
  nomBtn.onclick = () => nomina();
  inviteBtn.onclick = () => invitar();
  profBtn.onclick = () => AC.fichaProfesional({ row: null, areas, changed: load });

  list.addEventListener('change', async (e) => {
    const s = e.target.closest('[data-role]'); if (!s) return;
    try { await api(`/api/team/${s.dataset.role}`, { method: 'PATCH', body: { role: s.value } }); toast('Rol actualizado'); load(); } catch (ex) { toast(ex.message, false); load(); }
  });
  list.addEventListener('click', async (e) => {
    const l = e.target.closest('[data-link]'), d = e.target.closest('[data-del]'), mo = e.target.closest('[data-mods]'), fi = e.target.closest('[data-ficha]'), hp = e.target.closest('[data-hacerprof]'), qp = e.target.closest('[data-quitarprof]'), da = e.target.closest('[data-dar]');
    const pg = e.target.closest('[data-pago]');
    if (pg) return nomina(pg.dataset.pago);
    try {
      if (fi) AC.fichaProfesional({ row: profs.find((p) => p.id === +fi.dataset.ficha), areas, changed: load });
      if (hp) {
        const u = users.find((x) => x.id === hp.dataset.hacerprof);
        const r = await api('/api/profesionales/profesionales', { method: 'POST', body: { nombre: u.name || u.email, email: u.email, activo: true } });
        toast('Ahora también es profesional'); await load();
        const row = profs.find((p) => p.id === (r.id ?? r.row?.id)) || profs.find((p) => key(p.email) === key(u.email));
        if (row) AC.fichaProfesional({ row, areas, changed: load });   // para ponerle áreas y horario
      }
      if (qp) {
        const p = profs.find((x) => x.id === +qp.dataset.quitarprof);
        if (await confirm({ title: `¿Quitar a ${p.nombre} como profesional?`, text: 'Conserva su acceso a la app. Los cursos que dicta quedan sin profesional.', ok: 'Quitar' })) {
          await api(`/api/profesionales/profesionales/${p.id}`, { method: 'DELETE' }); toast('Ya no es profesional'); load();
        }
      }
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
  load();
});
