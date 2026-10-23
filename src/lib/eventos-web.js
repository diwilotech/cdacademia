// Página pública de eventos (sin sesión): `/<negocio>/eventos` muestra los próximos eventos públicos y recoge la inscripción.
// Quien se inscribe queda como asistente (lista de espera si el cupo está lleno) y como lead en Marketing. Solo si el módulo Eventos está activo.
import { all, one, today, now } from './crud.js';
import { leadMatricula } from './central.js';
import { activeModuleIds } from './modules.js';
import { estadoNuevo } from '../api/eventos.js';
import { json, HttpError } from './http.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => (n > 0 ? `$${Number(n).toLocaleString('es-CO')}` : 'Gratis');
const dia = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

const proximos = (env, businessId) => all(env, "SELECT id, titulo, tipo, fecha, hora_ini, hora_fin, lugar, descripcion, cupo, precio FROM ac_eventos WHERE business_id = ? AND publico = 1 AND estado = 'abierto' AND fecha >= ? ORDER BY fecha, hora_ini LIMIT 60", businessId, today());

export async function eventosWeb(req, env, url, slug) {
  const notFound = () => new Response('Esta página no existe.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const b = await env.DB.prepare("SELECT id, name FROM businesses WHERE slug = ? AND status = 'active' AND archived_at IS NULL").bind(slug).first();
  if (!b || !(await activeModuleIds(env, b.id)).includes('eventos')) return notFound();
  if (req.method === 'POST') {
    const d = await req.json().catch(() => ({}));
    try {
      if (d.website) return json({ ok: true });   // trampa para robots
      const name = String(d.name || '').trim().slice(0, 120), phone = String(d.phone || '').trim().slice(0, 40), email = String(d.email || '').trim().toLowerCase().slice(0, 254);
      if (!name || (!phone && !email)) throw new HttpError(400, 'Escribe tu nombre y un celular o correo');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Correo no válido');
      const ev = (await proximos(env, b.id)).find((x) => x.id === Number(d.evento_id));
      if (!ev) throw new HttpError(404, 'Ese evento ya no está disponible');
      if (await one(env, 'SELECT 1 FROM ac_evento_asistentes WHERE business_id = ? AND evento_id = ? AND ((? <> \'\' AND email = ?) OR (? <> \'\' AND telefono = ?))', b.id, ev.id, email, email, phone, phone)) throw new HttpError(409, 'Ya estás inscrito en este evento');
      const estado = await estadoNuevo(env, b.id, ev), t = now();
      await env.DB.prepare('INSERT INTO ac_evento_asistentes (business_id, evento_id, nombre, telefono, email, estado, origen, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(b.id, ev.id, name, phone || null, email || null, estado, 'web', t, t).run();
      await leadMatricula(env, b.id, { name, email, phone, ref: d.ref, note: `Se inscribió al evento: ${ev.titulo}` }).catch(() => {});
      return json({ ok: true, espera: estado === 'espera', precio: ev.precio });
    } catch (e) { return json({ error: e.message || 'No se pudo enviar' }, e.status || 500); }
  }
  const ref = url.searchParams.get('ref') || '', evs = await proximos(env, b.id);
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Eventos · ${esc(b.name)}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;background:#f5f5f7;color:#1d1d1f}main{max-width:880px;margin:0 auto;padding:24px 16px}h1{font-size:1.6rem;margin:0 0 4px}p.sub{color:#666;margin:0 0 20px}
.g{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}.c{background:#fff;border-radius:14px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.08);display:flex;flex-direction:column;gap:6px}.c h2{font-size:1.05rem;margin:0}.m{font-size:.88rem;color:#555}.t{font-size:.75rem;font-weight:600;color:#6d3fd6;text-transform:uppercase}
.p{font-weight:700}button,input,select{font:inherit;padding:10px 12px;border-radius:10px;border:1px solid #ccc;width:100%;box-sizing:border-box}button{background:#6d3fd6;color:#fff;border:0;cursor:pointer;font-weight:600}
form{background:#fff;border-radius:14px;padding:16px;margin-top:22px;display:grid;gap:10px;box-shadow:0 1px 3px rgba(0,0,0,.08)}.h{position:absolute;left:-9999px}#ok{color:#0a7d4f;font-weight:600}#er{color:#c0392b}</style></head><body><main>
<h1>${esc(b.name)}</h1><p class="sub">Próximos eventos</p>
${evs.length ? `<div class="g">${evs.map((e) => `<div class="c"><span class="t">${esc(e.tipo)}</span><h2>${esc(e.titulo)}</h2><div class="m">${esc(dia(e.fecha))}${e.hora_ini ? ` · ${esc(e.hora_ini)}${e.hora_fin ? `–${esc(e.hora_fin)}` : ''}` : ''}${e.lugar ? `<br>${esc(e.lugar)}` : ''}</div>
 ${e.descripcion ? `<div class="m">${esc(e.descripcion)}</div>` : ''}<div class="p">${money(e.precio)}</div><button type="button" data-q="${e.id}">Quiero ir</button></div>`).join('')}</div>` : '<p>Por ahora no hay eventos programados. Vuelve pronto.</p>'}
${evs.length ? `<form id="f"><b>Inscríbete</b><input name="name" placeholder="Tu nombre" required maxlength="120"><input name="phone" placeholder="Celular / WhatsApp" maxlength="40"><input name="email" type="email" placeholder="Correo (opcional si dejas celular)" maxlength="254">
<select name="evento_id">${evs.map((e) => `<option value="${e.id}">${esc(e.titulo)} · ${esc(e.fecha)}</option>`).join('')}</select><input class="h" name="website" tabindex="-1" autocomplete="off"><button>Inscribirme</button><div id="ok"></div><div id="er"></div></form>
<script>const f=document.getElementById('f');if(f){document.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{f.evento_id.value=b.dataset.q;f.scrollIntoView({behavior:'smooth'});f.name.focus()});
f.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f));if(!d.phone&&!d.email){er.textContent='Escribe un celular o un correo';return}d.ref=${JSON.stringify(ref).replace(/</g, '\\u003c')};er.textContent='';ok.textContent='';
const r=await fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});const j=await r.json().catch(()=>({}));if(r.ok){f.reset();ok.textContent=j.espera?'Quedaste en lista de espera: te avisamos si se libera un cupo.':(j.precio>0?'¡Listo! Te contactamos para el pago.':'¡Listo! Quedaste inscrito.')}else er.textContent=j.error||'No se pudo enviar'}}</script>` : ''}
</main></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'" } });
}
