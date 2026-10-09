/* =========================================================
   SEMANA DE CLASES (formulario del curso)
   De lunes a domingo, con la jornada dividida en mañana, media mañana, tarde, media tarde y noche
   (los mismos momentos del calendario). «+ Clase» agrega una clase en ese día y momento; se arrastra a otro
   día o momento; la hora se escribe en la propia tarjeta. Edita franjasTemp = [{dia, ini, fin}].
   ========================================================= */
const ORDEN_DIAS = [1,2,3,4,5,6,0];
const aMin = h => { const [a,b] = String(h||'0:0').split(':').map(Number); return a*60 + b; };
const deMin = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

/* Número de la clase dentro de la semana (por día y hora) */
function ordenSemana(){
  return franjasTemp.map((_,k)=>k).sort((a,b)=>ordenDia(franjasTemp[a].dia)-ordenDia(franjasTemp[b].dia) || franjasTemp[a].ini.localeCompare(franjasTemp[b].ini));
}
const numeroSemana = k => ordenSemana().indexOf(k) + 1;
/* ¿Se pisa con otra clase del mismo día? */
const choca = (dia,ini,fin,excepto) => franjasTemp.some((x,k)=>k!==excepto && x.dia===dia && aMin(x.ini)<fin && aMin(x.fin)>ini);

function refrescarHorario(){
  pintarSemana(); pintarFranjas(); resumenFechasForm();
  $('#curPorSemanaTxt').textContent = franjasTemp.length;
}
function pintarSemana(){
  const cont=$('#curSemana'), y=cont.scrollTop, orden=ordenSemana();
  const tarjeta=(x,k)=>`<div class="sg-card" draggable="true" data-k="${k}" aria-label="Clase ${orden.indexOf(k)+1}, ${DIAS_L[x.dia]}">
      <div class="sg-top"><i class="bi bi-grip-vertical text-muted"></i><b>Clase ${orden.indexOf(k)+1}</b><button type="button" class="sg-x" title="Quitar esta clase" aria-label="Quitar clase ${orden.indexOf(k)+1}">×</button></div>
      <div class="sg-hor"><input type="time" data-f="ini" value="${x.ini}" aria-label="Hora de inicio"><span class="text-muted">–</span><input type="time" data-f="fin" value="${x.fin}" aria-label="Hora de fin"></div></div>`;
  cont.innerHTML=`<div class="cal-grid"><div class="cal-cab cal-esq"></div>${ORDEN_DIAS.map(d=>`<div class="cal-cab"><span>${DIAS[d]}</span></div>`).join('')}
    ${MOMENTOS.map((m,i)=>`<div class="cal-mom"><i class="bi ${m.ic}"></i><b>${m.n}</b><small>${m.r}</small></div>`+ORDEN_DIAS.map(d=>
      `<div class="cal-celda" data-dia="${d}" data-mom="${i}">${franjasTemp.map((x,k)=>x.dia===d && momentoDe(x.ini)===i ? tarjeta(x,k) : '').join('')}
        <button type="button" class="sg-add" data-add title="Agregar una clase el ${DIAS_L[d]} en la ${m.n.toLowerCase()}">+ Clase</button></div>`).join('')).join('')}</div>`;
  cont.scrollTop=y;
}

/* Agrega una clase en ese día y momento (con el horario típico del momento, sin pisar otras) */
function agregarClase(dia,mom){
  let [ini,fin]=HORA_MOMENTO[mom].map(aMin); const dur=fin-ini;
  franjasTemp.filter(x=>x.dia===dia).sort((a,b)=>a.ini.localeCompare(b.ini)).forEach(x=>{ if(aMin(x.ini)<ini+dur && aMin(x.fin)>ini){ ini=aMin(x.fin); } });   // si ya hay una, empieza cuando termina
  fin=ini+dur;
  if(fin>24*60 || choca(dia,ini,fin,-1)){ toast('No hay espacio libre en ese momento del día'); return; }
  franjasTemp.push({dia,ini:deMin(ini),fin:deMin(fin)}); refrescarHorario();
}
/* Mueve una clase a otro día o momento: conserva su duración y toma la hora típica del nuevo momento */
function moverClase(k,dia,mom){
  const x=franjasTemp[k], dur=aMin(x.fin)-aMin(x.ini);
  let ini = momentoDe(x.ini)===mom ? aMin(x.ini) : aMin(HORA_MOMENTO[mom][0]);
  franjasTemp.filter((y,j)=>j!==k && y.dia===dia).sort((a,b)=>a.ini.localeCompare(b.ini)).forEach(y=>{ if(aMin(y.ini)<ini+dur && aMin(y.fin)>ini) ini=aMin(y.fin); });
  if(ini+dur>24*60 || choca(dia,ini,ini+dur,k)){ toast('No hay espacio libre en ese lugar'); return; }
  x.dia=dia; x.ini=deMin(ini); x.fin=deMin(ini+dur); refrescarHorario();
}

$('#curSemana').addEventListener('click',e=>{
  const add=e.target.closest('[data-add]');
  if(add){ const c=add.closest('.cal-celda'); agregarClase(+c.dataset.dia,+c.dataset.mom); return; }
  const x=e.target.closest('.sg-x'); if(x){ franjasTemp.splice(+x.closest('.sg-card').dataset.k,1); refrescarHorario(); }
});
/* La hora se escribe en la tarjeta; al salir del campo se valida y la clase cambia de momento si hace falta */
$('#curSemana').addEventListener('change',e=>{
  const inp=e.target.closest('input[data-f]'); if(!inp) return;
  const k=+inp.closest('.sg-card').dataset.k, x=franjasTemp[k], ini=inp.dataset.f==='ini'?inp.value:x.ini, fin=inp.dataset.f==='fin'?inp.value:x.fin;
  if(!ini || !fin || aMin(fin)<=aMin(ini)){ toast('La hora final debe ser después de la inicial'); pintarSemana(); return; }
  if(choca(x.dia,aMin(ini),aMin(fin),k)){ toast('Se cruza con otra clase de ese día'); pintarSemana(); return; }
  x.ini=ini; x.fin=fin; refrescarHorario();
});
/* Arrastrar y soltar entre días y momentos */
let arrastrada=null;
$('#curSemana').addEventListener('dragstart',e=>{
  const c=e.target.closest('.sg-card'); if(!c) return; arrastrada=+c.dataset.k; c.classList.add('arrastrando');
  if(e.dataTransfer){ e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',String(arrastrada)); }
});
$('#curSemana').addEventListener('dragend',()=>{ arrastrada=null; document.querySelectorAll('#curSemana .arrastrando, #curSemana .sobre').forEach(n=>n.classList.remove('arrastrando','sobre')); });
$('#curSemana').addEventListener('dragover',e=>{
  const c=e.target.closest('.cal-celda'); if(!c || arrastrada===null) return;
  e.preventDefault(); document.querySelectorAll('#curSemana .sobre').forEach(n=>n!==c&&n.classList.remove('sobre')); c.classList.add('sobre');
});
$('#curSemana').addEventListener('drop',e=>{
  const c=e.target.closest('.cal-celda'); if(!c || arrastrada===null) return; e.preventDefault();
  const k=arrastrada; arrastrada=null; moverClase(k,+c.dataset.dia,+c.dataset.mom);
});
