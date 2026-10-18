// Pruebas de las clases grabadas para reponer: subida por partes a R2, enlace personal con vencimiento, sesión única,
// video por partes (Range) solo con la sesión, tiempo realmente visto (90 %) que deja la reposición hecha, y aislamiento entre negocios.
export default async function ({ check, newBusiness, newMember, APP }) {
  const A = await newBusiness('Videos A', { login: true });
  const B = await newBusiness('Videos B', { login: true });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Un curso, una estudiante con falla en la clase 1 y su reposición
  const area = await A.app('/api/academia/areas', { method: 'POST', body: { nombre: 'Cocina' } });
  const k = await A.app('/api/cursos/cursos', { method: 'POST', body: { nombre: 'Repostería', area_id: area.data.id, nivel: 'Básico', precio: 500000, inicio: '2026-08-03', num_clases: 3, horario: [{ dia: 1, ini: '18:00', fin: '20:00' }] } });
  const e1 = await A.app('/api/estudiantes/estudiantes', { method: 'POST', body: { nombre: 'Laura Pérez', documento: '1234567890', telefono: '3001112233' } });
  const e2 = await A.app('/api/estudiantes/estudiantes', { method: 'POST', body: { nombre: 'Pedro Ruiz', documento: '9876543210' } });
  const m1 = await A.app('/api/matriculas', { method: 'POST', body: { estudiante_id: e1.data.id, curso_id: k.data.id } });
  const m2 = await A.app('/api/matriculas', { method: 'POST', body: { estudiante_id: e2.data.id, curso_id: k.data.id } });
  await A.app(`/api/cursos/${k.data.id}/asistencia`, { method: 'POST', body: { clase_n: 1, marcas: [{ inscripcion_id: m1.data.id, estado: 'A' }, { inscripcion_id: m2.data.id, estado: 'A' }] } });
  const r1 = await A.app('/api/reposiciones', { method: 'POST', body: { inscripcion_id: m1.data.id, clase_n: 1 } });
  const r2 = await A.app('/api/reposiciones', { method: 'POST', body: { inscripcion_id: m2.data.id, clase_n: 1 } });
  check('Videos: hay dos fallas con su reposición', r1.status === 201 && r2.status === 201);

  // Subida por partes
  const sube = async (cli, body = {}) => {
    const v = await cli.app('/api/videos', { method: 'POST', body: { titulo: 'Clase 1 · Repostería', curso_id: k.data.id, clase_n: 1, mime: 'video/mp4', bytes: 3000, duracion_s: 3, ...body } });
    if (v.status !== 201) return v;
    const p = await cli.app(`/api/videos/${v.data.id}/partes/1`, { method: 'PUT', body: 'x'.repeat(3000) });
    const c = await cli.app(`/api/videos/${v.data.id}/completar`, { method: 'POST' });
    return { ...v, parte: p, completar: c };
  };
  check('Videos: el video debe ser MP4, WEBM o MOV', (await A.app('/api/videos', { method: 'POST', body: { titulo: 'x', curso_id: k.data.id, clase_n: 1, mime: 'application/pdf', bytes: 10 } })).status === 400);
  check('Videos: más de 3 GB se rechaza', (await A.app('/api/videos', { method: 'POST', body: { titulo: 'x', curso_id: k.data.id, clase_n: 1, mime: 'video/mp4', bytes: 4 * 1024 ** 3 } })).status === 400);
  check('Videos: un curso de otro negocio se rechaza', (await B.app('/api/videos', { method: 'POST', body: { titulo: 'x', curso_id: k.data.id, clase_n: 1, mime: 'video/mp4', bytes: 10 } })).status === 400);
  const staff = await newMember(A.id, 'staff');
  check('Videos: el personal no sube videos (403)', (await staff.app('/api/videos', { method: 'POST', body: { titulo: 'x', curso_id: k.data.id, clase_n: 1, mime: 'video/mp4', bytes: 10 } })).status === 403);
  const up = await sube(A);
  check('Videos: sube un video por partes y queda listo', up.status === 201 && up.parte.status === 200 && up.parte.data.etag && up.completar.status === 200);
  const lista = (await A.app('/api/videos')).data.rows;
  check('Videos: aparece en la lista con su duración', lista.length === 1 && lista[0].duracion_s === 3 && lista[0].curso === 'Repostería' && lista[0].clase_n === 1 && lista[0].bytes > 0, JSON.stringify(lista));
  check('Videos: B no ve los videos de A ni sube partes a su subida', (await B.app('/api/videos')).data.rows.length === 0 && (await B.app(`/api/videos/${up.data.id}/partes/1`, { method: 'PUT', body: 'x' })).status === 404 && (await B.app(`/api/videos/${up.data.id}`, { method: 'DELETE' })).status === 404);
  const falla = (await A.app('/api/reposiciones')).data.rows.find((x) => x.id === r1.data.id);
  check('Videos: la falla de esa clase muestra que hay clase grabada', falla?.video?.id === up.data.id && falla.enlace === null, JSON.stringify(falla)?.slice(0, 200));

  // Enlace personal
  const otra = await sube(A, { clase_n: 2, titulo: 'Clase 2' });
  check('Videos: no se envía el video de otra clase', (await A.app(`/api/reposiciones/${r1.data.id}/video-link`, { method: 'POST', body: { video_id: otra.data.id } })).status === 400);
  check('Videos: B no crea enlaces para reposiciones de A', (await B.app(`/api/reposiciones/${r1.data.id}/video-link`, { method: 'POST', body: { video_id: up.data.id } })).status === 404);
  const lk = await staff.app(`/api/reposiciones/${r1.data.id}/video-link`, { method: 'POST', body: { video_id: up.data.id, dias: 5 } });
  const token = /\/ver\/([a-f0-9]{64})$/.exec(lk.data.url || '')?.[1];
  check('Videos: crea el enlace personal (64 caracteres) con su vencimiento', lk.status === 201 && !!token && lk.data.dias === 5 && lk.data.expira > Date.now() + 4 * 86400000, JSON.stringify(lk.data));
  const ls = (await A.app(`/api/reposiciones/${r1.data.id}/video-links`)).data.rows;
  check('Videos: la lista de enlaces no trae el enlace, solo su huella corta', ls.length === 1 && ls[0].prefijo === token.slice(0, 6) && !JSON.stringify(ls).includes(token));
  check('Videos: al enviar la clase grabada la reposición queda agendada (virtual)', (await A.app('/api/reposiciones?estado=agendada')).data.rows.some((x) => x.id === r1.data.id && x.modo === 'virtual'));

  // Lo que ve el estudiante (sin sesión de la app)
  const pg = await fetch(`${APP}/ver/${token}`);
  check('Ver: la página del reproductor abre y no se deja incrustar', pg.status === 200 && (await pg.text()).includes('Clase grabada') && pg.headers.get('x-frame-options') === 'DENY' && /noindex/.test(pg.headers.get('x-robots-tag') || ''));
  check('Ver: un enlace mal formado o inexistente da 404', (await fetch(`${APP}/ver/abc`)).status === 404 && (await fetch(`${APP}/ver/${'0'.repeat(64)}/iniciar`, { method: 'POST' })).status === 404);
  const ini = async (t) => { const r = await fetch(`${APP}/ver/${t}/iniciar`, { method: 'POST' }); return { status: r.status, data: await r.json().catch(() => ({})), cookie: (r.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('dwv=')) }; };
  const s1 = await ini(token);
  check('Ver: inicia la sesión con la marca de agua (nombre, documento oculto, referencia)', s1.status === 200 && s1.data.marca.nombre === 'Laura Pérez' && /1234567890/.test(s1.data.marca.doc) === false && s1.data.marca.doc.endsWith('7890') && s1.data.marca.ref === token.slice(0, 6) && s1.data.duracion_s === 3 && !!s1.cookie, JSON.stringify(s1.data));
  const vid = (cookie, rango) => fetch(`${APP}/ver/${token}/video`, { headers: { ...(cookie ? { cookie } : {}), ...(rango ? { range: rango } : {}) } });
  check('Ver: sin la cookie de sesión el video no se entrega (409)', (await vid(null, 'bytes=0-9')).status === 409);
  const v1 = await vid(s1.cookie, 'bytes=0-9');
  check('Ver: el video llega por partes (206) y nunca como descarga', v1.status === 206 && v1.headers.get('content-range')?.startsWith('bytes 0-9/') && (await v1.arrayBuffer()).byteLength === 10 && v1.headers.get('content-disposition') === 'inline' && v1.headers.get('cache-control') === 'no-store');
  const v2 = await vid(s1.cookie);
  check('Ver: sin «Range» solo se entrega un primer tramo (206), no el archivo', v2.status === 206 && /^bytes 0-\d+\//.test(v2.headers.get('content-range') || ''));
  check('Ver: un rango fuera del archivo da 416', (await vid(s1.cookie, 'bytes=999999-9999999')).status === 416);
  const hb = (cookie, body) => fetch(`${APP}/ver/${token}/progreso`, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));
  check('Ver: el progreso sin sesión no se acepta (409)', (await hb(null, { delta: 3, t: 3 })).status === 409);
  // Sesión única: abrirla en otro lugar cierra la anterior
  const s2 = await ini(token);
  check('Ver: abrirla en otro lugar cierra la sesión anterior (409)', s2.status === 200 && (await vid(s1.cookie, 'bytes=0-9')).status === 409 && (await hb(s1.cookie, { delta: 1, t: 1 })).status === 409 && (await vid(s2.cookie, 'bytes=0-9')).status === 206);
  // Solo cuenta el tiempo real
  const rapido = await hb(s2.cookie, { delta: 3, t: 3 });
  check('Ver: no se puede inventar tiempo visto (no pasa del tiempo real transcurrido)', rapido.status === 200 && rapido.data.completado === false, JSON.stringify(rapido.data));
  check('Ver: la reposición sigue sin estar hecha', !(await A.app('/api/reposiciones?estado=hecha')).data.rows.some((x) => x.id === r1.data.id));
  await sleep(3500);
  const fin = await hb(s2.cookie, { delta: 3, t: 3 });
  check('Ver: al ver el 90 % del tiempo real se completa', fin.status === 200 && fin.data.completado === true && fin.data.pct >= 90, JSON.stringify(fin.data));
  check('Ver: la reposición queda hecha y se registra en la bitácora', (await A.app('/api/reposiciones?estado=hecha')).data.rows.some((x) => x.id === r1.data.id)
    && (await A.app('/api/settings/bitacora')).data.items.some((a) => /vio la clase grabada/.test(a.accion) && /Laura Pérez/.test(a.accion)));
  const f2 = (await A.app('/api/reposiciones?estado=todas')).data.rows.find((x) => x.id === r1.data.id);
  check('Ver: el equipo ve que la vio completa', f2.enlace?.completado === true && f2.enlace.vistas === 2 && f2.enlace.pct >= 90, JSON.stringify(f2.enlace));

  // Revocar y borrar
  check('Videos: B no revoca enlaces de A', (await B.app(`/api/video-accesos/${ls[0].id}`, { method: 'DELETE' })).status === 404);
  check('Videos: se revoca un enlace', (await A.app(`/api/video-accesos/${ls[0].id}`, { method: 'DELETE' })).status === 200);
  const rv = await ini(token);
  check('Ver: un enlace revocado ya no abre (410) y no entrega el video', rv.status === 410 && (await vid(s2.cookie, 'bytes=0-9')).status === 410);
  const lk2 = await A.app(`/api/reposiciones/${r2.data.id}/video-link`, { method: 'POST', body: { video_id: up.data.id } });
  const t2 = /\/ver\/([a-f0-9]{64})$/.exec(lk2.data.url)[1];
  check('Ver: el enlace de otro estudiante lleva su propio nombre', (await ini(t2)).data.marca?.nombre === 'Pedro Ruiz');
  check('Videos: el personal no borra videos (403)', (await staff.app(`/api/videos/${up.data.id}`, { method: 'DELETE' })).status === 403);
  check('Videos: borrar el video borra también sus enlaces', (await A.app(`/api/videos/${up.data.id}`, { method: 'DELETE' })).status === 200 && (await ini(t2)).status === 404 && (await A.app('/api/videos')).data.rows.length === 1);
}
