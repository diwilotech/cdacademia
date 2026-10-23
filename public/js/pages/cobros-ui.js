// Cobros de Eventos, Certificaciones y Asesorías (ventana común). Cobra por Finanzas (recibo de caja); si ya estaba pagado
// se marca «ya pagado» con una nota y, si hay, el comprobante (foto o PDF).
//   AC.cobros({ base: '/api/eventos/asistentes', id, titulo, changed })
(function () {
  const { api, esc, toast, confirm, modal } = window.App;
  const C = window.App.Crud;
  window.AC = window.AC || {};
  const METODOS = ['Efectivo', 'Transferencia', 'Nequi', 'Daviplata', 'Tarjeta', 'Bre-B', 'Consignación', 'Otro'];
  const CHIP = { pagado: ['ok', 'Pagado'], parcial: ['soon', 'Pago parcial'], pendiente: ['bad', 'Por pagar'], sin_cobro: ['free', 'Sin cobro'] };
  // Chip de estado de cobro para las tablas (estado = row.cobro)
  window.AC.chipCobro = (estado) => { const [t, l] = CHIP[estado] || CHIP.sin_cobro; return C.chip(t, l); };

  window.AC.cobros = async function ({ base, id, titulo, changed }) {
    const url = `${base}/${id}/cobros`;
    const { el, m } = modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Cobro · ${esc(titulo)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body" data-body><div class="text-body-secondary">Cargando…</div></div>`, { size: 'modal-lg' });
    el.addEventListener('hidden.bs.modal', () => changed?.());
    const body = el.querySelector('[data-body]');
    const RO = window.DW?.me?.business?.readOnly;

    async function subir(cid, file) {
      if (!file) return;
      const r = await fetch(`${url}/${cid}/comprobante?nombre=${encodeURIComponent(file.name)}`, { method: 'POST', credentials: 'same-origin', headers: { 'x-app': '1' }, body: file });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'No se pudo subir');
    }

    async function draw() {
      const d = await api(url);
      const form = !RO && (d.saldo > 0 || !(d.precio > 0));
      body.innerHTML = `<div class="d-flex flex-wrap gap-3 mb-3 align-items-center"><div><div class="small text-body-secondary">Precio</div><b>${C.money(d.precio)}</b></div><div><div class="small text-body-secondary">Pagado</div><b>${C.money(d.pagado)}</b></div>
          <div><div class="small text-body-secondary">Saldo</div><b>${C.money(d.saldo)}</b></div><div>${AC.chipCobro(d.estado)}</div></div>
        ${d.rows.length ? `<div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Fecha</th><th>Valor</th><th>Detalle</th><th></th></tr></thead><tbody>${d.rows.map((x) => `<tr class="${x.anulado ? 'text-decoration-line-through text-body-secondary' : ''}">
          <td>${C.day(x.fecha)}</td><td>${C.money(x.valor)}</td>
          <td class="small">${esc(x.metodo || '')}${x.ya_pagado ? ' <span class="badge text-bg-secondary">Ya pagado</span>' : x.recibo ? ` · Recibo ${esc(x.recibo)}` : ''}${x.nota ? `<div class="text-body-secondary">${esc(x.nota)}</div>` : ''}</td>
          <td class="text-end text-nowrap">${x.comprobante ? `<a class="btn btn-sm btn-light" target="_blank" href="${url}/${x.id}/comprobante"><i class="bi bi-paperclip"></i> Ver</a>` : ''}
            ${!x.anulado && !RO ? `<label class="btn btn-sm btn-light mb-0" title="Adjuntar comprobante"><i class="bi bi-upload"></i><input type="file" hidden accept="image/*,.pdf" data-up="${x.id}"></label>
            ${window.DW?.me?.canManage ? `<button class="btn btn-sm btn-outline-danger" data-anular="${x.id}" title="Anular"><i class="bi bi-x-circle"></i></button>` : ''}` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="text-body-secondary small">Aún no hay cobros.</p>'}
        ${form ? `<form class="border-top pt-3"><div class="row g-2">
          <div class="col-sm-4"><label class="form-label small mb-1">Valor</label><input class="form-control" type="number" name="valor" min="1" step="1" value="${d.saldo || ''}" required></div>
          <div class="col-sm-4"><label class="form-label small mb-1">Medio</label><select class="form-select" name="metodo">${METODOS.map((o) => `<option>${o}</option>`).join('')}</select></div>
          <div class="col-sm-4"><label class="form-label small mb-1">Fecha</label><input class="form-control" type="date" name="fecha" value="${C.todayCo()}" max="${C.todayCo()}"></div>
          <div class="col-12"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="yp" name="ya_pagado"><label class="form-check-label" for="yp">Ya estaba pagado <span class="text-body-secondary small">· solo lo marca, no crea recibo en Finanzas</span></label></div></div>
          <div class="col-12"><label class="form-label small mb-1">Nota <span class="text-body-secondary" data-nota-hint>· opcional</span></label><input class="form-control" name="nota" maxlength="300" placeholder="Quién recibió, cómo, cuándo…"></div>
          <div class="col-12"><label class="form-label small mb-1">Comprobante <span class="text-body-secondary">· opcional (foto o PDF)</span></label><input class="form-control" type="file" name="archivo" accept="image/*,.pdf"></div>
        </div><div class="small text-danger mt-2" data-err></div><div class="text-end mt-2"><button class="btn btn-primary">Registrar cobro</button></div></form>` : ''}`;
      const f = body.querySelector('form');
      if (f) {
        const hint = f.querySelector('[data-nota-hint]');
        f.elements.ya_pagado.addEventListener('change', () => { f.elements.nota.required = f.elements.ya_pagado.checked; hint.textContent = f.elements.ya_pagado.checked ? '· obligatoria' : '· opcional'; });
        f.onsubmit = async (e) => {
          e.preventDefault();
          const err = f.querySelector('[data-err]'); err.textContent = '';
          try {
            const r = await api(url, { method: 'POST', body: { valor: f.elements.valor.value, metodo: f.elements.metodo.value, fecha: f.elements.fecha.value, nota: f.elements.nota.value.trim(), ya_pagado: f.elements.ya_pagado.checked } });
            if (f.elements.archivo.files[0]) await subir(r.id, f.elements.archivo.files[0]);
            toast(r.ya_pagado ? 'Marcado como ya pagado' : r.recibo ? `Cobro registrado · recibo ${r.recibo}` : 'Cobro registrado'); await draw();
          } catch (x) { err.textContent = x.message; }
        };
      }
      body.querySelectorAll('[data-up]').forEach((i) => i.addEventListener('change', async () => { try { await subir(i.dataset.up, i.files[0]); toast('Comprobante guardado'); await draw(); } catch (x) { toast(x.message, false); } }));
      body.querySelectorAll('[data-anular]').forEach((b) => b.addEventListener('click', async () => {
        if (!(await confirm({ title: '¿Anular este cobro?', text: 'Si tenía recibo en Finanzas, también se anula.', ok: 'Anular' }))) return;
        try { await api(`${url}/${b.dataset.anular}/anular`, { method: 'POST', body: {} }); toast('Cobro anulado'); await draw(); } catch (x) { toast(x.message, false); }
      }));
    }
    await draw().catch((x) => { body.innerHTML = `<div class="text-danger">${esc(x.message)}</div>`; });
    return m;
  };
})();
