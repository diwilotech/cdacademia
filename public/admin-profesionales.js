/* =========================================================
   ÁREAS Y PROFESIONALES
   DB.areas = [{id, nombre, color}]
   DB.profesionales = [{id, nombre, tel, activo, areas:[{areaId, niveles:[...], reponer}], horario:[{dia, ini, fin}]}]
   Un curso tiene un área y un nivel; solo se ofrecen como docente los profesionales que dictan esa área y nivel.
   Una reposición solo puede darla quien tenga «puede reponer» en esa área y nivel.
   ========================================================= */
const area = id => (DB.areas||[]).find(a=>a.id===id);
const profesional = id => id ? (DB.profesionales||[]).find(p=>p.id===id) : null;
const docenteEsp = x => profesional(x.profesionalId)?.nombre || x.docente || '';
const nivelCorto = n => ({Básico:'Básico',Intermedio:'Interm.',Avanzado:'Avanz.',Profesional:'Prof.'}[n]||n);

const dictaNivel = (p,areaId,nivel) => p.activo!==false && (p.areas||[]).some(a=>(!areaId||a.areaId===areaId) && (!nivel||(a.niveles||[]).includes(nivel)));
const puedeReponer = (p,areaId,nivel) => p.activo!==false && (p.areas||[]).some(a=>a.reponer && (!areaId||a.areaId===areaId) && (!nivel||(a.niveles||[]).includes(nivel)));
const profesionalesDe = (areaId,nivel) => (DB.profesionales||[]).filter(p=>areaId ? dictaNivel(p,areaId,nivel) : p.activo!==false);
const profesionalesReponen = (areaId,nivel) => (DB.profesionales||[]).filter(p=>areaId ? puedeReponer(p,areaId,nivel) : (p.areas||[]).some(a=>a.reponer) && p.activo!==false);

/* Sin horario cargado = sin restricción */
function dentroDeHorario(p,fecha,ini,fin){
  if(!(p.horario||[]).length) return true;
  const dia=new Date(fecha+'T12:00').getDay();
  return p.horario.some(h=>h.dia===dia && h.ini<=ini && h.fin>=fin);
}
/* Clase del propio profesional que se cruza con ese horario */
function choqueClase(p,fecha,ini,fin){
  for(const c of DB.cursos){
    if(c.grupo?.profesionalId!==p.id) continue;
    const ses=sesionesCurso(c);
    for(let k=0;k<ses.length;k++){ const x=ses[k]; if(x.fecha===fecha && x.ini<fin && x.fin>ini) return {c,n:k+1,x}; }
  }
  return null;
}

/* ---------- pantalla ---------- */
let areaEditando=null;
function pintarProfesionales(){
  DB.areas=DB.areas||[]; DB.profesionales=DB.profesionales||[];
  $('#listaAreas').innerHTML=DB.areas.map(a=>{
    const usos=DB.cursos.filter(c=>c.areaId===a.id).length;
    return `<span class="d-inline-flex align-items-center gap-1 border rounded-pill ps-2 pe-1 py-1 bg-white small">
      <i class="bi bi-circle-fill" style="color:${esc(a.color)};font-size:.6rem"></i><b>${esc(a.nombre)}</b><span class="text-muted">${usos} ${usos===1?'curso':'cursos'}</span>
      <button class="btn btn-sm btn-link p-0 px-1" data-area-edit="${a.id}" title="Editar" aria-label="Editar ${esc(a.nombre)}"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-sm btn-link text-danger p-0 px-1" data-area-del="${a.id}" title="Quitar" aria-label="Quitar ${esc(a.nombre)}"><i class="bi bi-x-lg"></i></button></span>`; }).join('')
    || '<span class="text-muted small">Aún no hay áreas.</span>';
  $('#tablaProf').innerHTML=DB.profesionales.map(p=>{
    const cursos=DB.cursos.filter(c=>c.grupo?.profesionalId===p.id);
    return `<tr class="${p.activo===false?'text-muted':''}"><td><div class="d-flex align-items-center gap-2"><div class="avatar">${iniciales(p.nombre)}</div>
        <div><div class="fw-semibold">${esc(p.nombre)}${p.activo===false?' <span class="badge text-bg-light border">Inactivo</span>':''}</div><small class="text-muted">${esc(p.tel||'')}</small></div></div></td>
      <td>${(p.areas||[]).map(a=>`<div class="small"><i class="bi bi-circle-fill" style="color:${esc(area(a.areaId)?.color||'#999')};font-size:.55rem"></i> <b>${esc(area(a.areaId)?.nombre||'Área')}</b>
          <span class="text-muted">${(a.niveles||[]).map(nivelCorto).join(', ')||'sin niveles'}</span>
          ${a.reponer?'<span class="pill pill-gratis ms-1"><i class="bi bi-arrow-repeat"></i> repone</span>':'<span class="pill pill-pendiente ms-1">no repone</span>'}</div>`).join('')||'<small class="text-muted">Sin áreas</small>'}</td>
      <td class="small tabular">${(p.horario||[]).length?esc(horarioTexto({slots:p.horario})):'<span class="text-muted">Sin horario</span>'}</td>
      <td class="small">${cursos.map(c=>`<div class="text-truncate" style="max-width:180px">${esc(c.nombre)}</div>`).join('')||'<span class="text-muted">—</span>'}</td>
      <td class="text-end"><button class="btn btn-sm btn-outline-secondary" onclick="abrirProf('${p.id}')" title="Editar"><i class="bi bi-pencil"></i></button></td></tr>`; }).join('')
    || '<tr><td colspan="5" class="text-center text-muted py-4">Aún no hay profesionales. Agrega el primero.</td></tr>';
}
$('#listaAreas').addEventListener('click',e=>{
  const ed=e.target.closest('[data-area-edit]'), del=e.target.closest('[data-area-del]');
  if(ed){ const a=area(ed.dataset.areaEdit); areaEditando=a.id; $('#areaNombre').value=a.nombre; $('#areaColor').value=a.color; $('#areaNombre').focus(); $('#formArea button').innerHTML='<i class="bi bi-check2"></i> Guardar área'; }
  if(del){
    const a=area(del.dataset.areaDel), usos=DB.cursos.filter(c=>c.areaId===a.id).length+DB.profesionales.filter(p=>(p.areas||[]).some(x=>x.areaId===a.id)).length+(DB.espacios||[]).filter(x=>x.areaId===a.id).length;
    if(usos){ toast(`«${a.nombre}» está en uso (${usos}): cámbiala primero en cursos, profesionales y espacios.`); return; }
    DB.areas=DB.areas.filter(x=>x.id!==a.id); guardar(); render(); toast('Área quitada');
  }
});
$('#formArea').addEventListener('submit',e=>{
  e.preventDefault();
  const nombre=$('#areaNombre').value.trim(), color=$('#areaColor').value;
  if(DB.areas.some(a=>a.nombre.toLowerCase()===nombre.toLowerCase() && a.id!==areaEditando)){ toast('Ya existe un área con ese nombre'); return; }
  if(areaEditando){ Object.assign(area(areaEditando),{nombre,color}); }
  else DB.areas.push({id:'ar'+uid(),nombre,color});
  areaEditando=null; $('#formArea').reset(); $('#areaColor').value='#7a2e5c'; $('#formArea button').innerHTML='<i class="bi bi-plus-lg"></i> Agregar área';
  guardar(); render(); toast('Área guardada');
});

/* ---------- editor de profesional ---------- */
let profAreasTemp=[], profHorarioTemp=[];
function abrirProf(id){
  const p=id?profesional(id):null;
  $('#formProf').reset(); $('#profId').value=id||'';
  $('#tProf').textContent=p?'Editar profesional':'Nuevo profesional';
  $('#profNombre').value=p?.nombre||''; $('#profTel').value=p?.tel||''; $('#profActivo').checked=p?p.activo!==false:true;
  profAreasTemp=structuredClone(p?.areas||[]); profHorarioTemp=structuredClone(p?.horario||[]);
  if(!p && !profAreasTemp.length && DB.areas.length) profAreasTemp.push({areaId:DB.areas[0].id,niveles:['Básico'],reponer:false});
  $('#profEliminar').hidden=!p;
  if(typeof cargarAcceso==='function') cargarAcceso(p);
  pintarProfAreas(); pintarProfHorario(); modal('mProf').show();
}
function pintarProfAreas(){
  $('#profAreas').innerHTML=profAreasTemp.map((a,k)=>`<div class="border rounded p-2" data-k="${k}">
    <div class="d-flex flex-wrap gap-2 align-items-center">
      <select class="form-select form-select-sm w-auto" data-f="areaId" aria-label="Área">${DB.areas.map(x=>`<option value="${x.id}" ${x.id===a.areaId?'selected':''}>${esc(x.nombre)}</option>`).join('')}</select>
      <div class="btn-group btn-group-sm" role="group" aria-label="Niveles">${NIVELES.map((n,j)=>`<input type="checkbox" class="btn-check" id="pn${k}_${j}" data-nivel="${n}" ${(a.niveles||[]).includes(n)?'checked':''}><label class="btn btn-outline-secondary" for="pn${k}_${j}">${n}</label>`).join('')}</div>
      <div class="form-check form-switch mb-0 ms-1"><input class="form-check-input" type="checkbox" id="pr${k}" data-f="reponer" ${a.reponer?'checked':''}><label class="form-check-label small" for="pr${k}">Puede hacer reposiciones</label></div>
      <button type="button" class="btn btn-sm btn-outline-danger ms-auto" data-del="${k}" title="Quitar área"><i class="bi bi-trash"></i></button></div></div>`).join('')
    || '<div class="small text-muted">Sin áreas todavía.</div>';
}
function pintarProfHorario(){
  $('#profHorario').innerHTML=profHorarioTemp.map((x,k)=>`<div class="d-flex flex-wrap gap-2 align-items-center" data-k="${k}">
    <select class="form-select form-select-sm" style="width:130px" data-f="dia" aria-label="Día">${opcionesDia(x.dia)}</select>
    <input type="time" class="form-control form-control-sm" style="width:115px" data-f="ini" value="${x.ini}" aria-label="Desde"><span class="text-muted small">a</span>
    <input type="time" class="form-control form-control-sm" style="width:115px" data-f="fin" value="${x.fin}" aria-label="Hasta">
    <button type="button" class="btn btn-sm btn-outline-danger" data-del="${k}" title="Quitar"><i class="bi bi-trash"></i></button></div>`).join('')
    || '<div class="small text-muted">Sin horario: se considera disponible a cualquier hora.</div>';
}
$('#profAddArea').addEventListener('click',()=>{ if(!DB.areas.length){ toast('Primero crea un área'); return; } profAreasTemp.push({areaId:DB.areas[0].id,niveles:['Básico'],reponer:false}); pintarProfAreas(); });
$('#profAddHorario').addEventListener('click',()=>{ const u=profHorarioTemp.at(-1)||{dia:1,ini:'09:00',fin:'13:00'}; profHorarioTemp.push({...u}); pintarProfHorario(); });
$('#profAreas').addEventListener('change',e=>{ const row=e.target.closest('[data-k]'); if(!row) return; const a=profAreasTemp[+row.dataset.k];
  if(e.target.dataset.f==='areaId') a.areaId=e.target.value;
  if(e.target.dataset.f==='reponer') a.reponer=e.target.checked;
  if(e.target.dataset.nivel){ const n=e.target.dataset.nivel; a.niveles=NIVELES.filter(x=>x===n?e.target.checked:(a.niveles||[]).includes(x)); } });
$('#profAreas').addEventListener('click',e=>{ const b=e.target.closest('[data-del]'); if(b){ profAreasTemp.splice(+b.dataset.del,1); pintarProfAreas(); } });
$('#profHorario').addEventListener('input',e=>{ const row=e.target.closest('[data-k]'); if(!row||!e.target.dataset.f) return; const f=e.target.dataset.f; profHorarioTemp[+row.dataset.k][f]= f==='dia'?+e.target.value:e.target.value; });
$('#profHorario').addEventListener('click',e=>{ const b=e.target.closest('[data-del]'); if(b){ profHorarioTemp.splice(+b.dataset.del,1); pintarProfHorario(); } });
$('#formProf').addEventListener('submit',e=>{
  e.preventDefault();
  if(profHorarioTemp.some(x=>!x.ini||!x.fin||x.fin<=x.ini)){ toast('En cada horario, la hora final debe ser después de la inicial'); return; }
  if(new Set(profAreasTemp.map(a=>a.areaId)).size!==profAreasTemp.length){ toast('Una misma área está repetida'); return; }
  if(profAreasTemp.some(a=>!(a.niveles||[]).length)){ toast('Marca al menos un nivel en cada área'); return; }
  const id=$('#profId').value||'pr'+uid();
  const datos={id,nombre:$('#profNombre').value.trim(),tel:$('#profTel').value.trim(),email:($('#profEmail')?.value||'').trim().toLowerCase(),activo:$('#profActivo').checked,areas:profAreasTemp,horario:profHorarioTemp};
  const i=DB.profesionales.findIndex(p=>p.id===id); i>=0?DB.profesionales[i]={...DB.profesionales[i],...datos}:DB.profesionales.push(datos);
  // el nombre se copia a los cursos y espacios donde ya está asignado
  DB.cursos.forEach(c=>{ if(c.grupo?.profesionalId===id) c.grupo.docente=datos.nombre; });
  (DB.espacios||[]).forEach(x=>{ if(x.profesionalId===id) x.docente=datos.nombre; });
  guardar(); modal('mProf').hide(); render(); toast('Profesional guardado');
  if(typeof sincronizarAcceso==='function') sincronizarAcceso(datos);
});
function eliminarProf(b){
  if(!b.dataset.ok){ b.dataset.ok=1; b.innerHTML='¿Eliminar? Toca otra vez'; setTimeout(()=>{ delete b.dataset.ok; b.innerHTML='<i class="bi bi-trash"></i> Eliminar'; },4000); return; }
  const id=$('#profId').value;
  DB.profesionales=DB.profesionales.filter(p=>p.id!==id);
  DB.cursos.forEach(c=>{ if(c.grupo?.profesionalId===id) c.grupo.profesionalId=''; });
  (DB.espacios||[]).forEach(x=>{ if(x.profesionalId===id) x.profesionalId=''; });
  guardar(); modal('mProf').hide(); render(); toast('Profesional eliminado; sus cursos quedaron sin docente asignado');
}
