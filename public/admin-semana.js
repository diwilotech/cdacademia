/* =========================================================
   HORARIO DEL CURSO (formulario)
   Se llenan solo las clases de la PRIMERA semana, como una lista: «Clase 1: sábado, Clase 2: martes».
   La fecha de la primera clase marca dónde empieza; las demás clases se repiten solas con ese mismo patrón
   hasta completar el total. Edita franjasTemp = [{dia, ini, fin}] (en el orden en que ocurren).
   Opción aparte: «las semanas no son iguales» → cada clase con su propia fecha (sesionesTemp = [{fecha, ini, fin}]).
   ========================================================= */
let modoCurso = 'semanal', sesionesTemp = [];
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

/* ---------- lista de clases por semana ---------- */
function pintarFranjas(){
  const N=Math.max(1,+$('#curNumClases').value||1), inicio=$('#curInicio').value;
  const ses=sesionesGrupo({slots:franjasTemp,inicio,numClases:N,festivos:$('#curFestivos').checked});
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

/* ---------- modo y refresco ---------- */
function aplicarModoCurso(){
  const v = modoCurso==='variable';
  $('#curModoVarChk').checked=v;
  $('#curBloqueSemanal').hidden=v; $('#curBloqueVariable').hidden=!v;
  $('#curInicioWrap').hidden=v; $('#curFestivosWrap').hidden=v;
}
function refrescarHorario(){
  if(modoCurso==='semanal') pintarFranjas(); else pintarVariable();
  resumenFechasForm();
}
$('#curModoVarChk').addEventListener('change',e=>{
  modoCurso=e.target.checked?'variable':'semanal';
  // al pasar a «cada clase en su fecha» se parte de lo que ya se armó, para solo cambiar lo distinto
  if(modoCurso==='variable' && !sesionesTemp.some(s=>s.fecha)) rellenarDesdeSemanal(true);
  aplicarModoCurso(); refrescarHorario();
});

/* ---------- cada clase en su fecha ---------- */
function ajustarNumClases(){
  if(modoCurso==='variable') pintarVariable(); else pintarFranjas();
  resumenFechasForm();
}
function pintarVariable(){
  const N=Math.max(1,+$('#curNumClases').value||1);
  while(sesionesTemp.length<N){ const u=sesionesTemp.at(-1); sesionesTemp.push({fecha:'',ini:u?.ini||'08:00',fin:u?.fin||'10:00'}); }
  sesionesTemp.length=N;
  $('#curFechasClases').innerHTML=sesionesTemp.map((s,k)=>`<div class="fila-clase d-flex flex-wrap gap-2 align-items-center" data-k="${k}">
    <span class="badge bg-marca-suave text-marca nclase">Clase ${k+1}</span>
    <input type="date" class="form-control form-control-sm" style="width:150px" data-f="fecha" value="${s.fecha||''}" aria-label="Fecha de la clase ${k+1}">
    <span class="small text-muted" style="width:62px" data-dia>${s.fecha?DIAS_L[diaDeFecha(s.fecha)]:''}</span>
    <label class="small text-muted d-flex align-items-center gap-1">Inicio <input type="time" class="form-control form-control-sm" style="width:112px" data-f="ini" value="${s.ini||''}"></label>
    <label class="small text-muted d-flex align-items-center gap-1">Fin <input type="time" class="form-control form-control-sm" style="width:112px" data-f="fin" value="${s.fin||''}"></label></div>`).join('');
}
$('#curFechasClases').addEventListener('input',e=>{
  const row=e.target.closest('[data-k]'), f=e.target.dataset.f; if(!row||!f) return;
  sesionesTemp[+row.dataset.k][f]=e.target.value;
  if(f==='fecha') row.querySelector('[data-dia]').textContent = e.target.value ? DIAS_L[diaDeFecha(e.target.value)] : '';
  resumenFechasForm();
});
/* Copia el horario semanal (con sus fechas) a la lista clase por clase */
function rellenarDesdeSemanal(silencioso){
  const N=Math.max(1,+$('#curNumClases').value||1), inicio=$('#curInicio').value;
  if(!inicio || !franjasTemp.length){ if(!silencioso) toast('Primero llena las clases de la semana y la fecha de la primera clase'); sesionesTemp=[]; return; }
  sesionesTemp=sesionesGrupo({slots:franjasTemp,inicio,numClases:N,festivos:$('#curFestivos').checked}).map(s=>({fecha:s.fecha||'',ini:s.ini,fin:s.fin}));
}
$('#curRellenar').addEventListener('click',()=>{ rellenarDesdeSemanal(false); refrescarHorario(); });

/* ---------- validación y datos para guardar ---------- */
function validarHorario(){
  if(modoCurso==='semanal'){
    if(!franjasTemp.length) return 'Agrega al menos una clase en la semana';
    if(franjasTemp.some(x=>!x.ini||!x.fin||x.fin<=x.ini)) return 'En cada clase, la hora final debe ser después de la inicial';
    if(hayCruce()) return 'Dos clases del mismo día se cruzan en el horario';
    return null;
  }
  const S=sesionesTemp.slice(0,Math.max(1,+$('#curNumClases').value||1));
  if(S.some(s=>!s.fecha)) return 'Falta la fecha de alguna clase';
  if(S.some(s=>!s.ini||!s.fin||s.fin<=s.ini)) return 'En cada clase, la hora final debe ser después de la inicial';
  return null;
}
function construirGrupo(pro){
  const base={docente:pro?pro.nombre:'',profesionalId:pro?pro.id:'',jornada:$('#curJornada').value,numClases:Math.max(1,+$('#curNumClases').value||16)};
  if(modoCurso==='variable'){
    const S=sesionesTemp.slice(0,base.numClases).map(s=>({fecha:s.fecha,ini:s.ini,fin:s.fin})).sort((a,b)=>(a.fecha+a.ini).localeCompare(b.fecha+b.ini));
    return normGrupo({...base,modo:'variable',sesiones:S,inicio:S[0].fecha,festivos:false});
  }
  return normGrupo({...base,slots:franjasTemp.map(x=>({...x})),inicio:$('#curInicio').value,festivos:$('#curFestivos').checked});
}

/* Resumen de fechas en vivo dentro del formulario */
function resumenFechasForm(){
  const prev=curso($('#curId').value), caja=$('#curResumenFechas'), N=+$('#curNumClases').value||0, variable=modoCurso==='variable';
  const g = variable ? {modo:'variable',sesiones:sesionesTemp,numClases:N} : {slots:franjasTemp,inicio:$('#curInicio').value,numClases:N,festivos:$('#curFestivos').checked};
  const ses=sesionesGrupo(g,prev?.clases||[]), f=ses.map(x=>x.fecha).filter(Boolean);
  $('#curListaClases').innerHTML=ses.some(x=>x.fecha) ? ses.map((x,k)=>x.fecha
      ? `<span class="tag tabular"><b>${k+1}</b> · ${DIAS[diaDeFecha(x.fecha)]} ${fechaMini(x.fecha)} · ${rangoHoras(x.ini,x.fin)}</span>`
      : `<span class="tag tabular text-muted"><b>${k+1}</b> · sin fecha</span>`).join('') : '<span class="small text-muted">Aún no hay fechas para mostrar.</span>';
  const h=ses.reduce((a,x)=>a+(x.fecha&&x.ini&&x.fin?horasSesion(x):0),0), ordenadas=[...f].sort();
  if(variable){
    if(!f.length){ caja.innerHTML='<i class="bi bi-info-circle"></i> Pon la fecha de cada clase para ver cuándo empieza y termina.'; return; }
    const falta=ses.length-f.length;
    caja.innerHTML=`<b>Empieza el ${DIAS_L[diaDeFecha(ordenadas[0])]} ${fechaLarga(ordenadas[0])} y termina el ${DIAS_L[diaDeFecha(ordenadas.at(-1))]} ${fechaLarga(ordenadas.at(-1))}</b> · ${ses.length} clases = <b>${h} h</b>`+
      (falta?`<div class="text-warning"><i class="bi bi-exclamation-triangle"></i> Faltan las fechas de ${falta} ${falta===1?'clase':'clases'}.</div>`:'');
    return;
  }
  if(!g.inicio || !franjasTemp.length || !f.length){ caja.innerHTML='<i class="bi bi-info-circle"></i> Elige la fecha de la primera clase para calcular cuándo termina.'; return; }
  const diasConClase=new Set(franjasTemp.map(x=>x.dia)), dia0=diaDeFecha(g.inicio);
  const aviso = diasConClase.has(dia0) ? '' : `<div class="text-warning"><i class="bi bi-exclamation-triangle"></i> La primera clase cae ${DIAS_L[dia0]}, que no tiene clase en la lista. Empezará el ${fechaLarga(f[0])}.</div>`;
  const fin=f.at(-1), semanas=Math.ceil((new Date(fin)-new Date(f[0]))/864e5/7)+1;
  const saltados=[]; if(g.festivos){ let t=new Date(f[0]+'T12:00Z'); while(t.toISOString().slice(0,10)<=fin){ const iso=t.toISOString().slice(0,10); if(diasConClase.has(t.getUTCDay())&&esFestivo(iso)) saltados.push(iso); t.setUTCDate(t.getUTCDate()+1);} }
  caja.innerHTML=aviso+`<b>Termina el ${DIAS_L[diaDeFecha(fin)]} ${fechaLarga(fin)}</b> · ${semanas} semanas · ${g.numClases} clases = <b>${h} h</b>`+
    (saltados.length?`<div class="text-muted mt-1"><i class="bi bi-calendar-x"></i> Se saltan festivos: ${saltados.map(fechaCorta).join(', ')}</div>`:'');
}
