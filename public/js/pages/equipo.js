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
      ...(me.canManage ? [{ label: 'Documento y celular', html: (r) => { const d = datos.get(personaKey(r)), tel = d?.celular || r.prof?.telefono;
        return d?.documento || tel ? `${d?.documento ? `<div><span class="badge text-bg-light">${esc(d.tipo_documento || 'CC')}</span> ${esc(d.documento)}</div>` : ''}${tel ? `<div class="small text-body-secondary">Cel ${esc(tel)}</div>` : ''}` : '<span class="text-body-secondary">—</span>'; } }] : []),
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
          me.canManage ? `<button class="btn btn-sm btn-outline-primary" data-editar="${esc(personaKey(r))}" title="Info: datos${r.prof ? ', áreas, niveles y horario' : ' y si es profesional'}" aria-label="Info de la persona"><i class="bi bi-mortarboard"></i></button>` : '',
          me.canManage && finanzasOn ? `<button class="btn btn-sm btn-outline-success" data-nomina="${esc(personaKey(r))}" title="Nómina: lo que se le paga" aria-label="Nómina"><i class="bi bi-currency-dollar"></i></button>` : '',
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
      <div class="modal-header"><div class="flex-grow-1"><h2 class="modal-title h5 mb-0">${tab === 'nomina' ? 'Nómina' : 'Info'} · ${esc(nombre)}</h2><div class="small text-body-secondary">${esc(d0.detalle || '')}</div></div><button type="button" class="btn-close" data-cerrar aria-label="Cerrar"></button></div>
      <div class="modal-body"><div data-panel></div></div>
      <div class="modal-footer justify-content-between" data-pie></div></div></div>`;
    document.body.appendChild(mo);
    const m_ = new bootstrap.Modal(mo, { backdrop: 'static', keyboard: false });
    mo.addEventListener('hidden.bs.modal', () => { mo.remove(); load(); });
    const panel = mo.querySelector('[data-panel]'), pie = mo.querySelector('[data-pie]');
    let sucio = false;
    const cerrar = async () => { if (sucio && !(await confirm({ title: 'Hay cambios sin guardar', text: 'Si cierras, se pierden.', ok: 'Cerrar sin guardar' }))) return; m_.hide(); };
    mo.addEventListener('click', (e) => { if (e.target.closest('[data-cerrar]')) cerrar(); });
    /* -- Info: datos y, si es profesional, sus áreas, niveles y horario (van juntos; sin marcar no lo es) -- */
    function pestanaDatos() {
      panel.innerHTML = `<form class="row g-3" data-form><div class="col-md-6"><label class="form-label small mb-1">Nombre</label><input class="form-control" name="nombre" value="${esc(nombre)}" maxlength="100" required></div>
        <div class="col-md-6"><label class="form-label small mb-1">Correo</label><input class="form-control" value="${esc(r.user?.email || r.prof?.email || '')}" disabled></div>
        <div class="col-md-4"><label class="form-label small mb-1">Tipo de documento</label><select class="form-select" name="tipo_documento">${Object.entries(TIPOS_DOC).map(([v, l]) => `<option value="${v}" ${v === (d0.tipo_documento || 'CC') ? 'selected' : ''}>${v} · ${l}</option>`).join('')}</select></div>
        <div class="col-md-4"><label class="form-label small mb-1">Número (cédula o NIT)</label><input class="form-control" name="documento" value="${esc(d0.documento || '')}" maxlength="40" placeholder="Ej.: 1020304050"></div>
        <div class="col-md-4"><label class="form-label small mb-1">Celular</label><input class="form-control" name="celular" type="tel" value="${esc(d0.celular || '')}" maxlength="30" placeholder="Ej.: 300 123 4567"></div></form>
        <div class="form-check form-switch mt-3"><input class="form-check-input" type="checkbox" id="esprof" data-esprof ${r.prof ? 'checked' : ''}><label class="form-check-label" for="esprof">Es profesional (docente)</label></div>
        <div class="mt-2" data-prof ${r.prof ? '' : 'hidden'}></div>`;
      const getC = AC.profCampos(panel.querySelector('[data-prof]'), r.prof || { areas: [], horario: [] }, areas);
      panel.querySelector('[data-esprof]').addEventListener('change', (e) => { panel.querySelector('[data-prof]').hidden = !e.target.checked; sucio = true; });
      panel.addEventListener('change', () => { sucio = true; });
      pie.innerHTML = `<span></span><span class="d-flex gap-2"><button type="button" class="btn btn-light" data-cerrar>Cerrar</button><button type="button" class="btn btn-primary" data-guardar-datos>Guardar datos</button></span>`;
      panel.querySelector('[data-form]').addEventListener('input', () => { sucio = true; });
      pie.querySelector('[data-guardar-datos]').onclick = async () => {
        const f = panel.querySelector('[data-form]'); if (!f.checkValidity()) return f.reportValidity();
        const esProf = panel.querySelector('[data-esprof]').checked;
        if (!esProf && r.prof && !(await confirm({ title: `¿Quitar a ${nombre} como profesional?`, text: 'Conserva su acceso a la app. Los cursos que dicta quedan sin profesional.', ok: 'Quitar' }))) return;
        try {
          await api(`/api/team/persona/${encodeURIComponent(k)}`, { method: 'PUT', body: { nombre: f.elements.nombre.value, tipo_documento: f.elements.tipo_documento.value, documento: f.elements.documento.value, celular: f.elements.celular.value } });
          if (esProf) {
            const body = { ...getC(), nombre: f.elements.nombre.value, email: r.user?.email || r.prof?.email || '', telefono: r.prof?.telefono || f.elements.celular.value, activo: true };
            if (r.prof) await api(`/api/profesionales/profesionales/${r.prof.id}`, { method: 'PATCH', body: { ...body, telefono: r.prof.telefono || f.elements.celular.value, activo: !!r.prof.activo } });
            else await api('/api/profesionales/profesionales', { method: 'POST', body });
          } else if (r.prof) await api(`/api/profesionales/profesionales/${r.prof.id}`, { method: 'DELETE' });
          sucio = false; toast('Guardado'); m_.hide();
        } catch (ex) { toast(ex.message, false); }
      };
    }

    /* -- Nómina: solo los ítems (el pago se hace en Finanzas) -- */
    async function pestanaNomina() {
      panel.innerHTML = '<p class="text-body-secondary">Cargando…</p>'; pie.innerHTML = '<span></span><button type="button" class="btn btn-light" data-cerrar>Cerrar</button>';
      const centros = await api('/api/finanzas/cost_centers?limit=200').then((x) => x.rows).catch(() => []);
      let def = { periodicidad: d0.periodicidad || 'mensual', centro: d0.centro_costo || '' };
      let mes = hoyMes(), plan = null, pagado = null, items = [], centroId = null;
      const centroDe = (nombreC) => centros.find((x) => x.name.toLowerCase() === String(nombreC || '').toLowerCase())?.id ?? null;
      const total = () => items.reduce((a, x) => a + (Number(x.valor) > 0 ? Math.round(Number(x.valor)) : 0), 0);
      const mesAnterior = (m) => { const [y, mm] = m.split('-').map(Number), t = y * 12 + mm - 2; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };

      // Los ítems del mes: los guardados, o los de siempre (los del mes anterior) más las clases que dicta, para ponerles valor
      async function cargarMes() {
        const pm = await api(`/api/finanzas/pagos-mes?month=${mes}`).catch(() => ({ planes: [], pagados: [] }));
        plan = pm.planes.find((x) => x.tipo === 'nomina' && x.key === k) || null; pagado = pm.pagados.find((x) => x.tipo === 'nomina' && x.key === refKey(k)) || null;
        if (plan) { items = plan.items.map((x) => ({ ...x })); centroId = plan.cost_center_id; return; }
        const prev = (await api(`/api/finanzas/pagos-mes?month=${mesAnterior(mes)}`).catch(() => ({ planes: [] }))).planes.find((x) => x.tipo === 'nomina' && x.key === k)?.items || [];
        const clasePrev = prev.find((x) => /^Clase \d+/.test(x.concepto || ''))?.valor || '';
        items = prev.filter((x) => !/^Clase \d+/.test(x.concepto || '')).map((x) => ({ concepto: x.concepto, valor: x.valor })); centroId = centroDe(def.centro);
        if (d0.profesional_id || r.prof) {
          const cl = await api(`/api/team/nomina/clases?profesional=${d0.profesional_id || r.prof.id}&month=${mes}`).then((x) => x.clases).catch(() => []);
          for (const c_ of cl) items.push({ auto: true, concepto: `Clase ${c_.n} · ${c_.curso}`, detalle: `${c_.fecha}${c_.ini ? ` · ${c_.ini}` : ''}`, valor: clasePrev });
        }
      }
      const dibuja = () => {
        const bloqueado = !!pagado;
        panel.innerHTML = `<div class="row g-2 mb-3 align-items-end"><div class="col-md-3"><label class="form-label small mb-1">Cada</label><select class="form-select" data-def="periodicidad" ${bloqueado ? 'disabled' : ''}>${Object.entries(PERIODOS).map(([v, l]) => `<option value="${v}" ${v === def.periodicidad ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            <div class="col-md-5"><label class="form-label small mb-1">Centro de costo</label><select class="form-select" data-centro-pago ${bloqueado ? 'disabled' : ''}><option value="">Sin centro de costo</option>${centros.map((x) => `<option value="${x.id}" ${x.id === centroId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
            <div class="col-md-4"><label class="form-label small mb-1">Mes</label><input type="month" class="form-control" data-mes value="${mes}"></div></div>
          ${pagado ? `<div class="alert alert-success py-2"><i class="bi bi-check-circle-fill me-1"></i><b>Pagado ${pesos(pagado.total)}</b> este mes. Los ítems quedan cerrados.</div>` : ''}
          ${!d0.documento ? '<div class="alert alert-warning py-2 small"><i class="bi bi-exclamation-triangle me-1"></i>Le falta la cédula o NIT: ponla en <b>Info</b> (el birrete) para que salga en su documento de pago.</div>' : ''}
          <div class="d-flex align-items-baseline gap-2 mb-2"><h3 class="h6 mb-0">Ítems</h3><span class="small text-body-secondary">El total cubre todo el mes${def.periodicidad === 'semanal' ? ': se paga en 4 partes, una por semana' : def.periodicidad === 'quincenal' ? ': se paga en 2 partes, una por quincena' : ''}. Los ítems sin valor no cuentan.</span></div>
          <ul class="list-group mb-2">${items.map((x, i) => { const auto = x.auto || /^Clase \d+ · /.test(x.concepto || '');
            return `<li class="list-group-item d-flex flex-wrap align-items-center gap-2 ${Number(x.valor) > 0 ? '' : 'opacity-75'}" data-i="${i}"><div class="flex-grow-1" style="min-width:180px">${auto ? `<div class="fw-semibold">${esc(x.concepto)}</div>${x.detalle ? `<div class="small text-body-secondary">${esc(x.detalle)}</div>` : ''}` : `<input class="form-control form-control-sm" data-f="concepto" value="${esc(x.concepto)}" maxlength="200" placeholder="Sueldo, bono, auxilio…" ${bloqueado ? 'disabled' : ''} aria-label="Concepto">`}</div>
              <div class="input-group input-group-sm" style="width:170px"><span class="input-group-text">$</span><input class="form-control" type="number" min="0" step="1000" data-f="valor" value="${x.valor || ''}" placeholder="Sin valor" ${bloqueado ? 'disabled' : ''} aria-label="Valor"></div>
              ${bloqueado ? '<span style="width:2rem"></span>' : '<button type="button" class="btn btn-sm btn-light" data-quitar aria-label="Quitar"><i class="bi bi-x-lg"></i></button>'}</li>`; }).join('') || '<li class="list-group-item text-body-secondary small">Aún no hay ítems.</li>'}</ul>
          ${bloqueado ? '' : '<button type="button" class="btn btn-sm btn-outline-secondary" data-mas><i class="bi bi-plus-lg me-1"></i>Agregar ítem</button>'}`;
        pie.innerHTML = `<span>Total del mes: <b data-total>${pesos(total())}</b>${sucio ? ' <span class="badge text-bg-warning ms-1">Sin guardar</span>' : ''}</span><span class="d-flex gap-2"><button type="button" class="btn btn-light" data-cerrar>Cerrar</button>${pagado || !canManage ? '' : '<button type="button" class="btn btn-outline-primary" data-guardar-items>Guardar</button><button type="button" class="btn btn-primary" data-pagar-fin><i class="bi bi-box-arrow-up-right me-1"></i>Pagar en Finanzas</button>'}</span>`;
      };
      // Guarda los ítems del mes (plan y presupuesto en Finanzas) y lo que se le paga (total, cada cuánto y centro de costo) en la nómina de la persona
      async function guardarItems() {
        const its = items.filter((x) => x.concepto && Number(x.valor) > 0).map((x) => ({ concepto: x.concepto, valor: Math.round(Number(x.valor)) }));
        if (!its.length) { toast('Ponle valor a al menos un ítem', false); return false; }
        const cid = panel.querySelector('[data-centro-pago]')?.value || '', cname = centros.find((x) => String(x.id) === cid)?.name || '';
        try {
          await api('/api/finanzas/pagos-mes', { method: 'POST', body: { month: mes, tipo: 'nomina', key: k, tercero: nombre, tax_id: d0.documento ? `${d0.tipo_documento || 'CC'} ${d0.documento}` : '', cost_center_id: cid || null, items: its, pagar: false } });
          await api(`/api/team/nomina/${encodeURIComponent(k)}`, { method: 'PUT', body: { valor: total(), periodicidad: def.periodicidad, centro_costo: cname || null, notas: d0.notas || null } });
          Object.assign(d0, { valor: total(), periodicidad: def.periodicidad, centro_costo: cname }); def.centro = cname; sucio = false; toast('Ítems guardados. Ya está en Finanzas para pagar'); await cargarMes(); dibuja(); return true;
        } catch (ex) { toast(ex.message, false); return false; }
      }
      await cargarMes(); dibuja();
      panel.oninput = (e) => {
        const dd = e.target.dataset?.def;
        if (dd) { def[dd] = e.target.value; sucio = true; if (!plan && !items.some((x) => Number(x.valor) > 0)) { cargarMes().then(dibuja); } else { const tt = pie.querySelector('[data-total]'); if (tt && !pie.querySelector('.badge')) tt.insertAdjacentHTML('afterend', ' <span class="badge text-bg-warning ms-1">Sin guardar</span>'); } return; }
        const li = e.target.closest('[data-i]'), f = e.target.dataset?.f;
        if (li && f) {
          const i = +li.dataset.i; items[i][f] = e.target.value; sucio = true;
          const tt = pie.querySelector('[data-total]'); if (tt) tt.textContent = pesos(total());
          li.classList.toggle('opacity-75', !(Number(items[i].valor) > 0));
          if (!pie.querySelector('.badge')) tt?.insertAdjacentHTML('afterend', ' <span class="badge text-bg-warning ms-1">Sin guardar</span>');
        } else if (e.target.matches('[data-centro-pago]')) { centroId = Number(e.target.value) || null; sucio = true; }
      };
      panel.onchange = async (e) => {
        if (e.target.matches('[data-mes]')) { if (sucio && !(await confirm({ title: 'Hay cambios sin guardar', text: 'Si cambias de mes, se pierden.', ok: 'Cambiar de mes' }))) { e.target.value = mes; return; } mes = e.target.value || mes; sucio = false; await cargarMes(); dibuja(); }
      };
      if (mo._nom) mo.removeEventListener('click', mo._nom);   // al volver a la pestaña no se duplican los clics
      mo._nom = async (e) => {
        if (e.target.closest('[data-mas]')) { items.push({ concepto: '', valor: '' }); sucio = true; dibuja(); return; }
        const q = e.target.closest('[data-quitar]'); if (q) { items.splice(+q.closest('[data-i]').dataset.i, 1); sucio = true; dibuja(); return; }
        if (e.target.closest('[data-guardar-items]')) { await guardarItems(); return; }
        if (e.target.closest('[data-pagar-fin]')) {   // el pago se hace en Finanzas: se guardan los ítems y se abre su pago
          if (!(await guardarItems())) return;
          const rec = (await api('/api/finanzas/recurring?limit=500').then((x) => x.rows).catch(() => [])).find((x) => x.ref === `academia:nomina:${k}`);
          sucio = false; location.href = rec ? `/staff/finanzas.html#pagar:${rec.id}` : '/staff/finanzas.html#recurrentes';
        }
      };
      mo.addEventListener('click', mo._nom);
    }
    m_.show();
    tab === 'nomina' && me.canManage && finanzasOn ? pestanaNomina() : pestanaDatos();
  }

  inviteBtn.onclick = () => invitar();
  profBtn.onclick = () => AC.fichaProfesional({ row: null, areas, changed: load });

  list.addEventListener('change', async (e) => {
    const s = e.target.closest('[data-role]'); if (!s) return;
    try { await api(`/api/team/${s.dataset.role}`, { method: 'PATCH', body: { role: s.value } }); toast('Rol actualizado'); load(); } catch (ex) { toast(ex.message, false); load(); }
  });
  list.addEventListener('click', async (e) => {
    const l = e.target.closest('[data-link]'), d = e.target.closest('[data-del]'), mo = e.target.closest('[data-mods]'), fi = e.target.closest('[data-ficha]'), da = e.target.closest('[data-dar]');
    const ed = e.target.closest('[data-editar]');
    if (ed) { const r_ = rows().find((x) => personaKey(x) === ed.dataset.editar); if (r_) editarPersona(r_); return; }
    const nm = e.target.closest('[data-nomina]');
    if (nm) { const r_ = rows().find((x) => personaKey(x) === nm.dataset.nomina); if (r_) editarPersona(r_, 'nomina'); return; }
    try {
      if (fi) AC.fichaProfesional({ row: profs.find((p) => p.id === +fi.dataset.ficha), areas, changed: load });
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
