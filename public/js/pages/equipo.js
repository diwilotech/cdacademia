// Equipo: el propietario y los administradores invitan, cambian de rol y quitan a administradores y personal.
// El propietario solo lo cambia Diwilo.
DW.ready.then((me) => {
  const { api, esc, toast, confirm, modal, empty, table } = window.App;
  const ROLE = { owner: 'Propietario', admin: 'Administrador', staff: 'Personal' };
  const list = document.querySelector('[data-list]');
  const canManage = me.canManage && !me.business.readOnly;
  const inviteBtn = document.querySelector('[data-invite]');
  inviteBtn.hidden = !me.canManage;

  function showLink(url, who) {
    const { el } = modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Link para ${esc(who)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><p class="small text-body-secondary">Envíaselo por WhatsApp o correo. Sirve una sola vez para crear o restablecer su contraseña.</p>
      <div class="input-group"><input class="form-control" readonly value="${esc(url)}"><button class="btn btn-primary" data-copy><i class="bi bi-clipboard"></i></button></div></div>`);
    el.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Link copiado'); } catch { el.querySelector('input').select(); } };
  }

  async function load() {
    const { users } = await api('/api/team');
    list.innerHTML = users.length ? table([
      { label: 'Persona', main: true, html: (u) => `<div>${esc(u.name || u.email)}</div><div class="small text-body-secondary fw-normal">${esc(u.email)}</div>` },
      { label: 'Estado', html: (u) => (u.status === 'invited' ? '<span class="badge text-bg-warning">Invitación pendiente</span>' : '<span class="badge text-bg-success">Activo</span>') },
      { label: 'Rol', html: (u) => (u.role === 'owner' || !canManage ? `<span class="badge text-bg-light">${ROLE[u.role] || esc(u.role)}</span>`
        : `<select class="form-select form-select-sm w-auto d-inline-block" data-role="${esc(u.id)}" aria-label="Rol"><option value="staff" ${u.role === 'staff' ? 'selected' : ''}>Personal</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrador</option></select>`) },
      { label: '', cls: 'text-end text-nowrap', html: (u) => (u.role !== 'owner' && canManage ? `<button class="btn btn-sm btn-outline-secondary" data-link="${esc(u.id)}" data-email="${esc(u.email)}" title="Link para crear o restablecer su contraseña"><i class="bi bi-key"></i></button>
        <button class="btn btn-sm btn-outline-danger" data-del="${esc(u.id)}" data-email="${esc(u.email)}" title="Quitar del equipo"><i class="bi bi-trash"></i></button>` : '') },
    ], users) : empty('bi-people', 'Aún no hay nadie en el equipo.');
  }

  inviteBtn.onclick = () => {
    const { el, m } = modal(`<form class="needs-validation" novalidate><div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Invitar a alguien</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body d-grid gap-2"><input class="form-control" type="email" name="email" placeholder="Correo" required>
        <input class="form-control" name="name" placeholder="Nombre (opcional)" maxlength="100">
        <select class="form-select" name="role" aria-label="Rol"><option value="staff">Personal</option><option value="admin">Administrador</option></select></div>
      <div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary">Invitar</button></div></form>`);
    const f = el.querySelector('form');
    f.onsubmit = async (e) => {
      e.preventDefault(); f.classList.add('was-validated'); if (!f.checkValidity()) return;
      try { const r = await api('/api/team', { method: 'POST', body: { email: f.email.value, name: f.name.value, role: f.role.value } }); m.hide(); load(); showLink(r.invite_url, f.email.value); }
      catch (ex) { toast(ex.message, false); }
    };
  };

  list.addEventListener('change', async (e) => {
    const s = e.target.closest('[data-role]'); if (!s) return;
    try { await api(`/api/team/${s.dataset.role}`, { method: 'PATCH', body: { role: s.value } }); toast('Rol actualizado'); } catch (ex) { toast(ex.message, false); load(); }
  });
  list.addEventListener('click', async (e) => {
    const l = e.target.closest('[data-link]'), d = e.target.closest('[data-del]');
    try {
      if (l) { const r = await api(`/api/team/${l.dataset.link}/invite`, { method: 'POST' }); showLink(r.invite_url, l.dataset.email); }
      if (d && await confirm({ title: `¿Quitar a ${d.dataset.email} del equipo?`, text: 'Ya no podrá entrar a este negocio.', ok: 'Quitar' })) {
        await api(`/api/team/${d.dataset.del}`, { method: 'DELETE' }); toast('Quitado del equipo'); load();
      }
    } catch (ex) { toast(ex.message, false); }
  });
  load();
});
