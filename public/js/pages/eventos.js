// Eventos: se maneja todo desde el calendario del mes (crear, editar, borrar y asistentes). Cupo y precio, asistentes por evento (con lista de espera y cobro) y enlace a la página pública de inscripción.
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, modal } = window.App;
  const C = window.App.Crud;
  // Cabecera del módulo: el agente, las estadísticas en líneas pequeñas y el chat (si no carga, tarjetas como antes)
  const cabeceraAgente = async (el, modulo, tiles) => { if (!window.DwAgenteMod) await new Promise((ok) => { const s = document.createElement('script'); s.src = '/m/agentemod.js'; s.onload = s.onerror = ok; document.head.appendChild(s); }); return window.DwAgenteMod ? window.DwAgenteMod.montar(el, { modulo, stats: tiles }) : C.kpis(el, tiles); };
  const view = document.querySelector('[data-view]');
  const RO = me.business.readOnly;
  const [cursos, estudiantes] = await Promise.all([AC.listas.cursos(), AC.listas.estudiantes()]);
  const publico = `${location.origin}/${me.business.slug}/eventos`;
  const TIPOS = ['General', 'Semanal', 'Cultural', 'Charla', 'Taller', 'Feria'];
  const ESTADO = { inscrito: ['ok', 'Inscrito'], espera: ['soon', 'En espera'], asistio: ['ok', 'Asistió'], no_asistio: ['free', 'No asistió'] };

  function asistentes(ev, changed) {
    const { el } = modal(`<div class="modal-header border-0 pb-0"><div><h2 class="modal-title h5">${esc(ev.titulo)}</h2><div class="small text-body-secondary">${C.day(ev.fecha)}${ev.hora_ini ? ` · ${esc(ev.hora_ini)}` : ''} · cupo ${ev.cupo || 'sin límite'}</div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><div data-t></div></div>`, { size: 'modal-xl' });
    el.addEventListener('hidden.bs.modal', changed);
    const t = C.table({ el: el.querySelector('[data-t]'), base: '/api/eventos', entity: 'asistentes', title: 'asistente', newText: 'Inscribir', readOnly: RO, fixed: { evento_id: ev.id }, emptyIcon: 'bi-people', empty: 'Aún no hay inscritos.',
      defaults: () => ({ evento_id: ev.id }),
      filters: [{ k: 'estado', options: [['', 'Todos'], ['inscrito', 'Inscritos'], ['espera', 'En espera'], ['asistio', 'Asistieron'], ['no_asistio', 'No asistieron']] }],
      fields: [{ k: 'estudiante_id', label: 'Estudiante', type: 'select', options: AC.opts(estudiantes, 'Otra persona'), hint: 'o escribe los datos' }, { k: 'nombre', label: 'Nombre', type: 'text' }, { k: 'telefono', label: 'Celular', type: 'text' }, { k: 'email', label: 'Correo', type: 'email' },
        { k: 'estado', label: 'Estado', type: 'select', options: Object.entries(ESTADO).map(([v, [, l]]) => [v, l]) }, { k: 'nota', label: 'Nota', type: 'long' }],
      columns: [{ label: 'Nombre', main: true, html: (r) => `${esc(r.nombre)}<div class="small text-body-secondary fw-normal">${esc([r.telefono, r.email].filter(Boolean).join(' · '))}</div>` },
        { label: 'Estado', html: (r) => C.chip(...(ESTADO[r.estado] || ESTADO.inscrito)) }, { label: 'Pago', html: (r) => (ev.precio > 0 ? `${AC.chipCobro(r.cobro)}` : '<span class="text-body-secondary">Gratis</span>') }],
      rowActions: (r) => `${r.estado !== 'asistio' ? `<button class="btn btn-sm btn-light" data-act="asistio" title="Marcar asistencia"><i class="bi bi-check2-circle"></i></button>` : ''}${ev.precio > 0 && !RO ? ` <button class="btn btn-sm btn-outline-primary" data-act="cobro"><i class="bi bi-cash"></i> Cobro</button>` : ''}`,
      onAction: async (a, r) => {
        if (a === 'asistio') { try { await api(`/api/eventos/asistentes/${r.id}`, { method: 'PATCH', body: { estado: 'asistio' } }); t.load(); } catch (x) { toast(x.message, false); } }
        if (a === 'cobro') AC.cobros({ base: '/api/eventos/asistentes', id: r.id, titulo: `${r.nombre} · ${ev.titulo}`, changed: () => t.load() });
      } });
    t.load();
  }

  const CAMPOS = [{ k: 'titulo', label: 'Título', type: 'text', required: true, full: true }, { k: 'tipo', label: 'Tipo', type: 'select', options: TIPOS.map((x) => [x, x]) }, { k: 'fecha', label: 'Fecha', type: 'date', required: true },
        { k: 'hora_ini', label: 'Hora de inicio', type: 'text', placeholder: '18:30' }, { k: 'hora_fin', label: 'Hora de fin', type: 'text', placeholder: '20:00' }, { k: 'lugar', label: 'Lugar', type: 'text' }, { k: 'enlace', label: 'Enlace (si es virtual)', type: 'url' },
        { k: 'cupo', label: 'Cupo', type: 'int', hint: '0 = sin límite' }, { k: 'precio', label: 'Precio', type: 'money', hint: '0 = gratis' }, { k: 'curso_id', label: 'Curso (opcional)', type: 'select', options: AC.opts(cursos, '—') },
        { k: 'estado', label: 'Estado', type: 'select', options: [['abierto', 'Abierto'], ['cancelado', 'Cancelado']] }, { k: 'repetir_semanas', label: 'Repetir cada semana', type: 'int', hint: 'cuántas semanas más (solo al crear)' },
        { k: 'publico', label: 'Visible', type: 'bool', check: 'Aparece en la página pública' }, { k: 'descripcion', label: 'Descripción', type: 'long' }];

  // El mes completo con los eventos de cada día (mismo formato que el calendario de Cursos). Tocar un día vacío crea un evento ese día; tocar un evento abre sus opciones.
  function calendario(host) {
    const mas = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
    const lunes = (iso) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
    const mesMas = (ym, n) => { const d = new Date(`${ym}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
    const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    let ym = C.todayCo().slice(0, 7), rows = [];
    host.innerHTML = `<div class="d-flex align-items-center gap-2 mb-3"><button class="btn btn-light" data-prev aria-label="Mes anterior"><i class="bi bi-chevron-left"></i></button>
      <b class="flex-grow-1 text-center text-capitalize" data-rango></b><button class="btn btn-light" data-hoy>Hoy</button><button class="btn btn-light" data-next aria-label="Mes siguiente"><i class="bi bi-chevron-right"></i></button>${RO ? '' : '<button class="btn btn-primary ms-2" data-nuevo><i class="bi bi-plus-lg me-1"></i>Nuevo evento</button>'}<button class="btn btn-outline-secondary" data-pub title="Copiar la dirección de la página pública"><i class="bi bi-link-45deg me-1"></i>Página pública</button></div><div data-cal></div>`;
    const pintar = () => {
      const hoy = C.todayCo(), primero = `${ym}-01`, ultimo = mas(`${mesMas(ym, 1)}-01`, -1), desde = lunes(primero), hasta = mas(lunes(ultimo), 6);
      host.querySelector('[data-rango]').textContent = new Date(`${primero}T12:00:00Z`).toLocaleDateString('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      const semanas = Math.round((Date.parse(hasta) - Date.parse(desde)) / 864e5 + 1) / 7;
      const celda = (f) => {
        const ev = rows.filter((x) => x.fecha === f).sort((p, q) => String(p.hora_ini || '').localeCompare(String(q.hora_ini || '')));
        const fuera = !f.startsWith(ym);
        return `<td class="${f === hoy ? 'hoy' : ''} ${fuera ? 'fuera' : ''} ${ev.length ? '' : 'vacio'}" data-f="${f}" data-dia="${DIAS[new Date(`${f}T12:00:00Z`).getUTCDay()]} ${+f.slice(8)}">
          <div class="dw-mes-n">${+f.slice(8)}</div>${ev.map((x) => `<a class="dw-ev dw-ev--mini${x.estado === 'cancelado' ? ' dw-ev--repo' : ''}" href="#" data-ev="${x.id}" title="${esc(x.titulo)} · ${x.inscritos}/${x.cupo || '∞'} inscritos"><b>${esc(x.hora_ini || '')}</b> ${esc(x.titulo)}</a>`).join('')}${ev.length > 3 ? `<button type="button" class="dw-mas btn btn-link btn-sm p-0" data-mas>+${ev.length - 3} más</button>` : ''}</td>`;
      };
      host.querySelector('[data-cal]').innerHTML = `<table class="dw-semana dw-mes" data-dt="off"><thead><tr>${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((x) => `<th>${x}</th>`).join('')}</tr></thead>
        <tbody>${Array.from({ length: semanas }, (_, w) => `<tr>${Array.from({ length: 7 }, (_, i) => celda(mas(desde, w * 7 + i))).join('')}</tr>`).join('')}</tbody></table>
        ${rows.some((x) => x.fecha >= desde && x.fecha <= hasta) ? '' : '<div class="small text-body-secondary mt-2">No hay eventos este mes.</div>'}`;
    };
    host.addEventListener('click', (e) => {
      const m = e.target.closest('[data-mas]'); if (m) { const td = m.closest('td'); td.classList.toggle('abierto'); m.textContent = td.classList.contains('abierto') ? 'Ver menos' : `+${td.querySelectorAll('.dw-ev').length - 3} más`; return; }
      const a = e.target.closest('[data-ev]'); if (a) { e.preventDefault(); const ev = rows.find((x) => x.id === Number(a.dataset.ev)); if (ev) opciones(ev); return; }
      const td = e.target.closest('td[data-f]'); if (td && !RO && !e.target.closest('button')) editar(null, td.dataset.f);
    });
    host.querySelector('[data-nuevo]')?.addEventListener('click', () => editar(null, C.todayCo()));
    host.querySelector('[data-pub]').addEventListener('click', () => navigator.clipboard?.writeText(publico).then(() => toast('Dirección copiada: ' + publico)).catch(() => toast(publico)));
    // Crear / editar / borrar un evento en una ventana (todo parte del calendario)
    async function editar(row, fecha) {
      const out = await C.form({ title: row ? 'Editar evento' : 'Nuevo evento', fields: CAMPOS, values: row ? { ...row } : { tipo: 'General', publico: true, fecha: fecha || C.todayCo() }, base: '/api/eventos',
        onDelete: row && me.canManage ? () => api(`/api/eventos/eventos/${row.id}`, { method: 'DELETE' }) : null });
      if (out === 'deleted') { toast('Evento borrado'); return cargar(); }
      if (!out) return;
      try { await api(row ? `/api/eventos/eventos/${row.id}` : '/api/eventos/eventos', { method: row ? 'PATCH' : 'POST', body: out }); toast(row ? 'Guardado' : 'Evento creado'); cargar(); } catch (x) { toast(x.message, false); }
    }
    // Un evento: resumen y qué hacer con él
    function opciones(ev) {
      const { el, m } = modal(`<div class="modal-header border-0 pb-0"><div><h2 class="modal-title h5">${esc(ev.titulo)} <span class="badge text-bg-light">${esc(ev.tipo)}</span></h2><div class="small text-body-secondary">${C.day(ev.fecha)}${ev.hora_ini ? ` · ${esc([ev.hora_ini, ev.hora_fin].filter(Boolean).join('–'))}` : ''}${ev.lugar ? ` · ${esc(ev.lugar)}` : ev.enlace ? ' · Virtual' : ''}</div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
        <div class="modal-body"><div class="d-flex flex-wrap gap-3 mb-3"><span><b>${ev.inscritos}</b>/${ev.cupo || '∞'} inscritos</span>${ev.espera ? `<span class="badge text-bg-warning align-self-center">${ev.espera} en espera</span>` : ''}<span>${ev.precio > 0 ? C.money(ev.precio) : 'Gratis'}</span>${ev.estado === 'cancelado' ? C.chip('bad', 'Cancelado') : C.chip('ok', 'Abierto')}</div>
          ${ev.descripcion ? `<p class="small text-body-secondary">${esc(ev.descripcion)}</p>` : ''}
          <div class="d-flex flex-wrap gap-2"><button class="btn btn-primary" data-a="asis"><i class="bi bi-people me-1"></i>Asistentes</button>${RO ? '' : '<button class="btn btn-outline-secondary" data-a="edit"><i class="bi bi-pencil me-1"></i>Editar evento</button>'}</div></div>`, {});
      el.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (!b) return; m.hide(); setTimeout(() => (b.dataset.a === 'asis' ? asistentes(ev, cargar) : editar(ev)), 250); });
    }
    host.querySelector('[data-prev]').onclick = () => { ym = mesMas(ym, -1); pintar(); };
    host.querySelector('[data-next]').onclick = () => { ym = mesMas(ym, 1); pintar(); };
    host.querySelector('[data-hoy]').onclick = () => { ym = C.todayCo().slice(0, 7); pintar(); };
    async function cargar() { rows = (await api('/api/eventos/eventos?limit=1000')).rows || []; pintar(); }
    return cargar();
  }

  view.innerHTML = '<div data-kpis class="row g-2 mb-3"></div><div data-calendario></div>';
  const resumen = () => api('/api/eventos/resumen').then((r) => cabeceraAgente(view.querySelector('[data-kpis]'), 'eventos', [
    ['Eventos próximos', r.eventos_proximos, '', 'bi-calendar-event'], ['Inscritos próximos', r.inscritos_proximos, '', 'bi-people'],
    ['Asistencias del mes', r.asistencias_mes, '', 'bi-check2-circle'], ['En lista de espera', r.en_espera, '', 'bi-hourglass-split']])).catch(() => {});
  resumen();
  calendario(view.querySelector('[data-calendario]'));
});
