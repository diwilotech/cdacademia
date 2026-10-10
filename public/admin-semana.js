/* =========================================================
   HORARIO DEL CURSO (formulario)
   Se llenan solo las clases de la PRIMERA semana, como una lista: «Clase 1: sábado, Clase 2: martes».
   La fecha de la primera clase marca dónde empieza; las demás clases se repiten solas con ese mismo patrón
   hasta completar el total. «Calcular clases» arma todas las fechas y revisa si chocan con otras clases
   futuras del área (o del mismo profesor). Edita franjasTemp = [{dia, ini, fin}] (en el orden en que ocurren).
   ========================================================= */
let calculado = false, avisoChoques = false;
const aMin = h => { const [a,b] = String(h||'0:0').split(':').map(Number); return a*60 + b; };
const deMin = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const diaDeFecha = iso => new Date(iso+'T12:00').getDay();
/* Primera fecha desde `iso` (incluida) que cae en ese día de la semana */
function proximaFecha(iso,dia){ const d=new Date(iso+'T12:00'); while(d.getDay()!==dia) d.setDate(d.getDate()+1); return isoLocal(d); }

/* ---------- orden de la primera semana ---------- */
/* Las clases se numeran en el orden en que ocurren, empezando por el día de la primera clase */
function diaAncla(){
  const f=$('#curInicio').value;
  if(f && franjasTemp.some(x=>x.dia===diaDeFecha(f))) return diaDeFecha(f);
  return franjasTemp[0]?.dia ?? 1;
}
function ordenarFranjas(){
  const a=diaAncla();
  franjasTemp.sort((p,q)=>((p.dia-a+7)%7)-((q.dia-a+7)%7) || p.ini.localeCompare(q.ini));
}
/* ¿Dos clases del mismo día se pisan? */
const hayCruce = () => franjasTemp.some((x,i)=>franjasTemp.some((y,j)=>j>i && x.dia===y.dia && aMin(x.ini)<aMin(y.fin) && aMin(y.ini)<aMin(x.fin)));

/* Clases que resultan del formulario tal como está */
function sesionesActuales(){
  const prev=curso($('#curId').value);
  return sesionesGrupo({slots:franjasTemp,inicio:$('#curInicio').value,numClases:+$('#curNumClases').value||0,festivos:$('#curFestivos').checked},prev?.clases||[]);
}

/* ---------- lista de clases por semana ---------- */
function pintarFranjas(){
  const N=Math.max(1,+$('#curNumClases').value||1), ses=sesionesActuales();
  $('#curPorSemana').value=franjasTemp.length;
  $('#curAyudaSemana').textContent = franjasTemp.length>1
    ? `Llena las ${franjasTemp.length} clases de la primera semana (por ejemplo, clase 1 el sábado y clase 2 el martes). Las demás se llenan solas con ese mismo patrón hasta completar las ${N} clases.`
    : `Llena la clase de la primera semana. Las demás se repiten solas cada semana hasta completar las ${N} clases.`;
  $('#curFranjas').innerHTML=franjasTemp.map((x,k)=>`<div class="fila-clase d-flex flex-wrap gap-2 align-items-center" data-k="${k}">
    <span class="badge bg-marca-suave text-marca nclase">Clase ${k+1}</span>
    <select class="form-select form-select-sm" style="width:130px" data-f="dia" aria-label="Día de la clase ${k+1}">${opcionesDia(x.dia)}</select>
    <label class="small text-muted d-flex align-items-center gap-1">Inicio <input type="time" class="form-control form-control-sm" style="width:112px" data-f="ini" value="${x.ini}"></label>
    <label class="small text-muted d-flex align-items-center gap-1">Fin <input type="time" class="form-control form-control-sm" style="width:112px" data-f="fin" value="${x.fin}"></label>
    <span class="fecha-clase ms-auto">${ses[k]?.fecha?`${DIAS[diaDeFecha(ses[k].fecha)]} ${fechaMini(ses[k].fecha)}`:''}</span></div>`).join('');
}
function ajustarPorSemana(n){
  n=Math.max(1,Math.min(14,Math.round(n)||1));
  while(franjasTemp.length<n){                                    // la nueva clase va el día siguiente a la última, a la misma hora
    const u=franjasTemp.at(-1)||{dia:6,ini:'08:00',fin:'10:00'}; franjasTemp.push({dia:(u.dia+1)%7,ini:u.ini,fin:u.fin});
  }
  franjasTemp.length=n;
}
$('#curPorSemana').addEventListener('input',e=>{ if(e.target.value==='') return; ajustarPorSemana(+e.target.value); ordenarFranjas(); refrescarHorario(); });
$('#curPorSemana').addEventListener('change',e=>{ e.target.value=franjasTemp.length; });
$('#curFranjas').addEventListener('input',e=>{          // al escribir solo se guarda y se recalcula (sin mover filas)
  const row=e.target.closest('[data-k]'), f=e.target.dataset.f; if(!row||!f||f==='dia') return;
  franjasTemp[+row.dataset.k][f]=e.target.value; resumenFechasForm();
});
$('#curFranjas').addEventListener('change',e=>{          // al terminar de cambiar, se reordena
  const row=e.target.closest('[data-k]'), f=e.target.dataset.f; if(!row||!f) return;
  const k=+row.dataset.k, x=franjasTemp[k];
  if(f==='dia'){
    const eraAncla = x.dia===diaAncla() && franjasTemp.findIndex(y=>y.dia===x.dia)===k, inicio=$('#curInicio').value;
    x.dia=+e.target.value;
    // la clase 1 cambió de día: la fecha de la primera clase pasa al siguiente día igual
    if(eraAncla && inicio) $('#curInicio').value=proximaFecha(inicio,x.dia);
  } else x[f]=e.target.value;
  ordenarFranjas(); refrescarHorario();
});
$('#curInicio').addEventListener('change',()=>{ ordenarFranjas(); refrescarHorario(); });
function ajustarNumClases(){ pintarFranjas(); resumenFechasForm(); }
function refrescarHorario(){ pintarFranjas(); resumenFechasForm(); }

/* ---------- calcular clases y revisar choques ---------- */
/* Choques de las clases (de hoy en adelante) con las de otros cursos del mismo área o del mismo profesor,
   y con espacios de reposición del área o del profesor */
function chocesCurso(ses){
  const hoy=hoyISO(), areaId=$('#curArea').value, profId=$('#curProf').value, id=$('#curId').value, out=[];
  const comparados=new Set();
  const motivo=(cursoAreaId,cursoProfId)=>[areaId&&cursoAreaId===areaId?'misma área':'', profId&&cursoProfId===profId?'mismo profesor':''].filter(Boolean).join(' y ');
  DB.cursos.forEach(o=>{
    if(o.id===id) return;
    const why=motivo(o.areaId,o.grupo?.profesionalId); if(!why) return;
    comparados.add(o.id);
    sesionesCurso(o).forEach((y,j)=>{
      if(!y.fecha || y.fecha<hoy) return;
      ses.forEach((x,k)=>{
        if(x.fecha && x.fecha===y.fecha && x.ini && y.ini && aMin(x.ini)<aMin(y.fin) && aMin(y.ini)<aMin(x.fin))
          out.push({n:k+1,x,otro:o.nombre,tipo:`clase ${j+1} (${rangoHoras(y.ini,y.fin)})`,why});
      });
    });
  });
  (DB.espacios||[]).forEach(sp=>{
    if(sp.fecha<hoy) return;
    const why=motivo(sp.areaId||curso(sp.cursoId)?.areaId,sp.profesionalId); if(!why) return;
    ses.forEach((x,k)=>{
      if(x.fecha===sp.fecha && aMin(x.ini)<aMin(sp.horaFin) && aMin(sp.horaIni)<aMin(x.fin))
        out.push({n:k+1,x,otro:'Espacio de reposición',tipo:`${rangoHoras(sp.horaIni,sp.horaFin)}${sp.docente?' · '+sp.docente:''}`,why});
    });
  });
  return {choques:out, revisados:comparados.size};
}
function pintarCalculo(){
  const caja=$('#curCalculo'); caja.hidden=!calculado; if(!calculado) return;
  const ses=sesionesActuales(), f=ses.filter(x=>x.fecha);
  if(!f.length){ caja.innerHTML='<div class="alert alert-warning small mb-0">Elige la fecha de la primera clase y el horario para calcular.</div>'; return; }
  const {choques,revisados}=chocesCurso(ses), conChoque=new Set(choques.map(c=>c.n));
  const horas=f.reduce((a,x)=>a+horasSesion(x),0);
  caja.innerHTML=`<div class="border rounded p-3 bg-white">
    <div class="fw-semibold mb-2"><i class="bi bi-calculator text-marca"></i> ${f.length} clases calculadas · ${fechaLarga(f[0].fecha)} → ${fechaLarga(f.at(-1).fecha)} · ${horas} h</div>
    <div class="d-flex flex-wrap gap-1 mb-3" style="max-height:170px;overflow:auto">${ses.map((x,k)=>x.fecha
      ? `<span class="tag tabular ${conChoque.has(k+1)?'border-danger text-danger':''}">${conChoque.has(k+1)?'<i class="bi bi-exclamation-triangle-fill text-danger"></i> ':''}<b>${k+1}</b> · ${DIAS[diaDeFecha(x.fecha)]} ${fechaMini(x.fecha)} · ${rangoHoras(x.ini,x.fin)}</span>`
      : `<span class="tag tabular text-muted"><b>${k+1}</b> · sin fecha</span>`).join('')}</div>
    ${!$('#curArea').value && !$('#curProf').value
      ? '<div class="text-warning small"><i class="bi bi-info-circle"></i> Elige el área (o el docente) del curso para revisar si chocan con otras clases.</div>'
      : choques.length
        ? `<div class="text-danger fw-semibold small mb-1"><i class="bi bi-exclamation-triangle"></i> ${choques.length} ${choques.length===1?'choque':'choques'} con otras clases</div>
           ${choques.slice(0,12).map(c=>`<div class="small">Clase ${c.n} (${DIAS[diaDeFecha(c.x.fecha)]} ${fechaMini(c.x.fecha)}, ${rangoHoras(c.x.ini,c.x.fin)}) choca con <b>${esc(c.otro)}</b> · ${esc(c.tipo)} <span class="text-muted">— ${c.why}</span></div>`).join('')}
           ${choques.length>12?`<div class="small text-muted">…y ${choques.length-12} más</div>`:''}`
        : `<div class="text-success small"><i class="bi bi-check-circle"></i> No choca con ninguna clase futura (revisé ${revisados} ${revisados===1?'curso':'cursos'} de la misma área o profesor y los espacios de reposición).</div>`}
  </div>`;
}
$('#curCalcular').addEventListener('click',()=>{ calculado=true; pintarCalculo(); resumenFechasForm(); });
/* Al guardar con choques, avisa una vez; si vuelve a guardar sin cambiar nada, se guarda igual */
function frenarPorChoques(){
  if(!$('#curArea').value && !$('#curProf').value) return false;
  const n=chocesCurso(sesionesActuales()).choques.length;
  if(!n){ avisoChoques=false; return false; }
  if(avisoChoques){ avisoChoques=false; return false; }
  avisoChoques=true; calculado=true; pintarCalculo();
  $('#curCalculo').scrollIntoView?.({behavior:'smooth',block:'center'});
  toast(`Hay ${n} ${n===1?'clase que choca':'clases que chocan'} con otras. Revisa y pulsa Guardar otra vez si quieres guardarlo así.`);
  return true;
}

/* ---------- validación y datos para guardar ---------- */
function validarHorario(){
  if(!franjasTemp.length) return 'Agrega al menos una clase en la semana';
  if(franjasTemp.some(x=>!x.ini||!x.fin||x.fin<=x.ini)) return 'En cada clase, la hora final debe ser después de la inicial';
  if(hayCruce()) return 'Dos clases del mismo día se cruzan en el horario';
  return null;
}
function construirGrupo(pro){
  return normGrupo({docente:pro?pro.nombre:'',profesionalId:pro?pro.id:'',jornada:$('#curJornada').value,numClases:Math.max(1,+$('#curNumClases').value||16),
    slots:franjasTemp.map(x=>({...x})),inicio:$('#curInicio').value,festivos:$('#curFestivos').checked});
}

/* Resumen de fechas en vivo dentro del formulario */
function resumenFechasForm(){
  avisoChoques=false;                                     // cualquier cambio vuelve a pedir la revisión al guardar
  const caja=$('#curResumenFechas'), N=+$('#curNumClases').value||0, ses=sesionesActuales(), f=ses.map(x=>x.fecha).filter(Boolean);
  pintarCalculo();
  const inicio=$('#curInicio').value;
  if(!inicio || !franjasTemp.length || !f.length){ caja.innerHTML='<i class="bi bi-info-circle"></i> Elige la fecha de la primera clase para calcular cuándo termina.'; return; }
  const diasConClase=new Set(franjasTemp.map(x=>x.dia)), dia0=diaDeFecha(inicio), h=ses.reduce((a,x)=>a+(x.fecha?horasSesion(x):0),0);
  const aviso = diasConClase.has(dia0) ? '' : `<div class="text-warning"><i class="bi bi-exclamation-triangle"></i> La primera clase cae ${DIAS_L[dia0]}, que no tiene clase en la lista. Empezará el ${fechaLarga(f[0])}.</div>`;
  const fin=f.at(-1), semanas=Math.ceil((new Date(fin)-new Date(f[0]))/864e5/7)+1;
  const saltados=[]; if($('#curFestivos').checked){ let t=new Date(f[0]+'T12:00Z'); while(t.toISOString().slice(0,10)<=fin){ const iso=t.toISOString().slice(0,10); if(diasConClase.has(t.getUTCDay())&&esFestivo(iso)) saltados.push(iso); t.setUTCDate(t.getUTCDate()+1);} }
  caja.innerHTML=aviso+`<b>Termina el ${DIAS_L[diaDeFecha(fin)]} ${fechaLarga(fin)}</b> · ${semanas} semanas · ${N} clases = <b>${h} h</b>`+
    (saltados.length?`<div class="text-muted mt-1"><i class="bi bi-calendar-x"></i> Se saltan festivos: ${saltados.map(fechaCorta).join(', ')}</div>`:'');
}
