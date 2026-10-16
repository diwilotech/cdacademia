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
  inviteBtn.onclick = () => invitar();
  profBtn.onclick = () => AC.fichaProfesional({ row: null, areas, changed: load });

  list.addEventListener('change', async (e) => {
    const s = e.target.closest('[data-role]'); if (!s) return;
    try { await api(`/api/team/${s.dataset.role}`, { method: 'PATCH', body: { role: s.value } }); toast('Rol actualizado'); load(); } catch (ex) { toast(ex.message, false); load(); }
  });
  list.addEventListener('click', async (e) => {
    const l = e.target.closest('[data-link]'), d = e.target.closest('[data-del]'), mo = e.target.closest('[data-mods]'), fi = e.target.closest('[data-ficha]'), da = e.target.closest('[data-dar]');
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
  load();
});
