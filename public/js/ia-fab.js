// IA Diwilo: botón flotante del panel con el asistente del negocio (módulo «ai»). Consulta con las herramientas de los módulos activos;
// lo que cambia datos llega como propuesta y solo se ejecuta al tocar «Aprobar». Vive en el panel (no dentro del marco de cada módulo).
DW.ready.then((me) => {
  if (window.top !== window.self || !me.pageAllowed || !me.modules.some((m) => m.id === 'ai')) return;
  const { api, esc, toast } = window.App;
  const KEY = 'dw_ia_hist', B = '/api/ai';
  let hist = [];
  try { hist = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (_) {}
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(hist.slice(-30))); } catch (_) {} };
  const SUGG = ['¿Qué clases tengo hoy?', '¿Quiénes tienen cuotas vencidas?', '¿Cuántos estudiantes nuevos tuve este mes?', 'Resumen de la cartera por cobrar'];
  document.body.insertAdjacentHTML('beforeend', `
    <button class="ia-fab" id="iaFab" aria-label="Abrir IA Diwilo" title="IA Diwilo"><i class="bi bi-stars"></i><span>IA Diwilo</span></button>
    <aside class="ia-panel" id="iaPanel" hidden aria-label="IA Diwilo">
      <header><span class="ia-logo"><i class="bi bi-stars"></i></span><div><b>IA Diwilo</b><small>Consulta tu academia. Lo que cambia datos te pide aprobar.</small></div>
        <button class="btn btn-sm btn-outline-secondary" id="iaNew" title="Nueva conversación" aria-label="Nueva conversación"><i class="bi bi-pencil-square"></i></button>
        <button class="btn btn-sm btn-outline-secondary" id="iaClose" aria-label="Cerrar"><i class="bi bi-x-lg"></i></button></header>
      <div class="ia-log" id="iaLog" aria-live="polite"></div><div class="ia-sugg" id="iaSugg"></div>
      <form class="ia-form" id="iaForm"><textarea class="form-control" name="q" rows="1" maxlength="2000" placeholder="Pregunta o pide algo…" aria-label="Pregunta"></textarea><button class="btn btn-primary" aria-label="Enviar"><i class="bi bi-send"></i></button></form>
    </aside>`);
  const $ = (s) => document.querySelector(s), panel = $('#iaPanel'), log = $('#iaLog'), form = $('#iaForm'), ta = form.q;
  const md = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^[-•]\s+(.*)$/gm, '<span class="li">$1</span>').replace(/\n/g, '<br>');
  const usados = (pasos) => (pasos?.length ? `<small class="ia-used">Consultó: ${[...new Set(pasos.map((p) => String(p.herramienta).replace(/_/g, ' ')))].map(esc).join(', ')}</small>` : '');

  function propuesta(m, div, p) {
    const card = document.createElement('div'); card.className = 'ia-pending';
    card.innerHTML = `<span><i class="bi bi-lightning-charge"></i><b>Propuesta:</b> ${esc(String(p.herramienta).replace(/_/g, ' '))}</span><pre>${esc(JSON.stringify(p.args, null, 2))}</pre>
      ${p.hecho ? `<small>${esc(p.hecho)}</small>` : '<div class="d-flex gap-2"><button class="btn btn-sm btn-primary" data-ok>Aprobar</button><button class="btn btn-sm btn-outline-secondary" data-no>Descartar</button></div>'}`;
    card.querySelector('[data-no]')?.addEventListener('click', () => { p.hecho = 'Descartado'; save(); draw(); });
    card.querySelector('[data-ok]')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try { await api(`${B}/asistente/aprobar`, { method: 'POST', body: { herramienta: p.herramienta, args: p.args } }); p.hecho = 'Hecho'; toast('Hecho'); }
      catch (x) { p.hecho = `No se pudo: ${x.message}`; }
      save(); draw();
    });
    div.appendChild(card);
  }
  function draw() {
    log.innerHTML = '';
    if (!hist.length) log.innerHTML = `<div class="ia-msg assistant">Hola, soy la IA de ${esc(me.business.name)}. Puedo contarte las clases del día, la cartera, los estudiantes y más. Si algo cambia datos, primero te pido aprobar.</div>`;
    for (const m of hist) {
      const div = document.createElement('div'); div.className = `ia-msg ${m.role}`;
      div.innerHTML = m.role === 'user' ? esc(m.content) : md(m.content) + usados(m.pasos);
      (m.props || []).forEach((p) => propuesta(m, div, p));
      log.appendChild(div);
    }
    $('#iaSugg').innerHTML = hist.length ? '' : SUGG.map((s) => `<button class="pill" type="button">${esc(s)}</button>`).join('');
    log.scrollTop = log.scrollHeight;
  }
  async function ask(q) {
    q = q.trim(); if (!q) return;
    hist.push({ role: 'user', content: q }); save(); draw();
    const wait = document.createElement('div'); wait.className = 'ia-msg assistant text-body-secondary'; wait.textContent = 'Pensando…'; log.appendChild(wait); log.scrollTop = log.scrollHeight;
    form.querySelector('button').disabled = true;
    try {
      const r = await api(`${B}/asistente`, { method: 'POST', body: { mensajes: hist.map((m) => ({ role: m.role, content: m.content })) } });
      hist.push({ role: 'assistant', content: r.respuesta, pasos: r.pasos.filter((p) => p.estado !== 'propuesta'), props: r.pasos.filter((p) => p.estado === 'propuesta') });
    } catch (x) { hist.push({ role: 'assistant', content: `No pude responder: ${x.message}` }); }
    form.querySelector('button').disabled = false; save(); draw();
  }
  const open = (on) => { panel.hidden = !on; $('#iaFab').classList.toggle('on', on); if (on) { draw(); setTimeout(() => ta.focus(), 50); } };
  $('#iaFab').onclick = () => open(panel.hidden);
  $('#iaClose').onclick = () => open(false);
  $('#iaNew').onclick = () => { hist = []; save(); draw(); };
  $('#iaSugg').onclick = (e) => { const b = e.target.closest('.pill'); if (b) ask(b.textContent); };
  form.onsubmit = (e) => { e.preventDefault(); const q = ta.value; ta.value = ''; ta.style.height = ''; ask(q); };
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) open(false); });
});
