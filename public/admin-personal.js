// Acceso al panel de un profesional. El personal solo se crea desde Profesionales; vive en la tabla `users`
// (la misma que ve Diwilo) y se enlaza con el profesional por el correo. Solo dueño/administrador.
const ACC_ESTADO = { active: ['Con contraseña', 'success'], invited: ['Link enviado', 'warning'], inactive: ['Desactivado', 'secondary'], none: ['Sin acceso', 'light text-muted border'], owner: ['Dueño (se gestiona en Diwilo)', 'info'] };
let accUsuarios = [], accYo = '';
const puedeGestionar = () => ['owner', 'admin'].includes(window.__BOOT__?.rol);
async function personalApi(met, url, body) {
  const r = await fetch(url, { method: met, headers: { 'content-type': 'application/json', 'x-requested-with': 'cda' }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se pudo completar');
  return d;
}
const usuarioDe = (mail) => accUsuarios.find((u) => u.email === String(mail || '').trim().toLowerCase());
function pintarAcceso() {
  const u = usuarioDe($('#profEmail').value), est = !u ? 'none' : u.role === 'owner' ? 'owner' : u.status;
  const [t, c] = ACC_ESTADO[est];
  $('#profAccEstado').className = 'badge text-bg-' + c; $('#profAccEstado').textContent = t;
  const fijo = u && (u.role === 'owner' || u.id === accYo);
  $('#profRol').disabled = fijo; $('#profLink').disabled = fijo;
  if (u && !fijo) $('#profRol').value = u.status === 'inactive' ? '' : u.role;
  $('#profLinkTxt').textContent = u?.status === 'active' ? 'Restablecer contraseña' : 'Link de registro';
}
async function cargarAcceso(p) {
  const box = $('#profAcceso'); if (!box) return;
  box.hidden = !puedeGestionar(); if (box.hidden) return;
  $('#profEmail').value = p?.email || ''; $('#profRol').value = ''; $('#profLinkBox').hidden = true; $('#profAccMsg').textContent = '';
  accUsuarios = []; pintarAcceso();
  try { const d = await personalApi('GET', '/staff/team'); accUsuarios = d.users; accYo = d.yo; pintarAcceso(); }
  catch (e) { $('#profAccMsg').textContent = e.message; }
}
async function generarLink(datos) {
  const email = ($('#profEmail').value || '').trim().toLowerCase();
  if (!email) throw new Error('Escribe el correo del profesional.');
  const rol = $('#profRol').value || 'staff';
  const d = await personalApi('POST', '/staff/team', { email, name: datos?.nombre || $('#profNombre').value.trim(), role: rol });
  const link = location.origin + d.invite_path;
  $('#profLinkVal').value = link; $('#profLinkBox').hidden = false; $('#profRol').value = rol;
  try { await navigator.clipboard.writeText(link); } catch { $('#profLinkVal').select?.(); }
  const l = await personalApi('GET', '/staff/team'); accUsuarios = l.users; pintarAcceso();
  return link;
}
$('#profEmail')?.addEventListener('input', pintarAcceso);
$('#profLink')?.addEventListener('click', async (e) => {
  const b = e.currentTarget; b.disabled = true; $('#profAccMsg').textContent = '';
  try { await generarLink(); $('#profAccMsg').textContent = 'Link generado y copiado.'; }
  catch (x) { $('#profAccMsg').textContent = x.message; }
  finally { b.disabled = false; }
});
// Al guardar: aplica la condición (rol / desactivar) al usuario enlazado por correo.
async function sincronizarAcceso(p) {
  if (!puedeGestionar() || !p.email) return;
  const u = usuarioDe(p.email); if (!u || u.role === 'owner' || u.id === accYo) return;
  const rol = $('#profRol').value, quiere = rol && p.activo !== false;
  try {
    if (!rol && u.status !== 'inactive') await personalApi('PATCH', '/staff/team/' + u.id, { active: false });
    else if (rol) await personalApi('PATCH', '/staff/team/' + u.id, { role: rol, active: !!quiere });
  } catch (x) { toast(x.message); }
}
