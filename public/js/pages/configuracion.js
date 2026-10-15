// Configuración del negocio: Apariencia (tema, modo y logo, con vista previa), IA → Conexiones (MCP) y Bitácora.
DW.ready.then((me) => {
  const { api, esc, toast, confirm, modal, empty, table, fecha } = window.App;
  const TEMAS = [['violeta', 'Violeta'], ['indigo', 'Índigo'], ['azul', 'Azul'], ['turquesa', 'Turquesa'], ['verde', 'Verde'], ['naranja', 'Naranja'], ['rojo', 'Rojo'], ['rosa', 'Rosa'], ['grafito', 'Grafito']];
  const tabs = document.querySelector('[data-tabs]');
  const pane = (id) => document.querySelector(`[data-pane="${id}"]`);
  if (!me.canManage) tabs.querySelector('[data-tab="bitacora"]').parentElement.remove();

  function show(id) {
    if (!pane(id) || (id === 'bitacora' && !me.canManage)) id = 'apariencia';
    tabs.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
    document.querySelectorAll('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== id));
    history.replaceState(null, '', `#${id}`);
    ({ apariencia, ia, bitacora })[id]();
  }
  tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab); });

  // ---- Apariencia: solo propietario y administrador cambian; la vista previa es en vivo ----
  let state = { ...me.settings };
  function apariencia() {
    const p = pane('apariencia'), can = me.canManage && !me.business.readOnly;
    p.innerHTML = `<div class="row g-3">
      <div class="col-lg-8"><div class="dw-card"><h2 class="h6 mb-1">Tema de color</h2><p class="small text-body-secondary">${can ? 'Toca un color para verlo en vivo y luego guarda.' : 'Solo el propietario o un administrador pueden cambiarlo.'}</p>
        <div class="row row-cols-3 row-cols-md-5 g-2" data-temas>${TEMAS.map(([id, n]) => `<div class="col"><button type="button" class="dw-swatch ${state.tema === id ? 'active' : ''}" data-tema="${id}" ${can ? '' : 'disabled'} aria-pressed="${state.tema === id}"><b data-dw-tema="${id}" style="background:var(--dw-p)"></b><span class="small">${n}</span></button></div>`).join('')}</div>
        <h2 class="h6 mt-4 mb-2">Modo</h2>
        <div class="btn-group" role="group" data-modos><button type="button" class="btn btn-outline-primary ${state.modo === 'light' ? 'active' : ''}" data-modo="light" ${can ? '' : 'disabled'}><i class="bi bi-sun me-1"></i>Claro</button><button type="button" class="btn btn-outline-primary ${state.modo === 'dark' ? 'active' : ''}" data-modo="dark" ${can ? '' : 'disabled'}><i class="bi bi-moon-stars me-1"></i>Oscuro</button></div>
        ${can ? '<div class="mt-4 d-flex gap-2"><button class="btn btn-primary" data-save><i class="bi bi-check-lg me-1"></i>Guardar apariencia</button><button class="btn btn-light" data-reset>Deshacer</button></div>' : ''}</div></div>
      <div class="col-lg-4"><div class="dw-card"><h2 class="h6 mb-3">Logo del negocio</h2>
        <div class="d-flex align-items-center gap-3"><span class="dw-brand__logo" style="width:64px;height:64px;font-size:1.6rem">${me.settings.logo ? `<img src="${esc(me.settings.logo)}" alt="Logo">` : esc(me.business.name[0] || 'D')}</span>
        <div class="small text-body-secondary">PNG, JPG, WEBP o SVG, cuadrado, máx. 300 KB.</div></div>
        ${can ? `<div class="mt-3 d-flex gap-2 flex-wrap"><label class="btn btn-outline-primary btn-sm mb-0"><i class="bi bi-upload me-1"></i>Subir logo<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden data-logo></label>${me.settings.logo ? '<button class="btn btn-outline-danger btn-sm" data-logo-del><i class="bi bi-trash me-1"></i>Quitar</button>' : ''}</div>` : ''}</div></div></div>`;
    const preview = () => {
      DW.applyTheme(state);
      p.querySelectorAll('[data-tema]').forEach((b) => { b.classList.toggle('active', b.dataset.tema === state.tema); b.setAttribute('aria-pressed', b.dataset.tema === state.tema); });
      p.querySelectorAll('[data-modo]').forEach((b) => b.classList.toggle('active', b.dataset.modo === state.modo));
    };
    p.querySelector('[data-temas]').onclick = (e) => { const b = e.target.closest('[data-tema]'); if (b && can) { state.tema = b.dataset.tema; preview(); } };
    p.querySelector('[data-modos]').onclick = (e) => { const b = e.target.closest('[data-modo]'); if (b && can) { state.modo = b.dataset.modo; preview(); } };
    if (!can) return;
    p.querySelector('[data-reset]').onclick = () => { state = { ...me.settings }; preview(); };
    p.querySelector('[data-save]').onclick = async () => {
      try { me.settings = { ...me.settings, ...(await api('/api/settings/apariencia', { method: 'PUT', body: { tema: state.tema, modo: state.modo } })) }; toast('Apariencia guardada para todo el equipo'); }
      catch (ex) { toast(ex.message, false); }
    };
    p.querySelector('[data-logo]').onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const dataUrl = file.type === 'image/svg+xml' ? await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); }) : await shrink(file, 256);
        me.settings = { ...me.settings, ...(await api('/api/settings/logo', { method: 'PUT', body: { dataUrl } })) };
        toast('Logo actualizado'); location.reload();
      } catch (ex) { toast(ex.message, false); }
    };
    p.querySelector('[data-logo-del]')?.addEventListener('click', async () => {
      if (!(await confirm({ title: '¿Quitar el logo?', ok: 'Quitar' }))) return;
      await api('/api/settings/logo', { method: 'DELETE' }); location.reload();
    });
  }
  // Reduce la imagen a un cuadrado de `size` px en PNG (el logo pesa poco y se ve igual en todas partes).
  function shrink(file, size) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(img.width, img.height), cv = document.createElement('canvas');
        cv.width = cv.height = Math.min(size, s);
        cv.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(img.src); resolve(cv.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('No pude abrir esa imagen'));
      img.src = URL.createObjectURL(file);
    });
  }

  // ---- IA → Conexiones (MCP): el negocio conecta su propio asistente con un token ----
  async function ia() {
    const p = pane('ia');
    const { tokens, url } = await api('/api/ia/tokens');
    p.innerHTML = `<div class="dw-card mb-3"><h2 class="h6">Conecta tu asistente de IA</h2>
        <p class="small text-body-secondary mb-2">Con una conexión, tu asistente (Claude u otro compatible con MCP) puede consultar y registrar datos de este negocio con <b>tu mismo rol</b>. Antes de cambiar algo, el asistente te pide confirmar, y cada cambio queda en la bitácora. Al usarlo, los datos que consulte se envían al proveedor de IA que tú elijas (ver <a href="/privacidad" target="_blank" rel="noopener">política de datos</a>).</p>
        <div class="small mb-3">Dirección del servidor: <code>${esc(url)}</code></div>
        <form class="d-flex gap-2 needs-validation" data-new novalidate><input class="form-control" name="name" placeholder="Nombre (ej. «Claude de Ana»)" maxlength="60" required aria-label="Nombre de la conexión"><button class="btn btn-primary text-nowrap" data-write><i class="bi bi-plus-lg me-1"></i>Crear conexión</button></form></div>
      <div class="dw-card p-0 p-md-2" data-list></div>`;
    p.querySelector('[data-list]').innerHTML = tokens.length ? table([
      { label: 'Conexión', main: true, html: (t) => `${esc(t.name)}<div class="small text-body-secondary fw-normal">${esc(t.email)}</div>` },
      { label: 'Creada', html: (t) => fecha(t.created_at) },
      { label: 'Último uso', html: (t) => (t.last_used_at ? fecha(t.last_used_at, true) : 'Nunca') },
      { label: 'Estado', html: (t) => (t.revoked_at ? '<span class="badge text-bg-secondary">Revocada</span>' : '<span class="badge text-bg-success">Activa</span>') },
      { label: '', cls: 'text-end', html: (t) => (t.revoked_at ? '' : `<button class="btn btn-sm btn-outline-danger" data-revoke="${esc(t.id)}" data-name="${esc(t.name)}">Revocar</button>`) },
    ], tokens) : empty('bi-plug', 'Aún no hay conexiones de IA.');
    const f = p.querySelector('[data-new]');
    f.onsubmit = async (e) => {
      e.preventDefault(); f.classList.add('was-validated'); if (!f.checkValidity()) return;
      try {
        const r = await api('/api/ia/tokens', { method: 'POST', body: { name: f.name.value } });
        const { el } = modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Conexión creada</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
          <div class="modal-body"><p class="small">Copia el token ahora: <b>no se vuelve a mostrar</b>. Si lo pierdes, revoca esta conexión y crea otra.</p>
          <div class="input-group mb-3"><input class="form-control font-monospace small" readonly value="${esc(r.token)}"><button class="btn btn-primary" data-copy aria-label="Copiar token"><i class="bi bi-clipboard"></i></button></div>
          <p class="small text-body-secondary mb-1">En tu asistente agrega un servidor MCP remoto con:</p>
          <ul class="small text-body-secondary mb-0"><li>URL: <code>${esc(r.url)}</code></li><li>Encabezado: <code>Authorization: Bearer &lt;token&gt;</code></li></ul></div>`);
        el.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(r.token); toast('Token copiado'); } catch { el.querySelector('input').select(); } };
        ia();
      } catch (ex) { toast(ex.message, false); }
    };
    p.querySelector('[data-list]').onclick = async (e) => {
      const b = e.target.closest('[data-revoke]');
      if (!b || !(await confirm({ title: `¿Revocar «${b.dataset.name}»?`, text: 'El asistente conectado con ese token dejará de tener acceso de inmediato.', ok: 'Revocar' }))) return;
      try { await api(`/api/ia/tokens/${b.dataset.revoke}`, { method: 'DELETE' }); toast('Conexión revocada'); ia(); } catch (ex) { toast(ex.message, false); }
    };
  }

  // ---- Bitácora: quién hizo qué (propietario y administrador) ----
  async function bitacora() {
    const p = pane('bitacora');
    const { items } = await api('/api/settings/bitacora');
    const ORIGEN = { app: 'App', mcp: 'IA (MCP)', diwilo: 'Diwilo' };
    p.innerHTML = `<div class="dw-card p-0 p-md-2">${items.length ? table([
      { label: 'Cuándo', html: (a) => fecha(a.created_at, true) },
      { label: 'Quién', html: (a) => esc(a.email || '—') },
      { label: 'Qué', main: true, html: (a) => esc(a.accion) },
      { label: 'Desde', html: (a) => `<span class="badge text-bg-light">${ORIGEN[a.origen] || esc(a.origen)}</span>` },
    ], items) : empty('bi-journal-text', 'Aún no hay movimientos registrados.')}</div>`;
  }

  show((location.hash || '#apariencia').slice(1));
});
