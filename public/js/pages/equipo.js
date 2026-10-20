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
  let users = [], profs = [], catalogo = [], areas = [], datos = new Map();
  const key = (s) => String(s || '').trim().toLowerCase();

  function showLink(url, who) {
    const { el } = modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Link para ${esc(who)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><p class="small text-body-secondary">Envíaselo por WhatsApp o correo. Sirve una sola vez para crear o restablecer su contraseña.</p>
      <div class="input-group"><input class="form-control" readonly value="${esc(url)}"><button class="btn btn-primary" data-copy><i class="bi bi-clipboard"></i></button></div></div>`);
    el.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Link copiado'); } catch { el.querySelector('input').select(); } };
  }
  const modBoxes = (sel) => catalogo.map((m, i) => `<div class="col-6"><div class="form-check"><input class="form-check-input" type="checkbox" id="mod${i}" data-mod="${esc(m.id)}" ${(sel || catalogo.filter((x) => x.defecto).map((x) => x.id)).includes(m.id) ? 'checked' : ''}><label class="form-check-label" for="mod${i}">${esc(m.nombre)}</label></div></div>`).join('');
  const picked = (el) => [...el.querySelectorAll('[data-mod]:checked')].map((c) => c.dataset.mod);

  const personaKey = (r) => (r.user ? `u:${r.user.id}` : `p:${r.prof.id}`);
  // Personas = usuarios con acceso + profesionales (se unen por correo; los que no tienen acceso salen como «Sin acceso»).
  const rows = () => {
    const byMail = new Map(profs.filter((p) => p.email).map((p) => [key(p.email), p]));
    const out = users.map((u) => ({ user: u, prof: byMail.get(key(u.email)) || null }));
    const used = new Set(out.map((r) => r.prof?.id).filter(Boolean));
    profs.filter((p) => !used.has(p.id)).forEach((p) => out.push({ user: null, prof: p }));
    return out;
  };

  async function load() {
    const [t, p, pn] = await Promise.all([api('/api/team'), api('/api/profesionales/profesionales?limit=500').catch(() => ({ rows: [] })), me.canManage ? api('/api/team/nomina/personas').catch(() => ({ personas: [] })) : Promise.resolve({ personas: [] })]);
    users = t.users; catalogo = t.catalogo; profs = p.rows || []; datos = new Map(pn.personas.map((x) => [x.key, x]));
    areas = await AC.listas.areas().catch(() => []);
    const nombreArea = (id) => areas.find((a) => a.id === id)?.nombre || '—';
    const all = rows();
    list.innerHTML = all.length ? table([
      { label: 'Nombre', main: true, html: (r) => { const n = r.user?.name || r.prof?.nombre || r.user?.email; const e = r.user?.email || r.prof?.email || '';
        return `<div>${esc(n)}</div><div class="small text-body-secondary fw-normal">${esc(e)}</div>`; } },
      ...(me.canManage ? [
        { label: 'Documento', html: (r) => { const d = datos.get(personaKey(r)); return d?.documento ? `<span class="badge text-bg-light">${esc(d.tipo_documento || 'CC')}</span> ${esc(d.documento)}` : '<span class="text-body-secondary">—</span>'; } },
        { label: 'Celular', html: (r) => { const d = datos.get(personaKey(r)), t = d?.celular || r.prof?.telefono; return t ? esc(t) : '<span class="text-body-secondary">—</span>'; } }] : []),
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
          me.canManage ? `<button class="btn btn-sm btn-outline-primary" data-editar="${esc(personaKey(r))}"><i class="bi bi-pencil me-1"></i>Editar</button>` : '',
          u && !r.prof && canManage ? `<button class="btn btn-sm btn-outline-info" data-hacerprof="${id}" title="Convertir en profesional (docente)"><i class="bi bi-mortarboard me-1"></i>Hacer profesional</button>` : '',
          u && r.prof && canManage ? `<button class="btn btn-sm btn-outline-warning" data-quitarprof="${r.prof.id}" title="Dejar de ser profesional (conserva su acceso a la app)"><i class="bi bi-person-dash"></i></button>` : '',
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
  /* ---------- Editar persona: sus datos y su nómina (lo que se le paga, los ítems del mes y el pago) ---------- */
  const TIPOS_DOC = { CC: 'Cédula de ciudadanía', NIT: 'NIT', CE: 'Cédula de extranjería', PA: 'Pasaporte' };
  const PERIODOS = { mensual: 'Mes', quincenal: 'Quincena', semanal: 'Semana', clase: 'Clase dictada', hora: 'Hora' };
  const FACTOR = { mensual: 1, quincenal: 2, semanal: 4 }, BASE = { mensual: 'Sueldo mensual', quincenal: 'Pago de 2 quincenas', semanal: 'Pago de 4 semanas' };
  const pesos = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO');
  const refKey = (k) => String(k || '').replace(/[^\w.-]/g, '_').slice(0, 60);
  const finanzasOn = me.modules.some((m) => m.id === 'finanzas');
  const hoyMes = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 7);

  function editarPersona(r, tab = 'datos') {
    const k = personaKey(r), d0 = { ...(datos.get(k) || {}) };
    const nombre = r.user?.name || r.prof?.nombre || r.user?.email || '';
    const mo = document.createElement('div');
    mo.className = 'modal fade'; mo.tabIndex = -1;
    mo.innerHTML = `<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-xl"><div class="modal-content">
      <div class="modal-header"><div class="flex-grow-1"><h2 class="modal-title h5 mb-0">Editar · ${esc(nombre)}</h2><div class="small text-body-secondary">${esc(d0.detalle || '')}</div></div><button type="button" class="btn-close" data-cerrar aria-label="Cerrar"></button></div>
      <div class="modal-body"><div class="dw-segb" data-tabs><button type="button" class="btn btn-sm btn-outline-secondary" data-tab="datos">Datos</button>${me.canManage ? '<button type="button" class="btn btn-sm btn-outline-secondary" data-tab="nomina">Nómina</button>' : ''}</div><div data-panel></div></div>
      <div class="modal-footer justify-content-between" data-pie></div></div></div>`;
    document.body.appendChild(mo);
    const m_ = new bootstrap.Modal(mo, { backdrop: 'static', keyboard: false });
    mo.addEventListener('hidden.bs.modal', () => { mo.remove(); load(); });
    const panel = mo.querySelector('[data-panel]'), pie = mo.querySelector('[data-pie]');
    let sucio = false;
    const cerrar = async () => { if (sucio && !(await confirm({ title: 'Hay cambios sin guardar', text: 'Si cierras, se pierden.', ok: 'Cerrar sin guardar' }))) return; m_.hide(); };
    mo.addEventListener('click', (e) => { if (e.target.closest('[data-cerrar]')) cerrar(); });
    const ir = async (t) => {
      if (sucio && !(await confirm({ title: 'Hay cambios sin guardar', text: 'Si cambias de pestaña, se pierden.', ok: 'Cambiar' }))) return;
      sucio = false; mo.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
      return t === 'datos' ? pestanaDatos() : pestanaNomina();
    };
    mo.querySelector('[data-tabs]').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) ir(b.dataset.tab); });

    /* -- Datos -- */
    function pestanaDatos() {
      panel.innerHTML = `<form class="row g-3" data-form><div class="col-md-6"><label class="form-label small mb-1">Nombre</label><input class="form-control" name="nombre" value="${esc(nombre)}" maxlength="100" required></div>
        <div class="col-md-6"><label class="form-label small mb-1">Correo</label><input class="form-control" value="${esc(r.user?.email || r.prof?.email || '')}" disabled></div>
        <div class="col-md-4"><label class="form-label small mb-1">Tipo de documento</label><select class="form-select" name="tipo_documento">${Object.entries(TIPOS_DOC).map(([v, l]) => `<option value="${v}" ${v === (d0.tipo_documento || 'CC') ? 'selected' : ''}>${v} · ${l}</option>`).join('')}</select></div>
        <div class="col-md-4"><label class="form-label small mb-1">Número (cédula o NIT)</label><input class="form-control" name="documento" value="${esc(d0.documento || '')}" maxlength="40" placeholder="Ej.: 1020304050"></div>
        <div class="col-md-4"><label class="form-label small mb-1">Celular</label><input class="form-control" name="celular" type="tel" value="${esc(d0.celular || '')}" maxlength="30" placeholder="Ej.: 300 123 4567"></div></form>
        <p class="small text-body-secondary mt-3 mb-0">La cédula o NIT sale en el documento de sus pagos en Finanzas.</p>`;
      pie.innerHTML = `<span></span><span class="d-flex gap-2"><button type="button" class="btn btn-light" data-cerrar>Cerrar</button><button type="button" class="btn btn-primary" data-guardar-datos>Guardar datos</button></span>`;
      panel.querySelector('[data-form]').addEventListener('input', () => { sucio = true; });
      pie.querySelector('[data-guardar-datos]').onclick = async () => {
        const f = panel.querySelector('[data-form]'); if (!f.checkValidity()) return f.reportValidity();
        try { await api(`/api/team/persona/${encodeURIComponent(k)}`, { method: 'PUT', body: { nombre: f.elements.nombre.value, tipo_documento: f.elements.tipo_documento.value, documento: f.elements.documento.value, celular: f.elements.celular.value } });
          Object.assign(d0, { tipo_documento: f.elements.tipo_documento.value, documento: f.elements.documento.value, celular: f.elements.celular.value }); sucio = false; toast('Datos guardados'); }
        catch (ex) { toast(ex.message, false); }
      };
    }

    /* -- Nómina -- */
    async function pestanaNomina() {
      panel.innerHTML = '<p class="text-body-secondary">Cargando…</p>'; pie.innerHTML = '<span></span><button type="button" class="btn btn-light" data-cerrar>Cerrar</button>';
      let cuentas = [], centros = [], recId = null;
      if (finanzasOn) {
        [cuentas, centros] = await Promise.all([api('/api/finanzas/accounts?limit=200').then((x) => x.rows).catch(() => []), api('/api/finanzas/cost_centers?limit=200').then((x) => x.rows).catch(() => [])]);
        recId = (await api('/api/finanzas/recurring?limit=500').then((x) => x.rows).catch(() => [])).find((x) => x.ref === `academia:nomina:${k}`)?.id || null;
      }
      let def = { valor: d0.valor || 0, periodicidad: d0.periodicidad || 'mensual', centro: d0.centro_costo || '' };
      let mes = hoyMes(), plan = null, pagado = null, items = [], centroId = null, defSucia = false;
      const centroDe = (nombreC) => centros.find((x) => x.name.toLowerCase() === String(nombreC || '').toLowerCase())?.id ?? null;
      const total = () => items.reduce((a, x) => a + (Number(x.valor) > 0 ? Math.round(Number(x.valor)) : 0), 0);
      const grupoDe = (x) => x.grupo || (/^(Sueldo mensual|Pago de \d+ (quincenas|semanas))$/.test(x.concepto || '') ? 'Sueldo' : /^Clase \d+/.test(x.concepto || '') ? 'Clases' : 'Otros');
      const GRUPOS = { Sueldo: ['bi-wallet2', 'Sueldo definido'], Clases: ['bi-journal-bookmark', 'Clases que dicta'], Otros: ['bi-plus-circle', 'Otros ítems (bonos, auxilios…)'] };

      async function cargarMes() {
        if (!finanzasOn) return;
        const pm = await api(`/api/finanzas/pagos-mes?month=${mes}`).catch(() => ({ planes: [], pagados: [] }));
        plan = pm.planes.find((x) => x.tipo === 'nomina' && x.key === k) || null; pagado = pm.pagados.find((x) => x.tipo === 'nomina' && x.key === refKey(k)) || null;
        if (plan) { items = plan.items.map((x) => ({ ...x })); centroId = plan.cost_center_id; }
        else {
          items = []; centroId = centroDe(def.centro);
          if (def.valor && FACTOR[def.periodicidad]) items.push({ concepto: BASE[def.periodicidad], valor: def.valor * FACTOR[def.periodicidad], grupo: 'Sueldo' });
          if (d0.profesional_id || r.prof) {
            const cl = await api(`/api/team/nomina/clases?profesional=${d0.profesional_id || r.prof.id}&month=${mes}`).then((x) => x.clases).catch(() => []);
            for (const c_ of cl) items.push({ grupo: 'Clases', concepto: `Clase ${c_.n} · ${c_.curso}`, detalle: `${c_.fecha}${c_.ini ? ` · ${c_.ini}` : ''}`, valor: def.periodicidad === 'clase' && def.valor ? def.valor : '' });
          }
        }
      }
      const dibuja = () => {
        const bloqueado = !!pagado;
        panel.innerHTML = `<div class="dw-card mb-3"><h3 class="h6">Lo que se le paga</h3><div class="row g-2 align-items-end">
            <div class="col-md-3"><label class="form-label small mb-1">Valor</label><div class="input-group"><span class="input-group-text">$</span><input class="form-control" type="number" min="0" step="1000" data-def="valor" value="${def.valor || ''}"></div></div>
            <div class="col-md-3"><label class="form-label small mb-1">Cada</label><select class="form-select" data-def="periodicidad">${Object.entries(PERIODOS).map(([v, l]) => `<option value="${v}" ${v === def.periodicidad ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            <div class="col-md-4"><label class="form-label small mb-1">Centro de costo</label>${centros.length ? `<select class="form-select" data-def="centro"><option value="">Sin centro de costo</option>${centros.map((x) => `<option value="${esc(x.name)}" ${x.name === def.centro ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : `<input class="form-control" data-def="centro" value="${esc(def.centro)}" maxlength="120" placeholder="Ej.: Maquillaje">`}</div>
            <div class="col-md-2"><button type="button" class="btn btn-outline-primary w-100" data-guardar-def ${defSucia ? '' : 'disabled'}>Guardar</button></div></div>
            <div class="form-text">${finanzasOn ? 'Se registra en Finanzas como gasto recurrente de tipo Nómina (nombre, cédula, valor y ciclo).' : 'Finanzas no está activo: aquí solo queda lo que se le paga.'}</div></div>
          ${finanzasOn ? `<div class="d-flex flex-wrap align-items-center gap-2 mb-2"><h3 class="h6 mb-0 flex-grow-1">Pago del mes</h3><input type="month" class="form-control form-control-sm w-auto" data-mes value="${mes}" aria-label="Mes"></div>
            ${pagado ? `<div class="alert alert-success py-2"><i class="bi bi-check-circle-fill me-1"></i><b>Pagado ${pesos(pagado.total)}</b> ${pagado.fuentes.map((f) => `<span class="small ms-2">${esc(cuentas.find((a) => a.id === f.account_id)?.name || 'Sin cuenta')}: ${pesos(f.valor)}</span>`).join('')}</div>` : ''}
            ${!d0.documento ? '<div class="alert alert-warning py-2 small"><i class="bi bi-exclamation-triangle me-1"></i>Le falta la cédula o NIT: ponla en la pestaña <b>Datos</b> para que salga en su documento de pago.</div>' : ''}
            <div class="row g-2 mb-3"><div class="col-md-6"><label class="form-label small mb-1">Cédula o NIT</label><input class="form-control" value="${esc(d0.documento ? `${d0.tipo_documento || 'CC'} ${d0.documento}` : '')}" disabled></div>
              <div class="col-md-6"><label class="form-label small mb-1">Centro de costo de este pago</label><select class="form-select" data-centro-pago ${bloqueado ? 'disabled' : ''}><option value="">Sin centro de costo</option>${centros.map((x) => `<option value="${x.id}" ${x.id === centroId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div></div>
            ${['Sueldo', 'Clases', 'Otros'].filter((g) => items.some((x) => grupoDe(x) === g) || g === 'Otros').map((g) => { const its = items.map((x, i) => ({ x, i })).filter((o) => grupoDe(o.x) === g), [ico, nom] = GRUPOS[g], cv = its.filter((o) => Number(o.x.valor) > 0).length;
              return `<div class="card mb-3"><div class="card-header bg-body-tertiary d-flex align-items-center gap-2 py-2"><i class="bi ${ico}"></i><b>${nom}</b>${its.length > 1 ? `<span class="small text-body-secondary">${cv} de ${its.length} con valor</span>` : ''}<span class="ms-auto fw-semibold" data-sub="${g}">${pesos(its.reduce((a, o) => a + (Number(o.x.valor) > 0 ? Math.round(Number(o.x.valor)) : 0), 0))}</span></div>
                <ul class="list-group list-group-flush">${its.map(({ x, i }) => `<li class="list-group-item d-flex flex-wrap align-items-center gap-2 ${Number(x.valor) > 0 ? '' : 'opacity-75'}" data-i="${i}"><div class="flex-grow-1" style="min-width:180px">${x.detalle || g !== 'Otros' ? `<div class="fw-semibold">${esc(x.concepto)}</div>${x.detalle ? `<div class="small text-body-secondary">${esc(x.detalle)}</div>` : ''}` : `<input class="form-control form-control-sm" data-f="concepto" value="${esc(x.concepto)}" maxlength="200" placeholder="Bono, auxilio…" ${bloqueado ? 'disabled' : ''} aria-label="Concepto">`}</div>
                  <div class="input-group input-group-sm" style="width:170px"><span class="input-group-text">$</span><input class="form-control" type="number" min="0" step="1000" data-f="valor" value="${x.valor || ''}" placeholder="Sin valor" ${bloqueado ? 'disabled' : ''} aria-label="Valor"></div>
                  ${bloqueado || g !== 'Otros' ? '<span style="width:2rem"></span>' : '<button type="button" class="btn btn-sm btn-light" data-quitar aria-label="Quitar"><i class="bi bi-x-lg"></i></button>'}</li>`).join('') || '<li class="list-group-item text-body-secondary small">Aún no hay ítems aquí.</li>'}</ul>
                ${g === 'Otros' && !bloqueado ? '<div class="card-footer bg-transparent py-2"><button type="button" class="btn btn-sm btn-outline-secondary" data-mas><i class="bi bi-plus-lg me-1"></i>Agregar ítem</button></div>' : ''}</div>`; }).join('')}` : ''}`;
        pie.innerHTML = finanzasOn ? `<span>Total: <b data-total>${pesos(total())}</b>${sucio ? ' <span class="badge text-bg-warning ms-1">Sin guardar</span>' : ''}</span><span class="d-flex gap-2"><button type="button" class="btn btn-light" data-cerrar>Cerrar</button>${pagado || !canManage ? '' : '<button type="button" class="btn btn-outline-primary" data-presupuesto>Guardar presupuesto</button><button type="button" class="btn btn-primary" data-pagar><i class="bi bi-cash-coin me-1"></i>Pagar</button>'}</span>`
          : '<span></span><button type="button" class="btn btn-light" data-cerrar>Cerrar</button>';
      };
      const cuerpoPago = () => ({ month: mes, tipo: 'nomina', key: k, tercero: nombre, tax_id: d0.documento ? `${d0.tipo_documento || 'CC'} ${d0.documento}` : '', cost_center_id: panel.querySelector('[data-centro-pago]')?.value || null, recurring_id: recId,
        items: items.filter((x) => x.concepto && Number(x.valor) > 0).map((x) => ({ concepto: x.concepto, valor: Math.round(Number(x.valor)) })) });
      async function guardarPago(pagar, extra = {}) {
        const body = { ...cuerpoPago(), ...extra, pagar };
        if (!body.items.length) { toast('Ponle valor a al menos un ítem', false); return false; }
        try { const x = await api('/api/finanzas/pagos-mes', { method: 'POST', body }); toast(pagar ? `Pago registrado en Movimientos${x.movimientos > 1 ? ` (${x.movimientos} cuentas)` : ''}` : 'Presupuesto del mes guardado'); sucio = false; await cargarMes(); dibuja(); return true; }
        catch (ex) { toast(ex.message, false); return false; }
      }
      function ventanaPago() {
        const tot = total(); if (!(tot > 0)) return toast('Ponle valor a al menos un ítem', false);
        const efectivo = cuentas.find((a) => a.kind === 'efectivo'), banco = cuentas.find((a) => a.kind === 'banco') || cuentas.find((a) => a !== efectivo);
        let fu = [{ account_id: cuentas[0]?.id || '', valor: tot }];
        const { el, m } = modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Pagar ${pesos(tot)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
          <div class="modal-body"><div class="mb-3"><label class="form-label small mb-1">Fecha del pago</label><input type="date" class="form-control" data-fecha value="${new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10)}"></div>
            <div class="d-flex align-items-center mb-1"><label class="form-label small mb-0 flex-grow-1">De dónde sale</label><button type="button" class="btn btn-sm btn-outline-secondary" data-mitad><i class="bi bi-scissors me-1"></i>Mitad y mitad</button></div>
            <div data-fuentes></div><button type="button" class="btn btn-sm btn-link px-0" data-otra><i class="bi bi-plus-lg me-1"></i>Agregar otra cuenta</button><div class="small mt-1" data-dif></div></div>
          <div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button type="button" class="btn btn-primary" data-ok>Registrar pago</button></div>`);
        const dif = () => tot - fu.reduce((a, f) => a + (Number(f.valor) || 0), 0);
        const estado = () => { const d = dif(); el.querySelector('[data-dif]').innerHTML = d === 0 ? '<span class="text-success"><i class="bi bi-check-circle me-1"></i>Cuadra con el total</span>' : `<span class="text-danger">${d > 0 ? 'Falta' : 'Sobra'} ${pesos(Math.abs(d))} para llegar a ${pesos(tot)}</span>`; el.querySelector('[data-ok]').disabled = d !== 0; };
        const pinta = () => { el.querySelector('[data-fuentes]').innerHTML = fu.map((f, i) => `<div class="input-group mb-2" data-j="${i}"><select class="form-select" data-c aria-label="Cuenta"><option value="">Sin cuenta</option>${cuentas.map((a) => `<option value="${a.id}" ${a.id === f.account_id ? 'selected' : ''}>${esc(a.name)}${a.kind === 'efectivo' ? ' (efectivo)' : ''}</option>`).join('')}</select><span class="input-group-text">$</span><input class="form-control" type="number" min="0" step="1000" data-v value="${f.valor}" aria-label="Valor">${fu.length > 1 ? '<button type="button" class="btn btn-outline-secondary" data-x aria-label="Quitar"><i class="bi bi-x-lg"></i></button>' : ''}</div>`).join(''); estado(); };
        el.addEventListener('input', (e) => { const j = e.target.closest('[data-j]'); if (!j) return; const f = fu[+j.dataset.j]; if (e.target.matches('[data-c]')) f.account_id = e.target.value ? Number(e.target.value) : ''; else f.valor = Math.round(Number(e.target.value) || 0); estado(); });
        el.addEventListener('click', (e) => {
          if (e.target.closest('[data-mitad]')) { const a = Math.floor(tot / 2); fu = [{ account_id: efectivo?.id || '', valor: a }, { account_id: banco?.id || '', valor: tot - a }]; pinta(); }
          if (e.target.closest('[data-otra]')) { fu.push({ account_id: '', valor: 0 }); pinta(); }
          const x = e.target.closest('[data-x]'); if (x) { fu.splice(+x.closest('[data-j]').dataset.j, 1); pinta(); }
        });
        el.querySelector('[data-ok]').addEventListener('click', async (e) => { e.currentTarget.disabled = true; const ok = await guardarPago(true, { fecha: el.querySelector('[data-fecha]').value, fuentes: fu.map((f) => ({ account_id: f.account_id || null, valor: f.valor })) }); if (ok) m.hide(); else e.currentTarget.disabled = false; });
        pinta();
      }
      await cargarMes(); dibuja();
      mo.querySelector('[data-panel]').oninput = (e) => {
        const dd = e.target.dataset?.def;
        if (dd) { def[dd] = dd === 'valor' ? Math.max(0, Math.round(Number(e.target.value) || 0)) : e.target.value; defSucia = true; panel.querySelector('[data-guardar-def]').disabled = false; return; }
        const li = e.target.closest('[data-i]'), f = e.target.dataset?.f;
        if (li && f) {
          const i = +li.dataset.i; items[i][f] = e.target.value; sucio = true;
          const tt = pie.querySelector('[data-total]'); if (tt) tt.textContent = pesos(total());
          for (const g of ['Sueldo', 'Clases', 'Otros']) { const el_ = panel.querySelector(`[data-sub="${g}"]`); if (el_) el_.textContent = pesos(items.filter((x) => grupoDe(x) === g).reduce((a, x) => a + (Number(x.valor) > 0 ? Math.round(Number(x.valor)) : 0), 0)); }
          li.classList.toggle('opacity-75', !(Number(items[i].valor) > 0));
          if (!pie.querySelector('.badge')) tt?.insertAdjacentHTML('afterend', ' <span class="badge text-bg-warning ms-1">Sin guardar</span>');
        } else if (e.target.matches('[data-centro-pago]')) { centroId = Number(e.target.value) || null; sucio = true; }
      };
      panel.onchange = async (e) => {
        if (e.target.matches('[data-mes]')) { if (sucio && !(await confirm({ title: 'Hay cambios sin guardar', text: 'Si cambias de mes, se pierden.', ok: 'Cambiar de mes' }))) { e.target.value = mes; return; } mes = e.target.value || mes; sucio = false; await cargarMes(); dibuja(); }
      };
      if (mo._nom) mo.removeEventListener('click', mo._nom);   // al volver a la pestaña no se duplican los clics
      mo._nom = async (e) => {
        if (!mo.querySelector('[data-tab="nomina"]')?.classList.contains('active')) return;
        if (e.target.closest('[data-guardar-def]')) {
          try { await api(`/api/team/nomina/${encodeURIComponent(k)}`, { method: 'PUT', body: { valor: def.valor || 0, periodicidad: def.periodicidad, centro_costo: def.centro || null, notas: d0.notas || null } });
            Object.assign(d0, { valor: def.valor, periodicidad: def.periodicidad, centro_costo: def.centro }); defSucia = false; toast('Guardado. Ya está en Finanzas como gasto de nómina');
            if (finanzasOn) { recId = (await api('/api/finanzas/recurring?limit=500').then((x) => x.rows).catch(() => [])).find((x) => x.ref === `academia:nomina:${k}`)?.id || recId; if (!plan && !sucio) { await cargarMes(); } } dibuja(); }
          catch (ex) { toast(ex.message, false); } return;
        }
        if (e.target.closest('[data-mas]')) { items.push({ concepto: '', valor: '', grupo: 'Otros' }); sucio = true; dibuja(); return; }
        const q = e.target.closest('[data-quitar]'); if (q) { items.splice(+q.closest('[data-i]').dataset.i, 1); sucio = true; dibuja(); return; }
        if (e.target.closest('[data-presupuesto]')) { await guardarPago(false); return; }
        if (e.target.closest('[data-pagar]')) ventanaPago();
      };
      mo.addEventListener('click', mo._nom);
    }
    m_.show();
    mo.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    tab === 'nomina' && me.canManage ? pestanaNomina() : pestanaDatos();
  }

  inviteBtn.onclick = () => invitar();
  profBtn.onclick = () => AC.fichaProfesional({ row: null, areas, changed: load });

  list.addEventListener('change', async (e) => {
    const s = e.target.closest('[data-role]'); if (!s) return;
    try { await api(`/api/team/${s.dataset.role}`, { method: 'PATCH', body: { role: s.value } }); toast('Rol actualizado'); load(); } catch (ex) { toast(ex.message, false); load(); }
  });
  list.addEventListener('click', async (e) => {
    const l = e.target.closest('[data-link]'), d = e.target.closest('[data-del]'), mo = e.target.closest('[data-mods]'), fi = e.target.closest('[data-ficha]'), hp = e.target.closest('[data-hacerprof]'), qp = e.target.closest('[data-quitarprof]'), da = e.target.closest('[data-dar]');
    const ed = e.target.closest('[data-editar]');
    if (ed) { const r_ = rows().find((x) => personaKey(x) === ed.dataset.editar); if (r_) editarPersona(r_); return; }
    try {
      if (fi) AC.fichaProfesional({ row: profs.find((p) => p.id === +fi.dataset.ficha), areas, changed: load });
      if (hp) {
        const u = users.find((x) => x.id === hp.dataset.hacerprof);
        const r = await api('/api/profesionales/profesionales', { method: 'POST', body: { nombre: u.name || u.email, email: u.email, activo: true } });
        toast('Ahora también es profesional'); await load();
        const row = profs.find((p) => p.id === (r.id ?? r.row?.id)) || profs.find((p) => key(p.email) === key(u.email));
        if (row) AC.fichaProfesional({ row, areas, changed: load });   // para ponerle áreas y horario
      }
      if (qp) {
        const p = profs.find((x) => x.id === +qp.dataset.quitarprof);
        if (await confirm({ title: `¿Quitar a ${p.nombre} como profesional?`, text: 'Conserva su acceso a la app. Los cursos que dicta quedan sin profesional.', ok: 'Quitar' })) {
          await api(`/api/profesionales/profesionales/${p.id}`, { method: 'DELETE' }); toast('Ya no es profesional'); load();
        }
      }
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
  load().then(() => { const m = /^#pago:(.+)$/.exec(location.hash); if (m && me.canManage) { const r_ = rows().find((x) => personaKey(x) === decodeURIComponent(m[1])); if (r_) { history.replaceState(null, '', location.pathname + location.search); editarPersona(r_, 'nomina'); } } });
});
