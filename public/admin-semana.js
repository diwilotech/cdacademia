/* =========================================================
   HORARIO DEL CURSO (formulario)
   Dos maneras de repartir las clases:
   · «Se repiten cada semana»: se eligen uno o varios días, la hora de inicio y la de fin, y el horario aparece como
     una tabla normal dividida en horas (con la mañana, media mañana, tarde, media tarde y noche marcadas).
   · «Cada clase en su fecha»: cada clase tiene su propia fecha y hora (la clase 1 un sábado, la 2 un martes…).
   Semanal edita franjasTemp = [{dia, ini, fin}]; por fecha edita sesionesTemp = [{fecha, ini, fin}].
   ========================================================= */
const ORDEN_DIAS = [1,2,3,4,5,6,0];
const TT_H = 30;                                   // píxeles por hora en la tabla
let modoCurso = 'semanal', sesionesTemp = [], editandoK = null;
const aMin = h => { const [a,b] = String(h||'0:0').split(':').map(Number); return a*60 + b; };
const deMin = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

/* Número de la clase dentro de la semana (por día y hora) */
function ordenSemana(){
  return franjasTemp.map((_,k)=>k).sort((a,b)=>ordenDia(franjasTemp[a].dia)-ordenDia(franjasTemp[b].dia) || franjasTemp[a].ini.localeCompare(franjasTemp[b].ini));
}
const numeroSemana = k => ordenSemana().indexOf(k) + 1;
/* ¿Se pisa con otra clase del mismo día? */
const choca = (dia,ini,fin,excepto) => franjasTemp.some((x,k)=>k!==excepto && x.dia===dia && aMin(x.ini)<fin && aMin(x.fin)>ini);

/* ---------- modo y refresco ---------- */
function aplicarModoCurso(){
  const v = modoCurso==='variable';
  $('#curModoSem').checked=!v; $('#curModoVar').checked=v;
  $('#curBloqueSemanal').hidden=v; $('#curBloqueVariable').hidden=!v;
  $('#curInicioWrap').hidden=v; $('#curFestivosWrap').hidden=v;
  $('#curModoAyuda').textContent = v ? 'Cada clase tiene su fecha y su hora; no se repiten solas.' : 'La misma semana se repite hasta completar el total de clases.';
}
function refrescarHorario(){
  if(modoCurso==='semanal'){ pintarSemana(); pintarFranjas(); } else pintarVariable();
  resumenFechasForm();
  $('#curPorSemanaTxt').textContent = modoCurso==='semanal' ? franjasTemp.length : '—';
}
document.querySelectorAll('[name="curModo"]').forEach(r=>r.addEventListener('change',e=>{
  modoCurso=e.target.value;
  // al pasar a «cada clase en su fecha» se parte del horario semanal ya armado, para solo cambiar lo distinto
  if(modoCurso==='variable' && !sesionesTemp.some(s=>s.fecha)) rellenarDesdeSemanal(true);
  aplicarModoCurso(); refrescarHorario();
}));

/* ---------- tabla semanal por horas ---------- */
function pintarSemana(){
  const cont=$('#curSemana'), y=cont.scrollTop, orden=ordenSemana();
  const hIni=Math.min(6,...franjasTemp.map(x=>Math.floor(aMin(x.ini)/60))), hFin=Math.max(22,...franjasTemp.map(x=>Math.ceil(aMin(x.fin)/60)));
  const horas=[]; for(let h=hIni;h<hFin;h++) horas.push(`<span style="top:${(h-hIni)*TT_H}px">${h%12||12} ${h>=12?'p. m.':'a. m.'}</span>`);
  const bandas=MOMENTOS.map((m,i)=>{ const d=Math.max(hIni*60,i?MOMENTOS[i-1].hasta:0), z=Math.min(hFin*60,m.hasta); return z>d ? {i,m,top:(d-hIni*60)/60*TT_H,alto:(z-d)/60*TT_H} : null; }).filter(Boolean);
  const bloque=(x,k)=>`<button type="button" class="tt-clase ${editandoK===k?'editando':''}" data-k="${k}" style="top:${(aMin(x.ini)-hIni*60)/60*TT_H}px;height:${Math.max(16,(aMin(x.fin)-aMin(x.ini))/60*TT_H)}px" aria-label="Clase ${orden.indexOf(k)+1}, ${DIAS_L[x.dia]} ${rangoHoras(x.ini,x.fin)}. Pulsa para cambiarla">
      <b>Clase ${orden.indexOf(k)+1}</b>${rangoHoras(x.ini,x.fin)}<span class="sg-x" role="button" title="Quitar esta clase" aria-label="Quitar">×</span></button>`;
  cont.innerHTML=`<div class="tt-cab"><div></div>${ORDEN_DIAS.map(d=>`<div>${DIAS[d]}</div>`).join('')}</div>
    <div class="tt-cuerpo" style="height:${(hFin-hIni)*TT_H}px">
      <div class="tt-gutter"><div class="tt-bandas">${bandas.map(b=>`<div class="tt-banda-n" style="top:${b.top}px;height:${b.alto}px"><i class="bi ${b.m.ic}"></i><b>${b.m.n}</b></div>`).join('')}</div><div class="tt-horas">${horas.join('')}</div></div>
      ${ORDEN_DIAS.map(d=>`<div class="tt-col" data-dia="${d}">${bandas.map(b=>`<div class="tt-banda ${b.i%2?'alt':''}" style="top:${b.top}px;height:${b.alto}px"></div>`).join('')}${franjasTemp.map((x,k)=>x.dia===d?bloque(x,k):'').join('')}</div>`).join('')}
    </div>`;
  cont.scrollTop=y;
}

/* ---------- barra de arriba: días, hora de inicio y hora de fin ---------- */
const diasMarcados = () => [...document.querySelectorAll('#rapDias input:checked')].map(i=>+i.value);
const marcarDias = lista => document.querySelectorAll('#rapDias input').forEach(i=>{ i.checked=lista.includes(+i.value); });
function avisoBarra(txt,tipo){ const m=$('#rapMsg'); m.className='w-100 small '+(tipo==='ok'?'text-success':tipo==='mal'?'text-danger':'text-muted'); m.textContent=txt; }
const ayudaBarra = () => avisoBarra(editandoK===null
  ? 'Elige uno o varios días, la hora de inicio y la de fin, y pulsa Agregar. Para cambiar una clase, tócala en el horario.'
  : `Cambiando la clase ${numeroSemana(editandoK)}: ajusta el día o las horas y pulsa Guardar cambios.`);
function entrarEdicion(k){
  editandoK=k; const x=franjasTemp[k];
  marcarDias([x.dia]); $('#rapIni').value=x.ini; $('#rapFin').value=x.fin;
  $('#rapAgregar').innerHTML='<i class="bi bi-check2"></i> Guardar cambios'; $('#rapCancelar').hidden=false; $('#rapQuitar').hidden=false;
  ayudaBarra(); pintarSemana();
}
function salirEdicion(){
  editandoK=null; $('#rapAgregar').innerHTML='<i class="bi bi-plus-lg"></i> Agregar'; $('#rapCancelar').hidden=true; $('#rapQuitar').hidden=true; ayudaBarra();
}
$('#rapDias').addEventListener('change',e=>{          // al cambiar una clase solo se permite un día
  if(editandoK!==null && e.target.checked) marcarDias([+e.target.value]);
});
$('#rapAgregar').addEventListener('click',()=>{
  const ini=$('#rapIni').value, fin=$('#rapFin').value;
  if(!ini || !fin || aMin(fin)<=aMin(ini)){ avisoBarra('La hora de fin debe ser después de la de inicio.','mal'); return; }
  if(editandoK!==null){
    const dia=diasMarcados()[0];
    if(dia===undefined){ avisoBarra('Elige el día de la clase.','mal'); return; }
    if(choca(dia,aMin(ini),aMin(fin),editandoK)){ avisoBarra('Se cruza con otra clase de ese día.','mal'); return; }
    Object.assign(franjasTemp[editandoK],{dia,ini,fin}); salirEdicion(); refrescarHorario(); avisoBarra('Cambios guardados.','ok'); return;
  }
  const dias=diasMarcados();
  if(!dias.length){ avisoBarra('Elige al menos un día.','mal'); return; }
  const puestas=[], pisadas=[];
  dias.sort((a,b)=>ordenDia(a)-ordenDia(b)).forEach(d=>{
    if(choca(d,aMin(ini),aMin(fin),-1)) pisadas.push(DIAS[d]); else { franjasTemp.push({dia:d,ini,fin}); puestas.push(DIAS[d]); }
  });
  if(puestas.length) refrescarHorario();
  const partes=[]; if(puestas.length) partes.push(`Agregada${puestas.length>1?'s':''}: ${puestas.join(', ')} · ${rangoHoras(ini,fin)}`);
  if(pisadas.length) partes.push(`Ya hay una clase a esa hora: ${pisadas.join(', ')}`);
  avisoBarra(partes.join(' · '), puestas.length&&!pisadas.length?'ok':'mal');
});
$('#rapCancelar').addEventListener('click',()=>{ salirEdicion(); pintarSemana(); });
$('#rapQuitar').addEventListener('click',()=>{ franjasTemp.splice(editandoK,1); salirEdicion(); refrescarHorario(); });
$('#curSemana').addEventListener('click',e=>{
  const b=e.target.closest('.tt-clase'); if(!b) return; const k=+b.dataset.k;
  if(e.target.closest('.sg-x')){ if(editandoK!==null) salirEdicion(); franjasTemp.splice(k,1); refrescarHorario(); return; }
  entrarEdicion(k);
});

/* ---------- cada clase en su fecha ---------- */
function ajustarNumClases(){
  if(modoCurso==='variable') pintarVariable();
  resumenFechasForm();
}
function pintarVariable(){
  const N=Math.max(1,+$('#curNumClases').value||1);
  while(sesionesTemp.length<N){ const u=sesionesTemp.at(-1); sesionesTemp.push({fecha:'',ini:u?.ini||'08:00',fin:u?.fin||'10:00'}); }
  sesionesTemp.length=N;
  $('#curFechasClases').innerHTML=sesionesTemp.map((s,k)=>`<div class="d-flex flex-wrap gap-2 align-items-center" data-k="${k}">
    <span class="badge bg-marca-suave text-marca" style="min-width:68px">Clase ${k+1}</span>
    <input type="date" class="form-control form-control-sm" style="width:150px" data-f="fecha" value="${s.fecha||''}" aria-label="Fecha de la clase ${k+1}">
    <span class="small text-muted" style="width:62px" data-dia>${s.fecha?DIAS_L[new Date(s.fecha+'T12:00').getDay()]:''}</span>
    <label class="small text-muted d-flex align-items-center gap-1">Inicio <input type="time" class="form-control form-control-sm" style="width:112px" data-f="ini" value="${s.ini||''}"></label>
    <label class="small text-muted d-flex align-items-center gap-1">Fin <input type="time" class="form-control form-control-sm" style="width:112px" data-f="fin" value="${s.fin||''}"></label></div>`).join('');
}
$('#curFechasClases').addEventListener('input',e=>{
  const row=e.target.closest('[data-k]'), f=e.target.dataset.f; if(!row||!f) return;
  sesionesTemp[+row.dataset.k][f]=e.target.value;
  if(f==='fecha') row.querySelector('[data-dia]').textContent = e.target.value ? DIAS_L[new Date(e.target.value+'T12:00').getDay()] : '';
  resumenFechasForm();
});
/* Copia el horario semanal (con sus fechas) a la lista clase por clase */
function rellenarDesdeSemanal(silencioso){
  const N=Math.max(1,+$('#curNumClases').value||1), inicio=$('#curInicio').value;
  if(!inicio || !franjasTemp.length){ if(!silencioso) toast('Primero arma el horario semanal y la primera clase'); sesionesTemp=[]; return; }
  sesionesTemp=sesionesGrupo({slots:franjasTemp,inicio,numClases:N,festivos:$('#curFestivos').checked}).map(s=>({fecha:s.fecha||'',ini:s.ini,fin:s.fin}));
}
$('#curRellenar').addEventListener('click',()=>{ rellenarDesdeSemanal(false); refrescarHorario(); });

/* ---------- validación y datos para guardar ---------- */
function validarHorario(){
  if(modoCurso==='semanal'){
    if(!franjasTemp.length) return 'Agrega al menos una clase en la semana';
    if(franjasTemp.some(x=>!x.ini||!x.fin||x.fin<=x.ini)) return 'En cada clase, la hora final debe ser después de la inicial';
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
      ? `<span class="tag tabular"><b>${k+1}</b> · ${DIAS[new Date(x.fecha+'T12:00').getDay()]} ${fechaMini(x.fecha)} · ${rangoHoras(x.ini,x.fin)}</span>`
      : `<span class="tag tabular text-muted"><b>${k+1}</b> · sin fecha</span>`).join('') : '<span class="small text-muted">Aún no hay fechas para mostrar.</span>';
  const h=ses.reduce((a,x)=>a+(x.fecha&&x.ini&&x.fin?horasSesion(x):0),0), ordenadas=[...f].sort();
  if(variable){
    if(!f.length){ caja.innerHTML='<i class="bi bi-info-circle"></i> Pon la fecha de cada clase para ver cuándo empieza y termina.'; return; }
    const falta=ses.length-f.length;
    caja.innerHTML=`<b>Empieza el ${DIAS_L[new Date(ordenadas[0]+'T12:00').getDay()]} ${fechaLarga(ordenadas[0])} y termina el ${DIAS_L[new Date(ordenadas.at(-1)+'T12:00').getDay()]} ${fechaLarga(ordenadas.at(-1))}</b> · ${ses.length} clases = <b>${h} h</b>`+
      (falta?`<div class="text-warning"><i class="bi bi-exclamation-triangle"></i> Faltan las fechas de ${falta} ${falta===1?'clase':'clases'}.</div>`:'');
    return;
  }
  if(!g.inicio || !franjasTemp.length || !f.length){ caja.innerHTML='<i class="bi bi-info-circle"></i> Elige el horario y la primera clase para calcular cuándo termina.'; return; }
  const diasConClase=new Set(franjasTemp.map(x=>x.dia)), dia0=new Date(g.inicio+'T12:00').getDay();
  const aviso = diasConClase.has(dia0) ? '' : `<div class="text-warning"><i class="bi bi-exclamation-triangle"></i> La primera clase cae ${DIAS_L[dia0]}, que no tiene horario. Empezará el ${fechaLarga(f[0])}.</div>`;
  const fin=f.at(-1), semanas=Math.ceil((new Date(fin)-new Date(f[0]))/864e5/7)+1;
  const saltados=[]; if(g.festivos){ let t=new Date(f[0]+'T12:00Z'); while(t.toISOString().slice(0,10)<=fin){ const iso=t.toISOString().slice(0,10); if(diasConClase.has(t.getUTCDay())&&esFestivo(iso)) saltados.push(iso); t.setUTCDate(t.getUTCDate()+1);} }
  caja.innerHTML=aviso+`<b>Termina el ${DIAS_L[new Date(fin+'T12:00').getDay()]} ${fechaLarga(fin)}</b> · ${semanas} semanas · ${g.numClases} clases = <b>${h} h</b>`+
    (saltados.length?`<div class="text-muted mt-1"><i class="bi bi-calendar-x"></i> Se saltan festivos: ${saltados.map(fechaCorta).join(', ')}</div>`:'');
}
ayudaBarra();
