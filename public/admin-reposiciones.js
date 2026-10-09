/* =========================================================
   REPOSICIONES
   Cada A (ausente) o J (excusa médica) en la planilla de asistencia es una clase por reponer.
   inscripcion.repos = {nClase:{espacioId, estado:'hecha', pagoId, exonerada}}
   DB.espacios = [{id, fecha, horaIni, horaFin, docente, cursoId, clase(n|null), cupos, notas}]
   A cobra config.valorRepo; J (excusa médica) no cobra. El pago se registra con tipo 'reposicion'
   y no se descuenta del saldo del curso.
   ========================================================= */
const espacio = id => (DB.espacios||[]).find(x=>x.id===id);
const temaClase = (c,n) => c ? (((c.clases||[]).find(x=>x.n===n)||{}).tema || `Clase ${n}`) : `Clase ${n}`;
const recRepo = (i,n) => { i.repos=i.repos||{}; return i.repos[n]=i.repos[n]||{}; };
function listaRepos(){
  const out=[];
  DB.inscripciones.forEach(i=>{
    const c=curso(i.cursoId); if(!c) return; const fechas=fechasClases(c);
    Object.entries(i.asistencia||{}).forEach(([k,v])=>{
      if(v!=='A' && v!=='J') return; const n=+k, r=(i.repos||{})[n]||{};
      const cl=(c.clases||[]).find(x=>x.n===n)||{};
      const costo = v==='J' || r.exonerada ? 0 : r.modo==='virtual' ? (+DB.config.valorRepoVirtual||0) : (+DB.config.valorRepo||0);
      const pago = r.pagoId ? DB.pagos.find(p=>p.id===r.pagoId) : null, esp = r.espacioId ? espacio(r.espacioId) : null;
      out.push({i, e:est(i.estId), c, n, motivo:v, virtual:r.modo==='virtual', claseVirtual:!!cl.virtual, video:cl.video||'', fechaFalta:fechas[n-1], tema:temaClase(c,n), costo, pago, pagada: !!pago || costo===0, esp, r,
        estado: r.estado==='hecha' ? 'hecha' : (esp || r.modo==='virtual') ? 'agendada' : 'pendiente'});
    });
  });
  return out;
}
const reposDeEspacio = id => listaRepos().filter(x=>x.r.espacioId===id);
const lunesDe = iso => { const d=new Date(iso+'T12:00'); d.setDate(d.getDate()-((d.getDay()+6)%7)); return isoLocal(d); };
const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const sumarDias = (iso,n) => { const d=new Date(iso+'T12:00'); d.setDate(d.getDate()+n); return isoLocal(d); };
let filtroRepo='pendiente';

function pintarReposiciones(){
  DB.espacios=DB.espacios||[];
  const L=listaRepos(), hoy=hoyISO(), cf=DB.config;
  const porAgendar=L.filter(x=>x.estado==='pendiente'), agendadas=L.filter(x=>x.estado==='agendada'), porCobrar=L.filter(x=>!x.pagada);
  $('#badgeRepo').hidden=!porAgendar.length; $('#badgeRepo').textContent=porAgendar.length;

  // clases sin tema: la reposición necesita saber qué tema repone
  const sinTema=DB.cursos.map(c=>({c,n:Array.from({length:+c.grupo?.numClases||0},(_,k)=>k+1).filter(n=>!(c.clases||[]).find(x=>x.n===n&&x.tema)).length})).filter(x=>x.n);
  $('#avisoTemas').innerHTML = sinTema.length ? `<div class="alert bg-marca-suave border-0 small d-flex flex-wrap align-items-center gap-2 py-2">
    <i class="bi bi-exclamation-circle text-marca"></i> Para reponer hay que saber el tema de cada clase. Faltan temas en:
    ${sinTema.map(x=>`<a href="#" class="text-marca fw-semibold" onclick="event.preventDefault();verCurso('${x.c.id}','clases')">${esc(x.c.nombre)} (${x.n})</a>`).join(' · ')}</div>` : '';

  const semIni=CALS.calRepo.semana, finSem=sumarDias(semIni,6), espSem=DB.espacios.filter(x=>x.fecha>=semIni && x.fecha<=finSem);
  const libres=espSem.reduce((a,x)=>a+Math.max(0,x.cupos-reposDeEspacio(x.id).length),0);
  $('#statsRepo').innerHTML=[
    ['bi-hourglass-split','Por agendar',porAgendar.length,porAgendar.length?'text-danger':''],
    ['bi-calendar-check','Agendadas',agendadas.length,''],
    ['bi-cash-coin','Por cobrar',money(porCobrar.reduce((a,x)=>a+x.costo,0)),''],
    ['bi-door-open','Cupos libres esta semana',`${libres}<span class="small text-muted" style="font-family:var(--font-body);font-size:.8rem"> en ${espSem.length} ${espSem.length===1?'espacio':'espacios'}</span>`,'']
  ].map(([ic,e,v,cl])=>`<div class="col-6 col-lg-3"><div class="card stat"><div class="card-body">
    <div class="d-flex justify-content-between"><span class="etq">${e}</span><i class="bi ${ic} text-marca"></i></div><div class="valor tabular mt-2 ${cl}">${v}</div></div></div></div>`).join('');

  // lista
  document.querySelectorAll('#filtrosRepo [data-f]').forEach(b=>b.classList.toggle('active',b.dataset.f===filtroRepo));
  const lista=L.filter(x=>({pendiente:x.estado==='pendiente',agendada:x.estado==='agendada',cobrar:!x.pagada,hecha:x.estado==='hecha',todas:true})[filtroRepo])
    .sort((a,b)=>(a.esp?.fecha||a.fechaFalta||'').localeCompare(b.esp?.fecha||b.fechaFalta||''));
  $('#listaRepo').innerHTML = lista.length ? lista.map(x=>{
    const costoPill = x.costo===0 ? `<span class="pill pill-gratis">${x.motivo==='J'?'Excusa médica · sin costo':x.r.exonerada?'No se cobra':'Sin costo'}</span>`
      : x.pago ? `<span class="pill pill-pagada">Pagada ${money(x.costo)}</span>` : `<span class="pill pill-vencida">Debe ${money(x.costo)}</span>`;
    const estadoTxt = x.estado==='hecha' ? '<span class="pill pill-pagada"><i class="bi bi-check2"></i> Repuesta</span>'
      : x.virtual ? `<span class="pill pill-virtual"><i class="bi bi-camera-video"></i> Virtual · ${x.r.envio?.fecha?`link enviado ${fechaMini(x.r.envio.fecha)}`:'por enviar'}</span>`
      : x.esp ? `<span class="pill pill-hoy"><i class="bi bi-calendar-event"></i> ${DIAS[new Date(x.esp.fecha+'T12:00').getDay()]} ${fechaMini(x.esp.fecha)} · ${hora12(x.esp.horaIni)}</span>`
      : '<span class="pill pill-pendiente">Por agendar</span>';
    const k=`'${x.i.id}',${x.n}`;
    return `<div class="repo-item"><div style="min-width:0">
        <div class="d-flex flex-wrap align-items-center gap-2"><b>${esc(x.e?.nombre)}</b>${estadoTxt}${costoPill}</div>
        <div class="mt-1"><span class="text-marca fw-semibold tabular">Clase ${x.n}</span> · <span class="fw-semibold">${esc(x.tema)}</span></div>
        <small class="text-muted">${esc(x.c.nombre)} · ${x.motivo==='J'?'excusa médica':'faltó'} el ${x.fechaFalta?fechaLarga(x.fechaFalta):'—'}</small></div>
      <div class="d-flex flex-wrap justify-content-end gap-1">
        ${x.estado!=='hecha'?`<button class="btn btn-sm ${x.estado==='agendada'?'btn-outline-secondary':'btn-marca'}" onclick="abrirAgendar(${k})"><i class="bi bi-calendar-plus"></i> ${x.estado==='agendada'?'Cambiar':'Agendar'}</button>`:''}
        ${!x.pagada?`<button class="btn btn-sm btn-outline-secondary" onclick="abrirCobroRepo(${k})"><i class="bi bi-cash"></i> Cobrar</button>`:''}
        ${x.pago?`<button class="btn btn-sm btn-outline-secondary" title="Recibo" onclick="imprimirRecibo('${x.pago.id}')"><i class="bi bi-printer"></i></button>`:''}
        ${x.virtual && x.estado!=='hecha'?`<button class="btn btn-sm btn-outline-secondary" style="color:#5b2ea6;border-color:#cdb8ef" onclick="abrirVirtual(${k})"><i class="bi bi-send"></i> ${x.r.envio?.fecha?'Ver link':'Enviar link'}</button>`:''}
        ${x.estado==='agendada'?`<button class="btn btn-sm btn-outline-success" title="Asistió a la reposición" onclick="marcarRepuesta(${k},true)"><i class="bi bi-check2"></i> Repuso</button>`:''}
        ${x.estado==='hecha'?`<button class="btn btn-sm btn-link text-muted" onclick="marcarRepuesta(${k},false)">Deshacer</button>`:''}
        ${x.estado!=='hecha'&&!x.virtual?botonWARepo(x):''}
        ${x.motivo==='A' && !x.pago && x.estado!=='hecha'?`<button class="btn btn-sm btn-link text-muted p-1" onclick="exonerar(${k})">${x.r.exonerada?'Cobrar de nuevo':'No cobrar'}</button>`:''}
      </div></div>`}).join('')
    : `<div class="card-body text-muted small">${filtroRepo==='pendiente'?'No hay clases por agendar. Las fallas (A) y excusas médicas (J) que marques en la asistencia aparecen aquí.':'No hay reposiciones en este filtro.'}</div>`;
}
document.querySelectorAll('#filtrosRepo [data-f]').forEach(b=>b.addEventListener('click',()=>{ filtroRepo=b.dataset.f; pintarReposiciones(); }));

function botonWARepo(x){
  const tel=(x.e?.tel||'').replace(/\D/g,''); if(!tel) return '';
  const num=tel.length===10?'57'+tel:tel, nombre=x.e.nombre.split(' ')[0], cf=DB.config;
  let txt;
  if(x.esp){
    const costo = x.costo===0 ? (x.motivo==='J'?'No tiene costo por la excusa médica.':'No tiene costo.') : x.pago ? 'Ya está paga.' : `Valor: ${money(x.costo)}.`;
    txt=`Hola ${nombre} 👋 Tu reposición de la clase ${x.n} (${x.tema}) de ${x.c.nombre} quedó para el ${DIAS_L[new Date(x.esp.fecha+'T12:00').getDay()]} ${fechaLarga(x.esp.fecha)} a las ${hora12(x.esp.horaIni)}${docenteEsp(x.esp)?` con ${docenteEsp(x.esp)}`:''}. ${costo} — ${cf.nombre}`;
  } else {
    const prox=opcionesEspacio(x).filter(o=>!o.lleno && o.score<3).slice(0,3);
    txt=`Hola ${nombre} 👋 Te quedó pendiente reponer la clase ${x.n} (${x.tema}) de ${x.c.nombre}.${prox.length?` Tenemos estos espacios:\n${prox.map(o=>`• ${DIAS_L[new Date(o.x.fecha+'T12:00').getDay()]} ${fechaLarga(o.x.fecha)}, ${hora12(o.x.horaIni)}`).join('\n')}\n¿Cuál te sirve?`:' ¿Qué día te queda bien?'}${x.costo?` La reposición tiene un valor de ${money(x.costo)}.`:''} — ${cf.nombre}`;
  }
  return `<a class="btn btn-sm btn-outline-success" target="_blank" title="Avisar por WhatsApp" href="https://wa.me/${num}?text=${encodeURIComponent(txt)}"><i class="bi bi-whatsapp"></i></a>`;
}

/* Espacios ordenados por conveniencia para una reposición */
function opcionesEspacio(x){
  const hoy=hoyISO();
  return (DB.espacios||[]).filter(s=>s.fecha>=hoy).map(s=>{
    const ocup=reposDeEspacio(s.id).filter(y=>!(y.i.id===x.i.id&&y.n===x.n)).length, lleno=ocup>=s.cupos;
    let score, nota;
    const pro=profesional(s.profesionalId), areaX=x.c.areaId;
    if(areaX && s.areaId && s.areaId!==areaX){ score=3; nota=`<span class="text-danger">Es de otra área (${esc(area(s.areaId)?.nombre||'')})</span>`; }
    else if(areaX && pro && !puedeReponer(pro,areaX,x.c.nivel)){ score=3; nota=`<span class="text-danger">${esc(pro.nombre)} no repone ${esc(area(areaX)?.nombre||'esta área')} nivel ${esc(x.c.nivel)}</span>`; }
    else if(s.cursoId===x.c.id && s.clase===x.n){ score=0; nota='<span class="text-success fw-semibold"><i class="bi bi-star-fill"></i> Es justo esta clase</span>'; }
    else if(!s.clase && (s.cursoId===x.c.id)){ score=1; nota='Libre del curso: repone su propio tema'; }
    else if(!s.clase && !s.cursoId){ score=2; nota='Libre: repone su propio tema'; }
    else { score=3; nota=`<span class="text-danger">Es para ${s.clase?`la clase ${s.clase}`:'otro curso'}</span>`; }
    return {x:s, ocup, lleno, score, nota};
  }).sort((a,b)=>a.score-b.score || a.x.fecha.localeCompare(b.x.fecha) || a.x.horaIni.localeCompare(b.x.horaIni));
}

/* ---------- agendar ---------- */
let repoSel=null;
function buscarRepo(inscId,n){ return listaRepos().find(y=>y.i.id===inscId && y.n===n); }
function abrirAgendar(inscId,n){
  const x=buscarRepo(inscId,n); repoSel={inscId,n};
  $('#agInfo').innerHTML=`<div class="fw-semibold">${esc(x.e.nombre)}</div>
    <div><span class="text-marca fw-semibold">Clase ${x.n}</span> · ${esc(x.tema)}</div>
    <small class="text-muted">${esc(x.c.nombre)} · ${x.costo?`reposición de ${money(x.costo)}`:'sin costo'}</small>`;
  const ops=opcionesEspacio(x), cf=DB.config;
  const precioV = x.motivo==='J'||x.r.exonerada ? 'sin costo' : money(cf.valorRepoVirtual||0);
  const virtualHtml = x.claseVirtual ? `<label class="slot" style="cursor:pointer;border-color:#cdb8ef;background:#faf7fe">
      <input type="radio" class="form-check-input mt-0" name="agEsp" value="__virtual" ${x.virtual?'checked':''}>
      <div class="flex-grow-1 small"><div class="fw-semibold" style="color:#5b2ea6"><i class="bi bi-camera-video"></i> Ver la grabación de esta clase</div>
        <div>Link único · ${cf.horasVirtual||4} h desde que lo abre · se abre una sola vez</div>
        <div>${x.video?'<span class="text-success">Grabación lista</span>':'<span class="text-danger">Falta subir la grabación</span>'}</div></div>
      <span class="small tabular text-nowrap fw-semibold">${precioV}</span></label>`
    : `<div class="small text-muted mb-1"><i class="bi bi-camera-video-off"></i> Esta clase se repone solo presencial (es práctica). Puedes cambiarlo en el tema de la clase.</div>`;
  $('#agLista').innerHTML = virtualHtml + (ops.length ? ops.map((o,k)=>`<label class="slot ${o.lleno?'opacity-50':''}" style="cursor:${o.lleno?'not-allowed':'pointer'}">
      <input type="radio" class="form-check-input mt-0" name="agEsp" value="${o.x.id}" ${o.lleno?'disabled':''} ${x.r.espacioId===o.x.id||(!x.r.espacioId&&k===0&&!o.lleno&&o.score<3)?'checked':''}>
      <div class="flex-grow-1 small"><div class="fw-semibold">${DIAS[new Date(o.x.fecha+'T12:00').getDay()]} ${fechaLarga(o.x.fecha)} · ${horaRango(o.x)}</div>
        <div>${o.x.clase?`Clase ${o.x.clase} · ${esc(temaClase(curso(o.x.cursoId),o.x.clase))}`:'Reposición libre'} · ${esc(docenteEsp(o.x))}${area(o.x.areaId)?` · ${esc(area(o.x.areaId).nombre)}`:''}</div>
        <div>${o.nota}</div></div>
      <span class="small tabular text-nowrap ${o.lleno?'text-danger':'text-muted'}">${o.lleno?'Lleno':`${o.x.cupos-o.ocup} libres`}</span></label>`).join('')
    : '<div class="small text-muted">No hay espacios presenciales abiertos desde hoy. Abre uno nuevo.</div>');
  if(x.virtual) document.querySelectorAll('[name="agEsp"]').forEach(r=>r.checked=r.value==='__virtual');
  $('#agNuevo').onclick=()=>{ modal('mAgendar').hide(); abrirEspacio(null,null,{cursoId:x.c.id,clase:x.n,asignar:{inscId,n}}); };
  modal('mAgendar').show();
}
$('#formAgendar').addEventListener('submit',e=>{ e.preventDefault();
  const id=document.querySelector('[name="agEsp"]:checked')?.value; if(!id){ toast('Elige un espacio'); return; }
  const i=insc(repoSel.inscId), r=recRepo(i,repoSel.n); delete r.estado;
  if(id==='__virtual'){ delete r.espacioId; r.modo='virtual'; guardar(); modal('mAgendar').hide(); render(); abrirVirtual(repoSel.inscId,repoSel.n); return; }
  r.espacioId=id; delete r.modo; delete r.envio;
  guardar(); modal('mAgendar').hide(); render(); toast('Reposición agendada'); });

/* ---------- reposición virtual ----------
   Contrato con el Worker (pendiente):
   GET /v/:token  → valida token en D1 (alumna, clase, video). Si es la primera vez, guarda abierto_en y vence = abierto_en + horasVirtual.
                    Si ya venció o ya se abrió en otro dispositivo, muestra "Este link ya se usó".
                    Si es válido, pide a Cloudflare Stream un token firmado que expira en vence y muestra el reproductor
                    con la marca de agua (nombre + cédula) moviéndose encima. Sin botón de descarga.
   POST /v/:token/progreso → guarda minutos vistos; al pasar el 80 % marca la reposición como hecha. */
function tokenVirtual(){ const a=new Uint8Array(9); crypto.getRandomValues(a); return [...a].map(b=>'abcdefghjkmnpqrstuvwxyz23456789'[b%31]).join(''); }
function abrirVirtual(inscId,n){
  const x=buscarRepo(inscId,n), r=x.r, cf=DB.config;
  if(!r.envio) r.envio={token:tokenVirtual(),fecha:null};
  const dom=cf.dominio||'https://tu-app.com', link=`${dom}/v/${r.envio.token}`, horas=cf.horasVirtual||4;
  const costoTxt = x.costo===0 ? (x.motivo==='J'?'sin costo (excusa médica)':'sin costo') : x.pago ? `pagada (${money(x.costo)})` : `${money(x.costo)} pendiente de pago`;
  $('#viInfo').innerHTML=`<div class="fw-semibold">${esc(x.e.nombre)}</div><div><span class="text-marca fw-semibold">Clase ${x.n}</span> · ${esc(x.tema)}</div><small class="text-muted">${esc(x.c.nombre)} · ${costoTxt}</small>`;
  $('#viLink').value=link;
  $('#viReglas').innerHTML=[`Tiene <b>${horas} horas</b> para verla desde que abre el link.`,'El link se abre <b>una sola vez</b> y en un solo dispositivo.','No se puede descargar; se ve por streaming.','Lleva su nombre y cédula como marca de agua.'].map(t=>`<li>${t}</li>`).join('');
  $('#viMarca').textContent=`${x.e.nombre} · ${x.e.doc||''}`;
  $('#viEstado').innerHTML = !x.video ? '<span class="text-danger"><i class="bi bi-exclamation-triangle"></i> Esta clase aún no tiene la grabación. Súbela antes de enviar el link.</span>'
    : r.envio.fecha ? `<span class="text-success"><i class="bi bi-check2-circle"></i> Link enviado el ${fechaLarga(r.envio.fecha)}.</span>` : '<span class="text-muted">Aún no se ha enviado.</span>';
  const tel=(x.e.tel||'').replace(/\D/g,''), num=tel.length===10?'57'+tel:tel;
  const msg=`Hola ${x.e.nombre.split(' ')[0]} 👋 Aquí está la grabación de la clase ${x.n} (${x.tema}) de ${x.c.nombre} para tu reposición:\n${link}\n\nTen en cuenta: el link se abre una sola vez y desde que lo abras tienes ${horas} horas para verla. Búscate un momento tranquilo y buena conexión.${x.costo&&!x.pago?` El valor de la reposición virtual es ${money(x.costo)}.`:''} — ${cf.nombre}`;
  const wa=$('#viWa'); wa.href=num?`https://wa.me/${num}?text=${encodeURIComponent(msg)}`:'#'; wa.classList.toggle('disabled',!num||!x.video);
  wa.onclick=()=>{ r.envio.fecha=hoyISO(); guardar(); setTimeout(()=>{ render(); abrirVirtual(inscId,n); },300); };
  $('#viNuevo').onclick=()=>{ r.envio={token:tokenVirtual(),fecha:null}; guardar(); abrirVirtual(inscId,n); toast('Link nuevo generado; el anterior deja de servir'); };
  guardar(); modal('mVirtual').show();
}
function marcarRepuesta(inscId,n,si){ const r=recRepo(insc(inscId),n); if(si) r.estado='hecha'; else delete r.estado; guardar(); render(); if(espActual) pintarDetalleEspacio(); toast(si?'Clase repuesta: ya cuenta como asistida':'Marcada como no repuesta'); }
function exonerar(inscId,n){ const r=recRepo(insc(inscId),n); r.exonerada=!r.exonerada; guardar(); render(); toast(r.exonerada?'No se cobrará esta reposición':'La reposición vuelve a cobrarse'); }
function quitarDeEspacio(inscId,n){ const r=recRepo(insc(inscId),n); delete r.espacioId; delete r.estado; guardar(); render(); pintarDetalleEspacio(); }

/* ---------- cobrar ---------- */
function abrirCobroRepo(inscId,n){
  const x=buscarRepo(inscId,n); repoSel={inscId,n};
  $('#crInfo').innerHTML=`<b>${esc(x.e.nombre)}</b><br>Clase ${x.n} · ${esc(x.tema)}`; $('#crValor').value=x.costo; $('#crImprimir').checked=true;
  modal('mEsp').hide(); modal('mCobroRepo').show();
}
$('#formCobroRepo').addEventListener('submit',e=>{ e.preventDefault();
  const i=insc(repoSel.inscId), n=repoSel.n, c=curso(i.cursoId);
  const p={id:uid(),num:DB.config.consecutivo++,inscId:i.id,valor:+$('#crValor').value,metodo:$('#crMetodo').value,
           concepto:`Reposición clase ${n} · ${temaClase(c,n)}`,fecha:hoyISO(),tipo:'reposicion'};
  DB.pagos.push(p); recRepo(i,n).pagoId=p.id; guardar(); modal('mCobroRepo').hide(); render(); toast('Pago de reposición registrado');
  if($('#crImprimir').checked) setTimeout(()=>imprimirRecibo(p.id),400); });
function imprimirReciboRepo(p,i,e,c){
  const cf=DB.config, f=(a,b)=>`<div class="fila"><span>${a}</span><span>${b}</span></div>`;
  $('#areaRecibo').innerHTML=`<div class="recibo ${cf.recibo}">
    <div style="text-align:center"><b style="font-size:1.2em">${esc(cf.nombre)}</b><br>${cf.nit?'NIT '+esc(cf.nit)+'<br>':''}${esc(cf.dir)}<br>${esc(cf.tel)}</div>
    <hr><div style="text-align:center"><b>RECIBO DE CAJA N.º ${String(p.num).padStart(5,'0')}</b></div>
    ${f('Fecha:',p.fecha)}<hr>
    ${f('Recibí de:','')}<div><b>${esc(e.nombre)}</b>${e.doc?'<br>Doc. '+esc(e.doc):''}</div><hr>
    ${f('Curso:','')}<div>${esc(c.nombre)}</div>
    ${f('Concepto:','')}<div>${esc(p.concepto)}</div>${f('Método:',esc(p.metodo))}<hr>
    ${f('<b>VALOR PAGADO:</b>','<b>'+money(p.valor)+'</b>')}<hr>
    <div style="text-align:center;margin-top:6px">${esc(cf.pie)}</div>
    ${cf.recibo==='carta'?'<div style="margin-top:40px;display:flex;justify-content:space-between"><span>____________________<br>Firma quien recibe</span><span>____________________<br>Firma estudiante</span></div>':'<br><br>'}
  </div>`;
  window.print();
}

/* ---------- espacios de disponibilidad ---------- */
let espActual=null, espAsignar=null;
function opcionesClaseEsp(cursoId,sel){
  const c=curso(cursoId);
  $('#espClase').innerHTML='<option value="">Libre: cada quien repone su tema</option>'+(c?Array.from({length:+c.grupo.numClases||0},(_,k)=>
    `<option value="${k+1}">Clase ${k+1} · ${esc(temaClase(c,k+1))}</option>`).join(''):'');
  $('#espClase').value=sel||'';
}
function abrirEspacio(id,fecha,pre){
  const x=id?espacio(id):null; espActual=id; espAsignar=pre?.asignar||null;
  const base = x || {fecha:fecha||hoyISO(), horaIni:'13:00', horaFin:'16:00', docente:'', cursoId:pre?.cursoId||'', clase:pre?.clase||null, cupos:4, notas:''};
  if(!x && pre?.cursoId){ const cc=curso(pre.cursoId); base.areaId=cc.areaId||''; base.profesionalId=cc.grupo?.profesionalId||''; }
  $('#tEsp').textContent = x ? `Espacio · ${DIAS_L[new Date(x.fecha+'T12:00').getDay()]} ${fechaLarga(x.fecha)}` : 'Nuevo espacio de reposición';
  $('#espId').value=id||''; $('#espFecha').value=base.fecha; $('#espIni').value=base.horaIni; $('#espFin').value=base.horaFin;
  $('#espCupos').value=base.cupos; $('#espNotas').value=base.notas||'';
  $('#espArea').innerHTML='<option value="">Cualquier área</option>'+(DB.areas||[]).map(a=>`<option value="${a.id}">${esc(a.nombre)}</option>`).join('');
  $('#espArea').value=base.areaId||'';
  $('#espCurso').innerHTML='<option value="">Cualquier curso</option>'+DB.cursos.map(c=>`<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
  $('#espCurso').value=base.cursoId||''; opcionesClaseEsp(base.cursoId,base.clase);
  refrescarProfEsp(base.profesionalId||'');
  $('#espRepetirWrap').hidden=!!x; $('#espRepetir').checked=false; $('#espEliminar').hidden=!x;
  pintarDetalleEspacio(); modal('mEsp').show();
}
$('#espCurso').addEventListener('change',e=>{ opcionesClaseEsp(e.target.value,'');
  const c=curso(e.target.value); if(c?.areaId) $('#espArea').value=c.areaId;
  refrescarProfEsp(c?.grupo?.profesionalId||''); });
$('#espArea').addEventListener('change',()=>refrescarProfEsp());
['#espProf','#espFecha','#espIni','#espFin'].forEach(q=>$(q).addEventListener('change',avisoEspacio));
/* Solo se ofrecen los profesionales que reponen esa área (y el nivel del curso, si hay curso) */
function refrescarProfEsp(sel){
  const areaId=$('#espArea').value, c=curso($('#espCurso').value);
  const lista=profesionalesReponen(areaId,c?.nivel||null), actual=sel!==undefined?sel:$('#espProf').value;
  const extra=actual && !lista.some(p=>p.id===actual) ? [profesional(actual)].filter(Boolean) : [];
  $('#espProf').innerHTML='<option value="">— Sin asignar —</option>'+[...lista,...extra].map(p=>`<option value="${p.id}">${esc(p.nombre)}${extra.includes(p)?' (no repone esta área/nivel)':''}</option>`).join('');
  $('#espProf').value=actual||''; avisoEspacio();
}
/* Avisos (no bloquean): fuera del horario del profesional o cruce con sus propias clases */
function avisoEspacio(){
  const p=profesional($('#espProf').value), f=$('#espFecha').value, i=$('#espIni').value, fi=$('#espFin').value, av=[];
  if(p && f && i && fi){
    if(!dentroDeHorario(p,f,i,fi)) av.push(`${p.nombre} no tiene este horario disponible (${DIAS_L[new Date(f+'T12:00').getDay()]}).`);
    const ch=choqueClase(p,f,i,fi,); if(ch) av.push(`Se cruza con la clase ${ch.n} de ${ch.c.nombre} (${rangoHoras(ch.x.ini,ch.x.fin)}).`);
  }
  $('#espAviso').innerHTML=av.map(t=>`<div class="small text-warning"><i class="bi bi-exclamation-triangle"></i> ${esc(t)}</div>`).join('');
}
function pintarDetalleEspacio(){
  if(!espActual){ $('#espDetalle').innerHTML = espAsignar ? `<div class="small bg-marca-suave rounded p-2"><i class="bi bi-info-circle"></i> Al guardar, la reposición de la clase ${espAsignar.n} queda agendada aquí.</div>` : ''; return; }
  const x=espacio(espActual), c=curso(x.cursoId), ins=reposDeEspacio(x.id), hoy=hoyISO();
  const candidatos=listaRepos().filter(y=>y.estado==='pendiente' && (!x.cursoId||y.c.id===x.cursoId))
    .sort((a,b)=>((b.n===x.clase)-(a.n===x.clase)) || (a.fechaFalta||'').localeCompare(b.fechaFalta||''));
  $('#espDetalle').innerHTML=`<div class="d-flex justify-content-between align-items-center mb-1"><b class="small">Inscritas (${ins.length}/${x.cupos})</b>
      ${x.clase?`<small class="text-muted">Tema: ${esc(temaClase(c,x.clase))}</small>`:''}</div>
    <div class="border rounded">${ins.map(y=>`<div class="repo-item"><div style="min-width:0"><b class="small">${esc(y.e.nombre)}</b>
        <div class="small"><span class="text-marca fw-semibold">Clase ${y.n}</span> · ${esc(y.tema)} ${x.clase&&y.n!==x.clase?'<span class="text-danger">(otra clase)</span>':''}</div>
        <div class="d-flex gap-1 mt-1">${y.costo===0?'<span class="pill pill-gratis">Sin costo</span>':y.pago?'<span class="pill pill-pagada">Pagada</span>':`<span class="pill pill-vencida">Debe ${money(y.costo)}</span>`}
        ${y.estado==='hecha'?'<span class="pill pill-pagada">Repuesta</span>':''}</div></div>
      <div class="d-flex flex-wrap gap-1 justify-content-end">
        ${y.estado!=='hecha'&&x.fecha<=hoy?`<button type="button" class="btn btn-sm btn-outline-success" onclick="marcarRepuesta('${y.i.id}',${y.n},true)"><i class="bi bi-check2"></i> Repuso</button>`:''}
        ${!y.pagada?`<button type="button" class="btn btn-sm btn-outline-secondary" onclick="abrirCobroRepo('${y.i.id}',${y.n})">Cobrar</button>`:''}
        ${y.estado!=='hecha'?`<button type="button" class="btn btn-sm btn-link text-danger p-1" onclick="quitarDeEspacio('${y.i.id}',${y.n})">Quitar</button>`:''}
      </div></div>`).join('')||'<div class="small text-muted p-2">Nadie agendada todavía.</div>'}</div>
    ${ins.length<x.cupos && candidatos.length ? `<div class="d-flex gap-2 mt-2"><select class="form-select form-select-sm" id="espAgregar" aria-label="Agregar reposición">
      ${candidatos.map(y=>`<option value="${y.i.id}|${y.n}">${y.n===x.clase?'★ ':''}${esc(y.e.nombre)} · clase ${y.n}: ${esc(y.tema)}</option>`).join('')}</select>
      <button type="button" class="btn btn-sm btn-marca text-nowrap" onclick="agregarAEspacio()"><i class="bi bi-plus-lg"></i> Agregar</button></div>` : ''}`;
}
function agregarAEspacio(){ const [iid,n]=$('#espAgregar').value.split('|'); const r=recRepo(insc(iid),+n); r.espacioId=espActual; delete r.estado; guardar(); render(); pintarDetalleEspacio(); toast('Agregada al espacio'); }
$('#formEsp').addEventListener('submit',e=>{ e.preventDefault();
  if($('#espFin').value<=$('#espIni').value){ toast('La hora final debe ser después de la inicial'); return; }
  const datos={fecha:$('#espFecha').value,horaIni:$('#espIni').value,horaFin:$('#espFin').value,areaId:$('#espArea').value,profesionalId:$('#espProf').value,docente:profesional($('#espProf').value)?.nombre||'',
    cursoId:$('#espCurso').value,clase:$('#espClase').value?+$('#espClase').value:null,cupos:Math.max(1,+$('#espCupos').value||1),notas:$('#espNotas').value.trim()};
  if(espActual){ Object.assign(espacio(espActual),datos); }
  else {
    const veces=$('#espRepetir').checked?Math.max(2,+$('#espSemanas').value||2):1, nuevos=[];
    for(let k=0;k<veces;k++) nuevos.push({id:'s'+uid(),...datos,fecha:sumarDias(datos.fecha,7*k)});
    DB.espacios.push(...nuevos);
    if(espAsignar){ const r=recRepo(insc(espAsignar.inscId),espAsignar.n); r.espacioId=nuevos[0].id; delete r.estado; }
    CALS.calRepo.semana=lunesDe(datos.fecha);
    toast(veces>1?`${veces} espacios creados`:espAsignar?'Espacio creado y reposición agendada':'Espacio creado');
  }
  espAsignar=null; guardar(); modal('mEsp').hide(); render(); });
function eliminarEspacio(b){
  if(!b.dataset.ok){ b.dataset.ok=1; b.innerHTML='¿Eliminar? Toca otra vez'; setTimeout(()=>{ delete b.dataset.ok; b.innerHTML='<i class="bi bi-trash"></i> Eliminar'; },4000); return; }
  listaRepos().filter(y=>y.r.espacioId===espActual && y.estado!=='hecha').forEach(y=>delete y.r.espacioId);
  DB.espacios=DB.espacios.filter(x=>x.id!==espActual); guardar(); modal('mEsp').hide(); render(); toast('Espacio eliminado; sus reposiciones volvieron a "Por agendar"');
}
document.getElementById('mEsp').addEventListener('hidden.bs.modal',()=>{ espActual=null; });
