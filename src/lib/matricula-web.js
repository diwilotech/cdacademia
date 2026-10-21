// Página pública de matrícula (sin sesión): `/<negocio>/matricula` muestra los cursos abiertos y recoge el interés de quien llega.
// El interesado queda como lead del link de rastreo (`?ref=`) en Marketing; al matricularlo pasa a cliente (embudo). Simple a propósito.
import { all, today } from './crud.js';
import { leadMatricula } from './central.js';
import { json, HttpError } from './http.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `$${Number(n || 0).toLocaleString('es-CO')}`;
const dia = (f) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

const cursosAbiertos = (env, businessId) => all(env, `SELECT k.id, k.nombre, k.descripcion, k.nivel, k.jornada, k.precio, k.inicio, k.num_clases, p.nombre AS profesional, a.nombre AS area, (SELECT MAX(fecha) FROM ac_clases WHERE curso_id = k.id AND business_id = k.business_id) AS fin
  FROM ac_cursos k LEFT JOIN ac_profesionales p ON p.id = k.profesional_id AND p.business_id = k.business_id LEFT JOIN ac_areas a ON a.id = k.area_id AND a.business_id = k.business_id
  WHERE k.business_id = ? AND k.activo = 1 ORDER BY COALESCE(k.inicio, '9999'), k.nombre`, businessId).then((rows) => rows.filter((k) => !k.fin || k.fin >= today()));

export async function matriculaWeb(req, env, url, slug) {
  const b = await env.DB.prepare("SELECT id, name FROM businesses WHERE slug = ? AND status = 'active' AND archived_at IS NULL").bind(slug).first();
  if (!b) return new Response('Esta página no existe.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  if (req.method === 'POST') {
    const d = await req.json().catch(() => ({}));
    try {
      if (d.website) return json({ ok: true });   // trampa para robots
      const k = (await cursosAbiertos(env, b.id)).find((x) => x.id === Number(d.curso_id));
      const r = await leadMatricula(env, b.id, { name: d.name, email: d.email, phone: d.phone, ref: d.ref, note: k ? `Interesado en: ${k.nombre}` : 'Interesado desde la página de matrícula' });
      if (!r) throw new HttpError(503, 'La matrícula en línea no está disponible ahora');
      return json({ ok: true });
    } catch (e) { return json({ error: e.message || 'No se pudo enviar' }, e.status || 500); }
  }
  const ref = url.searchParams.get('ref') || '', cursos = await cursosAbiertos(env, b.id);
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Matrículas · ${esc(b.name)}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;background:#f5f5f7;color:#1d1d1f}main{max-width:880px;margin:0 auto;padding:24px 16px}h1{font-size:1.6rem;margin:0 0 4px}p.sub{color:#666;margin:0 0 20px}
.g{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}.c{background:#fff;border-radius:14px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.08);display:flex;flex-direction:column;gap:6px}.c h2{font-size:1.05rem;margin:0}.m{font-size:.85rem;color:#666}
.p{font-weight:700;font-size:1.1rem}button,input,select{font:inherit;padding:10px 12px;border-radius:10px;border:1px solid #ccc;width:100%;box-sizing:border-box}button{background:#6d3fd6;color:#fff;border:0;cursor:pointer;font-weight:600}
form{background:#fff;border-radius:14px;padding:16px;margin-top:22px;display:grid;gap:10px;box-shadow:0 1px 3px rgba(0,0,0,.08)}.h{position:absolute;left:-9999px}#ok{color:#0a7d4f;font-weight:600}#er{color:#c0392b}</style></head><body><main>
<h1>${esc(b.name)}</h1><p class="sub">Cursos con matrícula abierta</p>
${cursos.length ? `<div class="g">${cursos.map((k) => `<div class="c"><h2>${esc(k.nombre)}</h2><div class="m">${[k.area, k.nivel, k.jornada, k.profesional && `Profesional: ${k.profesional}`].filter(Boolean).map(esc).join(' · ')}</div>
 ${k.descripcion ? `<div class="m">${esc(k.descripcion)}</div>` : ''}<div class="m">${k.inicio ? `Inicia el ${esc(dia(k.inicio))}` : 'Fecha por confirmar'} · ${k.num_clases} clases</div><div class="p">${money(k.precio)}</div>
 <button type="button" data-q="${k.id}">Quiero este curso</button></div>`).join('')}</div>` : '<p>Por ahora no hay cursos con matrícula abierta. Vuelve pronto.</p>'}
${cursos.length ? `<form id="f"><b>Déjanos tus datos y te contactamos</b><input name="name" placeholder="Tu nombre" required maxlength="120"><input name="phone" placeholder="Celular / WhatsApp" maxlength="40"><input name="email" type="email" placeholder="Correo (opcional)" maxlength="120">
<select name="curso_id">${cursos.map((k) => `<option value="${k.id}">${esc(k.nombre)}</option>`).join('')}</select><input class="h" name="website" tabindex="-1" autocomplete="off"><button>Quiero matricularme</button><div id="ok"></div><div id="er"></div></form>` : ''}
<script>const f=document.getElementById('f');if(f){document.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{f.curso_id.value=b.dataset.q;f.scrollIntoView({behavior:'smooth'});f.name.focus()});
f.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f));if(!d.phone&&!d.email){er.textContent='Escribe un celular o un correo';return}d.ref=${JSON.stringify(ref).replace(/</g, '\\u003c')};er.textContent='';
const r=await fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});const j=await r.json().catch(()=>({}));if(r.ok){f.reset();ok.textContent='¡Gracias! Pronto te contactamos.'}else er.textContent=j.error||'No se pudo enviar'}}</script></main></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:" } });
}
