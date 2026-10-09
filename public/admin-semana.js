/* =========================================================
   SEMANA INTERACTIVA DE CLASES (formulario del curso)
   Una cuadrícula lunes–domingo con horas: clic y arrastre para crear una clase, arrastrar una clase para moverla
   (de hora o de día), estirar su borde de abajo para cambiar la duración. Edita franjasTemp = [{dia, ini, fin}].
   ========================================================= */
const PX_H = 34, PASO = 15, MIN_DUR = 30;
const ORDEN_DIAS = [1,2,3,4,5,6,0];
let gridIni = 6*60, gridFin = 22*60, ultimaDur = 120, arr = null;
const aMin = h => { const [a,b] = String(h||'0:0').split(':').map(Number); return a*60 + b; };
const deMin = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

/* Número de la clase dentro de la semana (por día y hora) */
function ordenSemana(){
  return franjasTemp.map((_,k)=>k).sort((a,b)=>ordenDia(franjasTemp[a].dia)-ordenDia(franjasTemp[b].dia) || franjasTemp[a].ini.localeCompare(franjasTemp[b].ini));
}
const numeroSemana = k => ordenSemana().indexOf(k) + 1;

function refrescarHorario(){
  pintarSemana(); pintarFranjas(); resumenFechasForm();
  $('#curPorSemanaTxt').textContent = franjasTemp.length;
}
const choca = (dia,ini,fin,excepto) => franjasTemp.some((x,k)=>k!==excepto && x.dia===dia && aMin(x.ini)<fin && aMin(x.fin)>ini);
/* Inicio de la clase más cercana que empieza después de `desde` ese día (límite al estirar) */
const limiteDespues = (dia,desde,excepto) => Math.min(gridFin, ...franjasTemp.filter((x,k)=>k!==excepto && x.dia===dia && aMin(x.ini)>=desde).map(x=>aMin(x.ini)));

function claseHtml(x,k,n){
  const top=(aMin(x.ini)-gridIni)/60*PX_H, alto=Math.max(14,(aMin(x.fin)-aMin(x.ini))/60*PX_H);
  return `<div class="sg-clase" data-k="${k}" tabindex="0" role="button" style="top:${top}px;height:${alto}px" aria-label="Clase ${n}, ${DIAS_L[x.dia]} ${rangoHoras(x.ini,x.fin)}">
    <b>Clase ${n}</b><span class="sg-rango">${rangoHoras(x.ini,x.fin)}</span>
    <button type="button" class="sg-x" title="Quitar esta clase" aria-label="Quitar clase ${n}">×</button><div class="sg-res" title="Estira para cambiar la hora de fin"></div></div>`;
}
function pintarSemana(){
  const cont=$('#curSemana'), y=cont.scrollTop;
  // el rango se amplía si alguna clase queda fuera de 6 a. m. – 10 p. m.
  gridIni=Math.min(6*60, ...franjasTemp.map(x=>Math.floor(aMin(x.ini)/60)*60));
  gridFin=Math.max(22*60, ...franjasTemp.map(x=>Math.ceil(aMin(x.fin)/60)*60));
  const orden=ordenSemana(), num=k=>orden.indexOf(k)+1;
  const horas=[]; for(let m=gridIni;m<=gridFin;m+=60){ const h=m/60; horas.push(`<span style="top:${(m-gridIni)/60*PX_H}px">${h%12||12}${h>=12?'p':'a'}</span>`); }
  cont.innerHTML=`<div class="sg-head"><div></div>${ORDEN_DIAS.map(d=>`<div>${DIAS[d]}</div>`).join('')}</div>
    <div class="sg-body" style="height:${(gridFin-gridIni)/60*PX_H}px"><div class="sg-horas">${horas.join('')}</div>
    ${ORDEN_DIAS.map(d=>`<div class="sg-col" data-dia="${d}">${franjasTemp.map((x,k)=>x.dia===d?claseHtml(x,k,num(k)):'').join('')}</div>`).join('')}</div>`;
  cont.scrollTop=y;
}
function irAPrimeraClase(){
  const cont=$('#curSemana'); if(!franjasTemp.length) return;
  cont.scrollTop=Math.max(0,(Math.min(...franjasTemp.map(x=>aMin(x.ini)))-gridIni)/60*PX_H-24);
}
document.getElementById('mCurso').addEventListener('shown.bs.modal',irAPrimeraClase);

/* --- coordenadas --- */
const cuerpoSemana = () => document.querySelector('#curSemana .sg-body');
function minDesdeY(y){ const r=cuerpoSemana().getBoundingClientRect(); return Math.round((gridIni+(y-r.top)/PX_H*60)/PASO)*PASO; }
function diaDesdeX(x){
  for(const c of document.querySelectorAll('#curSemana .sg-col')){ const r=c.getBoundingClientRect(); if(x>=r.left && x<r.right) return +c.dataset.dia; }
  return null;
}

/* --- arrastre --- */
$('#curSemana').addEventListener('pointerdown',e=>{
  if(e.button>0 || e.target.closest('.sg-x')) return;
  const col=e.target.closest('.sg-col'); if(!col) return;
  const bl=e.target.closest('.sg-clase'), m=minDesdeY(e.clientY);
  if(bl){
    const k=+bl.dataset.k, x=franjasTemp[k];
    arr={modo:e.target.closest('.sg-res')?'res':'mov',k,bl,dia:x.dia,ini:aMin(x.ini),fin:aMin(x.fin),m0:m,y0:e.clientY,x0:e.clientX,movido:false};
    arr.cand={dia:x.dia,ini:arr.ini,fin:arr.fin}; bl.classList.add('arrastrando');
  } else {
    arr={modo:'crear',dia:+col.dataset.dia,m0:m,y0:e.clientY,x0:e.clientX,movido:false,col};
    arr.cand={dia:arr.dia,ini:m,fin:m+PASO*2};
  }
  try{ e.currentTarget.setPointerCapture(e.pointerId); }catch(x){}
  e.preventDefault();
});
$('#curSemana').addEventListener('pointermove',e=>{
  if(!arr) return;
  if(Math.abs(e.clientY-arr.y0)>3 || Math.abs(e.clientX-arr.x0)>3) arr.movido=true;
  if(!arr.movido) return;
  const m=minDesdeY(e.clientY);
  if(arr.modo==='mov'){
    const dur=arr.fin-arr.ini, ini=Math.max(gridIni,Math.min(gridFin-dur,arr.ini+(m-arr.m0))), dia=diaDesdeX(e.clientX) ?? arr.cand.dia;
    if(choca(dia,ini,ini+dur,arr.k)) return;                       // no se pisa con otra clase
    arr.cand={dia,ini,fin:ini+dur};
    const col=document.querySelector(`#curSemana .sg-col[data-dia="${dia}"]`); if(col && arr.bl.parentNode!==col) col.appendChild(arr.bl);
    arr.bl.style.top=(ini-gridIni)/60*PX_H+'px';
  } else if(arr.modo==='res'){
    const fin=Math.max(arr.ini+MIN_DUR,Math.min(m,limiteDespues(arr.dia,arr.fin,arr.k)));
    arr.cand={dia:arr.dia,ini:arr.ini,fin};
    arr.bl.style.height=(fin-arr.ini)/60*PX_H+'px';
  } else {
    const fin=Math.max(arr.m0+MIN_DUR,Math.min(m,limiteDespues(arr.dia,arr.m0,-1)));
    arr.cand={dia:arr.dia,ini:arr.m0,fin};
    if(!arr.fantasma){ arr.fantasma=document.createElement('div'); arr.fantasma.className='sg-clase sg-fantasma'; arr.col.appendChild(arr.fantasma); }
    arr.fantasma.style.top=(arr.m0-gridIni)/60*PX_H+'px'; arr.fantasma.style.height=(fin-arr.m0)/60*PX_H+'px';
    arr.fantasma.innerHTML=`<b>${rangoHoras(deMin(arr.m0),deMin(fin))}</b>`;
  }
});
function terminarArrastre(cancelar){
  const a=arr; arr=null; if(!a) return;
  if(!cancelar){
    if(a.modo==='crear'){
      let {ini,fin}=a.cand;
      if(!a.movido){ ini=Math.max(gridIni,Math.min(a.m0,gridFin-MIN_DUR)); fin=Math.min(ini+ultimaDur,limiteDespues(a.dia,ini,-1)); }
      if(choca(a.dia,ini,fin,-1) || fin-ini<MIN_DUR){ toast('No hay espacio libre a esa hora'); }
      else { franjasTemp.push({dia:a.dia,ini:deMin(ini),fin:deMin(fin)}); ultimaDur=fin-ini; }
    } else if(a.movido){
      const x=franjasTemp[a.k]; x.dia=a.cand.dia; x.ini=deMin(a.cand.ini); x.fin=deMin(a.cand.fin); ultimaDur=a.cand.fin-a.cand.ini;
    }
  }
  refrescarHorario();
  if(a.modo!=='crear'){ document.querySelector(`#curSemana .sg-clase[data-k="${a.k}"]`)?.classList.add('sel'); }
}
$('#curSemana').addEventListener('pointerup',()=>terminarArrastre(false));
$('#curSemana').addEventListener('pointercancel',()=>terminarArrastre(true));
$('#curSemana').addEventListener('click',e=>{
  const x=e.target.closest('.sg-x'); if(!x) return;
  franjasTemp.splice(+x.closest('.sg-clase').dataset.k,1); refrescarHorario();
});

/* --- teclado: flechas mueven, Mayús+flechas cambian la duración, Supr quita --- */
$('#curSemana').addEventListener('keydown',e=>{
  const bl=e.target.closest('.sg-clase'); if(!bl || e.target!==bl) return;
  const k=+bl.dataset.k, x=franjasTemp[k]; let ini=aMin(x.ini), fin=aMin(x.fin), dia=x.dia;
  if(e.key==='Delete'||e.key==='Backspace'){ e.preventDefault(); franjasTemp.splice(k,1); refrescarHorario(); return; }
  if(e.key==='ArrowUp'||e.key==='ArrowDown'){
    const d=e.key==='ArrowUp'?-PASO:PASO;
    if(e.shiftKey) fin=Math.max(ini+MIN_DUR,Math.min(gridFin,fin+d)); else { if(ini+d<gridIni||fin+d>gridFin) return; ini+=d; fin+=d; }
  } else if(!e.shiftKey && (e.key==='ArrowLeft'||e.key==='ArrowRight')){
    const i=ORDEN_DIAS.indexOf(dia)+(e.key==='ArrowLeft'?-1:1); if(i<0||i>=ORDEN_DIAS.length) return; dia=ORDEN_DIAS[i];
  } else return;
  e.preventDefault();
  if(choca(dia,ini,fin,k)) return;
  x.dia=dia; x.ini=deMin(ini); x.fin=deMin(fin); refrescarHorario();
  document.querySelector(`#curSemana .sg-clase[data-k="${k}"]`)?.focus();
});
