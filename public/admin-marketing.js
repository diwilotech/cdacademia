/* =========================================================
   MARKETING — publicaciones de Instagram + links de rastreo
   campana = {id, codigo, nombre, cursoId, formato, plantilla, estilo, textos:{etiqueta,badge,titulo,linea1,linea2,cta},
              tono, caption, tipo, destino, url, responsable, fecha, estado, publicadaEn, mensajes, creada, ajustes:[{x,y,zoom}]}
   Las fotos se guardan aparte en IndexedDB (pesan mucho para el estado en D1).
   Siguiente etapa: fotos en R2 (PUT /staff/files/:name) y link corto /r/CODIGO que cuenta clics en D1.
   ========================================================= */
const FORMATOS = {
  post45:{nombre:'Publicación 4:5', corto:'4:5', size:[1080,1350]},
  post11:{nombre:'Publicación 1:1', corto:'1:1', size:[1080,1080]},
  story: {nombre:'Historia 9:16',  corto:'9:16', size:[1080,1920]}
};
const PLANTILLAS = {
  portada:     {nombre:'Portada',             fotos:['Foto principal']},
  cupos:       {nombre:'Últimos cupos',       fotos:['Foto principal']},
  collage:     {nombre:'Maquillaje + espacio',fotos:['Foto del maquillaje','Foto del espacio']},
  antesdespues:{nombre:'Antes y después',     fotos:['Antes','Después']}
};
const ESTILOS = {marca:'Color de marca', claro:'Claro', oscuro:'Oscuro'};
const TIPOS = {
  post: {nombre:'Publicación (feed)', medium:'social', palabra:'publicación',
         donde:'<i class="bi bi-person-badge"></i> Ponlo en el <b>link de la bio</b>: Instagram no deja abrir links escritos en el texto de las publicaciones.'},
  story:{nombre:'Historia', medium:'social', palabra:'historia',
         donde:'<i class="bi bi-sticky"></i> Agrégalo con el <b>sticker "Enlace"</b> de la historia, fuera de las zonas sombreadas.'},
  ads:  {nombre:'Pauta pagada (Meta Ads)', medium:'paid_social', palabra:'anuncio',
         donde:'<i class="bi bi-badge-ad"></i> Pégalo en el campo <b>"URL del sitio web"</b> al crear el anuncio en el Administrador de anuncios de Meta.'}
};
const TONOS = {cercano:'Cercano', directo:'Directo', urgencia:'Urgencia'};
const ESTADOS_MKT = {borrador:['pendiente','Borrador'], lista:['hoy','Lista para publicar'], publicada:['pagada','Publicada']};
const ZONA_SUP = 250, ZONA_INF = 340;   // zonas de la historia que tapan el perfil y la barra de respuesta
const F_SERIF = "'DM Serif Display', Georgia, serif", F_SANS = "Manrope, 'Helvetica Neue', Arial, sans-serif";

/* ---------- utilidades de color y texto ---------- */
const hexRgb = h => { h=h.replace('#',''); if(h.length===3) h=[...h].map(x=>x+x).join(''); const n=parseInt(h,16); return [n>>16&255,n>>8&255,n&255]; };
const rgba = (h,a) => `rgba(${hexRgb(h).join(',')},${a})`;
const mezclar = (a,b,t) => { const A=hexRgb(a),B=hexRgb(b); return '#'+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join(''); };
const slug = t => String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const setLS = (ctx,v) => { if('letterSpacing' in ctx) ctx.letterSpacing = v+'px'; };
function envolver(ctx,texto,maxW){
  const palabras=String(texto||'').split(/\s+/).filter(Boolean), lineas=[]; let act='';
  for(const p of palabras){ const t=act?act+' '+p:p; if(ctx.measureText(t).width<=maxW || !act) act=t; else { lineas.push(act); act=p; } }
  if(act) lineas.push(act); return lineas;
}
function pildora(ctx,x,y,w,h,color){ ctx.fillStyle=color; ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(x,y,w,h,h/2); else ctx.rect(x,y,w,h); ctx.fill(); }
function paleta(estilo){
  const b=DB.config.color||'#7a2e5c';
  return ({
    marca: {bg:b, fg:'#ffffff', sub:'rgba(255,255,255,.86)', accent:'#ffffff', accentFg:b},
    claro: {bg:'#f8f2ee', fg:'#2a1f26', sub:'#6b5d66', accent:b, accentFg:'#ffffff'},
    oscuro:{bg:'#161113', fg:'#ffffff', sub:'rgba(255,255,255,.72)', accent:mezclar(b,'#ffffff',.18), accentFg:'#ffffff'}
  })[estilo] || null;
}

/* ---------- fotos ---------- */
let logoImg=null;
function cargarLogo(){ logoImg=null; if(DB.config.logo){ const i=new Image(); i.onload=()=>{ logoImg=i; if(AD) repintar(); }; i.src=DB.config.logo; } }
const cargarImg = src => new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=src; });
const FotosDB = (()=>{
  let dbp;
  const abrir=()=>dbp||(dbp=new Promise((res,rej)=>{ const r=indexedDB.open('academia_fotos',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('f'); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }));
  const tx=(modo,fn)=>abrir().then(db=>new Promise((res,rej)=>{ const t=db.transaction('f',modo), rq=fn(t.objectStore('f'));
    t.oncomplete=()=>res(rq&&rq.result); t.onerror=()=>rej(t.error); }));
  return { get:k=>tx('readonly',s=>s.get(k)).catch(()=>null), set:(k,v)=>tx('readwrite',s=>s.put(v,k)).catch(()=>null), del:k=>tx('readwrite',s=>s.delete(k)).catch(()=>null) };
})();
async function fotosDe(a){
  const out=[];
  for(let k=0;k<2;k++){ const b=await FotosDB.get(`${a.id}:${k}`); out.push(b? await cargarImg(URL.createObjectURL(b)).catch(()=>null) : null); }
  return out;
}
/* Reduce la foto a 1600 px para que pese poco y la guarda como JPG */
async function prepararFoto(file){
  const url=URL.createObjectURL(file); let img;
  try{ img=await cargarImg(url); } catch(e){ URL.revokeObjectURL(url); throw new Error('formato'); }
  const k=Math.min(1,1600/Math.max(img.width,img.height)), c=document.createElement('canvas');
  c.width=Math.round(img.width*k); c.height=Math.round(img.height*k); c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  URL.revokeObjectURL(url);
  const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.88));
  return {blob, img: await cargarImg(URL.createObjectURL(blob))};
}

/* ---------- dibujo de las plantillas ---------- */
function foto(ctx,img,x,y,w,h,aj,etiqueta,preview){
  ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();
  if(img){
    aj=aj||{x:50,y:50,zoom:100};
    const sc=Math.max(w/img.width,h/img.height)*(aj.zoom||100)/100, dw=img.width*sc, dh=img.height*sc;
    ctx.drawImage(img, x+(w-dw)*(aj.x??50)/100, y+(h-dh)*(aj.y??50)/100, dw, dh);
  } else {
    const b=DB.config.color||'#7a2e5c', g=ctx.createLinearGradient(x,y,x+w,y+h);
    g.addColorStop(0,mezclar(b,'#ffffff',.6)); g.addColorStop(1,mezclar(b,'#1a1014',.25));
    ctx.fillStyle=g; ctx.fillRect(x,y,w,h);
    let seed=11; const r=()=>(seed=(seed*9301+49297)%233280)/233280;
    for(let i=0;i<16;i++){ ctx.beginPath(); ctx.fillStyle=`rgba(255,255,255,${.04+r()*.12})`; ctx.arc(x+r()*w,y+r()*h,(.04+r()*.18)*Math.min(w,h),0,Math.PI*2); ctx.fill(); }
    if(preview){ ctx.fillStyle='rgba(255,255,255,.92)'; ctx.font=`600 ${Math.max(16,Math.min(w,h)*.05)}px ${F_SANS}`;
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('+ '+etiqueta, x+w/2, y+h/2); ctx.textAlign='left'; }
  }
  ctx.restore();
}
function marcaNegocio(ctx,x,y,s,color,sombra){
  const cf=DB.config; ctx.save();
  if(sombra){ ctx.shadowColor='rgba(0,0,0,.4)'; ctx.shadowBlur=14*s; }
  if(logoImg){ const h=86*s, w=Math.min(360*s,logoImg.width*h/logoImg.height); ctx.drawImage(logoImg,x,y,w,w*logoImg.height/logoImg.width); }
  else {
    ctx.fillStyle=color; ctx.textBaseline='top';
    ctx.font=`800 ${25*s}px ${F_SANS}`; setLS(ctx,5*s); ctx.fillText((cf.nombre||'').toUpperCase(),x,y); setLS(ctx,0);
    if(cf.ig){ ctx.globalAlpha=.88; ctx.font=`500 ${23*s}px ${F_SANS}`; ctx.fillText(cf.ig,x,y+38*s); }
  }
  ctx.restore();
}
/* Mide y devuelve el bloque de textos (etiqueta, título, líneas y botón) listo para dibujar */
function bloqueTexto(ctx,t,s,w,pal,k=1,o={}){
  const items=[]; let h=0;
  const add=(it,gap)=>{ if(items.length) h+=gap*s*k; it.y=h; h+=it.h; items.push(it); };
  ctx.textBaseline='top';
  if(t.etiqueta && !o.sinEtiqueta){ const fs=23*s*k; ctx.font=`800 ${fs}px ${F_SANS}`; setLS(ctx,3*s*k);
    const tw=ctx.measureText(t.etiqueta.toUpperCase()).width; setLS(ctx,0); add({tipo:'etq',fs,tw,h:fs+24*s*k},0); }
  if(t.titulo){ let fs=(o.tituloMax||104)*s*k, lineas; const maxL=o.tituloLineas||3;
    for(;;){ ctx.font=`${fs}px ${F_SERIF}`; lineas=envolver(ctx,t.titulo,w);
      if((lineas.length<=maxL && lineas.every(l=>ctx.measureText(l).width<=w)) || fs<=38*s*k) break; fs-=3*s; }
    add({tipo:'tit',fs,lineas,h:lineas.length*fs*1.06},22); }
  if(t.linea1){ const fs=31*s*k; ctx.font=`500 ${fs}px ${F_SANS}`; const lineas=envolver(ctx,t.linea1,w).slice(0,2); add({tipo:'l1',fs,lineas,h:lineas.length*fs*1.32},20); }
  if(t.linea2){ const fs=31*s*k; ctx.font=`800 ${fs}px ${F_SANS}`; const lineas=envolver(ctx,t.linea2,w).slice(0,2); add({tipo:'l2',fs,lineas,h:lineas.length*fs*1.32},4); }
  if(t.cta){ const fs=28*s*k; ctx.font=`800 ${fs}px ${F_SANS}`; const txt=t.cta+'  →'; const tw=Math.min(ctx.measureText(txt).width, w-60*s*k);
    add({tipo:'cta',fs,txt,tw,h:fs+42*s*k},32); }
  return {h, dibujar(x,y){
    ctx.save(); ctx.textBaseline='top';
    for(const it of items){ const Y=y+it.y;
      if(it.tipo==='etq'){ pildora(ctx,x,Y,it.tw+34*s*k,it.h,pal.accent); ctx.fillStyle=pal.accentFg; ctx.font=`800 ${it.fs}px ${F_SANS}`; setLS(ctx,3*s*k);
        ctx.textBaseline='middle'; ctx.fillText(t.etiqueta.toUpperCase(),x+17*s*k,Y+it.h/2+1); setLS(ctx,0); ctx.textBaseline='top'; }
      if(it.tipo==='tit'){ ctx.fillStyle=pal.fg; ctx.font=`${it.fs}px ${F_SERIF}`; it.lineas.forEach((l,i)=>ctx.fillText(l,x,Y+i*it.fs*1.06)); }
      if(it.tipo==='l1'){ ctx.fillStyle=pal.sub; ctx.font=`500 ${it.fs}px ${F_SANS}`; it.lineas.forEach((l,i)=>ctx.fillText(l,x,Y+i*it.fs*1.32)); }
      if(it.tipo==='l2'){ ctx.fillStyle=pal.fg; ctx.font=`800 ${it.fs}px ${F_SANS}`; it.lineas.forEach((l,i)=>ctx.fillText(l,x,Y+i*it.fs*1.32)); }
      if(it.tipo==='cta'){ pildora(ctx,x,Y,it.tw+60*s*k,it.h,pal.accent); ctx.fillStyle=pal.accentFg; ctx.font=`800 ${it.fs}px ${F_SANS}`;
        ctx.textBaseline='middle'; ctx.fillText(it.txt,x+30*s*k,Y+it.h/2+1,it.tw); ctx.textBaseline='top'; }
    }
    ctx.restore();
  }};
}
/* Ajusta el tamaño del bloque para que quepa en un alto disponible */
function bloqueQueCabe(ctx,t,s,w,pal,altoMax,k=1,o={}){
  let b; for(;k>=.5;k-=.04){ b=bloqueTexto(ctx,t,s,w,pal,k,o); if(b.h<=altoMax) break; } return b;
}

function pintarAnuncio(ctx,a,fotos,preview){
  const [W,H]=FORMATOS[a.formato].size, s=W/1080, pal=paleta(a.estilo), t=a.textos||{}, aj=a.ajustes||[];
  const esHist=a.formato==='story', top=esHist?ZONA_SUP:0, bot=esHist?ZONA_INF:0, pad=72*s, gap=8*s;
  const nombres=PLANTILLAS[a.plantilla].fotos;
  ctx.save(); ctx.clearRect(0,0,W,H); ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,W,H);

  if(a.plantilla==='portada'){
    foto(ctx,fotos[0],0,0,W,H,aj[0],nombres[0],preview);
    const g=ctx.createLinearGradient(0,H*.32,0,H); g.addColorStop(0,rgba(pal.bg,0)); g.addColorStop(.5,rgba(pal.bg,.72)); g.addColorStop(1,rgba(pal.bg,.97));
    ctx.fillStyle=g; ctx.fillRect(0,H*.32,W,H*.68);
    marcaNegocio(ctx,pad,top+pad*.8,s,'#ffffff',true);
    const b=bloqueQueCabe(ctx,t,s,W-2*pad,pal,H*.55-bot,esHist?1.22:1,{tituloMax:108});
    b.dibujar(pad,H-bot-pad-b.h);
  }
  if(a.plantilla==='cupos'){
    const r=132*s, ancho=W-2*pad-r*1.75;
    const b=bloqueQueCabe(ctx,t,s,ancho,pal,H*.42-bot,esHist?1.2:1,{sinEtiqueta:true,tituloMax:96});
    const yPanel=Math.min(H*.66, H-bot-b.h-pad*1.9);
    foto(ctx,fotos[0],0,0,W,yPanel+2,aj[0],nombres[0],preview);
    ctx.fillStyle=pal.bg; ctx.fillRect(0,yPanel,W,H-yPanel);
    marcaNegocio(ctx,pad,top+pad*.8,s,'#ffffff',true);
    const cx=W-pad-r, cy=yPanel;
    ctx.save(); ctx.shadowColor='rgba(0,0,0,.18)'; ctx.shadowBlur=24*s; ctx.fillStyle=pal.accent; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill(); ctx.restore();
    ctx.fillStyle=pal.accentFg; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font=`800 ${21*s}px ${F_SANS}`; setLS(ctx,3*s); ctx.fillText((t.etiqueta||'Últimos').toUpperCase(),cx,cy-62*s); ctx.fillText('CUPOS',cx,cy+66*s); setLS(ctx,0);
    ctx.font=`${118*s}px ${F_SERIF}`; ctx.fillText(t.badge||'·',cx,cy+6*s); ctx.textAlign='left';
    b.dibujar(pad, yPanel+pad*1.05);
  }
  if(a.plantilla==='collage'){
    const altoArriba=H*(esHist?.5:.56), y0=altoArriba+gap, anchoIzq=Math.round(W*.42);
    foto(ctx,fotos[0],0,0,W,altoArriba,aj[0],nombres[0],preview);
    foto(ctx,fotos[1],0,y0,anchoIzq,H-y0,aj[1],nombres[1],preview);
    ctx.fillStyle=pal.bg; ctx.fillRect(anchoIzq+gap,y0,W-anchoIzq-gap,H-y0);
    marcaNegocio(ctx,pad,top+pad*.8,s,'#ffffff',true);
    const px=anchoIzq+gap+44*s, pw=W-px-44*s, disp=H-bot-y0-88*s;
    const b=bloqueQueCabe(ctx,t,s,pw,pal,disp,esHist?1.05:.86,{tituloMax:96,tituloLineas:3});
    b.dibujar(px, y0+44*s+Math.max(0,(disp-b.h)/2));
  }
  if(a.plantilla==='antesdespues'){
    const altoFotos=H*(esHist?.58:.66), mitad=(W-gap)/2;
    foto(ctx,fotos[0],0,0,mitad,altoFotos,aj[0],nombres[0],preview);
    foto(ctx,fotos[1],mitad+gap,0,mitad,altoFotos,aj[1],nombres[1],preview);
    [['ANTES',0],['DESPUÉS',mitad+gap]].forEach(([txt,x0])=>{ ctx.font=`800 ${22*s}px ${F_SANS}`; setLS(ctx,4*s);
      const tw=ctx.measureText(txt).width; pildora(ctx,x0+36*s,altoFotos-84*s,tw+40*s,48*s,'rgba(255,255,255,.92)');
      ctx.fillStyle='#2a1f26'; ctx.textBaseline='middle'; ctx.fillText(txt,x0+56*s,altoFotos-60*s+1); setLS(ctx,0); });
    ctx.fillStyle=pal.bg; ctx.fillRect(0,altoFotos,W,H-altoFotos);
    marcaNegocio(ctx,pad,top+pad*.8,s,'#ffffff',true);
    const disp=H-bot-altoFotos-2*56*s;
    const b=bloqueQueCabe(ctx,t,s,W-2*pad,pal,disp,esHist?1.15:.9,{tituloMax:92,tituloLineas:2});
    b.dibujar(pad, altoFotos+56*s+Math.max(0,(disp-b.h)/2));
  }

  if(preview && esHist && a.guias){
    ctx.fillStyle='rgba(30,20,26,.28)'; ctx.fillRect(0,0,W,top); ctx.fillRect(0,H-bot,W,bot);
    ctx.setLineDash([14*s,10*s]); ctx.strokeStyle='rgba(255,255,255,.9)'; ctx.lineWidth=3*s;
    ctx.beginPath(); ctx.moveTo(0,top); ctx.lineTo(W,top); ctx.moveTo(0,H-bot); ctx.lineTo(W,H-bot); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='#fff'; ctx.font=`600 ${24*s}px ${F_SANS}`; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('Aquí va el nombre de la cuenta',W/2,top/2); ctx.fillText('Aquí va la barra de respuesta',W/2,H-bot/2); ctx.textAlign='left';
  }
  ctx.restore();
}
function lienzoDe(a,fotos,ancho,preview){
  const [W,H]=FORMATOS[a.formato].size, c=document.createElement('canvas'), k=ancho?ancho/W:1;
  c.width=Math.round(W*k); c.height=Math.round(H*k);
  const ctx=c.getContext('2d'); ctx.scale(k,k); pintarAnuncio(ctx,a,fotos,preview); return c;
}
const fuentesListas = Promise.all([`400 40px "DM Serif Display"`,`500 40px Manrope`,`800 40px Manrope`].map(f=>document.fonts.load(f).catch(()=>{}))).then(()=>document.fonts.ready);

/* ---------- datos del curso para el anuncio ---------- */
function textoPrecio(c){
  const conPlan=DB.inscripciones.find(i=>i.cursoId===c.id && i.planCuotas && i.planCuotas.n>1);
  if(conPlan){ const q=generarCuotas(c.precio,conPlan.planCuotas,hoyISO()), ini=q.find(x=>x.n===0), c1=q.find(x=>x.n===1);
    return ini ? `Inicial ${money(ini.valor)} + ${conPlan.planCuotas.n} cuotas de ${money(c1.valor)}` : `${conPlan.planCuotas.n} cuotas de ${money(c1.valor)}`; }
  return `Inversión ${money(c.precio)}`;
}
function fechaInicioTexto(c){ const f=infoCurso(c).inicio; return f ? `${DIAS_L[new Date(f+'T12:00').getDay()]} ${+f.slice(8)} de ${new Date(f+'T12:00').toLocaleDateString('es-CO',{month:'long'})}` : ''; }
function textosDeCurso(c,a){
  const g=c.grupo||{}, inf=infoCurso(c), ini=fechaInicioTexto(c);
  return {
    etiqueta: a.plantilla==='cupos' ? 'Últimos' : inf.estado==='En curso'||inf.estado==='Finalizado' ? 'Nuevo grupo' : 'Inscripciones abiertas',
    badge: (a.textos&&a.textos.badge)||'5',
    titulo: c.nombre,
    linea1: [ini?`Inicia el ${ini}`:'', g.jornada?`Jornada ${g.jornada.toLowerCase()}`:''].filter(Boolean).join(' · '),
    linea2: textoPrecio(c),
    cta: a.tipo==='story' ? 'Toca el enlace y separa tu cupo' : a.tipo==='ads' ? 'Escríbenos por WhatsApp' : 'Escríbenos · link en la bio'
  };
}
function codigoAuto(c,excluir){
  const ini=(c.nombre||'X').split(/\s+/).filter(w=>w.length>2).slice(0,3).map(w=>w[0]).join('').toUpperCase()||'CU';
  const d=new Date(), base=`${ini}-${MESES[d.getMonth()].toUpperCase()}${String(d.getFullYear()).slice(2)}`;
  let cod=base, n=2; while(DB.campanas.some(k=>k.codigo===cod && k.id!==excluir)) cod=`${base}-${n++}`;
  return cod;
}

/* ---------- texto para la publicación ----------
   Plantillas locales. Para IA real: POST /staff/ia/caption con {curso, tono, textos}
   y el Worker llama al modelo con la clave guardada como secreto. */
function hashtags(c){
  const cf=DB.config, ciudad=slug((cf.dir||'').split(',').pop()).replace(/-/g,''), base=slug(c.nombre).replace(/-/g,'');
  const porRubro={
    maquillaje:['#maquillaje','#maquillajeprofesional','#cursodemaquillaje','#escuelademaquillaje','#makeupartist','#mua','#makeup'],
    barberia:['#barberia','#cursodebarberia','#barber','#barbershop'], unas:['#unas','#cursodeunas','#nailart','#manicure'],
    idiomas:['#idiomas','#aprendeingles','#cursodeingles'], musica:['#musica','#clasesdemusica'], cocina:['#cocina','#cursodecocina','#gastronomia']
  }[cf.rubro]||['#cursos','#aprende','#capacitacion'];
  const tags=[...porRubro, '#'+base]; if(ciudad){ tags.push('#'+ciudad); if(cf.rubro==='maquillaje') tags.push('#maquillaje'+ciudad); }
  return [...new Set(tags)].slice(0,15).join(' ');
}
function generarCaption(a,tono){
  const c=curso(a.cursoId); if(!c) return '';
  const g=c.grupo||{}, inf=infoCurso(c), cf=DB.config, ini=fechaInicioTexto(c)||'muy pronto', precio=textoPrecio(c);
  const temas=((c.plan||[]).length ? c.plan.map(m=>m.titulo) : (c.clases||[]).filter(x=>x.tema).map(x=>x.tema)).slice(0,4);
  const accion = a.tipo==='story' ? 'Toca el enlace de esta historia' : a.tipo==='ads' ? 'Toca el botón' : 'Escríbenos al WhatsApp del link en la bio';
  const esMaq = cf.rubro==='maquillaje';
  const ficha = `${g.numClases||''} clases${inf.horas?` · ${inf.horas} horas`:''}`;
  let txt;
  if(tono==='directo'){
    txt=`${c.nombre.toUpperCase()} ${esMaq?'💄':'✨'}\n\n🗓 Inicia: ${ini}\n⏰ ${horarioTexto(g)} · jornada ${(g.jornada||'').toLowerCase()}\n${g.docente?`👩‍🏫 Docente: ${g.docente}\n`:''}📚 ${ficha}\n💳 ${precio}\n📍 ${cf.dir||''}\n\n${accion} 👆`;
  } else if(tono==='urgencia'){
    const n=a.textos?.badge;
    txt=`⏳ ¡${n?`Quedan ${n} cupos`:'Quedan pocos cupos'}!\n\nEl ${ini} arranca ${c.nombre} en jornada ${(g.jornada||'').toLowerCase()} (${horarioTexto(g)}). ${esMaq?'Grupos pequeños para que practiques en modelo desde la primera semana.':'Grupos pequeños y mucha práctica.'}\n\n💳 ${precio}\n\n👉 ${accion} y separa el tuyo antes de que se llene.`;
  } else {
    const gancho = esMaq ? '✨ ¿Te imaginas maquillando como una profesional?' : `✨ ¿Quieres aprender ${c.nombre.toLowerCase()}?`;
    txt=`${gancho}\n\nNuestro curso de ${c.nombre} empieza el ${ini}: ${ficha} en jornada ${(g.jornada||'').toLowerCase()}${g.docente?` con ${g.docente}`:''}.\n\n${temas.length?`${esMaq?'💄':'📚'} Vas a aprender:\n${temas.map(x=>'• '+x).join('\n')}\n\n`:''}💳 ${precio}\n📍 ${cf.dir||''}\n\n👉 ${accion} y separa tu cupo.`;
  }
  return `${txt}\n\n${hashtags(c)}`;
}

/* ---------- link de rastreo ---------- */
function linksDe(a){
  const c=curso(a.cursoId), tel=(DB.config.tel||'').replace(/\D/g,''), num=tel.length===10?'57'+tel:tel;
  const msg=`Hola 👋 Vi su ${TIPOS[a.tipo].palabra} en Instagram y quiero información del curso ${c?.nombre||''}. (Ref: ${a.codigo})`;
  const wa = num ? `https://wa.me/${num}?text=${encodeURIComponent(msg)}` : '';
  let web='', utm=null;
  try{ if(a.url){ const u=new URL(a.url);
    utm={utm_source:'instagram', utm_medium:TIPOS[a.tipo].medium, utm_campaign:a.codigo.toLowerCase(), utm_content:`${a.formato}-${a.plantilla}`};
    Object.entries(utm).forEach(([k,v])=>u.searchParams.set(k,v)); web=u.toString(); } }catch(e){}
  return {wa, web, msg, utm, principal: a.destino==='web' ? web : wa};
}

/* ---------- resultados ---------- */
function metricas(k){
  const ests=DB.estudiantes.filter(e=>e.origen===k.id), ids=new Set(ests.map(e=>e.id));
  const ins=new Set(DB.inscripciones.filter(i=>ids.has(i.estId)).map(i=>i.id));
  const ingresos=DB.pagos.filter(p=>ins.has(p.inscId)).reduce((a,p)=>a+ +p.valor,0);
  return {inscritas:ests.length, ingresos, conv: k.mensajes ? Math.round(ests.length/k.mensajes*100) : null};
}
const ORIGENES = {ig:'Instagram (sin campaña)', wa:'WhatsApp directo', ref:'Recomendación', otro:'Otro'};
function opcionesOrigen(){
  const camps=(DB.campanas||[]).filter(k=>k.estado!=='borrador');
  return `<option value="">Sin dato</option>${camps.length?`<optgroup label="Campañas">${camps.map(k=>`<option value="${k.id}">${esc(k.codigo)} · ${esc(k.nombre)}</option>`).join('')}</optgroup>`:''}
    <optgroup label="Otros">${Object.entries(ORIGENES).map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</optgroup>`;
}
const nombreOrigen = o => (DB.campanas||[]).find(k=>k.id===o)?.codigo || ORIGENES[o] || '';

/* ---------- pantalla de marketing ---------- */
let _turnoCola=0;
function pintarMarketing(){
  DB.campanas = DB.campanas || [];
  DB.campanas.forEach(k=>{ if(!k.caption && curso(k.cursoId)) k.caption=generarCaption(k,k.tono||'cercano'); });
  const cola=DB.campanas.filter(k=>k.estado!=='publicada').sort((a,b)=>(a.fecha||'9').localeCompare(b.fecha||'9'));
  const listas=cola.filter(k=>k.estado==='lista').length;
  $('#badgeMkt').hidden=!listas; $('#badgeMkt').textContent=listas;
  const tot=DB.campanas.reduce((acc,k)=>{ const m=metricas(k); acc.msj+= +k.mensajes||0; acc.ins+=m.inscritas; acc.ing+=m.ingresos; return acc; },{msj:0,ins:0,ing:0});
  $('#statsMkt').innerHTML=[
    ['bi-send','Listas para publicar',listas],
    ['bi-whatsapp','Mensajes recibidos',tot.msj],
    ['bi-person-check',`${cap(DB.config.termP)} por campañas`,tot.ins],
    ['bi-cash-stack','Ingresos de campañas',money(tot.ing)]
  ].map(([i,e,v])=>`<div class="col-6 col-lg-3"><div class="card stat"><div class="card-body">
    <div class="d-flex justify-content-between"><span class="etq">${e}</span><i class="bi ${i} text-marca"></i></div><div class="valor tabular mt-2">${v}</div></div></div></div>`).join('');

  $('#colaMkt').innerHTML = cola.length ? cola.map(k=>{ const [cls,txt]=ESTADOS_MKT[k.estado], hoy=hoyISO();
    const atrasada = k.fecha && k.fecha<hoy;
    return `<div class="col-md-6 col-xl-4"><div class="card h-100">
      <div class="cola-thumb" data-thumb="${k.id}" onclick="abrirAnuncio('${k.id}')" title="Editar"></div>
      <div class="card-body d-flex flex-column gap-2 pt-3">
        <div class="d-flex justify-content-between align-items-center gap-2"><span class="badge bg-marca-suave text-marca tabular">${esc(k.codigo)}</span><span class="pill pill-${atrasada?'vencida':cls}">${atrasada?'Atrasada':txt}</span></div>
        <div class="fw-semibold lh-sm">${esc(k.nombre)}</div>
        <div class="small text-muted">${FORMATOS[k.formato].nombre} · ${TIPOS[k.tipo].nombre}</div>
        <div class="small"><i class="bi bi-calendar-event text-marca"></i> ${k.fecha?`${DIAS[new Date(k.fecha+'T12:00').getDay()]} ${fechaLarga(k.fecha)}`:'Sin fecha'}
          · <i class="bi bi-person text-marca"></i> ${esc(k.responsable||'Sin responsable')}</div>
        <div class="d-flex flex-wrap gap-1 mt-auto pt-1">
          <button class="btn btn-sm btn-outline-secondary" onclick="descargarCampana('${k.id}')" title="Descargar imagen"><i class="bi bi-download"></i> Imagen</button>
          <button class="btn btn-sm btn-outline-secondary" onclick="copiar(campana('${k.id}').caption,'Texto copiado')" title="Copiar texto"><i class="bi bi-clipboard"></i> Texto</button>
          <button class="btn btn-sm btn-outline-secondary" onclick="copiar(linksDe(campana('${k.id}')).principal,'Link copiado')" title="Copiar link de rastreo"><i class="bi bi-link-45deg"></i> Link</button>
          <button class="btn btn-sm btn-marca ms-auto" onclick="marcarPublicada('${k.id}')"><i class="bi bi-check2"></i> Publicada</button>
        </div>
      </div></div></div>`}).join('')
    : `<div class="col-12"><div class="card"><div class="card-body text-muted small">No hay publicaciones pendientes. Crea una con "Nueva publicación".</div></div></div>`;

  $('#tablaMkt').innerHTML = [...DB.campanas].sort((a,b)=>(b.publicadaEn||b.creada||'').localeCompare(a.publicadaEn||a.creada||'')).map(k=>{
    const m=metricas(k), [cls,txt]=ESTADOS_MKT[k.estado];
    return `<tr><td class="tabular fw-semibold text-nowrap">${esc(k.codigo)}</td>
      <td><div class="fw-semibold">${esc(k.nombre)}</div><small class="text-muted">${esc(curso(k.cursoId)?.nombre||'')} · ${FORMATOS[k.formato].corto} · ${k.publicadaEn?'publicada '+fechaLarga(k.publicadaEn):TIPOS[k.tipo].nombre}</small></td>
      <td><span class="pill pill-${cls}">${txt}</span></td>
      <td class="text-center text-nowrap"><button class="btn btn-sm btn-light py-0" onclick="sumarMensaje('${k.id}',-1)" title="Restar">−</button>
        <span class="tabular fw-semibold mx-1">${+k.mensajes||0}</span><button class="btn btn-sm btn-outline-success py-0" onclick="sumarMensaje('${k.id}',1)" title="Llegó un mensaje">+1</button></td>
      <td class="text-center tabular fw-semibold">${m.inscritas}</td>
      <td class="text-end tabular">${m.conv===null?'—':m.conv+'%'}</td>
      <td class="text-end tabular fw-semibold">${money(m.ingresos)}</td>
      <td class="text-end"><button class="btn btn-sm btn-outline-secondary" onclick="abrirAnuncio('${k.id}')" title="Abrir"><i class="bi bi-pencil"></i></button></td></tr>`}).join('')
    || '<tr><td colspan="8" class="text-center text-muted py-4">Aún no hay campañas.</td></tr>';

  // miniaturas con las fotos guardadas
  const turno=++_turnoCola;
  fuentesListas.then(async()=>{ for(const k of cola){ const el=document.querySelector(`[data-thumb="${k.id}"]`); if(!el||turno!==_turnoCola) return;
    const c=lienzoDe(k, await fotosDe(k), 400, false); el.replaceChildren(c); } });
}
const campana = id => DB.campanas.find(k=>k.id===id);
function sumarMensaje(id,d){ const k=campana(id); k.mensajes=Math.max(0,(+k.mensajes||0)+d); guardar(); render(); }
function marcarPublicada(id){ const k=campana(id); k.estado='publicada'; k.publicadaEn=hoyISO(); guardar(); render(); toast(`${k.codigo} marcada como publicada`); }
async function descargarCampana(id){ const k=campana(id); await fuentesListas; descargarLienzo(lienzoDe(k, await fotosDe(k), 0, false), k); }
function descargarLienzo(c,a){
  c.toBlob(b=>{ const l=document.createElement('a'); l.href=URL.createObjectURL(b); l.download=`${a.codigo}-${a.formato}.jpg`; l.click(); setTimeout(()=>URL.revokeObjectURL(l.href),4000); },'image/jpeg',.93);
  toast('Imagen descargada');
}
async function copiar(txt,msg){
  if(!txt){ toast('No hay nada para copiar todavía'); return; }
  try{ await navigator.clipboard.writeText(txt); }
  catch(e){ const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); }catch(_){} ta.remove(); }
  toast(msg||'Copiado');
}

/* ---------- editor ---------- */
let AD=null, fotosEd=[null,null], blobsEd=[undefined,undefined];
async function abrirAnuncio(id){
  DB.campanas = DB.campanas || [];
  if(id){ AD=structuredClone(campana(id)); fotosEd=await fotosDe(AD); }
  else {
    const hoy=hoyISO(), c=DB.cursos.find(x=>(infoCurso(x).inicio||'')>=hoy) || DB.cursos[0];
    if(!c){ toast('Primero crea un curso'); return; }
    AD={id:'k'+uid(), codigo:codigoAuto(c), nombre:`Promo ${c.nombre}`, cursoId:c.id, formato:'post45', plantilla:'portada', estilo:'marca',
        textos:{}, tono:'cercano', caption:'', tipo:'post', destino:DB.config.web?'web':'whatsapp', url:DB.config.web||'',
        responsable:'', fecha:'', estado:'borrador', mensajes:0, creada:hoy, ajustes:[]};
    AD.textos=textosDeCurso(c,AD); AD.caption=generarCaption(AD,'cercano'); fotosEd=[null,null];
  }
  AD.ajustes=[0,1].map(k=>({x:50,y:50,zoom:100,...(AD.ajustes||[])[k]})); AD.guias=true; blobsEd=[undefined,undefined];
  llenarEditor(); ir('anuncio'); await fuentesListas; repintar(); pintarPlantillas();
}
function llenarEditor(){
  const a=AD;
  $('#adCurso').innerHTML=DB.cursos.map(c=>`<option value="${c.id}">${esc(c.nombre)}</option>`).join(''); $('#adCurso').value=a.cursoId;
  $('#adNombre').value=a.nombre;
  $('#adFormatos').innerHTML=Object.entries(FORMATOS).map(([k,f])=>`<input type="radio" class="btn-check" name="adFormato" id="fmt-${k}" value="${k}" ${a.formato===k?'checked':''}>
    <label class="btn btn-sm btn-outline-secondary" for="fmt-${k}">${f.nombre}</label>`).join('');
  $('#adEstilos').innerHTML=Object.entries(ESTILOS).map(([k,n])=>`<input type="radio" class="btn-check" name="adEstilo" id="est-${k}" value="${k}" ${a.estilo===k?'checked':''}>
    <label class="btn btn-sm btn-outline-secondary" for="est-${k}">${n}</label>`).join('');
  $('#adTonos').innerHTML=Object.entries(TONOS).map(([k,n])=>`<input type="radio" class="btn-check" name="adTono" id="tono-${k}" value="${k}" ${a.tono===k?'checked':''}>
    <label class="btn btn-outline-secondary" for="tono-${k}">${n}</label>`).join('');
  $('#adTipo').innerHTML=Object.entries(TIPOS).map(([k,t])=>`<option value="${k}">${t.nombre}</option>`).join(''); $('#adTipo').value=a.tipo;
  document.querySelectorAll('[data-t]').forEach(el=>el.value=a.textos?.[el.dataset.t]||'');
  $('#adCaption').value=a.caption||''; $('#adCodigo').value=a.codigo; $('#adUrl').value=a.url||'';
  $(a.destino==='web'?'#adDestWeb':'#adDestWa').checked=true;
  $('#adResp').value=a.responsable||''; $('#adFecha').value=a.fecha||''; $('#adEstado').value=a.estado; $('#adGuias').checked=a.guias!==false;
  $('#listaResp').innerHTML=[...new Set(DB.campanas.map(k=>k.responsable).filter(Boolean))].map(r=>`<option value="${esc(r)}">`).join('');
  $('#adEliminar').hidden=!campana(a.id);
  pintarSlots(); actualizarLinks(); contarCaption(); cabeceraEditor();
}
function cabeceraEditor(){
  $('#adTitulo').textContent=AD.nombre||'Nueva publicación'; $('#adCodigoBadge').textContent=AD.codigo;
  $('#adBadgeWrap').hidden=AD.plantilla!=='cupos';
  $('#guiasWrap').hidden=AD.formato!=='story';
  const [W,H]=FORMATOS[AD.formato].size; $('#lienzoInfo').textContent=`${FORMATOS[AD.formato].nombre} · ${W} × ${H} px · JPG`;
}
let _raf=0;
function repintar(){
  cancelAnimationFrame(_raf);
  _raf=requestAnimationFrame(()=>{ const cv=$('#lienzo'), [W,H]=FORMATOS[AD.formato].size;
    if(cv.width!==W||cv.height!==H){ cv.width=W; cv.height=H; }
    cv.style.width=`min(100%, calc(70vh * ${W/H}))`;
    pintarAnuncio(cv.getContext('2d'),AD,fotosEd,true); });
}
let _rafP=0;
function pintarPlantillas(){
  cancelAnimationFrame(_rafP);
  _rafP=requestAnimationFrame(()=>{
    $('#adPlantillas').innerHTML=Object.entries(PLANTILLAS).map(([k,p])=>`<div class="col-3"><button type="button" class="plantilla-btn ${AD.plantilla===k?'active':''}" data-plantilla="${k}"><span data-mini="${k}"></span>${p.nombre}</button></div>`).join('');
    Object.keys(PLANTILLAS).forEach(k=>{ const c=lienzoDe({...AD,plantilla:k,guias:false},fotosEd,150,false); document.querySelector(`[data-mini="${k}"]`).replaceWith(c); });
  });
}
function pintarSlots(){
  const nombres=PLANTILLAS[AD.plantilla].fotos;
  $('#adFotos').innerHTML=nombres.map((n,k)=>{ const img=fotosEd[k], aj=AD.ajustes[k];
    return `<div class="slot" data-slot="${k}">
      <label class="mini mb-0" style="cursor:pointer" title="Elegir foto">${img?`<img src="${img.src}" class="mini" alt="">`:'<i class="bi bi-camera fs-4"></i>'}
        <input type="file" accept="image/*" hidden data-file="${k}"></label>
      <div class="flex-grow-1" style="min-width:0">
        <div class="d-flex justify-content-between align-items-center"><b class="small">${n}</b>
          ${img?`<button type="button" class="btn btn-sm btn-link text-danger p-0" data-quitar="${k}">Quitar</button>`:'<span class="small text-muted">Sin foto</span>'}</div>
        ${img?`<div class="row g-2 mt-1 small">
          <div class="col-4"><label class="text-muted" for="aj-x-${k}">Horizontal</label><input type="range" class="form-range" id="aj-x-${k}" min="0" max="100" value="${aj.x}" data-aj="${k}" data-c="x"></div>
          <div class="col-4"><label class="text-muted" for="aj-y-${k}">Vertical</label><input type="range" class="form-range" id="aj-y-${k}" min="0" max="100" value="${aj.y}" data-aj="${k}" data-c="y"></div>
          <div class="col-4"><label class="text-muted" for="aj-z-${k}">Zoom</label><input type="range" class="form-range" id="aj-z-${k}" min="100" max="250" value="${aj.zoom}" data-aj="${k}" data-c="zoom"></div></div>`
          :'<div class="small text-muted">Toca la cámara o arrastra una foto</div>'}
      </div></div>`}).join('');
}
async function ponerFoto(k,file){
  if(!file || !file.type.startsWith('image/')){ toast('Ese archivo no es una imagen'); return; }
  try{ const {blob,img}=await prepararFoto(file); fotosEd[k]=img; blobsEd[k]=blob; AD.ajustes[k]={x:50,y:50,zoom:100}; pintarSlots(); repintar(); pintarPlantillas(); }
  catch(e){ toast('No se pudo leer la foto. Usa JPG o PNG (las fotos HEIC del iPhone hay que convertirlas).'); }
}
/* eventos del editor */
$('#adFotos').addEventListener('change',e=>{ const f=e.target.closest('[data-file]'); if(f) ponerFoto(+f.dataset.file,f.files[0]); });
$('#adFotos').addEventListener('input',e=>{ const r=e.target.closest('[data-aj]'); if(r){ AD.ajustes[+r.dataset.aj][r.dataset.c]=+r.value; repintar(); } });
$('#adFotos').addEventListener('click',e=>{ const q=e.target.closest('[data-quitar]'); if(q){ const k=+q.dataset.quitar; fotosEd[k]=null; blobsEd[k]=null; pintarSlots(); repintar(); pintarPlantillas(); } });
['dragover','dragleave','drop'].forEach(ev=>$('#adFotos').addEventListener(ev,e=>{ const s=e.target.closest('.slot'); if(!s) return; e.preventDefault();
  s.classList.toggle('drag',ev==='dragover'); if(ev==='drop') ponerFoto(+s.dataset.slot,e.dataTransfer.files[0]); }));
$('#adPlantillas').addEventListener('click',e=>{ const b=e.target.closest('[data-plantilla]'); if(!b) return;
  const antes=AD.plantilla; AD.plantilla=b.dataset.plantilla;
  if(antes==='cupos' && AD.plantilla!=='cupos' && AD.textos.etiqueta==='Últimos'){ AD.textos.etiqueta=textosDeCurso(curso(AD.cursoId),AD).etiqueta; $('#adEtiqueta').value=AD.textos.etiqueta; }
  if(AD.plantilla==='cupos'){ AD.textos.etiqueta='Últimos'; if(!AD.textos.badge) AD.textos.badge='5'; $('#adEtiqueta').value=AD.textos.etiqueta; $('#adBadge').value=AD.textos.badge; }
  pintarSlots(); cabeceraEditor(); repintar(); pintarPlantillas(); actualizarLinks(); });
$('#adFormatos').addEventListener('change',e=>{ AD.formato=e.target.value; if(AD.formato==='story' && AD.tipo==='post'){ AD.tipo='story'; $('#adTipo').value='story'; } cabeceraEditor(); repintar(); pintarPlantillas(); actualizarLinks(); });
$('#adEstilos').addEventListener('change',e=>{ AD.estilo=e.target.value; repintar(); pintarPlantillas(); });
$('#adTonos').addEventListener('change',e=>{ AD.tono=e.target.value; generarTexto(); });
document.querySelectorAll('[data-t]').forEach(el=>el.addEventListener('input',()=>{ AD.textos[el.dataset.t]=el.value; repintar(); }));
$('#adGuias').addEventListener('change',e=>{ AD.guias=e.target.checked; repintar(); });
$('#adNombre').addEventListener('input',e=>{ AD.nombre=e.target.value; cabeceraEditor(); });
$('#adCurso').addEventListener('change',e=>{ const c=curso(e.target.value); AD.cursoId=c.id; AD.textos=textosDeCurso(c,AD);
  AD.codigo=codigoAuto(c,AD.id); AD.nombre=`Promo ${c.nombre}`; $('#adNombre').value=AD.nombre; $('#adCodigo').value=AD.codigo;
  document.querySelectorAll('[data-t]').forEach(el=>el.value=AD.textos[el.dataset.t]||''); generarTexto(); cabeceraEditor(); repintar(); pintarPlantillas(); actualizarLinks(); });
$('#adCaption').addEventListener('input',()=>{ AD.caption=$('#adCaption').value; contarCaption(); });
$('#adTipo').addEventListener('change',e=>{ AD.tipo=e.target.value; actualizarLinks(); });
$('#adCodigo').addEventListener('input',e=>{ AD.codigo=slug(e.target.value).toUpperCase(); cabeceraEditor(); actualizarLinks(); });
$('#adCodigo').addEventListener('change',e=>{ e.target.value=AD.codigo; });
$('#adUrl').addEventListener('input',e=>{ AD.url=e.target.value.trim(); actualizarLinks(); });
document.querySelectorAll('[name="adDestino"]').forEach(r=>r.addEventListener('change',e=>{ AD.destino=e.target.value; actualizarLinks(); }));
['adResp','adFecha','adEstado'].forEach(id=>$('#'+id).addEventListener('input',e=>{ AD[{adResp:'responsable',adFecha:'fecha',adEstado:'estado'}[id]]=e.target.value; }));

function textosDesdeCurso(){ AD.textos=textosDeCurso(curso(AD.cursoId),AD); document.querySelectorAll('[data-t]').forEach(el=>el.value=AD.textos[el.dataset.t]||''); repintar(); pintarPlantillas(); }
function generarTexto(){ AD.caption=generarCaption(AD,AD.tono); $('#adCaption').value=AD.caption; contarCaption(); }
function contarCaption(){
  const t=$('#adCaption').value, n=t.length, h=(t.match(/#[\p{L}\p{N}_]+/gu)||[]).length;
  $('#adContador').innerHTML=`<span class="${n>2200?'contador malo':''}">${n.toLocaleString('es-CO')} / 2.200 caracteres</span> · <span class="${h>30?'contador malo':''}">${h} / 30 hashtags</span>`;
}
function actualizarLinks(){
  const L=linksDe(AD);
  $('#adUrlWrap').hidden=AD.destino!=='web';
  $('#adLink').value=L.principal || '';
  $('#adLink').placeholder = AD.destino==='web' ? 'Escribe la página de destino' : 'Falta el teléfono del negocio en Configuración';
  $('#adDonde').innerHTML=TIPOS[AD.tipo].donde;
  $('#adRastreo').innerHTML = AD.destino==='whatsapp'
    ? `<b>Cómo se rastrea:</b> el WhatsApp llega con este mensaje ya escrito, que incluye el código:<div class="mt-1 fst-italic">"${esc(L.msg)}"</div>
       <div class="mt-1 text-muted">Cuando llegue, suma +1 en Marketing y, si se inscribe, elige <b>${esc(AD.codigo)}</b> en "¿Cómo nos conoció?".</div>`
    : L.utm ? `<b>Cómo se rastrea:</b> el link lleva etiquetas UTM que Google Analytics y Meta leen solas:
       <div class="d-flex flex-wrap gap-1 mt-1">${Object.entries(L.utm).map(([k,v])=>`<span class="tag tabular">${k}=<b>${esc(v)}</b></span>`).join('')}</div>`
    : '<span class="text-muted">Escribe la página de destino (debe empezar por https://).</span>';
}
async function guardarAnuncio(){
  if(!AD.codigo){ toast('Ponle un código a la campaña'); return; }
  if(DB.campanas.some(k=>k.codigo===AD.codigo && k.id!==AD.id)){ toast(`Ya existe una campaña con el código ${AD.codigo}`); return; }
  for(let k=0;k<2;k++){ if(blobsEd[k]) await FotosDB.set(`${AD.id}:${k}`,blobsEd[k]); else if(blobsEd[k]===null) await FotosDB.del(`${AD.id}:${k}`); }
  blobsEd=[undefined,undefined];
  if(AD.estado==='publicada' && !AD.publicadaEn) AD.publicadaEn=hoyISO();
  const {guias,...datos}=AD; const i=DB.campanas.findIndex(k=>k.id===AD.id); i>=0?DB.campanas[i]=datos:DB.campanas.push(datos);
  guardar(); $('#adEliminar').hidden=false; render(); toast('Publicación guardada');
}
async function descargarEditor(){ await fuentesListas; descargarLienzo(lienzoDe({...AD,guias:false},fotosEd,0,false),AD); }
function eliminarAnuncio(b){
  if(!b.dataset.ok){ b.dataset.ok=1; b.innerHTML='¿Eliminar? Toca otra vez'; setTimeout(()=>{ delete b.dataset.ok; b.innerHTML='<i class="bi bi-trash"></i> Eliminar'; },4000); return; }
  DB.campanas=DB.campanas.filter(k=>k.id!==AD.id); DB.estudiantes.forEach(e=>{ if(e.origen===AD.id) e.origen=''; });
  FotosDB.del(`${AD.id}:0`); FotosDB.del(`${AD.id}:1`); guardar(); ir('marketing'); toast('Publicación eliminada');
}

/* ---------- logo ---------- */
function pintarLogoPrev(){ $('#cfgLogoPrev').innerHTML = DB.config.logo ? `<img src="${DB.config.logo}" style="max-width:56px;max-height:56px" alt="Logo">` : '<i class="bi bi-image text-white-50"></i>'; }
async function subirLogo(inp){
  const f=inp.files[0]; inp.value=''; if(!f) return;
  try{ const url=URL.createObjectURL(f), img=await cargarImg(url), k=Math.min(1,400/Math.max(img.width,img.height)), c=document.createElement('canvas');
    c.width=Math.round(img.width*k); c.height=Math.round(img.height*k); c.getContext('2d').drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(url);
    DB.config.logo=c.toDataURL('image/png'); guardar(); cargarLogo(); pintarLogoPrev(); toast('Logo guardado'); }
  catch(e){ toast('No se pudo leer el logo. Usa PNG o JPG.'); }
}
function quitarLogo(){ delete DB.config.logo; guardar(); cargarLogo(); pintarLogoPrev(); }
cargarLogo();
