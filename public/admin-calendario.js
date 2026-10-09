/* =========================================================
   CALENDARIO SEMANAL ÚNICO (clases y reposiciones)
   Una sola forma de ver todo: columnas lunes–domingo y filas por momento del día
   (mañana, media mañana, tarde, media tarde y noche). Cada tarjeta muestra la hora, el título de la clase,
   el curso, el profesor, los módulos y los estudiantes. Se usa en Reposiciones, en Cursos y dentro de cada curso.
   ========================================================= */
const MOMENTOS = [
  {n:'Mañana',        r:'antes de las 9:00',     ic:'bi-sunrise',          hasta:9*60},
  {n:'Media mañana',  r:'9:00 – 12:00',          ic:'bi-brightness-high',  hasta:12*60},
  {n:'Tarde',         r:'12:00 – 3:00 p. m.',    ic:'bi-sun',              hasta:15*60},
  {n:'Media tarde',     r:'3:00 – 6:00 p. m.',     ic:'bi-sunset',           hasta:18*60},
  {n:'Noche',         r:'desde las 6:00 p. m.',  ic:'bi-moon-stars',       hasta:24*60}
];
const momentoDe = ini => MOMENTOS.findIndex(m=>aMin(ini)<m.hasta);
const calBase = o => ({semana:lunesDe(hoyISO()),clases:true,repos:false,area:'',prof:'',cursoId:'',nuevo:false,...o});
const CALS = {
  calRepo:    calBase({repos:true,nuevo:true}),     // Reposiciones: clases + espacios de reposición
  calCursos:  calBase({}),                          // Cursos: todas las clases
  calCursoUno:calBase({})                           // dentro de un curso
};

function eventosCal(cal){
  const desde=cal.semana, hasta=sumarDias(desde,6), out=[];
  const okArea=a=>!cal.area || a===cal.area;
  if(cal.clases) DB.cursos.forEach(c=>{
    if(cal.cursoId && c.id!==cal.cursoId) return;
    if(!okArea(c.areaId) || (cal.prof && c.grupo?.profesionalId!==cal.prof)) return;
    const alumnos=DB.inscripciones.filter(i=>i.cursoId===c.id).map(i=>est(i.estId)?.nombre).filter(Boolean), N=+c.grupo?.numClases||0;
    sesionesCurso(c).forEach((x,k)=>{
      if(!x.fecha || x.fecha<desde || x.fecha>hasta) return;
      out.push({tipo:'clase',fecha:x.fecha,ini:x.ini,fin:x.fin,n:k+1,N,cursoId:c.id,curso:c.nombre,areaId:c.areaId,
        titulo:temaClase(c,k+1),profesor:c.grupo?.docente||'',modulos:modulosDeClase(c,k+1).map(m=>m.m.titulo),estudiantes:alumnos});
    });
  });
  if(cal.repos){
    const L=listaRepos();
    (DB.espacios||[]).forEach(x=>{
      if(x.fecha<desde || x.fecha>hasta) return;
      const c=curso(x.cursoId), ar=x.areaId||c?.areaId||'';
      if(cal.cursoId && x.cursoId!==cal.cursoId) return;
      if(!okArea(ar) || (cal.prof && x.profesionalId!==cal.prof)) return;
      const ins=L.filter(y=>y.r.espacioId===x.id);
      out.push({tipo:'repo',id:x.id,fecha:x.fecha,ini:x.horaIni,fin:x.horaFin,cursoId:x.cursoId,curso:c?.nombre||'Cualquier curso',areaId:ar,
        titulo:x.clase?`Clase ${x.clase}: ${temaClase(c,x.clase)}`:'Reposición libre',n:x.clase||0,profesor:docenteEsp(x),
        modulos:x.clase&&c?modulosDeClase(c,x.clase).map(m=>m.m.titulo):[],
        estudiantes:ins.map(y=>`${y.e.nombre} (clase ${y.n})`),cupos:x.cupos,lleno:ins.length>=x.cupos});
    });
  }
  return out;
}
function tarjetaCal(e,hoy){
  const ar=area(e.areaId), color=ar?.color||'var(--marca)', pasada=e.fecha<hoy;
  const alumnos=e.estudiantes, mostrar=alumnos.slice(0,3).map(a=>esc(a.split(' ').slice(0,2).join(' '))).join(', ');
  return `<button type="button" class="cal-ev ${e.tipo==='repo'?'cal-repo':'cal-clase'} ${e.lleno?'lleno':''} ${pasada?'pasada':''}" style="--c:${esc(color)}"
      data-ev="${e.tipo}" data-curso="${e.cursoId||''}" data-n="${e.n||''}" data-id="${e.id||''}" title="${esc(alumnos.join(', '))}">
    <div class="cal-h"><i class="bi ${e.tipo==='repo'?'bi-arrow-repeat':'bi-mortarboard'}"></i> ${rangoHoras(e.ini,e.fin)}${e.tipo==='clase'?` <span class="cal-n">Clase ${e.n}/${e.N}</span>`:' <span class="cal-n">Reposición</span>'}</div>
    <div class="cal-t">${esc(e.titulo||'Sin tema')}</div>
    <div class="cal-c">${esc(e.curso)}${ar && ar.nombre.toLowerCase()!==String(e.curso).toLowerCase() ? ` · ${esc(ar.nombre)}` : ''}</div>
    ${e.profesor?`<div class="cal-p"><i class="bi bi-person-badge"></i> ${esc(e.profesor)}</div>`:'<div class="cal-p text-muted"><i class="bi bi-person-badge"></i> Sin profesor</div>'}
    ${e.modulos.length?`<div class="cal-m">${e.modulos.slice(0,2).map(m=>`<span><i class="bi bi-collection"></i> ${esc(m)}</span>`).join('')}${e.modulos.length>2?`<span>+${e.modulos.length-2}</span>`:''}</div>`:''}
    <div class="cal-e"><i class="bi bi-people"></i> ${alumnos.length?`<b>${alumnos.length}</b> ${esc(mostrar)}${alumnos.length>3?` +${alumnos.length-3}`:''}`:'<span class="text-muted">Sin estudiantes</span>'}${e.tipo==='repo'?` <span class="cal-cupos">${alumnos.length}/${e.cupos}</span>`:''}</div>
  </button>`;
}
function calHtml(id){
  const cal=CALS[id], hoy=hoyISO(), ev=eventosCal(cal), fin=sumarDias(cal.semana,6);
  const dias=Array.from({length:7},(_,k)=>sumarDias(cal.semana,k)), d0=new Date(cal.semana+'T12:00'), d6=new Date(fin+'T12:00');
  const rotulo = d0.getMonth()===d6.getMonth() ? `${d0.getDate()} – ${d6.getDate()} de ${d6.toLocaleDateString('es-CO',{month:'long'})} ${d6.getFullYear()}` : `${fechaMini(cal.semana)} – ${fechaMini(fin)} ${d6.getFullYear()}`;
  const opArea=(DB.areas||[]).map(a=>`<option value="${a.id}" ${a.id===cal.area?'selected':''}>${esc(a.nombre)}</option>`).join('');
  const opProf=(DB.profesionales||[]).filter(p=>p.activo!==false).map(p=>`<option value="${p.id}" ${p.id===cal.prof?'selected':''}>${esc(p.nombre)}</option>`).join('');
  const celdas=MOMENTOS.map((m,i)=>`<div class="cal-mom"><i class="bi ${m.ic}"></i><b>${m.n}</b><small>${m.r}</small></div>`+dias.map(iso=>{
    const lista=ev.filter(e=>e.fecha===iso && momentoDe(e.ini)===i).sort((a,b)=>a.ini.localeCompare(b.ini));
    return `<div class="cal-celda ${iso===hoy?'hoy':''}">${lista.map(e=>tarjetaCal(e,hoy)).join('')}</div>`; }).join('')).join('');
  return `<div class="cal-barra">
      <div class="btn-group btn-group-sm"><button type="button" class="btn btn-outline-secondary" data-nav="-1" title="Semana anterior"><i class="bi bi-chevron-left"></i></button>
        <button type="button" class="btn btn-outline-secondary" data-nav="0">Hoy</button>
        <button type="button" class="btn btn-outline-secondary" data-nav="1" title="Semana siguiente"><i class="bi bi-chevron-right"></i></button></div>
      <span class="fw-semibold small tabular">${rotulo}</span>
      <div class="btn-group btn-group-sm" role="group" aria-label="Qué mostrar">
        <input type="checkbox" class="btn-check" id="${id}-c" data-tog="clases" ${cal.clases?'checked':''}><label class="btn btn-outline-secondary" for="${id}-c"><i class="bi bi-mortarboard"></i> Clases</label>
        <input type="checkbox" class="btn-check" id="${id}-r" data-tog="repos" ${cal.repos?'checked':''}><label class="btn btn-outline-secondary" for="${id}-r"><i class="bi bi-arrow-repeat"></i> Reposiciones</label></div>
      <select class="form-select form-select-sm w-auto" data-sel="area" aria-label="Área"><option value="">Todas las áreas</option>${opArea}</select>
      <select class="form-select form-select-sm w-auto" data-sel="prof" aria-label="Profesional"><option value="">Todos los profesionales</option>${opProf}</select>
      ${cal.nuevo?'<button type="button" class="btn btn-sm btn-marca ms-auto" data-nuevo=""><i class="bi bi-calendar-plus"></i> Nuevo espacio</button>':''}</div>
    <div class="cal"><div class="cal-grid">
      <div class="cal-cab cal-esq"></div>${dias.map(iso=>{ const d=new Date(iso+'T12:00'); return `<div class="cal-cab ${iso===hoy?'hoy':''}"><span>${DIAS[d.getDay()]}</span> <b>${d.getDate()}</b>${cal.nuevo?`<button type="button" class="cal-mas" data-nuevo="${iso}" title="Abrir un espacio de reposición este día"><i class="bi bi-plus-circle"></i></button>`:''}</div>`; }).join('')}
      ${celdas}</div></div>
    <div class="small text-muted mt-2"><i class="bi bi-info-circle"></i> Así se ven todas las clases${cal.repos?' y reposiciones':''}: la jornada se divide en mañana, media mañana, tarde, media tarde y noche.
      ${ev.length?'':' <b>No hay nada esta semana con estos filtros.</b>'}</div>`;
}
function pintarCal(id){ const el=document.getElementById(id); if(el && !el.hidden) el.innerHTML=calHtml(id); }
function pintarCalendarios(){ Object.keys(CALS).forEach(pintarCal); }

document.addEventListener('click',e=>{
  const root=e.target.closest('[data-cal]'); if(!root) return; const id=root.dataset.cal, cal=CALS[id]; if(!cal) return;
  const nav=e.target.closest('[data-nav]');
  if(nav){ cal.semana = +nav.dataset.nav===0 ? lunesDe(hoyISO()) : sumarDias(cal.semana,7*+nav.dataset.nav); pintarCal(id); return; }
  const nuevo=e.target.closest('[data-nuevo]'); if(nuevo){ abrirEspacio(null,nuevo.dataset.nuevo||undefined); return; }
  const card=e.target.closest('[data-ev]'); if(!card) return;
  if(card.dataset.ev==='repo') abrirEspacio(card.dataset.id);
  else { verCurso(card.dataset.curso,'clases'); abrirClase(+card.dataset.n); }
});
document.addEventListener('change',e=>{
  const root=e.target.closest('[data-cal]'); if(!root) return; const id=root.dataset.cal, cal=CALS[id]; if(!cal) return;
  if(e.target.dataset.tog){ cal[e.target.dataset.tog]=e.target.checked; pintarCal(id); }
  else if(e.target.dataset.sel){ cal[e.target.dataset.sel]=e.target.value; pintarCal(id); }
});

/* Cursos: tarjetas o calendario */
function setVistaCursos(v){
  const cal=v==='cal';
  $('#gridCursos').hidden=cal; $('#calCursos').hidden=!cal;
  $('#vcTarjetas').classList.toggle('active',!cal); $('#vcCal').classList.toggle('active',cal);
  pintarCal('calCursos');
}
/* Dentro de un curso: lista o calendario de sus clases */
let vistaClases='lista';
function semanaInicialCurso(c){
  const inf=infoCurso(c), hoy=hoyISO();
  return lunesDe(inf.inicio && inf.fin && hoy>=inf.inicio && hoy<=inf.fin ? hoy : (inf.inicio||hoy));
}
