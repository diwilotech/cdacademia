// Shell común de las apps Diwilo: barra superior, barra lateral (escritorio) y barra inferior con «Más» (celular).
// Lo pinta todo a partir de GET /api/me (módulos activos, rol y tema). Cada página solo trae:
//   <div id="dw-shell"></div>
//   <main class="dw-main" data-titulo="Elementos" data-modulo="items"> … </main>
// y espera a DW.ready (Promise con /api/me) para cargar sus datos.
(function () {
  const { api, esc, changePassword } = window.App;
  const ROLE = { owner: 'Propietario', admin: 'Administrador', staff: 'Personal' };
  const RANK = { staff: 1, admin: 2, owner: 3 };
  const main = document.querySelector('main.dw-main');
  const page = { titulo: main?.dataset.titulo || '', modulo: main?.dataset.modulo || '' };

  // Módulos base (siempre activos) + los del negocio, en el orden del menú.
  const BASE_START = [{ id: 'inicio', nombre: 'Inicio', icono: 'bi-house', ruta: '/staff/' }];
  const BASE_END = [
    { id: 'equipo', nombre: 'Equipo', icono: 'bi-people', ruta: '/staff/equipo.html' },
    { id: 'configuracion', nombre: 'Configuración', icono: 'bi-gear', ruta: '/staff/configuracion.html' },
  ];

  function applyTheme(s) {
    const root = document.documentElement;
    root.dataset.dwTema = s.tema;
    root.setAttribute('data-bs-theme', s.modo);
    try { localStorage.setItem('dw_tema', JSON.stringify({ tema: s.tema, modo: s.modo })); } catch (_) {}
    const color = getComputedStyle(root).getPropertyValue('--dw-p').trim();
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    meta.content = s.modo === 'dark' ? '#171a23' : color || '#6d28d9';
  }

  const isActive = (m) => {
    const here = location.pathname.replace(/index\.html$/, '');
    return m.id === page.modulo || (m.ruta && m.ruta.replace(/index\.html$/, '') === here);
  };
  let inBottom = new Set();
  const link = (m) => `<li class="${inBottom.has(m.id) ? 'dw-in-bottom' : ''}"><a href="${esc(m.ruta)}" class="${isActive(m) ? 'active' : ''}" ${isActive(m) ? 'aria-current="page"' : ''} title="${esc(m.nombre)}"><i class="bi ${esc(m.icono || 'bi-grid')}"></i><span>${esc(m.nombre)}</span></a></li>`;

  function render(me) {
    const mods = [...BASE_START, ...me.modules.slice().sort((a, b) => a.orden - b.orden), ...BASE_END];
    const initials = (me.user.name || me.user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
    const logo = me.settings.logo ? `<img src="${esc(me.settings.logo)}" alt="">` : esc(me.business.name.trim()[0] || 'D').toUpperCase();
    const canManage = RANK[me.role] >= RANK.admin;
    // Celular: máximo 4 módulos en la barra inferior + «Más» (abre la barra lateral como offcanvas).
    const bottom = mods.slice(0, 4);
    // En «Más» solo va lo que no cabe abajo (si todo cabe, «Más» muestra el menú completo).
    inBottom = new Set(mods.length > 4 ? bottom.map((m) => m.id) : []);
    const moreActive = !bottom.some(isActive);

    document.getElementById('dw-shell').innerHTML = `
      <a class="visually-hidden-focusable position-absolute top-0 start-0 m-2 btn btn-primary" style="z-index:2000" href="#dw-content">Saltar al contenido</a>
      <header class="dw-top">
        <a class="dw-brand" href="/staff/"><span class="dw-brand__logo">${logo}</span><span class="dw-brand__name d-none d-lg-inline">${esc(me.business.name)}</span></a>
        <span class="dw-top__sep d-none d-lg-inline">/</span>
        <span class="dw-top__title">${esc(page.titulo)}</span>
        <span class="dw-top__spacer"></span>
        <div class="dropdown">
          <button class="dw-iconbtn" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Notificaciones"><i class="bi bi-bell"></i>${me.business.readOnly ? '<span class="dw-dot"></span>' : ''}</button>
          <div class="dropdown-menu dropdown-menu-end p-0" style="width:300px"><div class="px-3 py-2 fw-semibold border-bottom">Notificaciones</div>
            ${me.business.readOnly ? `<div class="px-3 py-2 small"><i class="bi bi-lock-fill text-danger me-1"></i>La suscripción venció: la app quedó en solo lectura. Escríbele a Diwilo para reactivarla.</div>` : '<div class="px-3 py-3 small text-body-secondary text-center">No tienes notificaciones.</div>'}</div>
        </div>
        <div class="dropdown">
          <button class="dw-user" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Menú de usuario"><span class="dw-avatar">${esc(initials)}</span><i class="bi bi-chevron-down small d-none d-sm-inline"></i></button>
          <ul class="dropdown-menu dropdown-menu-end shadow-sm">
            <li class="px-3 py-2"><div class="fw-semibold">${esc(me.user.name || me.user.email)}</div><div class="small text-body-secondary">${esc(me.user.email)} · ${ROLE[me.role] || esc(me.role)}</div></li>
            <li><hr class="dropdown-divider"></li>
            ${me.businesses.length > 1 ? `<li><h6 class="dropdown-header">Cambiar de negocio</h6></li>${me.businesses.map((b) => `<li><button class="dropdown-item ${b.id === me.business.id ? 'active' : ''}" data-biz="${esc(b.id)}"><i class="bi bi-shop me-2"></i>${esc(b.name)}</button></li>`).join('')}<li><hr class="dropdown-divider"></li>` : ''}
            ${canManage ? '<li><a class="dropdown-item" href="/staff/configuracion.html#apariencia"><i class="bi bi-palette me-2"></i>Apariencia</a></li>' : ''}
            <li><button class="dropdown-item" data-pass><i class="bi bi-key me-2"></i>Cambiar contraseña</button></li>
            <li><a class="dropdown-item" href="/privacidad" target="_blank" rel="noopener"><i class="bi bi-shield-check me-2"></i>Política de datos</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><button class="dropdown-item text-danger" data-logout><i class="bi bi-box-arrow-right me-2"></i>Cerrar sesión</button></li>
          </ul>
        </div>
      </header>
      <aside class="offcanvas-lg offcanvas-start dw-side" tabindex="-1" id="dwSide" aria-label="Menú">
        <div class="offcanvas-header border-bottom"><span class="fw-bold">${esc(me.app.nombre)}</span><button type="button" class="btn-close" data-bs-dismiss="offcanvas" data-bs-target="#dwSide" aria-label="Cerrar"></button></div>
        <div class="offcanvas-body"><nav><ul class="dw-nav">${mods.slice(0, -BASE_END.length).map(link).join('')}<li class="dw-nav__sep"></li>${BASE_END.map(link).join('')}</ul></nav></div>
        <div class="dw-side__foot dw-collapse"><button class="dw-iconbtn w-100" data-mini title="Contraer o expandir el menú" aria-label="Contraer o expandir el menú"><i class="bi bi-chevron-double-left"></i></button></div>
      </aside>
      <nav class="dw-bottom" aria-label="Menú principal">
        ${bottom.map((m) => `<a href="${esc(m.ruta)}" class="${isActive(m) ? 'active' : ''}"><i class="bi ${esc(m.icono)}"></i><span>${esc(m.nombre)}</span></a>`).join('')}
        <button type="button" class="${moreActive ? 'active' : ''}" data-bs-toggle="offcanvas" data-bs-target="#dwSide" aria-controls="dwSide"><i class="bi bi-grid"></i><span>Más</span></button>
      </nav>`;
    if (main) main.id = 'dw-content';
    if (me.business.readOnly && main) main.insertAdjacentHTML('afterbegin', '<div class="dw-readonly"><i class="bi bi-lock-fill me-1"></i>Suscripción vencida: la app está en solo lectura. Escríbele a Diwilo para reactivarla.</div>');
    document.querySelectorAll('[data-write]').forEach((b) => (b.disabled = me.business.readOnly));
    document.title = `${page.titulo ? page.titulo + ' · ' : ''}${me.business.name} · ${me.app.nombre}`;

    try { if (localStorage.getItem('dw_mini') === '1') document.body.classList.add('dw-mini'); } catch (_) {}
    document.querySelector('[data-mini]').onclick = () => {
      document.body.classList.toggle('dw-mini');
      try { localStorage.setItem('dw_mini', document.body.classList.contains('dw-mini') ? '1' : '0'); } catch (_) {}
    };
    document.querySelector('[data-pass]').onclick = changePassword;
    document.querySelector('[data-logout]').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); location.replace('/'); };
    document.querySelectorAll('[data-biz]').forEach((b) => (b.onclick = async () => {
      await api('/api/auth/business', { method: 'POST', body: { businessId: b.dataset.biz } });
      location.replace('/staff/');
    }));

    // Página de un módulo inactivo o sin permiso: no se muestra su contenido.
    if (page.modulo && !['inicio', 'equipo', 'configuracion'].includes(page.modulo) && !me.modules.some((m) => m.id === page.modulo) && main) {
      main.innerHTML = `<div class="dw-card">${window.App.empty('bi-slash-circle', 'Este módulo no está activo para tu negocio o tu rol no tiene acceso.', '<a class="btn btn-primary" href="/staff/">Ir al inicio</a>')}</div>`;
      return false;
    }
    return true;
  }

  const ready = api('/api/me').then((me) => {
    applyTheme(me.settings);
    me.canManage = RANK[me.role] >= RANK.admin;
    me.reaches = (min) => (RANK[me.role] || 0) >= (RANK[min] || 1);
    me.pageAllowed = render(me);
    window.DW.me = me;
    return me;
  }).catch((e) => {
    if (e.code === 'NO_BUSINESS' || e.status === 401) location.replace('/');
    throw e;
  });

  window.DW = { ready, applyTheme };
})();
