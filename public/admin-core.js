/* =========================================================
   CONFIG DE RUBROS — así la misma app sirve para otras áreas
   ========================================================= */
const RUBROS = {
  maquillaje: {nombre:'Maquillaje', icono:'bi-brush', s:'estudiante', p:'estudiantes', color:'#7a2e5c'},
  barberia:   {nombre:'Barbería', icono:'bi-scissors', s:'aprendiz', p:'aprendices', color:'#1f4e5f'},
  unas:       {nombre:'Uñas', icono:'bi-gem', s:'alumna', p:'alumnas', color:'#b0476a'},
  idiomas:    {nombre:'Idiomas', icono:'bi-translate', s:'estudiante', p:'estudiantes', color:'#2b5aa8'},
  musica:     {nombre:'Música', icono:'bi-music-note-beamed', s:'alumno', p:'alumnos', color:'#6b4b2a'},
  cocina:     {nombre:'Cocina', icono:'bi-egg-fried', s:'alumno', p:'alumnos', color:'#a3461f'},
  otro:       {nombre:'Otro', icono:'bi-mortarboard', s:'estudiante', p:'estudiantes', color:'#444'}
};

/* =========================================================
   DATOS — el Worker incrusta window.__BOOT__ con el estado del negocio (D1, siempre con business_id).
   Sin __BOOT__ (archivo abierto suelto) usa localStorage con datos de ejemplo.
   ========================================================= */
const KEY = 'academia_v1';
const BOOT = window.__BOOT__ || null;
const uid = () => Math.random().toString(36).slice(2,10);
const hoyISO = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }; // fecha local, no UTC

function datosEjemplo(){
  const c1='c1', c2='c2', c3='c3', e1='e1', e2='e2', e3='e3';
  // Clase: [tema, contenido, metodologías, materiales]
  const MP = [
    ['Bienvenida, bioseguridad y kit profesional','Higiene de herramientas, desinfección, organización del kit',['Clase magistral'],'Kit básico, alcohol 70 %, espátulas, toallas desechables'],
    ['Teoría del color','Círculo cromático, colores complementarios, temperatura',['Clase magistral','Taller'],'Paleta de sombras, cartulina, círculo cromático impreso'],
    ['Visagismo','Tipos de rostro, proporciones, correcciones con luz y sombra',['Demostración','Evaluación teórica'],'Fotos de referencia, espejo, lápiz blanco'],
    ['Tipos de piel y preparación','Diagnóstico de piel, skincare previo, primers',['Demostración','Práctica guiada'],'Limpiador, tónico, hidratante, primers'],
    ['Bases y subtonos','Elección de tono, texturas, aplicación con brocha y esponja',['Práctica guiada'],'Bases fluidas y en crema, brochas, esponjas'],
    ['Corrección de color y ojeras','Neutralización, correctores de alta cobertura',['Práctica en modelo'],'Correctores de color, corrector líquido, polvo traslúcido'],
    ['Contorno, rubor e iluminación','Técnicas en crema y en polvo según rostro',['Práctica en modelo'],'Contornos crema y polvo, rubores, iluminadores'],
    ['Evaluación 1: piel perfecta','Preparación, base, corrección y sellado en modelo',['Evaluación práctica'],'Modelo propia, kit completo de piel'],
    ['Cejas: diseño y relleno','Medición, diseño según rostro, relleno con pomada',['Demostración','Práctica guiada'],'Pomada, lápices de cejas, gel fijador, regla de cejas'],
    ['Ojos I: difuminados y smokey','Cuenca, transiciones, smokey clásico',['Práctica en modelo'],'Paletas de sombras, brochas de difuminar, primer de ojos'],
    ['Ojos II: delineados y pestañas','Delineado gráfico y felino, pestañas en tira y pelo a pelo',['Práctica en modelo','Evaluación práctica'],'Delineador gel y líquido, pestañas postizas, pegante'],
    ['Labios de larga duración','Perfilado, corrección de forma, sellado',['Práctica guiada'],'Perfiladores, labiales mate, pinceles de labios'],
    ['Maquillaje social día y noche','Adaptación de un look según evento e iluminación',['Práctica en modelo'],'Kit completo, fijador'],
    ['Maquillaje de novia y fotografía','Larga duración, flash, retoques',['Demostración','Práctica en modelo','Evaluación práctica'],'Fijador, setting powder, ring light'],
    ['Editorial y tendencias','Looks creativos para sesiones y pasarela',['Taller'],'Pigmentos, glitter, pedrería, pegante cosmético'],
    ['Evaluación final y certificación','Look completo en modelo con tema asignado',['Evaluación práctica'],'Modelo propia, kit completo']
  ].map(([tema,detalle,metodos,materiales],k)=>({n:k+1,tema,detalle,metodos,materiales,
      virtual:[1,2,3,9].includes(k+1), video:[1,2,3].includes(k+1)?`vid_mp_${k+1}`:''}));

  // Asistencia de las clases 1–10 y notas de las dos primeras evaluaciones
  const grupoMP = [
    ['i1',e1,'PPAPPTPPPP',[4.5,4.2]],
    ['i4','e4','PPPPPPPPPP',[4.8,4.6]],
    ['i5','e5','PPTPPPJPPP',[4.0,3.8]],
    ['i6','e6','PPPPAPPPTP',[3.9,4.1]],
    ['i7','e7','PPPPPPPPPJ',[4.4,4.7]],
    ['i8','e8','PAPPAPTAPP',[3.2,2.6]]
  ];
  const asis = s => Object.fromEntries([...s].map((v,k)=>[k+1,v]));
  // Reposiciones ya gestionadas (A = falla con costo, J = excusa médica sin costo)
  const REPOS = {
    i6:{5:{estado:'hecha',espacioId:'s1',pagoId:'p9'}},
    i8:{2:{estado:'hecha',espacioId:'s1',pagoId:'p10'}, 5:{espacioId:'s2'}},
    i5:{7:{estado:'hecha',espacioId:'s1'}},
    i7:{10:{espacioId:'s2'}},
    i1:{3:{modo:'virtual',envio:{token:'k7m2qa9xr',fecha:null}}}
  };

  return {
    business_id:'demo',
    config:{nombre:'Bella Studio Academy', nit:'900.123.456-7', tel:'300 123 4567', dir:'Cra 43A #10-20, Medellín',
            color:'#7a2e5c', recibo:'ticket', pie:'Gracias por formarte con nosotros ✨', rubro:'maquillaje', termS:'estudiante', termP:'estudiantes',
            consecutivo:11, valorRepo:60000, valorRepoVirtual:35000, horasVirtual:4, dominio:'', escala:5, notaMin:3.0, asisMin:80, ig:'@bellastudio.academy', web:''},
    cursos:[
      {id:c1, nombre:'Automaquillaje Social', precio:450000, nivel:'Básico',
       desc:'Aprende a maquillarte para el día a día y eventos.',
       grupo:{docente:'Paola Vélez',jornada:'Sabatina',dias:[6],horaIni:'09:00',horaFin:'12:00',inicio:'2026-09-19',numClases:4,festivos:true},
       clases:[
         {n:1,tema:'Preparación de la piel',detalle:'Tipos de piel, limpieza e hidratación, primers',metodos:['Demostración','Práctica guiada'],materiales:'Limpiador, hidratante, primer, espejo'},
         {n:2,tema:'Base y corrección',detalle:'Subtonos, correctores de color, sellado',metodos:['Práctica guiada'],materiales:'Base, corrector, esponja, polvo traslúcido'},
         {n:3,tema:'Ojos sociales',detalle:'Sombras básicas, delineado, pestañas',metodos:['Demostración','Práctica guiada'],materiales:'Paleta neutra, delineador, máscara de pestañas'},
         {n:4,tema:'Look completo para evento',detalle:'Labios, contorno suave, práctica final',metodos:['Evaluación práctica'],materiales:'Kit personal completo'}],
       evaluaciones:[{id:'ev1',nombre:'Participación',peso:30,clase:2},{id:'ev2',nombre:'Look final',peso:70,clase:4}],
       plan:[{titulo:'Preparación de la piel',horas:3,temas:['Tipos de piel','Limpieza e hidratación','Primers']},
             {titulo:'Base y corrección',horas:3,temas:['Subtonos','Correctores de color','Sellado']},
             {titulo:'Ojos sociales',horas:3,temas:['Sombras básicas','Delineado','Pestañas']},
             {titulo:'Look completo',horas:3,temas:['Labios','Contorno suave','Práctica final']}]},
      {id:c2, nombre:'Maquillaje Profesional', precio:1800000, nivel:'Profesional',
       desc:'Formación completa para trabajar como maquilladora profesional.',
       grupo:{docente:'Natalia Herrera',jornada:'Noche',dias:[2,4],horaIni:'18:00',horaFin:'21:00',inicio:'2026-09-01',numClases:16,festivos:true},
       clases:MP,
       evaluaciones:[{id:'ev1',nombre:'Teoría y visagismo',peso:15,clase:3},{id:'ev2',nombre:'Piel perfecta',peso:25,clase:8},
                     {id:'ev3',nombre:'Ojos y cejas',peso:20,clase:11},{id:'ev4',nombre:'Novia',peso:15,clase:14},{id:'ev5',nombre:'Examen final',peso:25,clase:16}],
       plan:[{titulo:'Fundamentos',horas:9,temas:['Bioseguridad','Teoría del color','Visagismo']},
             {titulo:'Piel',horas:15,temas:['Preparación','Bases','Corrección','Contorno']},
             {titulo:'Ojos, cejas y labios',horas:12,temas:['Cejas','Sombras','Delineados y pestañas','Labios']},
             {titulo:'Looks profesionales',horas:12,temas:['Social','Novia','Editorial','Evaluación final']}]},
      {id:c3, nombre:'Cejas y Pestañas', precio:650000, nivel:'Intermedio', desc:'Diseño de cejas, laminado y lifting.',
       grupo:{docente:'Natalia Herrera',jornada:'Tarde',dias:[5],horaIni:'14:00',horaFin:'18:00',inicio:'2026-10-09',numClases:6,festivos:true},
       clases:[
         {n:1,tema:'Visagismo y medición de cejas',detalle:'Proporciones, puntos de inicio, arco y final',metodos:['Clase magistral','Demostración'],materiales:'Regla de cejas, lápiz blanco, espejo'},
         {n:2,tema:'Diseño y depilación',detalle:'Pinza, hilo y cera; cuidados posteriores',metodos:['Práctica en modelo'],materiales:'Pinzas, hilo, cera tibia, aloe'},
         {n:3,tema:'Laminado de cejas',detalle:'Lociones, tiempos de pose, fijación',metodos:['Demostración','Práctica en modelo'],materiales:'Kit de laminado, film, cepillos'},
         {n:4,tema:'Lifting de pestañas',detalle:'Elección de molde, aplicación y neutralizado',metodos:['Demostración','Práctica en modelo'],materiales:'Kit de lifting, moldes de silicona, pegante'},
         {n:5,tema:'Tinte de cejas y pestañas',detalle:'Colorimetría, prueba de alergia, aplicación',metodos:['Práctica guiada'],materiales:'Tintes, oxidante, protector de piel'},
         {n:6,tema:'Evaluación final en modelo',detalle:'Servicio completo: diseño, laminado y lifting',metodos:['Evaluación práctica'],materiales:'Modelo propia, kit completo'}],
       evaluaciones:[{id:'ev1',nombre:'Práctica',peso:50,clase:3},{id:'ev2',nombre:'Final',peso:50,clase:6}], plan:[]}
    ],
    estudiantes:[
      {id:e1,nombre:'Valentina Ríos',doc:'1.036.555.221',tel:'311 456 7788',email:'vale@correo.com',notas:'',origen:'k1'},
      {id:e2,nombre:'Mariana López',doc:'1.017.889.003',tel:'320 111 2233',email:'',notas:'Prefiere horario sábado'},
      {id:e3,nombre:'Camila Ospina',doc:'43.889.120',tel:'304 998 1100',email:'',notas:''},
      {id:'e4',nombre:'Laura Gómez',doc:'1.152.440.876',tel:'315 220 4410',email:'',notas:'',origen:'k1'},
      {id:'e5',nombre:'Daniela Restrepo',doc:'1.037.612.905',tel:'300 845 1290',email:'',notas:'',origen:'ref'},
      {id:'e6',nombre:'Sara Montoya',doc:'1.001.233.457',tel:'317 552 0098',email:'',notas:'',origen:'k1'},
      {id:'e7',nombre:'Juliana Cardona',doc:'1.040.778.312',tel:'312 609 7745',email:'',notas:'',origen:'ig'},
      {id:'e8',nombre:'Isabella Zapata',doc:'1.017.250.661',tel:'301 334 8821',email:'',notas:'Trabaja en la tarde, a veces llega tarde',origen:'k1'}
    ],
    inscripciones:[
      ...grupoMP.map(([id,estId,a,[n1,n2]])=>({id,estId,cursoId:c2,valor:1800000,desc:id==='i1'?100000:0,fecha:'2026-09-01',estado:'activa',
         planCuotas:{inicial:500000,n:6,frecuencia:'mensual',primera:'2026-10-01'}, asistencia:asis(a), notas:{ev1:n1,ev2:n2}, repos:REPOS[id]||{}})),
      {id:'i2',estId:e2,cursoId:c1,valor:450000,desc:0,fecha:'2026-09-15',estado:'activa',
       planCuotas:{inicial:0,n:1,frecuencia:'mensual',primera:'2026-09-15'}, asistencia:asis('PPP'), notas:{ev1:4.6}},
      {id:'i3',estId:e3,cursoId:c3,valor:650000,desc:0,fecha:'2026-09-20',estado:'activa',
       planCuotas:{inicial:200000,n:3,frecuencia:'quincenal',primera:'2026-10-05'}}
    ].map(i=>({asistencia:{},notas:{},...i,cuotas:generarCuotas(i.valor-i.desc,i.planCuotas,i.fecha)})),
    pagos:[
      {id:'p1',num:1,inscId:'i1',valor:600000,metodo:'Transferencia',concepto:'Matrícula y cuota 1',fecha:'2026-09-01'},
      {id:'p2',num:2,inscId:'i2',valor:450000,metodo:'Nequi',concepto:'Pago total',fecha:'2026-09-15'},
      {id:'p3',num:3,inscId:'i3',valor:200000,metodo:'Efectivo',concepto:'Abono',fecha:'2026-09-20'},
      {id:'p4',num:4,inscId:'i4',valor:716000,metodo:'Transferencia',concepto:'Inicial y cuota 1',fecha:'2026-09-01'},
      {id:'p5',num:5,inscId:'i5',valor:500000,metodo:'Efectivo',concepto:'Cuota inicial',fecha:'2026-09-01'},
      {id:'p6',num:6,inscId:'i6',valor:716000,metodo:'Nequi',concepto:'Inicial y cuota 1',fecha:'2026-09-01'},
      {id:'p7',num:7,inscId:'i7',valor:500000,metodo:'Daviplata',concepto:'Cuota inicial',fecha:'2026-08-29'},
      {id:'p8',num:8,inscId:'i8',valor:500000,metodo:'Efectivo',concepto:'Cuota inicial',fecha:'2026-09-01'},
      {id:'p9',num:9,inscId:'i6',valor:60000,metodo:'Nequi',concepto:'Reposición clase 5 · Bases y subtonos',fecha:'2026-09-19',tipo:'reposicion'},
      {id:'p10',num:10,inscId:'i8',valor:60000,metodo:'Efectivo',concepto:'Reposición clase 2 · Teoría del color',fecha:'2026-09-19',tipo:'reposicion'}
    ],
    espacios:[
      {id:'s1',fecha:'2026-09-19',horaIni:'14:00',horaFin:'17:00',docente:'Natalia Herrera',cursoId:c2,clase:null,cupos:4,notas:'Sala 2'},
      {id:'s2',fecha:'2026-10-10',horaIni:'13:00',horaFin:'16:00',docente:'Natalia Herrera',cursoId:c2,clase:null,cupos:4,notas:'Sala 2'},
      {id:'s3',fecha:'2026-10-14',horaIni:'15:00',horaFin:'18:00',docente:'Natalia Herrera',cursoId:c2,clase:8,cupos:3,notas:'Traer modelo'},
      {id:'s4',fecha:'2026-10-17',horaIni:'13:00',horaFin:'16:00',docente:'Natalia Herrera',cursoId:c2,clase:null,cupos:4,notas:'Sala 2'},
      {id:'s5',fecha:'2026-10-24',horaIni:'13:00',horaFin:'16:00',docente:'Natalia Herrera',cursoId:c2,clase:null,cupos:4,notas:'Sala 2'}
    ],
    campanas:[
      {id:'k1',codigo:'MP-AGO26',nombre:'Lanzamiento Maquillaje Profesional',cursoId:c2,formato:'post45',plantilla:'portada',estilo:'marca',
       textos:{etiqueta:'Inscripciones abiertas',titulo:'Maquillaje Profesional',linea1:'Inicia el 1 de septiembre · Jornada noche',linea2:'Inicial $500.000 + 6 cuotas de $216.000',cta:'Escríbenos · link en la bio',badge:''},
       tono:'cercano',caption:'',tipo:'post',destino:'whatsapp',url:'',responsable:'Laura (redes)',fecha:'2026-08-20',estado:'publicada',publicadaEn:'2026-08-20',mensajes:14,creada:'2026-08-18',ajustes:[]},
      {id:'k2',codigo:'CP-OCT26',nombre:'Cejas y Pestañas · últimos cupos',cursoId:c3,formato:'story',plantilla:'cupos',estilo:'claro',
       textos:{etiqueta:'Últimos',badge:'4',titulo:'Cejas y Pestañas',linea1:'Inicia el viernes 9 de octubre · Tarde',linea2:'Inicial $200.000 + 3 cuotas de $150.000',cta:'Toca el enlace y separa tu cupo'},
       tono:'urgencia',caption:'',tipo:'story',destino:'whatsapp',url:'',responsable:'Laura (redes)',fecha:'2026-10-07',estado:'lista',mensajes:0,creada:'2026-10-05',ajustes:[]},
      {id:'k3',codigo:'MP-NOV26',nombre:'Nuevo grupo Profesional · antes y después',cursoId:c2,formato:'post11',plantilla:'antesdespues',estilo:'oscuro',
       textos:{etiqueta:'Nuevo grupo',titulo:'Del antes al después en 16 clases',linea1:'Maquillaje Profesional · Jornada noche',linea2:'',cta:'Escríbenos · link en la bio',badge:''},
       tono:'directo',caption:'',tipo:'post',destino:'whatsapp',url:'',responsable:'',fecha:'',estado:'borrador',mensajes:0,creada:'2026-10-06',ajustes:[]}
    ]
  };
}
/* Negocio nuevo: sin cursos ni alumnos, pero con la configuración base */
function datosVacios(nombre){
  const d=datosEjemplo();
  return {business_id:'', config:{...d.config, nombre:nombre||'Mi academia', nit:'', tel:'', dir:'', consecutivo:1, ig:'', web:''},
          cursos:[], estudiantes:[], inscripciones:[], pagos:[], espacios:[], campanas:[]};
}
let DB;
if(BOOT){ DB = BOOT.estado || datosVacios(BOOT.negocio); }
else { try{ DB = JSON.parse(localStorage.getItem(KEY)) || datosEjemplo(); }catch(e){ DB = datosEjemplo(); } }

/* ---------- guardado: nube (D1) con control de versión, o localStorage si no hay servidor ---------- */
let VERSION = BOOT ? BOOT.version : 0, _tSync=0, _enVuelo=false, _bloqueado=false, _sucio=false;
function estadoSync(e, msg){
  const el=document.getElementById('lblSync'); if(!el) return;
  el.innerHTML = e==='ok' ? '<i class="bi bi-cloud-check"></i> Sincronizado'
    : e==='pend' ? '<i class="bi bi-cloud-arrow-up"></i> Guardando…'
    : `<span class="text-danger"><i class="bi bi-cloud-slash"></i> ${esc(msg||'No se pudo guardar')}</span>`;
}
function guardar(){
  if(!BOOT){ try{ localStorage.setItem(KEY, JSON.stringify(DB)); }catch(e){} return; }
  if(_bloqueado) return;
  if(BOOT.readOnly){ estadoSync('error','Suscripción vencida: solo lectura'); return; }
  _sucio=true; estadoSync('pend'); clearTimeout(_tSync); _tSync=setTimeout(sincronizar,700);
}
async function sincronizar(){
  if(_enVuelo){ _tSync=setTimeout(sincronizar,500); return; }
  _enVuelo=true; _sucio=false;
  try{
    const r=await fetch('/staff/state',{method:'PUT',headers:{'content-type':'application/json','x-requested-with':'cda'},body:JSON.stringify({data:DB,version:VERSION})});
    const d=await r.json().catch(()=>({}));
    if(r.ok){ VERSION=d.version; if(!_sucio) estadoSync('ok'); }
    else if(r.status===401){ location.href='/'; }
    else if(r.status===402){ _bloqueado=true; document.getElementById('barraVencida').hidden=false; estadoSync('error', d.error); }
    else { if(r.status===409) _bloqueado=true; estadoSync('error', d.error); }
  }catch(e){ _sucio=true; estadoSync('error','Sin conexión; reintentando…'); _tSync=setTimeout(sincronizar,5000); }
  _enVuelo=false;
}
window.addEventListener('beforeunload',e=>{ if(_enVuelo || _sucio){ e.preventDefault(); e.returnValue=''; } });
// Ventana "Cambiar contraseña" (misma en todas las apps de Diwilo). enviar(actual, nueva) devuelve un error o nada.
function abrirCambioClave(enviar) {
  let d = document.getElementById('dlgClave');
  if (!d) {
    d = document.createElement('dialog');
    d.id = 'dlgClave';
    d.style.cssText = 'border:0;border-radius:14px;padding:22px;max-width:360px;width:calc(100% - 32px);box-shadow:0 20px 50px rgba(0,0,0,.25)';
    d.innerHTML = '<form class="d-grid gap-2">' +
      '<h2 class="h5 mb-1">Cambiar contraseña</h2>' +
      '<input class="form-control" type="password" name="current" placeholder="Contraseña actual" autocomplete="current-password" required>' +
      '<input class="form-control" type="password" name="password" placeholder="Nueva contraseña (mínimo 8)" minlength="8" maxlength="200" autocomplete="new-password" required>' +
      '<input class="form-control" type="password" name="confirm" placeholder="Repite la nueva contraseña" minlength="8" maxlength="200" autocomplete="new-password" required>' +
      '<div class="small text-danger" data-err></div>' +
      '<div class="d-flex gap-2 justify-content-end mt-1"><button type="button" class="btn btn-light" data-cancel>Cancelar</button><button class="btn btn-primary" data-ok>Guardar</button></div>' +
      '</form>';
    document.body.appendChild(d);
    d.querySelector('[data-cancel]').onclick = () => d.close();
  }
  const f = d.querySelector('form'), err = d.querySelector('[data-err]'), ok = d.querySelector('[data-ok]');
  f.reset(); err.textContent = '';
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (f.password.value !== f.confirm.value) { err.textContent = 'Las contraseñas nuevas no coinciden'; return; }
    ok.disabled = true;
    try {
      const msg = await enviar(f.current.value, f.password.value);
      if (msg) err.textContent = msg;
      else { d.close(); alert('Contraseña actualizada. Se cerraron tus otras sesiones abiertas.'); }
    } catch (_) { err.textContent = 'No se pudo conectar. Intenta de nuevo.'; }
    finally { ok.disabled = false; }
  };
  d.showModal();
}
function cambiarClave(ev){
  ev?.preventDefault();
  abrirCambioClave(async (current, password) => {
    const r = await fetch('/api/auth/password', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'cda' }, body: JSON.stringify({ current, password }) });
    if (r.ok) return null;
    return (await r.json().catch(() => ({}))).error || 'No se pudo cambiar la contraseña';
  });
}
async function cerrarSesion(ev){
  ev?.preventDefault();
  try{ await fetch('/api/logout',{method:'POST',headers:{'x-requested-with':'cda'}}); }catch(e){}
  location.href='/';
}

/* =========================================================
   CUOTAS
   Cada inscripción guarda su plan y las cuotas generadas:
   cuotas: [{n, etiqueta, fecha, valor}]
   Los pagos NO se asignan a mano: se abonan a las cuotas en
   orden de vencimiento (la más antigua primero).
   ========================================================= */
const FRECUENCIAS = {semanal:'Semanal', quincenal:'Quincenal', mensual:'Mensual'};

function sumarFecha(iso, frecuencia, veces){
  const [y,m,d]=iso.split('-').map(Number);
  if(frecuencia==='mensual'){
    const base=new Date(Date.UTC(y,m-1+veces,1));
    const ultimo=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+1,0)).getUTCDate();
    base.setUTCDate(Math.min(d,ultimo));           // 31 ene → 28/29 feb
    return base.toISOString().slice(0,10);
  }
  const dias = frecuencia==='semanal'?7:15;
  return new Date(Date.UTC(y,m-1,d+dias*veces)).toISOString().slice(0,10);
}

function generarCuotas(total, plan, fechaInscripcion){
  const cuotas=[]; let resto=Math.max(0,total);
  const inicial=Math.min(+plan.inicial||0, resto);
  if(inicial>0){ cuotas.push({n:0,etiqueta:'Inicial',fecha:fechaInscripcion,valor:inicial}); resto-=inicial; }
  const n=Math.max(1,+plan.n||1);
  if(resto>0){
    const base=Math.floor(resto/n/1000)*1000;         // redondeo a miles
    for(let k=0;k<n;k++){
      const valor = k===n-1 ? resto-base*(n-1) : base;  // la última absorbe el redondeo
      cuotas.push({n:k+1,etiqueta:n===1?'Pago único':`Cuota ${k+1} de ${n}`,fecha:sumarFecha(plan.primera||fechaInscripcion,plan.frecuencia,k),valor});
    }
  }
  return cuotas;
}

/* Estado de cada cuota. hastaNum limita qué pagos se cuentan (para recibos históricos). */
function estadoCuotas(i, hastaNum=Infinity){
  let disponible=DB.pagos.filter(p=>p.inscId===i.id && p.num<=hastaNum && esPagoCurso(p)).reduce((a,p)=>a+ +p.valor,0);
  const hoy=hoyISO();
  return [...(i.cuotas||[])].sort((a,b)=>a.fecha.localeCompare(b.fecha)).map(c=>{
    const abonado=Math.min(c.valor,disponible); disponible-=abonado;
    const falta=c.valor-abonado;
    let estado = falta<=0 ? 'pagada' : c.fecha<hoy ? 'vencida' : c.fecha===hoy ? 'hoy' : abonado>0 ? 'parcial' : 'pendiente';
    return {...c, abonado, falta, estado, diasMora: estado==='vencida' ? Math.round((new Date(hoy)-new Date(c.fecha))/864e5) : 0};
  });
}
function todasLasCuotas(){
  return DB.inscripciones.flatMap(i=>estadoCuotas(i).map(c=>({...c, insc:i})));
}
const PILL = {pagada:'Pagada', parcial:'Abono parcial', vencida:'Vencida', pendiente:'Pendiente', hoy:'Vence hoy'};
const pill = c => `<span class="pill pill-${c.estado}">${c.estado==='vencida' ? `Vencida · ${c.diasMora} ${c.diasMora===1?'día':'días'}` : PILL[c.estado]}</span>`;

/* =========================================================
   ACADÉMICO: grupo, clases, asistencia y notas
   curso.grupo = {docente, jornada, dias:[0-6], horaIni, horaFin, inicio, numClases, festivos}
   curso.clases = [{n, tema, detalle, metodos:[], materiales, fecha?(reprogramada), obs}]
   curso.evaluaciones = [{id, nombre, peso, clase}]
   inscripcion.asistencia = {nClase:'P'|'A'|'T'|'J'}   inscripcion.notas = {evalId: nota}
   ========================================================= */
const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const DIAS_L = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const METODOS = ['Clase magistral','Demostración','Práctica guiada','Práctica en modelo','Taller','Evaluación teórica','Evaluación práctica','Virtual'];
const ASIS = {P:'Presente',A:'Ausente',T:'Llegó tarde',J:'Excusa médica'};
const CICLO = ['', 'P', 'A', 'T', 'J'];

/* Festivos de Colombia (Ley Emiliani + Semana Santa), calculados para cualquier año */
const _fest = {};
function festivosCO(y){
  if(_fest[y]) return _fest[y];
  const iso = d => d.toISOString().slice(0,10);
  const D = (m,d) => new Date(Date.UTC(y,m-1,d));
  const lunes = d => { const w=d.getUTCDay(); if(w!==1) d.setUTCDate(d.getUTCDate()+((8-w)%7)); return d; };
  const mas = (d,n) => { const x=new Date(d); x.setUTCDate(x.getUTCDate()+n); return x; };
  // Pascua (algoritmo anónimo gregoriano)
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),
        h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),
        mes=Math.floor((h+l-7*m+114)/31),dia=((h+l-7*m+114)%31)+1, pascua=D(mes,dia);
  const lista=[D(1,1),D(5,1),D(7,20),D(8,7),D(12,8),D(12,25),
    lunes(D(1,6)),lunes(D(3,19)),lunes(D(6,29)),lunes(D(8,15)),lunes(D(10,12)),lunes(D(11,1)),lunes(D(11,11)),
    mas(pascua,-3),mas(pascua,-2),mas(pascua,43),mas(pascua,64),mas(pascua,71)];
  return _fest[y]=new Set(lista.map(iso));
}
const esFestivo = iso => festivosCO(+iso.slice(0,4)).has(iso);

/* Fechas de las clases según días, festivos y reprogramaciones */
function fechasClases(c){
  const g=c.grupo||{}; const N=+g.numClases||0;
  if(!g.inicio || !(g.dias||[]).length || !N) return Array(N).fill(null);
  const out=[]; let [y,m,d]=g.inicio.split('-').map(Number); let t=new Date(Date.UTC(y,m-1,d));
  for(let guard=0; out.length<N && guard<1500; guard++){
    const iso=t.toISOString().slice(0,10);
    if(g.dias.includes(t.getUTCDay()) && !(g.festivos && esFestivo(iso))) out.push(iso);
    t.setUTCDate(t.getUTCDate()+1);
  }
  (c.clases||[]).forEach(cl=>{ if(cl.fecha && cl.n<=N) out[cl.n-1]=cl.fecha; });
  return out;
}
const minutos = h => { const [a,b]=(h||'0:0').split(':').map(Number); return a*60+b; };
const horasClase = g => Math.max(0,(minutos(g.horaFin)-minutos(g.horaIni))/60);
const hora12 = h => { if(!h) return ''; let [a,b]=h.split(':').map(Number); const s=a>=12?'p. m.':'a. m.'; a=a%12||12; return `${a}:${String(b).padStart(2,'0')} ${s}`; };
const diasTexto = g => (g.dias||[]).slice().sort((a,b)=>((a+6)%7)-((b+6)%7)).map(d=>DIAS[d]).join(' y ').replace(/ y (?=.* y )/g,', ');
const horaRango = g => { const a=hora12(g.horaIni), b=hora12(g.horaFin); return a.slice(-5)===b.slice(-5) ? `${a.slice(0,-6)} – ${b}` : `${a} – ${b}`; };
const horarioTexto = g => g && g.dias?.length ? `${diasTexto(g)} · ${horaRango(g)}` : '—';
function clase(c,n){ let cl=(c.clases||[]).find(x=>x.n===n); if(!cl){ cl={n,tema:'',detalle:'',metodos:[],materiales:'',obs:''}; (c.clases=c.clases||[]).push(cl); } return cl; }
function infoCurso(c){
  const fechas=fechasClases(c), hoy=hoyISO(), g=c.grupo||{};
  const dictadas=fechas.filter(f=>f && f<hoy).length;
  const idxHoy=fechas.indexOf(hoy);
  const proxima=fechas.findIndex(f=>f && f>=hoy);
  const fin=fechas.filter(Boolean).sort().at(-1)||null;
  const estado = !g.inicio ? 'Sin programar' : hoy<g.inicio ? 'Por iniciar' : fin && hoy>fin ? 'Finalizado' : 'En curso';
  return {fechas, dictadas, idxHoy, proxima, inicio:fechas[0], fin, estado, horas:horasClase(g)*(+g.numClases||0)};
}

/* Asistencia: tarde y excusa cuentan como asistida; solo se cuentan clases ya marcadas */
function resumenAsis(i){
  const marcas=Object.entries(i.asistencia||{}).filter(([,v])=>v);
  const repuesta = n => i.repos?.[n]?.estado==='hecha';
  const fallas=marcas.filter(([n,v])=>v==='A' && !repuesta(n)).length;
  const porReponer=marcas.filter(([n,v])=>(v==='A'||v==='J') && !repuesta(n)).length;
  return {pct: marcas.length? Math.round((marcas.length-fallas)/marcas.length*100) : null, fallas, porReponer, marcadas:marcas.length};
}
/* Notas: promedio ponderado de lo evaluado + % del curso ya evaluado */
function resumenNotas(i,c){
  const ev=c.evaluaciones||[]; let suma=0, pesos=0;
  ev.forEach(e=>{ const n=i.notas?.[e.id]; if(n!==undefined && n!=='' && !isNaN(n)){ suma+=+n*e.peso; pesos+=+e.peso; } });
  const total=ev.reduce((a,e)=>a+ +e.peso,0)||100;
  return {prom: pesos? suma/pesos : null, evaluado: Math.round(pesos/total*100)};
}
function estadoAcad(i,c){
  const cf=DB.config, a=resumenAsis(i), n=resumenNotas(i,c);
  const notaOk = n.prom===null || n.prom>=cf.notaMin, asisOk = a.pct===null || a.pct>=cf.asisMin;
  if(n.evaluado>=100) return (notaOk&&asisOk) ? ['pagada','Aprobó'] : ['vencida','No aprobó'];
  if(n.prom===null && a.pct===null) return ['pendiente','Sin datos'];
  if(!notaOk && !asisOk) return ['vencida','Nota y asistencia'];
  if(!notaOk) return ['vencida','Nota baja'];
  if(!asisOk) return ['parcial','Asistencia baja'];
  return ['pagada','Va bien'];
}
const fmtNota = n => n===null||n===undefined||n==='' ? '—' : (+n).toFixed(1);

/* Reparte el plan de estudio (módulos y temas) entre las clases sin tema */
function repartirPlan(c){
  const N=+c.grupo?.numClases||0, mods=(c.plan||[]).filter(m=>m.temas.length||m.titulo);
  if(!N || !mods.length) return 0;
  const pesos=mods.map(m=>+m.horas||m.temas.length||1), tot=pesos.reduce((a,b)=>a+b,0);
  let asig=pesos.map(p=>Math.max(1,Math.floor(p/tot*N)));
  while(asig.reduce((a,b)=>a+b,0)>N){ const k=asig.indexOf(Math.max(...asig)); asig[k]--; }
  const resto=pesos.map((p,k)=>p/tot*N-asig[k]);
  while(asig.reduce((a,b)=>a+b,0)<N){ const k=resto.indexOf(Math.max(...resto)); asig[k]++; resto[k]=-1; }
  const salida=[];
  mods.forEach((m,k)=>{ const n=asig[k]; if(!n) return;
    const temas=m.temas.length?m.temas:[m.titulo]; const porClase=Math.ceil(temas.length/n);
    for(let j=0;j<n;j++){ const trozo=temas.slice(j*porClase,(j+1)*porClase);
      salida.push({tema: n>1 ? `${m.titulo}${trozo.length?': '+trozo[0]:` (${j+1}/${n})`}` : m.titulo, detalle: trozo.join(', ')}); }
  });
  let llenadas=0;
  salida.slice(0,N).forEach((s,k)=>{ const cl=clase(c,k+1); if(!cl.tema){ cl.tema=s.tema; cl.detalle=cl.detalle||s.detalle; llenadas++; } });
  return llenadas;
}

/* Migración académica para datos guardados en versiones anteriores */
DB.config = {escala:5, notaMin:3, asisMin:80, ...DB.config};
DB.cursos.forEach(c=>{
  c.grupo = c.grupo || {docente:'',jornada:'Mañana',dias:[],horaIni:'09:00',horaFin:'12:00',inicio:'',numClases:16,festivos:true};
  c.clases = c.clases || []; c.evaluaciones = c.evaluaciones || [{id:'ev1',nombre:'Prácticas',peso:40,clase:null},{id:'ev2',nombre:'Evaluación final',peso:60,clase:null}];
});
DB.inscripciones.forEach(i=>{ i.asistencia=i.asistencia||{}; i.notas=i.notas||{}; });

/* Migración: inscripciones antiguas sin cuotas quedan como pago único */
DB.inscripciones.forEach(i=>{
  if(!i.cuotas){ i.planCuotas={inicial:0,n:1,frecuencia:'mensual',primera:i.fecha}; i.cuotas=generarCuotas(i.valor-(i.desc||0),i.planCuotas,i.fecha); }
});

/* ===== utilidades ===== */
const $ = s => document.querySelector(s);
const money = n => '$' + Math.round(n||0).toLocaleString('es-CO');
const esc = s => String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iniciales = n => n.split(' ').slice(0,2).map(x=>x[0]).join('').toUpperCase();
const cap = s => s.charAt(0).toUpperCase()+s.slice(1);
const curso = id => DB.cursos.find(c=>c.id===id);
const est = id => DB.estudiantes.find(e=>e.id===id);
const insc = id => DB.inscripciones.find(i=>i.id===id);
const esPagoCurso = p => p.tipo!=='reposicion';
const pagado = inscId => DB.pagos.filter(p=>p.inscId===inscId && esPagoCurso(p)).reduce((a,p)=>a+ +p.valor,0);
const totalInsc = i => (+i.valor) - (+i.desc||0);
const saldoInsc = i => totalInsc(i) - pagado(i.id);
const saldoEst = estId => DB.inscripciones.filter(i=>i.estId===estId).reduce((a,i)=>a+saldoInsc(i),0);
function toast(t){ $('#toastTxt').textContent=t; bootstrap.Toast.getOrCreateInstance($('#toast'),{delay:2200}).show(); }
const modal = id => bootstrap.Modal.getOrCreateInstance(document.getElementById(id));

/* ===== navegación ===== */
function ir(v){
  document.querySelectorAll('section[data-vista]').forEach(s=>s.classList.toggle('activa', s.dataset.vista===v));
  document.querySelectorAll('#menu .nav-link').forEach(a=>a.classList.toggle('active', a.dataset.ir===v || (v==='curso'&&a.dataset.ir==='cursos') || (v==='anuncio'&&a.dataset.ir==='marketing')));
  $('#menuMovil').value = v==='curso'?'cursos':v==='anuncio'?'marketing':v;
  render(); window.scrollTo(0,0);
}
document.querySelectorAll('[data-ir]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();ir(a.dataset.ir)}));
$('#menuMovil').addEventListener('change',e=>ir(e.target.value));

/* ===== marca / rubro ===== */
function aplicarMarca(){
  const c=DB.config, r=RUBROS[c.rubro]||RUBROS.otro;
  document.documentElement.style.setProperty('--marca', c.color);
  document.documentElement.style.setProperty('--marca-suave', c.color+'14');
  $('#lblNegocio').textContent=c.nombre; $('#lblNegocioM').textContent=c.nombre; $('#lblRubro').textContent=r.nombre;
  document.querySelector('.brand-logo').innerHTML=`<i class="bi ${r.icono}"></i>`;
  document.querySelectorAll('[data-term]').forEach(el=>{
    const t=el.dataset.term, plural=t.toLowerCase()==='estudiantes', base=plural?c.termP:c.termS;
    el.textContent = t[0]===t[0].toUpperCase() ? cap(base) : base;
  });
  document.title = c.nombre + ' · Gestión';
}

/* ===== render ===== */
function render(){
  aplicarMarca();
  $('#hoy').textContent = new Date().toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const c=DB.config;

  // estadísticas
  const mes=hoyISO().slice(0,7);
  const ingresosMes=DB.pagos.filter(p=>p.fecha.startsWith(mes)).reduce((a,p)=>a+ +p.valor,0);
  const porCobrar=DB.inscripciones.reduce((a,i)=>a+Math.max(0,saldoInsc(i)),0);
  const TODAS=todasLasCuotas(), hoy=hoyISO(), en7=sumarFecha(hoy,'semanal',1);
  const vencidas=TODAS.filter(q=>q.estado==='vencida');
  const totalVencido=vencidas.reduce((a,q)=>a+q.falta,0);
  $('#badgeVencidas').hidden=!vencidas.length; $('#badgeVencidas').textContent=vencidas.length;
  const stats=[
    ['bi-people',cap(c.termP)+' activos',DB.estudiantes.length],
    ['bi-graph-up-arrow','Ingresos del mes',money(ingresosMes)],
    ['bi-exclamation-triangle','Cuotas vencidas',`${money(totalVencido)}<div class="small text-muted mt-1" style="font-family:var(--font-body);font-size:.8rem">${vencidas.length} ${vencidas.length===1?'cuota':'cuotas'}</div>`],
    ['bi-hourglass-split','Por cobrar',money(porCobrar)]];
  $('#stats').innerHTML=stats.map(([i,e,v])=>`<div class="col-6 col-lg-3"><div class="card stat"><div class="card-body">
    <div class="d-flex justify-content-between"><span class="etq">${e}</span><i class="bi ${i} text-marca"></i></div>
    <div class="valor tabular mt-2">${v}</div></div></div></div>`).join('');

  // cuotas vencidas y próximas 7 días
  const urgentes=TODAS.filter(q=>q.falta>0 && q.fecha<=en7).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  $('#pendientes').innerHTML = urgentes.length ? urgentes.map(q=>{
    const e=est(q.insc.estId), cu=curso(q.insc.cursoId);
    return `<div class="d-flex align-items-center gap-3 py-2 border-bottom">
      <div class="avatar">${iniciales(e.nombre)}</div>
      <div class="flex-grow-1" style="min-width:0"><div class="fw-semibold text-truncate">${esc(e.nombre)}</div>
        <small class="text-muted">${esc(q.etiqueta)} · ${esc(cu?.nombre)}</small>
        <div class="mt-1">${pill(q)} <small class="text-muted ms-1">${fechaLarga(q.fecha)}</small></div></div>
      <div class="text-end tabular"><div class="fw-semibold">${money(q.falta)}</div>
        <div class="d-flex gap-2 justify-content-end">${botonWA(q,true)}
        <button class="btn btn-sm btn-link text-marca p-0" onclick="abrirPago('${q.insc.id}')">Cobrar</button></div></div></div>`}).join('')
    : '<p class="text-muted small mb-0">No hay cuotas vencidas ni por vencer esta semana.</p>';

  // vista cuotas
  const filtro=document.querySelector('#filtrosCuotas .active')?.dataset.f||'cobrar';
  const lista=TODAS.filter(q=>({
      cobrar:q.falta>0, vencida:q.estado==='vencida', semana:q.falta>0&&q.fecha>=hoy&&q.fecha<=en7,
      pagada:q.estado==='pagada', todas:true})[filtro]).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const proxMes=sumarFecha(hoy,'mensual',1);
  const sCuo=[
    ['Vencido',totalVencido,'text-danger'],
    ['Vence esta semana',TODAS.filter(q=>q.falta>0&&q.fecha>=hoy&&q.fecha<=en7).reduce((a,q)=>a+q.falta,0),''],
    ['Próximos 30 días',TODAS.filter(q=>q.falta>0&&q.fecha>=hoy&&q.fecha<=proxMes).reduce((a,q)=>a+q.falta,0),'']];
  $('#statsCuotas').innerHTML=sCuo.map(([e,v,cl])=>`<div class="col-md-4"><div class="card stat"><div class="card-body py-3">
    <span class="etq">${e}</span><div class="valor tabular mt-1 ${cl}" style="font-size:1.5rem">${money(v)}</div></div></div></div>`).join('');
  $('#tablaCuotas').innerHTML = lista.map(q=>{const e=est(q.insc.estId), cu=curso(q.insc.cursoId);
    return `<tr><td class="tabular text-nowrap">${fechaLarga(q.fecha)}</td>
      <td><a href="#" class="text-reset fw-semibold text-decoration-none" onclick="event.preventDefault();verFicha('${e.id}')">${esc(e.nombre)}</a></td>
      <td><small>${esc(cu?.nombre)}</small></td><td><small>${esc(q.etiqueta)}</small></td>
      <td class="text-end tabular">${money(q.valor)}</td>
      <td class="text-end tabular fw-semibold">${q.falta>0?money(q.falta):'—'}</td>
      <td>${pill(q)}</td>
      <td class="text-end text-nowrap">${q.falta>0?`${botonWA(q)} <button class="btn btn-sm btn-marca" onclick="abrirPago('${q.insc.id}')">Cobrar</button>`:''}</td></tr>`}).join('')
    || '<tr><td colspan="8" class="text-center text-muted py-4">No hay cuotas en este filtro.</td></tr>';

  // últimos pagos
  const ult=[...DB.pagos].sort((a,b)=>b.num-a.num).slice(0,5);
  $('#ultimosPagos').innerHTML = ult.map(p=>{const i=insc(p.inscId),e=est(i?.estId);
    return `<div class="d-flex justify-content-between align-items-center py-2 border-bottom">
      <div><div class="fw-semibold">${esc(e?.nombre)}</div><small class="text-muted">${p.fecha} · ${esc(p.metodo)}</small></div>
      <div class="d-flex align-items-center gap-2"><span class="tabular fw-semibold">${money(p.valor)}</span>
      <button class="btn btn-sm btn-outline-secondary" title="Imprimir recibo" onclick="imprimirRecibo('${p.id}')"><i class="bi bi-printer"></i></button></div></div>`}).join('') || '<p class="text-muted small">Sin pagos aún.</p>';

  // estudiantes
  const q=($('#buscarEst').value||'').toLowerCase();
  $('#tablaEst').innerHTML = DB.estudiantes.filter(e=>[e.nombre,e.doc,e.tel].join(' ').toLowerCase().includes(q)).map(e=>{
    const ins=DB.inscripciones.filter(i=>i.estId===e.id), s=saldoEst(e.id);
    return `<tr><td><div class="d-flex align-items-center gap-2"><div class="avatar">${iniciales(e.nombre)}</div>
      <div><div class="fw-semibold">${esc(e.nombre)}</div><small class="text-muted">${esc(e.doc)}${e.origen?` · <span class="text-marca">${esc(nombreOrigen(e.origen))}</span>`:''}</small></div></div></td>
      <td><small>${esc(e.tel)}<br><span class="text-muted">${esc(e.email)}</span></small></td>
      <td>${ins.map(i=>`<span class="badge bg-marca-suave text-marca fw-medium me-1">${esc(curso(i.cursoId)?.nombre)}</span>`).join('')||'<small class="text-muted">—</small>'}</td>
      <td class="text-end tabular ${s>0?'text-danger fw-semibold':'text-success'}">${s>0?money(s):'Al día'}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-sm btn-outline-secondary" onclick="verFicha('${e.id}')" title="Ver ficha"><i class="bi bi-eye"></i></button>
        <button class="btn btn-sm btn-outline-secondary" onclick="abrirEstudiante('${e.id}')" title="Editar"><i class="bi bi-pencil"></i></button></td></tr>`}).join('')
    || `<tr><td colspan="5" class="text-center text-muted py-4">No hay ${c.termP} que coincidan.</td></tr>`;

  // cursos
  $('#gridCursos').innerHTML = DB.cursos.map(cu=>{
    const n=DB.inscripciones.filter(i=>i.cursoId===cu.id).length, g=cu.grupo||{}, inf=infoCurso(cu), N=+g.numClases||0;
    const pct=N?Math.round(inf.dictadas/N*100):0;
    return `<div class="col-md-6 col-xl-4"><div class="card h-100"><div class="card-body d-flex flex-column">
      <div class="d-flex justify-content-between align-items-start mb-2">
        <div class="d-flex gap-1"><span class="badge bg-marca-suave text-marca">${esc(cu.nivel)}</span><span class="badge text-bg-light border">${esc(g.jornada||'')}</span></div>
        <span class="fw-semibold tabular">${money(cu.precio)}</span></div>
      <h3 class="h5 mb-1">${esc(cu.nombre)}</h3>
      <div class="small text-muted mb-2"><i class="bi bi-person-badge"></i> ${esc(g.docente||'Sin docente asignada')}</div>
      <div class="small d-grid gap-1 mb-3 flex-grow-1">
        <span><i class="bi bi-clock text-marca"></i> ${horarioTexto(g)}</span>
        <span class="tabular"><i class="bi bi-calendar-range text-marca"></i> ${inf.inicio?`${fechaCorta(inf.inicio)} → ${fechaLarga(inf.fin)}`:'Fechas por definir'}</span>
        <span><i class="bi bi-people text-marca"></i> ${n} ${n===1?c.termS:c.termP} · ${N} clases${inf.horas?` · ${inf.horas} h`:''}</span>
      </div>
      <div class="d-flex justify-content-between small text-muted mb-1"><span>${inf.estado}</span><span class="tabular">${inf.dictadas}/${N} clases</span></div>
      <div class="barra mb-3"><i style="width:${pct}%"></i></div>
      <div class="d-flex gap-2"><button class="btn btn-sm btn-marca flex-grow-1" onclick="verCurso('${cu.id}')">Abrir curso</button>
        <button class="btn btn-sm btn-outline-secondary" title="Editar" onclick="abrirCurso('${cu.id}')"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-secondary" title="Duplicar para otro grupo" onclick="duplicarCurso('${cu.id}')"><i class="bi bi-copy"></i></button></div>
    </div></div></div>`}).join('');

  // clases de hoy
  const hoyC=DB.cursos.map(cu=>({cu,inf:infoCurso(cu)})).filter(x=>x.inf.idxHoy>=0);
  const espHoy=(DB.espacios||[]).filter(x=>x.fecha===hoyISO()).sort((a,b)=>a.horaIni.localeCompare(b.horaIni));
  $('#clasesHoy').innerHTML = (hoyC.length||espHoy.length) ? `<h2 class="h5 mb-2">Clases de hoy</h2><div class="row g-2">${espHoy.map(x=>{ const n=reposDeEspacio(x.id).length;
      return `<div class="col-md-6"><div class="card hoy-card" style="border-left-color:#2b4f99"><div class="card-body py-2 d-flex align-items-center gap-3">
        <i class="bi bi-arrow-repeat fs-3" style="color:#2b4f99"></i>
        <div class="flex-grow-1" style="min-width:0"><div class="fw-semibold text-truncate">Reposición${x.clase?` · ${esc(temaClase(curso(x.cursoId),x.clase))}`:''}</div>
          <small class="text-muted">${hora12(x.horaIni)} · ${esc(x.docente||'')} · ${n} ${n===1?DB.config.termS:DB.config.termP}</small></div>
        <button class="btn btn-sm btn-outline-secondary text-nowrap" onclick="abrirEspacio('${x.id}')">Ver</button></div></div></div>`}).join('')}${hoyC.map(({cu,inf})=>{
      const n=inf.idxHoy+1, cl=(cu.clases||[]).find(x=>x.n===n)||{};
      return `<div class="col-md-6"><div class="card hoy-card"><div class="card-body py-2 d-flex align-items-center gap-3">
        <div class="text-center"><div class="display-font fs-3 text-marca lh-1">${n}</div><small class="text-muted">de ${cu.grupo.numClases}</small></div>
        <div class="flex-grow-1" style="min-width:0"><div class="fw-semibold text-truncate">${esc(cl.tema||'Clase '+n)}</div>
          <small class="text-muted">${esc(cu.nombre)} · ${hora12(cu.grupo.horaIni)} · ${esc(cu.grupo.docente)}</small></div>
        <button class="btn btn-sm btn-marca text-nowrap" onclick="verCurso('${cu.id}','asistencia')"><i class="bi bi-check2-square"></i> Asistencia</button>
      </div></div></div>`}).join('')}</div>` : '';

  pintarMarketing();
  pintarReposiciones();

  // pagos
  $('#tablaPagos').innerHTML=[...DB.pagos].sort((a,b)=>b.num-a.num).map(p=>{const i=insc(p.inscId);
    return `<tr><td class="tabular">#${String(p.num).padStart(5,'0')}</td><td class="tabular">${p.fecha}</td>
      <td>${esc(est(i?.estId)?.nombre)}</td><td><small>${esc(curso(i?.cursoId)?.nombre)}${esPagoCurso(p)?'':'<br><span class="badge bg-marca-suave text-marca">Reposición</span>'}</small></td><td>${esc(p.metodo)}</td>
      <td class="text-end tabular fw-semibold">${money(p.valor)}</td>
      <td class="text-end"><button class="btn btn-sm btn-outline-secondary" onclick="imprimirRecibo('${p.id}')"><i class="bi bi-printer"></i></button></td></tr>`}).join('');
}
$('#buscarEst').addEventListener('input',render);
document.querySelectorAll('#filtrosCuotas [data-f]').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('#filtrosCuotas [data-f]').forEach(x=>x.classList.toggle('active',x===b)); render();
}));

/* Recordatorio por WhatsApp (abre wa.me con el mensaje listo; luego irá por Evolution API) */
function botonWA(q, link){
  const e=est(q.insc.estId), tel=(e.tel||'').replace(/\D/g,'');
  if(!tel) return '';
  const num = tel.length===10 ? '57'+tel : tel;
  const cu=curso(q.insc.cursoId), nombre=e.nombre.split(' ')[0];
  const txt = q.estado==='vencida'
    ? `Hola ${nombre} 👋 Te recordamos que la ${q.etiqueta.toLowerCase()} de ${cu.nombre} venció el ${fechaLarga(q.fecha)}. Valor pendiente: ${money(q.falta)}. ¡Gracias! — ${DB.config.nombre}`
    : `Hola ${nombre} 👋 Te recordamos que la ${q.etiqueta.toLowerCase()} de ${cu.nombre} vence el ${fechaLarga(q.fecha)}. Valor: ${money(q.falta)}. ¡Gracias! — ${DB.config.nombre}`;
  const url=`https://wa.me/${num}?text=${encodeURIComponent(txt)}`;
  return link
    ? `<a class="btn btn-sm btn-link text-success p-0" href="${url}" target="_blank" title="Recordar por WhatsApp"><i class="bi bi-whatsapp"></i></a>`
    : `<a class="btn btn-sm btn-outline-success" href="${url}" target="_blank" title="Recordar por WhatsApp"><i class="bi bi-whatsapp"></i></a>`;
}

/* ===== formulario de cuotas reutilizable ===== */
function montarFormCuotas(cont, total, plan, fechaInsc){
  const p = plan || {inicial:0,n:1,frecuencia:'mensual',primera:fechaInsc};
  cont.dataset.total=total; cont.dataset.fecha=fechaInsc;
  cont.innerHTML=`
    <div class="col-12 d-flex align-items-center gap-2"><i class="bi bi-calendar-check text-marca"></i><b class="small">Forma de pago</b>
      <div class="ms-auto btn-group btn-group-sm" role="group">
        ${[1,3,6].map(n=>`<button type="button" class="btn btn-outline-secondary" data-atajo="${n}">${n===1?'Contado':n+' cuotas'}</button>`).join('')}
      </div></div>
    <div class="col-6 col-md-3"><label class="form-label small">Cuota inicial</label><input type="number" min="0" step="1000" class="form-control" data-k="inicial" value="${p.inicial||0}"></div>
    <div class="col-6 col-md-3"><label class="form-label small">N.º de cuotas</label><input type="number" min="1" max="48" class="form-control" data-k="n" value="${p.n||1}"></div>
    <div class="col-6 col-md-3"><label class="form-label small">Frecuencia</label><select class="form-select" data-k="frecuencia">
      ${Object.entries(FRECUENCIAS).map(([k,v])=>`<option value="${k}" ${p.frecuencia===k?'selected':''}>${v}</option>`).join('')}</select></div>
    <div class="col-6 col-md-3"><label class="form-label small">Primera cuota</label><input type="date" class="form-control" data-k="primera" value="${p.primera||fechaInsc}"></div>
    <div class="col-12"><div class="small tabular" data-preview></div></div>`;
  const actualizar=()=>{
    const cuotas=generarCuotas(+cont.dataset.total, leerPlan(cont), cont.dataset.fecha);
    cont.querySelector('[data-preview]').innerHTML = +cont.dataset.total>0
      ? `<div class="d-flex flex-wrap gap-2 mt-1">${cuotas.map(c=>`<span class="border rounded px-2 py-1 bg-white"><span class="text-muted">${c.n===0?'Inicial':c.n}</span> · ${fechaCorta(c.fecha)} · <b>${money(c.valor)}</b></span>`).join('')}</div>`
      : '<span class="text-muted">Indica el valor para ver las cuotas.</span>';
  };
  cont.querySelectorAll('[data-k]').forEach(el=>el.addEventListener('input',actualizar));
  cont.querySelectorAll('[data-atajo]').forEach(b=>b.addEventListener('click',()=>{
    const n=+b.dataset.atajo; cont.querySelector('[data-k="n"]').value=n;
    cont.querySelector('[data-k="frecuencia"]').value='mensual';
    if(n===1) cont.querySelector('[data-k="inicial"]').value=0;
    actualizar();
  }));
  cont.actualizar=actualizar; actualizar();
}
function leerPlan(cont){
  const v=k=>cont.querySelector(`[data-k="${k}"]`).value;
  return {inicial:+v('inicial')||0, n:Math.max(1,+v('n')||1), frecuencia:v('frecuencia'), primera:v('primera')||cont.dataset.fecha};
}
const fechaCorta = iso => new Date(iso+'T12:00').toLocaleDateString('es-CO',{day:'numeric',month:'short'});
const MESES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const fechaMini = iso => { const [,m,d]=iso.split('-'); return `${+d} ${MESES[+m-1]}`; };
const fechaLarga = iso => new Date(iso+'T12:00').toLocaleDateString('es-CO',{day:'numeric',month:'short',year:'numeric'});

/* Plan de cuotas para una inscripción existente */
function abrirCuotas(inscId){
  const i=insc(inscId), e=est(i.estId), c=curso(i.cursoId);
  $('#cuoInsc').value=inscId;
  $('#tCuotas').textContent=`Plan de cuotas · ${e.nombre}`;
  $('#cuoResumen').innerHTML=`${esc(c.nombre)} · Total ${money(totalInsc(i))} · Pagado ${money(pagado(i.id))}`;
  montarFormCuotas(document.querySelector('[data-cuotas="mod"]'), totalInsc(i), i.planCuotas, i.fecha);
  modal('mFicha').hide(); modal('mCuotas').show();
}
$('#formCuotas').addEventListener('submit',ev=>{
  ev.preventDefault();
  const i=insc($('#cuoInsc').value), plan=leerPlan(document.querySelector('[data-cuotas="mod"]'));
  i.planCuotas=plan; i.cuotas=generarCuotas(totalInsc(i),plan,i.fecha);
  guardar(); modal('mCuotas').hide(); render(); toast('Plan de cuotas actualizado');
});

/* ===== estudiantes ===== */
function llenarCursos(sel){ sel.innerHTML='<option value="">— Ninguno por ahora —</option>'+DB.cursos.map(c=>`<option value="${c.id}">${esc(c.nombre)} (${money(c.precio)})</option>`).join(''); }
function abrirEstudiante(id){
  $('#formEst').reset(); llenarCursos($('#estCurso'));
  contCuotasEst().innerHTML=''; $('#bloqueCuotasEst').hidden=true;
  const e=id?est(id):{}; $('#estId').value=id||'';
  $('#tEst').textContent=(id?'Editar ':'Nuevo ')+DB.config.termS;
  ['Nombre','Doc','Tel','Email','Notas'].forEach(k=>$('#est'+k).value=e[k.toLowerCase()]||'');
  $('#estOrigen').innerHTML=opcionesOrigen(); $('#estOrigen').value=e.origen||'';
  modal('mEst').show();
}
const contCuotasEst = () => document.querySelector('[data-cuotas="est"]');
function refrescarCuotasEst(){
  const activo=!!$('#estCurso').value; $('#bloqueCuotasEst').hidden=!activo;
  if(!activo) return;
  const total=(+$('#estValor').value||0)-(+$('#estDesc').value||0), cont=contCuotasEst();
  if(!cont.firstElementChild) montarFormCuotas(cont,total,null,hoyISO());
  else { cont.dataset.total=total; cont.actualizar(); }
}
$('#estCurso').addEventListener('change',e=>{ const c=curso(e.target.value); $('#estValor').value=c?c.precio:''; refrescarCuotasEst(); });
['#estValor','#estDesc'].forEach(s=>$(s).addEventListener('input',refrescarCuotasEst));
$('#formEst').addEventListener('submit',ev=>{
  ev.preventDefault();
  const id=$('#estId').value||uid();
  const data={id,nombre:$('#estNombre').value.trim(),doc:$('#estDoc').value,tel:$('#estTel').value,email:$('#estEmail').value,notas:$('#estNotas').value,origen:$('#estOrigen').value};
  const idx=DB.estudiantes.findIndex(e=>e.id===id); idx>=0?DB.estudiantes[idx]=data:DB.estudiantes.push(data);
  const cid=$('#estCurso').value;
  if(cid){
    const valor=+$('#estValor').value||curso(cid).precio, desc=+$('#estDesc').value||0;
    const plan=leerPlan(contCuotasEst());
    DB.inscripciones.push({id:uid(),estId:id,cursoId:cid,valor,desc,fecha:hoyISO(),estado:'activa',
                           planCuotas:plan,cuotas:generarCuotas(valor-desc,plan,hoyISO())});
  }
  guardar(); modal('mEst').hide(); render(); toast('Guardado');
});
function verFicha(id){
  const e=est(id), ins=DB.inscripciones.filter(i=>i.estId===id);
  $('#tFicha').textContent=e.nombre;
  $('#cuerpoFicha').innerHTML=`<div class="row g-2 small mb-3">
    <div class="col-md-4"><span class="text-muted">Documento</span><br>${esc(e.doc)||'—'}</div>
    <div class="col-md-4"><span class="text-muted">WhatsApp</span><br>${esc(e.tel)||'—'}</div>
    <div class="col-md-4"><span class="text-muted">Correo</span><br>${esc(e.email)||'—'}</div>
    ${e.notas?`<div class="col-12"><span class="text-muted">Notas</span><br>${esc(e.notas)}</div>`:''}</div>
    ${ins.map(i=>{const cu=curso(i.cursoId),ps=DB.pagos.filter(p=>p.inscId===i.id);
      return `<div class="card mb-2"><div class="card-body">
        <div class="d-flex justify-content-between flex-wrap gap-2"><div><div class="fw-semibold">${esc(cu?.nombre)}</div><small class="text-muted">Inscrito ${i.fecha}${cu?.grupo?.docente?' · '+esc(cu.grupo.docente):''}</small>
          ${cu?(()=>{const a=resumenAsis(i), n=resumenNotas(i,cu), [cls,txt]=estadoAcad(i,cu);
            return `<div class="small mt-1 d-flex flex-wrap gap-2 align-items-center tabular"><span><i class="bi bi-check2-square text-marca"></i> Asistencia ${a.pct??'—'}${a.pct!==null?'%':''}</span>
              <span><i class="bi bi-mortarboard text-marca"></i> Promedio ${fmtNota(n.prom)}</span><span class="pill pill-${cls}">${txt}</span></div>`})():''}</div>
        <div class="text-end tabular small">Total ${money(totalInsc(i))}${i.desc?` <span class="text-muted">(desc. ${money(i.desc)})</span>`:''}<br>
        Pagado ${money(pagado(i.id))} · <b class="${saldoInsc(i)>0?'text-danger':'text-success'}">Saldo ${money(saldoInsc(i))}</b></div></div>
        <div class="d-flex justify-content-between align-items-center mt-3 mb-1">
          <span class="small fw-semibold">Cuotas ${i.planCuotas?`<span class="text-muted fw-normal">· ${FRECUENCIAS[i.planCuotas.frecuencia].toLowerCase()}</span>`:''}</span>
          <button class="btn btn-sm btn-link text-marca p-0" onclick="abrirCuotas('${i.id}')"><i class="bi bi-sliders"></i> Cambiar plan</button></div>
        <div class="table-responsive"><table class="table table-sm small mb-0">
          ${estadoCuotas(i).map(q=>`<tr><td>${esc(q.etiqueta)}</td><td class="tabular">${fechaLarga(q.fecha)}</td>
            <td class="text-end tabular">${money(q.valor)}</td><td class="text-end tabular">${q.falta>0?'Falta '+money(q.falta):''}</td><td class="text-end">${pill(q)}</td></tr>`).join('')}
        </table></div>
        ${ps.length?`<div class="small fw-semibold mt-3 mb-1">Pagos</div><table class="table table-sm small mb-0">${ps.map(p=>`<tr><td>#${String(p.num).padStart(5,'0')}</td><td>${p.fecha}</td><td>${esc(p.concepto)}</td><td class="text-end tabular">${money(p.valor)}</td><td class="text-end"><button class="btn btn-sm btn-link p-0" onclick="imprimirRecibo('${p.id}')"><i class="bi bi-printer"></i></button></td></tr>`).join('')}</table>`:''}
        ${saldoInsc(i)>0?`<button class="btn btn-sm btn-marca mt-2" onclick="modal('mFicha').hide();abrirPago('${i.id}')">Registrar pago</button>`:''}
      </div></div>`}).join('')||'<p class="text-muted">Sin cursos inscritos.</p>'}`;
  modal('mFicha').show();
}

/* ===== cursos y plan de estudio ===== */
let planTemp=[];
function abrirCurso(id){
  $('#formCurso').reset(); const c=id?curso(id):{};
  $('#curId').value=id||''; $('#curNombre').value=c.nombre||''; $('#curPrecio').value=c.precio||'';
  $('#curNivel').value=c.nivel||'Básico'; $('#curDesc').value=c.desc||'';
  const g=c.grupo||{jornada:'Mañana',dias:[],horaIni:'09:00',horaFin:'12:00',inicio:'',numClases:16,festivos:true};
  $('#listaDocentes').innerHTML=[...new Set(DB.cursos.map(x=>x.grupo?.docente).filter(Boolean))].map(d=>`<option value="${esc(d)}">`).join('');
  $('#curDocente').value=g.docente||''; $('#curJornada').value=g.jornada||'Mañana';
  $('#curHoraIni').value=g.horaIni||'09:00'; $('#curHoraFin').value=g.horaFin||'12:00';
  $('#curInicio').value=g.inicio||''; $('#curNumClases').value=g.numClases||16; $('#curFestivos').checked=g.festivos!==false;
  $('#curDias').innerHTML=[1,2,3,4,5,6,0].map(d=>`<input type="checkbox" class="btn-check" id="dia${d}" value="${d}" ${(g.dias||[]).includes(d)?'checked':''}>
    <label class="btn btn-sm btn-outline-secondary" for="dia${d}">${DIAS[d]}</label>`).join('');
  resumenFechasForm();
  planTemp=structuredClone(c.plan||[]);
  $('#curPlanTexto').value=planTemp.map((m,k)=>`Módulo ${k+1}: ${m.titulo} (${m.horas}h)\n`+m.temas.map(t=>'- '+t).join('\n')).join('\n');
  previewPlan(); modal('mCurso').show();
}
function cargarPlanArchivo(inp){
  const f=inp.files[0]; if(!f) return;
  const r=new FileReader(); r.onload=()=>{ $('#curPlanTexto').value=r.result; organizarPlanIA(); }; r.readAsText(f); inp.value='';
}

/* "Organizar con IA"
   Por ahora usa un analizador local. Para conectarlo a IA real, reemplaza
   el cuerpo por: const r = await fetch('/staff/ia/plan',{method:'POST',body:texto});
   planTemp = await r.json();   // [{titulo, horas, temas:[]}]
   (el Worker llama al modelo con la clave guardada como secreto, nunca en el HTML) */
async function organizarPlanIA(){
  const texto=$('#curPlanTexto').value.trim(); if(!texto){ $('#iaEstado').textContent='Pega o sube un plan primero.'; return; }
  $('#iaEstado').innerHTML='<span class="spinner-border spinner-border-sm"></span> Organizando…';
  await new Promise(r=>setTimeout(r,500));
  planTemp=analizarPlan(texto);
  $('#iaEstado').textContent=`Listo: ${planTemp.length} módulos detectados. Revisa y guarda.`;
  previewPlan();
}
function analizarPlan(texto){
  const mods=[]; let actual=null;
  const esTitulo=l=>/^(m[oó]dulo|semana|unidad|clase|sesi[oó]n|tema|nivel)\b/i.test(l)||/^#+\s/.test(l)||/^\d+[\.\)]\s/.test(l);
  texto.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).forEach(l=>{
    if(esTitulo(l)){
      const h=(l.match(/(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|horas?)\b/i)||[])[1];
      const titulo=l.replace(/^#+\s*/,'').replace(/^(m[oó]dulo|semana|unidad|clase|sesi[oó]n|tema|nivel)\s*\d*\s*[:.\-–]?\s*/i,'')
                    .replace(/^\d+[\.\)]\s*/,'').replace(/\(?\s*\d+(?:[.,]\d+)?\s*(h|hr|hrs|horas?)\s*\)?/i,'').trim();
      actual={titulo:titulo||l,horas:h?parseFloat(h.replace(',','.')):0,temas:[]}; mods.push(actual);
    } else {
      if(!actual){ actual={titulo:'General',horas:0,temas:[]}; mods.push(actual); }
      actual.temas.push(l.replace(/^[-*•·]\s*/,''));
    }
  });
  return mods;
}
function previewPlan(){
  $('#previewPlan').innerHTML=planTemp.length?`<div class="small text-muted mb-2">Vista previa (${planTemp.length} módulos)</div>`+
    planTemp.map((m,k)=>`<div class="modulo mb-2"><b>${k+1}. ${esc(m.titulo)}</b> ${m.horas?`<span class="text-muted small">· ${m.horas} h</span>`:''}
    <div class="small text-muted">${m.temas.map(esc).join(' · ')}</div></div>`).join(''):'';
}
$('#formCurso').addEventListener('submit',ev=>{
  ev.preventDefault();
  if($('#curPlanTexto').value.trim() && !planTemp.length) planTemp=analizarPlan($('#curPlanTexto').value);
  const id=$('#curId').value||uid();
  const prev=curso(id)||{};
  const grupo={docente:$('#curDocente').value.trim(),jornada:$('#curJornada').value,
    dias:[...document.querySelectorAll('#curDias input:checked')].map(x=>+x.value),
    horaIni:$('#curHoraIni').value,horaFin:$('#curHoraFin').value,inicio:$('#curInicio').value,
    numClases:Math.max(1,+$('#curNumClases').value||16),festivos:$('#curFestivos').checked};
  const data={...prev,id,nombre:$('#curNombre').value.trim(),precio:+$('#curPrecio').value,nivel:$('#curNivel').value,
              desc:$('#curDesc').value,plan:planTemp,grupo,clases:prev.clases||[],
              evaluaciones:prev.evaluaciones||[{id:'ev1',nombre:'Prácticas',peso:40,clase:null},{id:'ev2',nombre:'Evaluación final',peso:60,clase:grupo.numClases}]};
  const idx=DB.cursos.findIndex(c=>c.id===id); idx>=0?DB.cursos[idx]=data:DB.cursos.push(data);
  guardar(); modal('mCurso').hide(); render(); if(cursoActual===id) pintarCurso(); toast('Curso guardado');
});

/* Resumen de fechas en vivo dentro del formulario */
function resumenFechasForm(){
  const g={dias:[...document.querySelectorAll('#curDias input:checked')].map(x=>+x.value),inicio:$('#curInicio').value,
           numClases:+$('#curNumClases').value||0,festivos:$('#curFestivos').checked,horaIni:$('#curHoraIni').value,horaFin:$('#curHoraFin').value};
  const prev=curso($('#curId').value);
  const f=fechasClases({grupo:g,clases:prev?.clases||[]}).filter(Boolean);
  if(!g.inicio || !g.dias.length){ $('#curResumenFechas').innerHTML='<i class="bi bi-info-circle"></i> Elige los días y la primera clase para calcular cuándo termina.'; return; }
  if(g.inicio && !g.dias.includes(new Date(g.inicio+'T12:00').getDay())){
    $('#curResumenFechas').innerHTML=`<i class="bi bi-exclamation-triangle"></i> La primera clase cae ${DIAS_L[new Date(g.inicio+'T12:00').getDay()]}, que no es un día de clase. Empezará el ${fechaLarga(f[0])}.`; }
  else {
    const fin=f.at(-1), semanas=Math.ceil((new Date(fin)-new Date(f[0]))/864e5/7)+1, h=horasClase(g)*g.numClases;
    const saltados=[]; if(g.festivos){ let t=new Date(f[0]); while(t.toISOString().slice(0,10)<=fin){ const iso=t.toISOString().slice(0,10); if(g.dias.includes(t.getUTCDay())&&esFestivo(iso)) saltados.push(iso); t.setUTCDate(t.getUTCDate()+1);} }
    $('#curResumenFechas').innerHTML=`<b>Termina el ${DIAS_L[new Date(fin+'T12:00').getDay()]} ${fechaLarga(fin)}</b> · ${semanas} semanas · ${g.numClases} clases de ${horasClase(g)} h = <b>${h} h</b>`+
      (saltados.length?`<div class="text-muted mt-1"><i class="bi bi-calendar-x"></i> Se saltan festivos: ${saltados.map(fechaCorta).join(', ')}</div>`:'');
  }
}
['#curInicio','#curNumClases','#curFestivos','#curHoraIni','#curHoraFin'].forEach(s=>$(s).addEventListener('input',resumenFechasForm));
$('#curDias').addEventListener('change',resumenFechasForm);

function duplicarCurso(id){
  const c=structuredClone(curso(id)); c.id=uid(); c.nombre=c.nombre+' (otro grupo)';
  c.grupo.docente=''; c.grupo.inicio=''; (c.clases||[]).forEach(cl=>{ delete cl.fecha; cl.obs=''; });
  DB.cursos.push(c); guardar(); render(); abrirCurso(c.id); toast('Curso duplicado: ajusta docente, jornada y fechas');
}
