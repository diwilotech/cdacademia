/* ================= VISTA DEL CURSO ================= */
let cursoActual=null, tabCurso='clases';
function verCurso(id, tab){ cursoActual=id; if(tab) tabCurso=tab; ir('curso'); pintarCurso(); }

function pintarCurso(){
  const c=curso(cursoActual); if(!c) return;
  const g=c.grupo, inf=infoCurso(c), ins=DB.inscripciones.filter(i=>i.cursoId===c.id), N=+g.numClases||0;
  const pct=N?Math.round(inf.dictadas/N*100):0;
  const tabs=[['clases','bi-list-ol','Clases',N],['asistencia','bi-check2-square','Asistencia',ins.length],['notas','bi-mortarboard','Notas',ins.length],['plan','bi-journal-text','Plan de estudio',(c.plan||[]).length]];
  $('#detalleCurso').innerHTML=`
    <div class="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-3">
      <div style="min-width:0"><div class="d-flex gap-1 mb-1"><span class="badge bg-marca-suave text-marca">${esc(c.nivel)}</span>
        <span class="badge ${inf.estado==='En curso'?'text-bg-success':'text-bg-light border'}">${inf.estado}</span></div>
        <h1 class="h2 mb-0">${esc(c.nombre)}</h1></div>
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-outline-secondary" onclick="imprimirHoja('${tabCurso==='clases'||tabCurso==='plan'?'cronograma':'planilla'}')"><i class="bi bi-printer"></i> Imprimir</button>
        <button class="btn btn-sm btn-outline-secondary" onclick="abrirCurso('${c.id}')"><i class="bi bi-pencil"></i> Editar</button></div>
    </div>
    <div class="ficha mb-3">
      <div><div class="k">Docente</div><div class="v">${esc(g.docente||'—')}</div></div>
      <div><div class="k">Jornada</div><div class="v">${esc(g.jornada||'—')}</div></div>
      <div><div class="k">Horario</div><div class="v" title="${horarioTexto(g)}">${diasTexto(g)||'—'}</div><div class="small text-muted tabular">${horaRango(g)}</div></div>
      <div><div class="k">Inicia</div><div class="v tabular">${inf.inicio?fechaLarga(inf.inicio):'—'}</div></div>
      <div><div class="k">Termina</div><div class="v tabular">${inf.fin?fechaLarga(inf.fin):'—'}</div></div>
      <div><div class="k">Avance</div><div class="v tabular">${inf.dictadas}/${N} <small>· ${inf.horas} h</small></div><div class="barra mt-1"><i style="width:${pct}%"></i></div></div>
    </div>
    <ul class="nav tabs-curso mb-3">${tabs.map(([k,ic,t,n])=>`<li class="nav-item"><a href="#" class="nav-link ${tabCurso===k?'active':''}" data-tab="${k}"><i class="bi ${ic}"></i> ${t}<span class="cnt">${n}</span></a></li>`).join('')}</ul>
    <div id="cuerpoTab"></div>`;
  document.querySelectorAll('[data-tab]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault(); tabCurso=a.dataset.tab; pintarCurso();}));
  ({clases:tabClases, asistencia:tabAsistencia, notas:tabNotas, plan:tabPlan})[tabCurso](c,inf,ins);
}

/* ---------- Pestaña: clases 1..N ---------- */
function tabClases(c,inf){
  const N=+c.grupo.numClases||0, hoy=hoyISO(), sinTema=Array.from({length:N},(_,k)=>k+1).filter(n=>!(c.clases||[]).find(x=>x.n===n&&x.tema)).length;
  const evPorClase={}; (c.evaluaciones||[]).forEach(e=>{ if(e.clase) (evPorClase[e.clase]=evPorClase[e.clase]||[]).push(e); });
  $('#cuerpoTab').innerHTML=`
    ${sinTema && (c.plan||[]).length?`<div class="alert bg-marca-suave border-0 d-flex flex-wrap align-items-center gap-2 py-2 small">
      <i class="bi bi-magic text-marca"></i> ${sinTema} ${sinTema===1?'clase no tiene':'clases no tienen'} tema.
      <button class="btn btn-sm btn-marca ms-auto" onclick="accionRepartir()"><i class="bi bi-stars"></i> Repartir plan de estudio en las clases</button></div>`:''}
    <div class="card">${Array.from({length:N},(_,k)=>{
      const n=k+1, cl=(c.clases||[]).find(x=>x.n===n)||{}, f=inf.fechas[k];
      const estC = !f ? '' : f<hoy ? 'pasada' : f===hoy ? 'hoy' : '';
      const ev=evPorClase[n]||[];
      return `<div class="clase ${estC} ${cl.tema?'':'sin-tema'}" onclick="abrirClase(${n})">
        <div class="num">${n}</div>
        <div class="fecha">${f?`<b>${DIAS[new Date(f+'T12:00').getDay()]} ${fechaMini(f)}</b>${cl.fecha?'<span class="text-warning"><i class="bi bi-arrow-repeat"></i> reprogramada</span>':hora12(c.grupo.horaIni)}`:'<b>—</b>'}</div>
        <div style="min-width:0"><div class="tema">${esc(cl.tema||'Sin tema asignado')}</div>
          ${cl.detalle?`<div class="det">${esc(cl.detalle)}</div>`:''}
          ${(cl.metodos?.length||cl.materiales||ev.length)?`<div class="meta">
            ${ev.map(e=>`<span class="tag" style="border-color:var(--marca)"><i class="bi bi-award"></i> ${esc(e.nombre)} · ${e.peso}%</span>`).join('')}
            ${(cl.metodos||[]).map(m=>`<span class="tag"><i class="bi bi-easel"></i> ${esc(m)}</span>`).join('')}
            ${cl.materiales?`<span class="tag text-wrap" style="white-space:normal"><i class="bi bi-bag"></i> ${esc(cl.materiales)}</span>`:''}</div>`:''}
          ${cl.virtual?`<div class="meta"><span class="tag" style="border-color:#cdb8ef;color:#5b2ea6"><i class="bi bi-camera-video" style="color:#5b2ea6"></i> Reposición virtual · ${cl.video?'grabada':'falta grabar'}</span></div>`:''}
          ${cl.obs?`<div class="det mt-1"><i class="bi bi-chat-left-text"></i> ${esc(cl.obs)}</div>`:''}</div>
        <div class="estado text-end">${estC==='hoy'?'<span class="pill pill-hoy">Hoy</span>':estC==='pasada'?'<span class="pill pill-pagada"><i class="bi bi-check2"></i> Dictada</span>':''}</div>
      </div>`}).join('') || '<p class="text-muted p-3 mb-0">Define el número de clases en Editar.</p>'}</div>`;
}
function accionRepartir(){ const c=curso(cursoActual), n=repartirPlan(c); guardar(); pintarCurso(); toast(n?`${n} clases con tema asignado desde el plan`:'No había clases vacías'); }

function abrirClase(n){
  const c=curso(cursoActual), cl=(c.clases||[]).find(x=>x.n===n)||{}, f=infoCurso(c).fechas[n-1];
  $('#claN').value=n; $('#tClase').textContent=`Clase ${n} de ${c.grupo.numClases}`+(f?` · ${DIAS_L[new Date(f+'T12:00').getDay()]} ${fechaLarga(f)}`:'');
  $('#claTema').value=cl.tema||''; $('#claDetalle').value=cl.detalle||''; $('#claMateriales').value=cl.materiales||''; $('#claObs').value=cl.obs||'';
  $('#claVirtual').checked=!!cl.virtual; $('#claVideo').value=cl.video||'';
  $('#claFecha').value=f||'';
  $('#claMetodos').innerHTML=METODOS.map((m,k)=>`<input type="checkbox" class="btn-check" id="met${k}" value="${m}" ${(cl.metodos||[]).includes(m)?'checked':''}>
    <label class="btn btn-sm btn-outline-secondary rounded-pill" for="met${k}">${m}</label>`).join('');
  $('#claAsis').onclick=()=>{ modal('mClase').hide(); tabCurso='asistencia'; pintarCurso(); };
  modal('mClase').show();
}
$('#formClase').addEventListener('submit',ev=>{
  ev.preventDefault();
  const c=curso(cursoActual), n=+$('#claN').value, cl=clase(c,n);
  const calculada=fechasClases({...c,clases:(c.clases||[]).map(x=>x.n===n?{...x,fecha:undefined}:x)})[n-1];
  Object.assign(cl,{tema:$('#claTema').value.trim(),detalle:$('#claDetalle').value.trim(),materiales:$('#claMateriales').value.trim(),obs:$('#claObs').value.trim(),
    virtual:$('#claVirtual').checked, video:$('#claVideo').value.trim(),
    metodos:[...document.querySelectorAll('#claMetodos input:checked')].map(x=>x.value)});
  const f=$('#claFecha').value; if(f && f!==calculada) cl.fecha=f; else delete cl.fecha;
  guardar(); modal('mClase').hide(); pintarCurso(); toast(`Clase ${n} guardada`);
});

/* ---------- Pestaña: asistencia ---------- */
function tabAsistencia(c,inf,ins){
  const N=+c.grupo.numClases||0, hoy=hoyISO();
  const colCls = k => inf.fechas[k]===hoy ? 'col-hoy' : inf.fechas[k] && inf.fechas[k]>hoy ? 'col-fut' : '';
  $('#cuerpoTab').innerHTML = ins.length ? `
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
      <div class="leyenda">${Object.entries(ASIS).map(([k,v])=>`<span><button class="asis" data-v="${k}" tabindex="-1">${k}</button> ${v}</span>`).join('')}</div>
      <small class="text-muted">Toca una casilla para cambiarla · toca el número de la clase para marcar a todas presentes · <b>A</b> y <b>J</b> quedan como reposición</small>
    </div>
    <div class="planilla-wrap"><table class="grilla">
      <thead><tr><th class="nom">${cap(DB.config.termS)}</th>
        ${Array.from({length:N},(_,k)=>`<th class="cl ${colCls(k)}" data-col="${k+1}" title="${esc((c.clases||[]).find(x=>x.n===k+1)?.tema||'')}">${k+1}<span class="d">${inf.fechas[k]?fechaMini(inf.fechas[k]):''}</span></th>`).join('')}
        <th class="resumen">%</th><th>Fallas</th><th>Por reponer</th></tr></thead>
      <tbody>${ins.map(i=>{const e=est(i.estId), r=resumenAsis(i);
        return `<tr data-insc="${i.id}"><td class="nom" title="${esc(e.nombre)}">${esc(e.nombre)}</td>
          ${Array.from({length:N},(_,k)=>{const v=i.asistencia?.[k+1]||'', rp=i.repos?.[k+1]?.estado==='hecha'&&(v==='A'||v==='J'); return `<td class="${colCls(k)}"><button class="asis ${rp?'rep':''}" data-n="${k+1}" data-v="${v}" title="${v?ASIS[v]:'Sin marcar'}${rp?' · repuesta':''}">${v}</button></td>`}).join('')}
          <td class="resumen tabular" data-pct>${pctHtml(r)}</td><td class="tabular" data-fallas>${r.fallas||''}</td><td class="tabular" data-repo>${r.porReponer?`<a href="#" class="text-marca" onclick="event.preventDefault();ir('reposiciones')">${r.porReponer}</a>`:''}</td></tr>`}).join('')}</tbody>
    </table></div>` : sinAlumnas();
  const tabla=$('#cuerpoTab table'); if(!tabla) return;
  tabla.addEventListener('click',e=>{
    const b=e.target.closest('button.asis[data-n]'), th=e.target.closest('th.cl');
    if(b){ const tr=b.closest('tr'), i=insc(tr.dataset.insc), n=+b.dataset.n;
      const nv=CICLO[(CICLO.indexOf(b.dataset.v||'')+1)%CICLO.length];
      if(nv) i.asistencia[n]=nv; else delete i.asistencia[n];
      b.dataset.v=nv; b.textContent=nv; b.title=nv?ASIS[nv]:'Sin marcar';
      const r=resumenAsis(i); tr.querySelector('[data-pct]').innerHTML=pctHtml(r); tr.querySelector('[data-fallas]').textContent=r.fallas||''; tr.querySelector('[data-repo]').textContent=r.porReponer||'';
      guardar();
    } else if(th){ const n=+th.dataset.col; let k=0;
      tabla.querySelectorAll(`button.asis[data-n="${n}"]`).forEach(btn=>{ if(!btn.dataset.v){ btn.click(); k++; } });
      toast(k?`Clase ${n}: ${k} marcadas presentes`:`Clase ${n} ya estaba marcada`);
    }
  });
  // centra la clase de hoy o la próxima
  const ref=tabla.querySelector('th.col-hoy')||tabla.querySelector(`th[data-col="${(inf.proxima>=0?inf.proxima:inf.dictadas)+1}"]`);
  if(ref){ const w=$('#cuerpoTab .planilla-wrap'); w.scrollLeft=Math.max(0,ref.offsetLeft-w.clientWidth/2); }
}
function pctHtml(r){
  if(r.pct===null) return '<span class="text-muted">—</span>';
  const bajo=r.pct<DB.config.asisMin;
  return `<span class="${bajo?'text-danger':''}">${r.pct}%</span>`;
}
const sinAlumnas = () => `<div class="card"><div class="card-body text-center text-muted py-5"><i class="bi bi-people fs-1"></i>
  <p class="mb-2">Aún no hay ${DB.config.termP} inscritas en este curso.</p><button class="btn btn-marca" onclick="inscribirEnCurso()">Inscribir ${DB.config.termS}</button></div></div>`;

function inscribirEnCurso(){
  abrirEstudiante(); $('#estCurso').value=cursoActual; $('#estCurso').dispatchEvent(new Event('change'));
}

/* ---------- Pestaña: notas ---------- */
function tabNotas(c,inf,ins){
  const ev=c.evaluaciones||[], cf=DB.config, suma=ev.reduce((a,e)=>a+ +e.peso,0);
  $('#cuerpoTab').innerHTML = ins.length ? `
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
      <small class="text-muted">Escala 0–${cf.escala.toFixed(1)} · aprueba con ${cf.notaMin.toFixed(1)} y ${cf.asisMin}% de asistencia
        ${suma!==100?`<span class="text-danger ms-2"><i class="bi bi-exclamation-triangle"></i> Los porcentajes suman ${suma}%</span>`:''}</small>
      <button class="btn btn-sm btn-outline-secondary" onclick="abrirEvals()"><i class="bi bi-sliders"></i> Evaluaciones y porcentajes</button>
    </div>
    <div class="planilla-wrap"><table class="grilla">
      <thead><tr><th class="nom">${cap(cf.termS)}</th>
        ${ev.map(e=>`<th title="${e.clase?'Clase '+e.clase:''}">${esc(e.nombre)}<span class="d">${e.peso}%${e.clase?' · cl. '+e.clase:''}</span></th>`).join('')}
        <th class="resumen">Promedio</th><th>Asist.</th><th>Estado</th></tr></thead>
      <tbody>${ins.map(i=>{const e=est(i.estId);
        return `<tr data-insc="${i.id}"><td class="nom" title="${esc(e.nombre)}">${esc(e.nombre)}</td>
          ${ev.map(x=>{const v=i.notas?.[x.id]; return `<td><input class="nota ${v!==undefined&&v<cf.notaMin?'baja':''}" type="number" inputmode="decimal" step="0.1" min="0" max="${cf.escala}" data-ev="${x.id}" value="${v!==undefined?(+v).toFixed(1):''}" aria-label="${esc(x.nombre)} de ${esc(e.nombre)}"></td>`}).join('')}
          ${celdasResumen(i,c)}</tr>`}).join('')}</tbody>
    </table></div>
    <div class="small text-muted mt-2">El promedio se calcula solo con las evaluaciones que ya tienen nota; debajo se ve qué parte del curso va evaluada.</div>` : sinAlumnas();
  const tabla=$('#cuerpoTab table'); if(!tabla) return;
  tabla.addEventListener('change',e=>{
    const inp=e.target.closest('input.nota'); if(!inp) return;
    const tr=inp.closest('tr'), i=insc(tr.dataset.insc);
    let v=inp.value.replace(',','.');
    if(v===''){ delete i.notas[inp.dataset.ev]; }
    else { v=Math.min(cf.escala,Math.max(0,Math.round(+v*10)/10)); inp.value=v.toFixed(1); i.notas[inp.dataset.ev]=v; }
    inp.classList.toggle('baja', v!=='' && v<cf.notaMin);
    tr.querySelectorAll('[data-res]').forEach(td=>td.remove());
    tr.insertAdjacentHTML('beforeend',celdasResumen(i,c));
    guardar();
  });
  // Enter baja a la siguiente fila, como en una hoja de cálculo
  tabla.addEventListener('keydown',e=>{
    if(e.key!=='Enter') return; const inp=e.target.closest('input.nota'); if(!inp) return; e.preventDefault();
    const sig=inp.closest('tr').nextElementSibling?.querySelector(`input[data-ev="${inp.dataset.ev}"]`); (sig||inp).focus(); sig?.select();
  });
}
function celdasResumen(i,c){
  const n=resumenNotas(i,c), a=resumenAsis(i), [cls,txt]=estadoAcad(i,c);
  return `<td class="resumen tabular" data-res><span class="${n.prom!==null&&n.prom<DB.config.notaMin?'text-danger':''}">${fmtNota(n.prom)}</span>
      <div class="barra mt-1" title="${n.evaluado}% evaluado"><i style="width:${n.evaluado}%"></i></div></td>
    <td class="tabular" data-res>${pctHtml(a)}</td>
    <td data-res><span class="pill pill-${cls}">${txt}</span></td>`;
}

/* Editor de evaluaciones */
let evalsTemp=[];
function abrirEvals(){ evalsTemp=structuredClone(curso(cursoActual).evaluaciones||[]); pintarEvals(); modal('mEvals').show(); }
function pintarEvals(){
  const N=+curso(cursoActual).grupo.numClases||0;
  $('#listaEvals').innerHTML=evalsTemp.map((e,k)=>`<div class="d-flex gap-2 align-items-center">
    <input class="form-control form-control-sm" value="${esc(e.nombre)}" data-k="${k}" data-f="nombre" placeholder="Nombre" aria-label="Nombre">
    <div class="input-group input-group-sm" style="width:100px"><input type="number" min="0" max="100" class="form-control" value="${e.peso}" data-k="${k}" data-f="peso" aria-label="Porcentaje"><span class="input-group-text">%</span></div>
    <select class="form-select form-select-sm" style="width:110px" data-k="${k}" data-f="clase" aria-label="Clase"><option value="">Sin clase</option>
      ${Array.from({length:N},(_,j)=>`<option value="${j+1}" ${e.clase==j+1?'selected':''}>Clase ${j+1}</option>`).join('')}</select>
    <button type="button" class="btn btn-sm btn-outline-danger" data-del="${k}" title="Quitar"><i class="bi bi-trash"></i></button></div>`).join('');
  const s=evalsTemp.reduce((a,e)=>a+ +e.peso,0);
  $('#sumaPesos').innerHTML = s===100 ? `<span class="text-success"><i class="bi bi-check-circle"></i> Suman 100%</span>` : `<span class="text-danger"><i class="bi bi-exclamation-triangle"></i> Suman ${s}%; deben sumar 100%</span>`;
}
$('#listaEvals').addEventListener('input',e=>{ const t=e.target; if(t.dataset.k===undefined) return;
  const ev=evalsTemp[+t.dataset.k]; ev[t.dataset.f]= t.dataset.f==='nombre'?t.value : t.value===''?null:+t.value;
  if(t.dataset.f==='peso'){ const s=evalsTemp.reduce((a,x)=>a+ +x.peso,0); $('#sumaPesos').innerHTML = s===100?`<span class="text-success"><i class="bi bi-check-circle"></i> Suman 100%</span>`:`<span class="text-danger"><i class="bi bi-exclamation-triangle"></i> Suman ${s}%; deben sumar 100%</span>`; } });
$('#listaEvals').addEventListener('click',e=>{ const b=e.target.closest('[data-del]'); if(b){ evalsTemp.splice(+b.dataset.del,1); pintarEvals(); } });
$('#addEval').addEventListener('click',()=>{ evalsTemp.push({id:'ev'+uid(),nombre:'',peso:0,clase:null}); pintarEvals(); [...document.querySelectorAll('#listaEvals input[data-f="nombre"]')].at(-1)?.focus(); });
$('#formEvals').addEventListener('submit',e=>{ e.preventDefault();
  curso(cursoActual).evaluaciones=evalsTemp.filter(x=>x.nombre.trim()).map(x=>({...x,peso:+x.peso||0}));
  guardar(); modal('mEvals').hide(); pintarCurso(); toast('Evaluaciones guardadas'); });

/* ---------- Pestaña: plan de estudio ---------- */
function tabPlan(c){
  const h=(c.plan||[]).reduce((a,m)=>a+(+m.horas||0),0);
  $('#cuerpoTab').innerHTML=`<div class="card"><div class="card-body">
    ${c.plan.length?`<div class="small text-muted mb-2">${c.plan.length} módulos${h?` · ${h} h`:''}</div><div class="accordion accordion-flush" id="accPlan">${c.plan.map((m,k)=>`
      <div class="accordion-item"><h3 class="accordion-header"><button class="accordion-button ${k?'collapsed':''}" type="button" data-bs-toggle="collapse" data-bs-target="#m${k}">
        <span class="me-3 text-marca fw-bold tabular">${String(k+1).padStart(2,'0')}</span>${esc(m.titulo)}
        ${m.horas?`<span class="ms-auto me-3 small text-muted">${m.horas} h</span>`:''}</button></h3>
      <div id="m${k}" class="accordion-collapse collapse ${k?'':'show'}" data-bs-parent="#accPlan"><div class="accordion-body">
        <ul class="mb-0">${m.temas.map(t=>`<li>${esc(t)}</li>`).join('')||'<li class="text-muted">Sin temas</li>'}</ul></div></div></div>`).join('')}</div>`
    :`<div class="text-center py-4 text-muted"><i class="bi bi-file-earmark-text fs-1"></i><p>Este curso aún no tiene plan de estudio.</p>
        <button class="btn btn-marca" onclick="abrirCurso('${c.id}')">Subir plan de estudio</button></div>`}
  </div></div>`;
}

/* ---------- Hojas imprimibles ---------- */
function imprimirHoja(tipo){
  const c=curso(cursoActual), g=c.grupo, inf=infoCurso(c), cf=DB.config, N=+g.numClases||0;
  const ins=DB.inscripciones.filter(i=>i.cursoId===c.id), ev=c.evaluaciones||[];
  const cab=`<div class="cab"><div><h1>${esc(c.nombre)}</h1>${esc(cf.nombre)}</div><div style="text-align:right">${tipo==='planilla'?'PLANILLA DE ASISTENCIA Y NOTAS':'CRONOGRAMA DE CLASES'}<br>Impreso ${fechaLarga(hoyISO())}</div></div>
    <div class="datos"><div><b>Docente</b>${esc(g.docente||'—')}</div><div><b>Jornada</b>${esc(g.jornada)}</div><div><b>Horario</b>${horarioTexto(g)}</div>
      <div><b>Inicia</b>${inf.inicio?fechaLarga(inf.inicio):'—'}</div><div><b>Termina</b>${inf.fin?fechaLarga(inf.fin):'—'}</div><div><b>Intensidad</b>${N} clases · ${inf.horas} h</div></div>`;
  let cuerpo;
  if(tipo==='planilla'){
    cuerpo=`<table><thead><tr><th>#</th><th class="l">${cap(cf.termS)}</th>${Array.from({length:N},(_,k)=>`<th>${k+1}<br>${inf.fechas[k]?fechaMini(inf.fechas[k]):''}</th>`).join('')}<th>%</th>
      ${ev.map(e=>`<th>${esc(e.nombre)}<br>${e.peso}%</th>`).join('')}<th>Prom.</th></tr></thead>
      <tbody>${ins.map((i,k)=>{const r=resumenAsis(i), n=resumenNotas(i,c);
        return `<tr><td>${k+1}</td><td class="l">${esc(est(i.estId).nombre)}</td>${Array.from({length:N},(_,j)=>`<td>${i.asistencia?.[j+1]||''}</td>`).join('')}
        <td>${r.pct??''}${r.pct!==null?'%':''}</td>${ev.map(e=>`<td>${i.notas?.[e.id]!==undefined?fmtNota(i.notas[e.id]):''}</td>`).join('')}<td><b>${n.prom!==null?fmtNota(n.prom):''}</b></td></tr>`}).join('')}</tbody></table>
      <div style="margin-top:4px">P: presente · A: ausente (repone con costo) · T: tarde · J: excusa médica (repone sin costo). Aprueba con ${cf.notaMin.toFixed(1)} y ${cf.asisMin}% de asistencia.</div>
      <div class="firmas"><span>Firma docente</span><span>Coordinación académica</span></div>`;
  } else {
    cuerpo=`<table><thead><tr><th>Clase</th><th>Fecha</th><th class="l">Tema y contenido</th><th class="l">Metodología</th><th class="l">Materiales</th><th class="l">Evaluación</th></tr></thead>
      <tbody>${Array.from({length:N},(_,k)=>{const cl=(c.clases||[]).find(x=>x.n===k+1)||{}, f=inf.fechas[k], e=ev.filter(x=>x.clase==k+1);
        return `<tr><td><b>${k+1}</b></td><td>${f?DIAS[new Date(f+'T12:00').getDay()]+' '+fechaMini(f):''}</td><td class="l"><b>${esc(cl.tema||'')}</b>${cl.detalle?'<br>'+esc(cl.detalle):''}</td>
          <td class="l">${esc((cl.metodos||[]).join(', '))}</td><td class="l">${esc(cl.materiales||'')}</td><td class="l">${e.map(x=>esc(x.nombre)+' ('+x.peso+'%)').join('<br>')}</td></tr>`}).join('')}</tbody></table>`;
  }
  $('#areaRecibo').innerHTML=`<div class="hoja">${cab}${cuerpo}</div>`;
  window.print();
}

/* ===== pagos y recibos ===== */
function abrirPago(inscId){
  $('#formPago').reset(); $('#pagoImprimir').checked=true;
  $('#pagoInsc').innerHTML='<option value="">Selecciona…</option>'+DB.inscripciones.map(i=>{
    const e=est(i.estId),c=curso(i.cursoId);return `<option value="${i.id}">${esc(e?.nombre)} — ${esc(c?.nombre)} (saldo ${money(saldoInsc(i))})</option>`}).join('');
  if(inscId) $('#pagoInsc').value=inscId;
  mostrarSaldo(); modal('mPago').show();
}
function mostrarSaldo(){
  const i=insc($('#pagoInsc').value);
  if(!i){ $('#pagoSaldo').textContent='Selecciona una inscripción'; $('#pagoAtajos').innerHTML=''; return; }
  const qs=estadoCuotas(i), sig=qs.find(q=>q.falta>0);
  const vencido=qs.filter(q=>q.estado==='vencida').reduce((a,q)=>a+q.falta,0);
  $('#pagoSaldo').innerHTML=`Total ${money(totalInsc(i))} · Pagado ${money(pagado(i.id))} · <b>Saldo ${money(saldoInsc(i))}</b>`+
    (sig?`<div class="mt-1">Siguiente: <b>${esc(sig.etiqueta)}</b> · ${fechaLarga(sig.fecha)} · falta ${money(sig.falta)} ${pill(sig)}</div>`:'');
  const atajos=[];
  if(sig) atajos.push([`${sig.etiqueta}`,sig.falta,sig.abonado>0?`Saldo ${sig.etiqueta.toLowerCase()}`:sig.etiqueta]);
  if(vencido>0 && (!sig || vencido!==sig.falta)) atajos.push(['Todo lo vencido',vencido,'Pago cuotas vencidas']);
  if(saldoInsc(i)>0 && (!sig || saldoInsc(i)!==sig.falta)) atajos.push(['Saldo total',saldoInsc(i),'Pago total']);
  $('#pagoAtajos').innerHTML=`<div class="d-flex flex-wrap gap-2">${atajos.map(([t,v,conc])=>
    `<button type="button" class="btn btn-sm btn-outline-secondary" data-v="${v}" data-c="${esc(conc)}">${esc(t)} · ${money(v)}</button>`).join('')}</div>`;
  $('#pagoAtajos').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{ $('#pagoValor').value=b.dataset.v; $('#pagoConcepto').value=b.dataset.c; }));
  if(!$('#pagoValor').value && atajos.length){ $('#pagoValor').value=atajos[0][1]; $('#pagoConcepto').value=atajos[0][2]; }
}
$('#pagoInsc').addEventListener('change',()=>{ $('#pagoValor').value=''; mostrarSaldo(); });
$('#formPago').addEventListener('submit',ev=>{
  ev.preventDefault();
  const p={id:uid(),num:DB.config.consecutivo++,inscId:$('#pagoInsc').value,valor:+$('#pagoValor').value,
           metodo:$('#pagoMetodo').value,concepto:$('#pagoConcepto').value||'Abono',fecha:hoyISO()};
  DB.pagos.push(p); guardar(); modal('mPago').hide(); render(); toast('Pago registrado');
  if($('#pagoImprimir').checked) setTimeout(()=>imprimirRecibo(p.id),400);
});
function imprimirRecibo(pid){
  const p=DB.pagos.find(x=>x.id===pid), i=insc(p.inscId), e=est(i.estId), c=curso(i.cursoId), cf=DB.config;
  if(!esPagoCurso(p)) return imprimirReciboRepo(p,i,e,c);
  const saldoTras = totalInsc(i) - DB.pagos.filter(x=>x.inscId===i.id && x.num<=p.num && esPagoCurso(x)).reduce((a,x)=>a+ +x.valor,0);
  const f=(a,b)=>`<div class="fila"><span>${a}</span><span>${b}</span></div>`;
  const antes=estadoCuotas(i,p.num-1), despues=estadoCuotas(i,p.num);
  const cubiertas=despues.map((q,k)=>({q,aplicado:q.abonado-antes[k].abonado})).filter(x=>x.aplicado>0);
  const proxima=despues.find(q=>q.falta>0);
  const bloqueCuotas = cubiertas.length ? `<hr><b>Aplicado a:</b>${cubiertas.map(({q,aplicado})=>
      f(`${esc(q.etiqueta)}${q.falta>0?' (abono)':''}`, money(aplicado))).join('')}` : '';
  const bloqueProxima = proxima ? `${f('Próxima cuota:',fechaLarga(proxima.fecha))}${f('Valor:',money(proxima.falta))}` : '<div style="text-align:center"><b>¡CURSO PAGADO EN SU TOTALIDAD!</b></div>';
  $('#areaRecibo').innerHTML=`<div class="recibo ${cf.recibo}">
    <div style="text-align:center"><b style="font-size:1.2em">${esc(cf.nombre)}</b><br>${cf.nit?'NIT '+esc(cf.nit)+'<br>':''}${esc(cf.dir)}<br>${esc(cf.tel)}</div>
    <hr><div style="text-align:center"><b>RECIBO DE CAJA N.º ${String(p.num).padStart(5,'0')}</b></div>
    ${f('Fecha:',p.fecha)}<hr>
    ${f('Recibí de:','')}<div><b>${esc(e.nombre)}</b>${e.doc?'<br>Doc. '+esc(e.doc):''}</div><hr>
    ${f('Curso:','')}<div>${esc(c.nombre)}</div>
    ${f('Concepto:',esc(p.concepto))}${f('Método:',esc(p.metodo))}<hr>
    ${f('Valor curso:',money(totalInsc(i)))}
    ${f('<b>VALOR PAGADO:</b>','<b>'+money(p.valor)+'</b>')}
    ${bloqueCuotas}<hr>
    ${f('Saldo pendiente:',money(Math.max(0,saldoTras)))}
    ${bloqueProxima}<hr>
    <div style="text-align:center;margin-top:6px">${esc(cf.pie)}</div>
    ${cf.recibo==='carta'?'<div style="margin-top:40px;display:flex;justify-content:space-between"><span>____________________<br>Firma quien recibe</span><span>____________________<br>Firma estudiante</span></div>':'<br><br>'}
  </div>`;
  window.print();
}

/* ===== configuración ===== */
function cargarConfig(){
  const c=DB.config;
  $('#cfgNombre').value=c.nombre; $('#cfgNit').value=c.nit; $('#cfgTel').value=c.tel; $('#cfgDir').value=c.dir;
  $('#cfgColor').value=c.color; $('#cfgRecibo').value=c.recibo; $('#cfgPie').value=c.pie;
  $('#cfgEscala').value=c.escala; $('#cfgNotaMin').value=c.notaMin; $('#cfgAsisMin').value=c.asisMin; $('#cfgRepo').value=c.valorRepo??0; $('#cfgRepoV').value=c.valorRepoVirtual??0; $('#cfgHorasV').value=c.horasVirtual??4; $('#cfgDominio').value=c.dominio||'';
  $('#cfgIg').value=c.ig||''; $('#cfgWeb').value=c.web||''; pintarLogoPrev();
  $('#cfgRubro').innerHTML=Object.entries(RUBROS).map(([k,r])=>`<option value="${k}">${r.nombre}</option>`).join('');
  $('#cfgRubro').value=c.rubro; $('#cfgTermS').value=c.termS; $('#cfgTermP').value=c.termP;
}
$('#cfgRubro').addEventListener('change',e=>{const r=RUBROS[e.target.value]; $('#cfgTermS').value=r.s; $('#cfgTermP').value=r.p; $('#cfgColor').value=r.color;});
$('#formConfig').addEventListener('submit',ev=>{
  ev.preventDefault(); Object.assign(DB.config,{nombre:$('#cfgNombre').value,nit:$('#cfgNit').value,tel:$('#cfgTel').value,dir:$('#cfgDir').value,
    color:$('#cfgColor').value,recibo:$('#cfgRecibo').value,pie:$('#cfgPie').value,
    escala:+$('#cfgEscala').value||5, notaMin:+$('#cfgNotaMin').value||3, asisMin:+$('#cfgAsisMin').value||0, valorRepo:+$('#cfgRepo').value||0, valorRepoVirtual:+$('#cfgRepoV').value||0, horasVirtual:Math.max(1,+$('#cfgHorasV').value||4), dominio:$('#cfgDominio').value.trim().replace(/\/$/,''), ig:$('#cfgIg').value.trim(), web:$('#cfgWeb').value.trim()}); guardar(); render(); toast('Configuración guardada');
});
function guardarRubro(){
  Object.assign(DB.config,{rubro:$('#cfgRubro').value,termS:$('#cfgTermS').value.toLowerCase(),termP:$('#cfgTermP').value.toLowerCase(),color:$('#cfgColor').value});
  guardar(); render(); toast('Rubro aplicado');
}
function exportar(){
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(DB,null,2)],{type:'application/json'}));
  a.download=`academia-${hoyISO()}.json`; a.click();
}
function importar(inp){
  const r=new FileReader(); r.onload=()=>{ try{ DB=JSON.parse(r.result); guardar(); cargarConfig(); render(); toast('Datos importados'); }catch(e){ toast('El archivo no es un respaldo válido'); } };
  r.readAsText(inp.files[0]); inp.value='';
}
function reiniciar(){
  const b=event.target.closest('button');
  if(b.dataset.ok){ DB=datosEjemplo(); guardar(); cargarConfig(); render(); toast('Datos de ejemplo cargados'); delete b.dataset.ok; b.innerHTML='<i class="bi bi-arrow-counterclockwise"></i> Cargar datos de ejemplo'; }
  else { b.dataset.ok=1; b.textContent='¿Seguro? Borra todo. Clic otra vez'; setTimeout(()=>{delete b.dataset.ok;b.innerHTML='<i class="bi bi-arrow-counterclockwise"></i> Cargar datos de ejemplo';},4000); }
}
