// Reproductor protegido de la clase grabada de una reposición (/ver/<enlace>). Ver src/lib/ver.js.
// Lo que hace es DISUADIR (marca de agua con el nombre, sin descarga, sin saltar partes, pausa al salir de la pestaña, sesión única).
// Ningún navegador permite impedir que alguien grabe la pantalla o la fotografíe con otro aparato.
(function () {
  const base = location.pathname.replace(/\/$/, '');
  const $ = (id) => document.getElementById(id);
  const v = $('v'), caja = $('caja'), wm = $('wm'), tapa = $('tapa');
  let datos = null, maxT = 0, acum = 0, ultimaT = 0, vivo = true, hb = null, fin = false, obs = null;

  const post = (sub, body) => fetch(`${base}/${sub}`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
    .then(async (r) => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }));
  const error = (msg) => { vivo = false; try { obs && obs.disconnect(); } catch (_) {} v.pause(); v.removeAttribute('src'); v.load(); caja.style.aspectRatio = 'auto'; caja.innerHTML = `<div class="err">${msg}</div>`; $('barra').style.display = 'none'; };
  const cubrir = (txt, boton) => { v.pause(); $('tapaTxt').textContent = txt; $('tapaBtn').style.display = boton ? '' : 'none'; tapa.classList.add('on'); };
  $('tapaBtn').onclick = () => { tapa.classList.remove('on'); v.play().catch(() => {}); };

  /* ---------- marca de agua: nombre, documento y hora, en varios puntos que cambian de lugar ---------- */
  const hora = () => new Date().toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  function marca() {
    const m = datos.marca, txt = () => `${m.nombre} · ${m.doc ? m.doc + ' · ' : ''}${hora()} · ${m.ref}`;
    wm.innerHTML = '';
    for (let i = 0; i < 6; i++) { const s = document.createElement('span'); s.textContent = txt(); wm.appendChild(s); }
    const mover = () => { [...wm.children].forEach((s) => { s.style.left = `${Math.round(Math.random() * 62)}%`; s.style.top = `${Math.round(Math.random() * 88)}%`; s.textContent = txt(); }); };
    mover(); setInterval(mover, 5000);
    // Si alguien la quita o la esconde, se detiene el video
    obs = new MutationObserver(() => {
      if (fin) return;
      const ok = document.body.contains(wm) && wm.children.length >= 6 && getComputedStyle(wm).display !== 'none' && getComputedStyle(wm).visibility !== 'hidden' && Number(getComputedStyle(wm).opacity) > 0.5;
      if (!ok) { fin = true; error('Se detectó un cambio en la página. Recárgala para seguir viendo la clase.'); }
    });
    obs.observe(caja, { childList: true, subtree: true, attributes: true });
  }

  /* ---------- reproducción: sin saltar partes ni acelerar ---------- */
  v.addEventListener('ratechange', () => { if (v.playbackRate !== 1) v.playbackRate = 1; });
  v.addEventListener('seeking', () => { if (v.currentTime > maxT + 4) v.currentTime = maxT; });
  v.addEventListener('timeupdate', () => {
    if (v.paused || v.seeking) { ultimaT = v.currentTime; return; }
    const d = v.currentTime - ultimaT;
    if (d > 0 && d < 3) { acum += d; if (v.currentTime > maxT) maxT = v.currentTime; }   // solo avance normal cuenta como visto
    ultimaT = v.currentTime;
  });
  async function latido(final) {
    if (!vivo) return;
    const delta = acum; acum = 0;
    const r = await post('progreso', { delta, t: v.currentTime }).catch(() => null);
    if (!r) { acum += delta; return; }
    if (r.status === 409) { vivo = false; clearInterval(hb); cubrir(r.data.error || 'Esta clase se abrió en otro lugar.', false); return; }
    if (r.ok) { $('barra').firstElementChild.style.width = `${r.data.pct}%`; info(r.data.pct, r.data.completado); }
  }
  const info = (pct, ok) => { $('info').innerHTML = ok ? '<b>✔ Reposición completada.</b> Puedes volver a verla cuando quieras hasta que venza el enlace.' : `Visto: <b>${pct}%</b> · necesitas al menos <b>${datos.minimo}%</b> para completar la reposición.`; };

  /* ---------- protecciones del navegador (disuasivas) ---------- */
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('dragstart', (e) => e.preventDefault());
  document.addEventListener('copy', (e) => e.preventDefault());
  document.addEventListener('visibilitychange', () => { if (document.hidden && vivo) cubrir('Vuelve a esta pestaña para continuar.', true); });
  window.addEventListener('blur', () => { if (vivo && !v.paused) cubrir('La clase se pausó al salir de la ventana.', true); });
  document.addEventListener('keydown', (e) => {
    const k = (e.key || '').toLowerCase();
    const captura = e.key === 'PrintScreen' || (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(k)) || (e.metaKey && e.shiftKey && k === 's') || (e.ctrlKey && e.shiftKey && k === 's');
    const bloqueo = (e.ctrlKey || e.metaKey) && ['s', 'p', 'u'].includes(k) || e.key === 'F12' || ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c'].includes(k));
    if (captura) { cubrir('No se permiten capturas de pantalla.', true); try { navigator.clipboard.writeText(''); } catch (_) {} }
    if (bloqueo || captura) e.preventDefault();
  });
  document.addEventListener('keyup', (e) => { if (e.key === 'PrintScreen') { try { navigator.clipboard.writeText(''); } catch (_) {} cubrir('No se permiten capturas de pantalla.', true); } });
  // En iPhone/iPad el reproductor tiene su pantalla completa propia (sin marca de agua): se cierra
  v.addEventListener('webkitbeginfullscreen', () => { try { v.webkitExitFullscreen(); } catch (_) {} });
  // Pantalla completa de la caja (con la marca de agua); el del video suelto la quitaría
  const fs = $('fs');
  if (caja.requestFullscreen) { fs.style.display = 'block'; fs.onclick = () => (document.fullscreenElement ? document.exitFullscreen() : caja.requestFullscreen().catch(() => {})); }

  /* ---------- arranque ---------- */
  (async () => {
    const r = await post('iniciar').catch(() => null);
    if (!r) return error('No hay conexión. Intenta de nuevo.');
    if (!r.ok) return error(r.data.error || 'No se pudo abrir la clase.');
    datos = r.data;
    $('tit').textContent = datos.titulo; document.title = datos.titulo;
    $('sub').textContent = `${datos.curso || ''} · clase ${datos.clase} · enlace de ${datos.marca.nombre} · vence ${new Date(datos.vence).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}`;
    $('barra').firstElementChild.style.width = `${datos.pct}%`; info(datos.pct, datos.completado);
    marca();
    v.src = `${base}/video`; v.controls = true;
    hb = setInterval(() => { if (!v.paused) latido(); }, 10000);
    v.addEventListener('ended', () => latido(true));
    v.addEventListener('pause', () => { if (acum > 0) latido(); });
    window.addEventListener('pagehide', () => { if (acum > 0) navigator.sendBeacon?.(`${base}/progreso`, new Blob([JSON.stringify({ delta: acum, t: v.currentTime })], { type: 'application/json' })); });
  })();
})();
