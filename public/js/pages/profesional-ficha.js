// Ficha del profesional (docente): datos, áreas con niveles, reposiciones y horario. La usa Equipo.
//   AC.fichaProfesional({ row, areas, changed }) — row = null para uno nuevo.
(function () {
  const { api, esc, toast, confirm, modal } = window.App;
  window.AC = window.AC || {};
  // Áreas con niveles y disponibilidad semanal: van juntas y solo existen si la persona es profesional. Devuelve () => ({ areas, horario }).
  window.AC.profCampos = function (host, p, areas) {
    host.innerHTML = `<div class="row g-2"><div class="col-12"><div class="form-label small mb-1">Áreas que enseña</div>${areas.length ? areas.map((a) => {
      const sel = (p.areas || []).find((x) => x.area_id === a.id);
      return `<div class="border rounded-3 p-2 mb-2" data-area="${a.id}"><div class="form-check"><input class="form-check-input" type="checkbox" id="a${a.id}" data-on ${sel ? 'checked' : ''}><label class="form-check-label fw-semibold" for="a${a.id}">${esc(a.nombre)}</label></div>
        <div class="d-flex flex-wrap gap-3 ms-4 small">${AC.NIVELES.map((n) => `<label><input type="checkbox" class="form-check-input me-1" data-nivel="${n}" ${sel?.niveles?.includes(n) ? 'checked' : ''}>${n}</label>`).join('')}
        <label><input type="checkbox" class="form-check-input me-1" data-reponer ${sel?.reponer ? 'checked' : ''}>Hace reposiciones</label></div></div>`;
    }).join('') : '<p class="small text-body-secondary">Crea las áreas en <a href="/staff/academia.html#areas">Mi academia</a>.</p>'}</div>
      <div class="col-12"><div class="form-label small mb-1">Disponibilidad semanal</div><div data-horario></div></div></div>`;
    const getH = AC.horarioEditor(host.querySelector('[data-horario]'), p.horario || []);
    return () => ({ horario: getH(),
      areas: [...host.querySelectorAll('[data-area]')].filter((x) => x.querySelector('[data-on]').checked).map((x) => ({ area_id: +x.dataset.area,
        niveles: [...x.querySelectorAll('[data-nivel]:checked')].map((n) => n.dataset.nivel), reponer: x.querySelector('[data-reponer]').checked })) });
  };
  window.AC.fichaProfesional = function ({ row, areas, changed }) {
    const p = row || { activo: 1, areas: [], horario: [] };
    const { el, m } = modal(`<form><div class="modal-header border-0 pb-0"><h2 class="modal-title h5">${row ? 'Editar profesional' : 'Nuevo profesional'}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><div class="row g-2">
        <div class="col-12"><label class="form-label small mb-1" for="pn">Nombre</label><input class="form-control" id="pn" name="nombre" value="${esc(p.nombre || '')}" required></div>
        <div class="col-sm-6"><label class="form-label small mb-1" for="pt">Teléfono</label><input class="form-control" id="pt" name="telefono" value="${esc(p.telefono || '')}"></div>
        <div class="col-sm-6"><label class="form-label small mb-1" for="pe">Correo <span class="text-body-secondary">· para darle acceso en Equipo</span></label><input class="form-control" type="email" id="pe" name="email" value="${esc(p.email || '')}"></div>
        <div class="col-12" data-campos></div>
        <div class="col-12"><label class="form-label small mb-1" for="pno">Notas</label><textarea class="form-control" id="pno" name="notas" rows="2">${esc(p.notas || '')}</textarea></div>
        <div class="col-12"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="pa" name="activo" ${p.activo ? 'checked' : ''}><label class="form-check-label" for="pa">Activo</label></div></div>
      </div><div class="small text-danger mt-2" data-err></div></div>
      <div class="modal-footer border-0 pt-0 justify-content-between"><span>${row ? '<button type="button" class="btn btn-outline-danger btn-sm" data-del><i class="bi bi-trash me-1"></i>Borrar</button>' : ''}</span>
        <span><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button> <button class="btn btn-primary">Guardar</button></span></div></form>`, { size: 'modal-lg' });
    const getC = AC.profCampos(el.querySelector('[data-campos]'), p, areas);
    const f = el.querySelector('form'), err = el.querySelector('[data-err]');
    el.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!(await confirm({ title: `¿Borrar a ${row.nombre}?`, text: 'Los cursos que dicta quedan sin profesional.' }))) return;
      try { await api(`/api/profesionales/profesionales/${row.id}`, { method: 'DELETE' }); m.hide(); toast('Borrado'); changed(); } catch (x) { err.textContent = x.message; }
    });
    f.onsubmit = async (e) => {
      e.preventDefault();
      const body = { nombre: f.nombre.value, telefono: f.telefono.value, email: f.email.value, notas: f.notas.value, activo: f.activo.checked, ...getC() };
      try { await api(row ? `/api/profesionales/profesionales/${row.id}` : '/api/profesionales/profesionales', { method: row ? 'PATCH' : 'POST', body }); m.hide(); toast('Guardado'); changed(); }
      catch (x) { err.textContent = x.message; }
    };
  };
})();
