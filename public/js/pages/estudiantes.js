// Estudiantes (o alumnas, aprendices… según el rubro): lista, buscar, crear y editar; la ficha muestra sus cursos, avance y pagos.
// Aquí también viven las Matrículas y los Comprobantes (pestañas, de matriculas.js): sin el permiso de Matrículas no se ven los valores.
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { esc } = window.App;
  const C = window.App.Crud;
  const cfg = await AC.cfg();
  const S = cfg.termS, P = AC.cap(cfg.termP);
  document.querySelector('[data-h1]').textContent = P;
  const tabla = (host) => {
  document.querySelector('[data-acciones]').innerHTML = '';
  host.innerHTML = '<div data-tabla></div>';
  const T = C.table({ el: host.querySelector('[data-tabla]'), base: '/api/estudiantes', entity: 'estudiantes', title: S, newText: `Nuevo ${S}`, emptyIcon: 'bi-people', empty: `Aún no hay ${cfg.termP}. Registra el primero.`,
    filters: [{ k: 'activo', options: [['', 'Todos'], ['1', 'Activos'], ['0', 'Inactivos']] }],
    fields: [{ k: 'nombre', label: 'Nombre completo', required: true, full: true }, { k: 'documento', label: 'Documento' }, { k: 'telefono', label: 'Teléfono / WhatsApp' },
      { k: 'email', label: 'Correo', type: 'email' }, { k: 'origen', label: '¿Cómo nos conoció?', placeholder: 'Instagram, referido…' }, { k: 'notas', label: 'Notas', type: 'long' },
      { k: 'activo', label: 'Estado', type: 'bool', check: 'Activo', default: true }],
    columns: [
      { label: 'Nombre', main: true, html: (r) => `${esc(r.nombre)}${r.documento ? `<div class="text-body-secondary fw-normal" style="font-size:.75rem">CC ${esc(r.documento)}</div>` : ''}${r.en_mora ? ` <div class="mt-1">${C.chip('bad', `En mora${r.mora_dias ? ` · ${r.mora_dias} d` : ''}`)}${r.baja_asistencia ? ` ${C.chip('soon', `Asistencia ${r.asistencia_pct}%`)}` : ''}</div>` : (r.baja_asistencia ? ` <div class="mt-1">${C.chip('soon', `Asistencia ${r.asistencia_pct}%`)}</div>` : '')}` },
      { label: 'Teléfono', html: (r) => (r.telefono ? `<a href="https://wa.me/57${esc(String(r.telefono).replace(/\D/g, '').slice(-10))}" target="_blank" rel="noopener"><i class="bi bi-whatsapp me-1"></i>${esc(r.telefono)}</a>` : '—') },
      { label: 'Origen', html: (r) => esc(r.origen || '—') },
      { label: 'Estado', html: (r) => (r.activo ? C.chip('ok', 'Activo') : C.chip('free', 'Inactivo')) }],
    rowActions: (r) => `${me.canManage ? `${AC.botonesAcceso(r.acceso, r.id).replace(/data-acc="(\w+)"/g, 'data-act="acc-$1"')} ` : ''}<button class="btn btn-sm btn-outline-primary" data-act="ficha" title="Ficha" aria-label="Ficha"><i class="bi bi-person-vcard"></i></button>`,
    onAction: (a, r) => {
      if (a.startsWith('acc-')) return AC.accionAcceso(a.slice(4), r.id, r.nombre).then((hecho) => hecho && T.load()).catch((x) => window.App.toast(x.message, false));
      AC.ficha(r.id, me).catch((x) => window.App.toast(x.message, false));
    },
  });
  T.load();
  };
  // Tablero: matrículas y recaudo, cartera por antigüedad, quién debe más y qué cursos tienen más gente (solo con el permiso de Matrículas)
  const tablero = async (host) => {
    document.querySelector('[data-acciones]').innerHTML = '';
    await new Promise((ok) => { if (window.DwViz) return ok(); const j = document.createElement('script'); j.src = '/m/dwviz.js'; j.onload = j.onerror = () => ok(); document.head.appendChild(j); });
    const V = window.DwViz; if (!V) return;
    V.esqueleto(host, 3);
    let t; try { t = await window.App.api('/api/academia/tablero'); } catch (x) { host.innerHTML = `<p class="text-danger">${esc(x.message)}</p>`; return; }
    const k = t.kpis, money = C.money, mes = (m) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('es-CO', { month: 'short', timeZone: 'UTC' }).replace('.', '');
    if (!k.estudiantes) { V.vacio(host, { icono: 'bi-people', titulo: `Tu tablero empieza con el primer ${S}`, texto: 'Registra tus estudiantes y matricúlalos: aquí verás matrículas, recaudo y cartera.' }); return; }
    host.innerHTML = `${t.sugerencia ? `<div class="alert alert-warning d-flex gap-2 align-items-center py-2"><i class="bi bi-stars"></i><span>${esc(t.sugerencia)}</span></div>` : ''}
      <div data-k></div><div class="dv-g"><div data-a></div><div data-b></div></div><div class="dv-g"><div data-c></div><div data-d></div></div><div class="dv-g"><div data-e></div></div>`;
    V.kpis(host.querySelector('[data-k]'), [
      { titulo: `${AC.cap(cfg.termP)} activos`, valor: String(k.activos), icono: 'bi-people', detalle: `${k.matriculas_activas} matrículas en 6 meses`, delta: V.variacion(k.nuevas_mes, k.nuevas_anterior), serie: t.meses.map((m) => m.matriculas) },
      { titulo: 'Recaudo del mes', valor: money(k.recaudo_mes), icono: 'bi-cash-coin', tono: 'ok', delta: V.variacion(k.recaudo_mes, k.recaudo_anterior), serie: t.meses.map((m) => m.recaudo) },
      { titulo: 'Por cobrar', valor: money(k.pendiente), icono: 'bi-hourglass-split', detalle: `${money(k.este_mes)} vence este mes` },
      { titulo: 'En mora', valor: money(k.vencido), icono: 'bi-exclamation-triangle', tono: k.vencido ? 'mal' : 'ok', detalle: k.vencido ? `${t.morosos.length} ${t.morosos.length === 1 ? 'persona' : 'personas'}` : 'Todo al día' }]);
    const box = (id, titulo, sub) => { host.querySelector(`[data-${id}]`).innerHTML = V.tarjeta(titulo, '<div data-in></div>', { sub }); return host.querySelector(`[data-${id}] [data-in]`); };
    V.barras(box('a', 'Recaudo por mes', 'Pagos registrados, sin los anulados'), { etiquetas: t.meses.map((m) => mes(m.mes)), series: [{ nombre: 'Recaudo', datos: t.meses.map((m) => m.recaudo), color: '#34D399' }], fmt: money });
    V.barras(box('b', 'Matrículas nuevas', 'Últimos 6 meses'), { etiquetas: t.meses.map((m) => mes(m.mes)), series: [{ nombre: 'Matrículas', datos: t.meses.map((m) => m.matriculas) }], fmt: (n) => String(n) });
    V.dona(box('c', 'Cartera por antigüedad', 'Lo que falta por cobrar'), t.cartera.map((x, i) => ({ nombre: `${x.nombre} (${x.cuotas})`, valor: x.valor, color: ['#34D399', '#FBBF24', '#FB923C', '#FB7185'][i] })), { fmt: money, centro: 'Por cobrar' });
    if (t.cursos.length) V.ranking(box('e', 'Cursos con más gente', 'Matrículas activas por curso'), t.cursos.map((x) => ({ nombre: x.nombre, valor: x.activos })), { fmt: (n) => `${n} ${n === 1 ? 'persona' : 'personas'}` });
    const w = box('d', 'Quién debe más', 'Toca para ver la ficha');
    if (!t.morosos.length) V.vacio(w, { icono: 'bi-emoji-smile', titulo: 'Nadie en mora', texto: 'Todas las cuotas vencidas están pagadas.' });
    else { w.innerHTML = t.morosos.map((m) => `<button type="button" class="btn w-100 text-start d-flex align-items-center gap-2 py-2 border-bottom rounded-0" data-est="${m.id}"><i class="bi bi-person"></i><span class="flex-grow-1 text-truncate"><b>${esc(m.nombre)}</b><span class="d-block small text-body-secondary">${esc(m.curso)} · ${m.cuotas} ${m.cuotas === 1 ? 'cuota' : 'cuotas'} · ${m.dias} días</span></span><b class="text-danger">${money(m.valor)}</b></button>`).join('');
      w.addEventListener('click', (e) => { const b = e.target.closest('[data-est]'); if (b) AC.ficha(+b.dataset.est, me).catch((x) => window.App.toast(x.message, false)); }); }
  };
  const extra = await window.AC.matriculasVista(me);
  const conValores = me.modules.some((m) => m.id === 'matriculas');
  const vistas = [...(conValores ? [['tablero', 'Tablero', 'bi-speedometer2', tablero]] : []), ['estudiantes', AC.cap(cfg.termP), 'bi-people', tabla], ...extra];
  AC.vistas(vistas.map((v) => v.slice(0, 3)), (k, host) => vistas.find((v) => v[0] === k)[3](host));
});
