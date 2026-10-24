// Pestaña «Mi negocio» de la pantalla Marca (la pantalla es del módulo central de Diwilo Modulos; esta pestaña la suma la app):
// a qué se dedica el negocio (rubro y cómo les dices a los estudiantes) y las áreas que enseña.
// Las reglas (notas, asistencia, reposiciones, cobros y recibo) están en Configuración.
(window.DwMarcaTabs = window.DwMarcaTabs || []).push({
  id: 'academia', label: 'Mi negocio', icon: 'bi-building',
  async mount(view, { me }) {
    const { api, esc, toast, confirm } = window.App;
    const RO = me.business.readOnly, CAN = me.canManage && !RO;
    const c = await AC.cfg(true);
    view.innerHTML = `<div class="row g-3"><div class="col-lg-6"><form class="dw-card" data-rubro><h2 class="h6 mb-1">A qué te dedicas</h2>
        <p class="small text-body-secondary mb-3">Con el rubro, la app te llama a tus estudiantes como tú los llamas (estudiante, alumna, aprendiz…).</p>
        <div class="row g-3">
          <div class="col-12"><label class="form-label small mb-1" for="m_rubro">Rubro</label><select class="form-select" id="m_rubro" name="rubro" ${CAN ? '' : 'disabled'}>${Object.entries(c.rubros).map(([k, r]) => `<option value="${k}" ${c.rubro === k ? 'selected' : ''}>${esc(r.nombre)}</option>`).join('')}</select></div>
          <div class="col-6"><label class="form-label small mb-1" for="m_termS">Cómo les dices <span class="text-body-secondary">· singular</span></label><input class="form-control" id="m_termS" name="termS" maxlength="80" value="${esc(c.termS || '')}" ${CAN ? '' : 'disabled'}></div>
          <div class="col-6"><label class="form-label small mb-1" for="m_termP">Plural</label><input class="form-control" id="m_termP" name="termP" maxlength="80" value="${esc(c.termP || '')}" ${CAN ? '' : 'disabled'}></div>
          ${CAN ? '<div class="col-12"><button class="btn btn-primary"><i class="bi bi-check-lg me-1"></i>Guardar</button></div>' : ''}
        </div></form></div>
      <div class="col-lg-6"><div class="dw-card" data-areas><h2 class="h6 mb-1">Áreas que enseñas</h2>
        <p class="small text-body-secondary mb-3">Las líneas en que se mueve tu academia: Inglés, Maquillaje, Barbería… Aparecen al crear cursos, profesionales y materiales.</p>
        <div class="d-flex flex-wrap gap-2 mb-3" data-chips></div>
        ${CAN ? '<form class="d-flex gap-2" data-nueva style="max-width:420px"><input class="form-control" name="nombre" maxlength="80" placeholder="Nueva área: Inglés, Francés…" aria-label="Nombre de la nueva área" required><button class="btn btn-primary text-nowrap"><i class="bi bi-plus-lg me-1"></i>Agregar</button></form>' : ''}</div></div></div>`;
    const chips = view.querySelector('[data-chips]');
    const cargar = async () => {
      const { areas } = await api('/api/academia/areas-lista');
      chips.innerHTML = areas.length ? areas.map((a) => `<span class="badge text-bg-${esc(a.color || 'light')} border d-inline-flex align-items-center gap-2 fs-6 fw-normal">${esc(a.nombre)}${CAN ? `<button type="button" class="btn-close btn-close-sm" style="font-size:.6rem" data-quitar="${a.id}" aria-label="Quitar ${esc(a.nombre)}"></button>` : ''}</span>`).join('')
        : '<span class="small text-body-secondary">Aún no hay áreas. Agrega la primera aquí abajo.</span>';
    };
    await cargar();
    view.querySelector('[data-nueva]')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const i = e.target.nombre;
      try { await api('/api/academia/areas', { method: 'POST', body: { nombre: i.value.trim() } }); i.value = ''; toast('Área agregada'); await cargar(); } catch (x) { toast(x.message, false); }
    });
    chips.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-quitar]'); if (!b) return;
      if (!(await confirm({ title: '¿Quitar esta área?', text: 'Desaparece de la lista; los cursos, profesionales y materiales que la usaban pueden quedar sin área.', ok: 'Quitar' }))) return;
      try { await api(`/api/academia/areas/${b.dataset.quitar}`, { method: 'DELETE' }); toast('Área quitada'); await cargar(); } catch (x) { toast(x.message, false); }
    });
    const f = view.querySelector('[data-rubro]');
    f.rubro.addEventListener('change', () => { const r = c.rubros[f.rubro.value]; f.termS.value = r.s; f.termP.value = r.p; });
    f.onsubmit = async (e) => {
      e.preventDefault();
      try { await api('/api/academia/config', { method: 'PUT', body: { rubro: f.rubro.value, termS: f.termS.value, termP: f.termP.value } }); await AC.cfg(true); toast('Guardado'); } catch (x) { toast(x.message, false); }
    };
  },
});
