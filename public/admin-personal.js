// Personal con acceso: usuarios del negocio (tabla users, la misma que ve Diwilo). Solo dueño/administrador.
const ROL_TXT = { owner: 'Dueño', admin: 'Administrador', staff: 'Personal' };
const ESTADO_TXT = { active: ['Activo', 'success'], invited: ['Invitado', 'warning'], inactive: ['Inactivo', 'secondary'] };
async function personalApi(met, url, body) {
  const r = await fetch(url, { method: met, headers: { 'content-type': 'application/json', 'x-requested-with': 'cda' }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se pudo completar');
  return d;
}
async function cargarPersonal() {
  const card = document.getElementById('cardPersonal'); if (!card) return;
  if (!['owner', 'admin'].includes(window.__BOOT__?.rol)) return;
  card.hidden = false;
  const box = document.getElementById('listaPersonal');
  try {
    const { users, yo } = await personalApi('GET', '/staff/team');
    box.innerHTML = users.map((u) => {
      const [t, c] = ESTADO_TXT[u.status] || ESTADO_TXT.inactive, fijo = u.role === 'owner' || u.id === yo;
      return `<div class="d-flex align-items-center gap-2 py-1 border-bottom small">
        <div class="flex-grow-1 text-truncate"><strong>${esc(u.name)}</strong><br><span class="text-muted">${esc(u.email)}</span></div>
        <span class="badge text-bg-${c}">${t}</span>
        ${fijo ? `<span class="text-muted">${ROL_TXT[u.role] || u.role}</span>` : `
        <select class="form-select form-select-sm w-auto" onchange="cambiarPersonal('${u.id}',{role:this.value})" aria-label="Rol"><option value="staff"${u.role === 'staff' ? ' selected' : ''}>Personal</option><option value="admin"${u.role === 'admin' ? ' selected' : ''}>Administrador</option></select>
        <button class="btn btn-sm btn-outline-secondary" title="${u.status === 'inactive' ? 'Activar' : 'Desactivar'}" onclick="cambiarPersonal('${u.id}',{active:${u.status === 'inactive'}})"><i class="bi bi-${u.status === 'inactive' ? 'toggle-off' : 'toggle-on'}"></i></button>
        <button class="btn btn-sm btn-outline-danger" title="Quitar" onclick="quitarPersonal('${u.id}')"><i class="bi bi-trash"></i></button>`}
      </div>`;
    }).join('');
  } catch (e) { box.textContent = e.message; }
}
async function cambiarPersonal(id, cambio) {
  try { await personalApi('PATCH', '/staff/team/' + id, cambio); } catch (e) { alert(e.message); }
  cargarPersonal();
}
async function quitarPersonal(id) {
  if (!confirm('¿Quitar el acceso de esta persona?')) return;
  try { await personalApi('DELETE', '/staff/team/' + id); } catch (e) { alert(e.message); }
  cargarPersonal();
}
document.getElementById('formPersonal')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('perMsg'); msg.textContent = '';
  try {
    const d = await personalApi('POST', '/staff/team', { email: perMail.value, name: perNombre.value, role: perRol.value });
    const link = location.origin + d.invite_path;
    try { await navigator.clipboard.writeText(link); msg.textContent = 'Link copiado: envíaselo para que cree su contraseña.'; }
    catch { prompt('Envía este link para que cree su contraseña:', link); }
    perMail.value = ''; perNombre.value = '';
    cargarPersonal();
  } catch (x) { msg.textContent = x.message; }
});
