// Pruebas de Eventos, Certificaciones y Asesorías: rutas clave, cobros (Finanzas / ya pagado con nota y comprobante) y aislamiento entre negocios.
export default async function ({ check, newBusiness, newMember, APP }) {
  const A = await newBusiness('Nuevos A', { login: true });
  const B = await newBusiness('Nuevos B', { login: true });
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const raw = { 'content-type': 'application/octet-stream' };

  /* ───── Eventos ───── */
  const ev = await A.app('/api/eventos/eventos', { method: 'POST', body: { titulo: 'Stammtisch', tipo: 'Semanal', fecha: '2099-01-08', hora_ini: '18:30', hora_fin: '20:00', cupo: 1, precio: 20000, repetir_semanas: 2 } });
  const lista = (await A.app('/api/eventos/eventos')).data.rows;
  check('Eventos: crea el evento y repite cada semana (3 en total)', ev.status === 201 && lista.length === 3 && lista.map((x) => x.fecha).sort().join() === '2099-01-08,2099-01-15,2099-01-22', JSON.stringify(lista.map((x) => x.fecha)));
  check('Eventos: una hora fuera de orden se rechaza', (await A.app('/api/eventos/eventos', { method: 'POST', body: { titulo: 'x', fecha: '2099-02-01', hora_ini: '20:00', hora_fin: '19:00' } })).status === 400);
  const a1 = await A.app('/api/eventos/asistentes', { method: 'POST', body: { evento_id: ev.data.id, nombre: 'Laura', email: 'laura@ejemplo.com' } });
  const a2 = await A.app('/api/eventos/asistentes', { method: 'POST', body: { evento_id: ev.data.id, nombre: 'Pedro', telefono: '3001112233' } });
  const asis = (await A.app(`/api/eventos/asistentes?f_evento_id=${ev.data.id}`)).data.rows;
  check('Eventos: con cupo 1 el segundo queda en lista de espera', asis.find((x) => x.id === a1.data.id)?.estado === 'inscrito' && asis.find((x) => x.id === a2.data.id)?.estado === 'espera', JSON.stringify(asis.map((x) => x.estado)));
  check('Eventos: el mismo correo no se inscribe dos veces', (await A.app('/api/eventos/asistentes', { method: 'POST', body: { evento_id: ev.data.id, nombre: 'Otra', email: 'laura@ejemplo.com' } })).status === 409);
  check('Eventos: un evento con asistentes no se borra', (await A.app(`/api/eventos/eventos/${ev.data.id}`, { method: 'DELETE' })).status === 409);

  const cb = `/api/eventos/asistentes/${a1.data.id}/cobros`;
  check('Eventos: el cobro no puede superar el saldo', (await A.app(cb, { method: 'POST', body: { valor: 99999 } })).status === 400);
  check('Eventos: «ya pagado» exige una nota', (await A.app(cb, { method: 'POST', body: { valor: 10000, ya_pagado: true } })).status === 400);
  const yp = await A.app(cb, { method: 'POST', body: { valor: 10000, ya_pagado: true, nota: 'Pagó en efectivo a Camila el día del evento' } });
  const cp = await A.app(`${cb}/${yp.data.id}/comprobante?nombre=foto`, { method: 'POST', body: PNG, headers: raw });
  const est = await A.app(cb);
  check('Eventos: «ya pagado» queda como pago parcial, sin recibo, con su comprobante', yp.status === 201 && yp.data.ya_pagado && !yp.data.recibo && cp.status === 200 && est.data.estado === 'parcial' && est.data.saldo === 10000 && est.data.rows[0].comprobante === true, JSON.stringify([yp.data, cp.data, est.data]));
  const fin = await A.app(cb, { method: 'POST', body: { valor: 10000, metodo: 'Nequi' } });
  check('Eventos: el resto se cobra y queda pagado', fin.status === 201 && (await A.app(cb)).data.estado === 'pagado');
  check('Eventos: B no ve eventos, asistentes ni cobros de A', (await B.app('/api/eventos/eventos')).data.rows.length === 0 && (await B.app(cb)).status === 404 && (await B.app(`${cb}/${yp.data.id}/comprobante`)).status === 404);
  const staff = await newMember(A.id, 'staff');
  check('Eventos: el personal anula cobros solo con permiso de administrador (403)', (await staff.app(`${cb}/${fin.data.id}/anular`, { method: 'POST', body: {} })).status === 403);
  check('Eventos: el administrador anula el cobro', (await A.app(`${cb}/${fin.data.id}/anular`, { method: 'POST', body: {} })).status === 200 && (await A.app(cb)).data.estado === 'parcial');

  const slug = (await A.app('/api/me')).data.business?.slug;
  const pub = await fetch(`${APP}/${slug}/eventos`);
  const html = await pub.text();
  check('Eventos: la página pública lista el evento', pub.status === 200 && html.includes('Stammtisch'), String(pub.status));
  const ins = await fetch(`${APP}/${slug}/eventos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Visitante', phone: '3105550000', evento_id: ev.data.id }) });
  check('Eventos: quien se inscribe desde la web entra a la lista de espera (cupo lleno)', ins.status === 200 && (await ins.json()).espera === true);
  check('Eventos: la página pública de otro negocio no existe', (await fetch(`${APP}/no-existe-xyz/eventos`)).status === 404);

  /* ───── Certificaciones ───── */
  const curso = await A.app('/api/cursos/cursos', { method: 'POST', body: { nombre: 'Intensivo A1', precio: 900000, inicio: '2026-11-04', num_clases: 2, horario: [{ dia: 1, ini: '18:00', fin: '20:00' }] } });
  const ej = await A.app('/api/certificaciones/cargar-ejemplos', { method: 'POST', body: {} });
  const exs = (await A.app('/api/certificaciones/examenes')).data.rows;
  const za1 = exs.find((x) => x.nivel === 'A1');
  check('Certificaciones: carga ÖSD A1, A2 y B2 con sus partes y mínimos', ej.data.creados === 3 && za1?.partes.length === 4 && za1.minimos.escrita === 38, JSON.stringify(ej.data));
  check('Certificaciones: el personal no crea exámenes (403)', (await staff.app('/api/certificaciones/examenes', { method: 'POST', body: { entidad: 'X', nombre: 'Y' } })).status === 403);
  await A.app(`/api/certificaciones/examenes/${za1.id}`, { method: 'PATCH', body: { curso_id: curso.data.id, precio: 500000 } });
  const conv = await A.app('/api/certificaciones/convocatorias', { method: 'POST', body: { examen_id: za1.id, fecha: '2099-03-10', cierre: '2099-03-01', cupo: 5, modalidad: 'Papel' } });
  check('Certificaciones: crea la convocatoria y el cierre debe ser antes del examen', conv.status === 201 && (await A.app('/api/certificaciones/convocatorias', { method: 'POST', body: { examen_id: za1.id, fecha: '2099-03-10', cierre: '2099-03-20' } })).status === 400);
  const est1 = await A.app('/api/estudiantes/estudiantes', { method: 'POST', body: { nombre: 'Sofía Montoya', documento: '123' } });
  await A.app('/api/matriculas', { method: 'POST', body: { estudiante_id: est1.data.id, curso_id: curso.data.id } });
  const el = await A.app(`/api/certificaciones/elegibles?convocatoria_id=${conv.data.id}`);
  check('Certificaciones: lista a los estudiantes del curso que prepara ese examen', el.data.rows.length === 1 && el.data.rows[0].nombre === 'Sofía Montoya', JSON.stringify(el.data));
  const cand = await A.app('/api/certificaciones/candidatos', { method: 'POST', body: { convocatoria_id: conv.data.id, estudiante_id: est1.data.id } });
  check('Certificaciones: inscribe al candidato con los datos del estudiante y no lo repite', cand.status === 201 && (await A.app('/api/certificaciones/candidatos', { method: 'POST', body: { convocatoria_id: conv.data.id, estudiante_id: est1.data.id } })).status === 409);
  const ok = await A.app(`/api/certificaciones/candidatos/${cand.data.id}/calcular`, { method: 'POST', body: { puntos: { Lesen: 25, 'Hören': 25, Schreiben: 10, Sprechen: 20 }, eval1: { Schreiben: 10, Sprechen: 19 }, eval2: { Schreiben: 10, Sprechen: 21 } } });
  check('Certificaciones: con los mínimos de escrita y oral aprueba', ok.data.resultado === 'aprobado', JSON.stringify(ok.data));
  const no = await A.app(`/api/certificaciones/candidatos/${cand.data.id}/calcular`, { method: 'POST', body: { puntos: { Lesen: 5, 'Hören': 5, Schreiben: 5, Sprechen: 20 } } });
  check('Certificaciones: bajo el mínimo escrito no aprueba', no.data.resultado === 'no_aprobado' && (await A.app(`/api/certificaciones/candidatos/${cand.data.id}/calcular`, { method: 'POST', body: { puntos: { Lesen: 99, 'Hören': 5, Schreiben: 5, Sprechen: 20 } } })).status === 400);
  const hoja = await A.app(`/api/certificaciones/candidatos/${cand.data.id}/hoja?nombre=hoja`, { method: 'POST', body: PNG, headers: raw });
  const cands = (await A.app(`/api/certificaciones/candidatos?f_convocatoria_id=${conv.data.id}`)).data.rows;
  check('Certificaciones: sube la hoja escaneada (privada) y el precio sale del examen', hoja.status === 200 && cands[0].hoja === true && cands[0].precio === 500000 && cands[0].cobro === 'pendiente' && !('hoja_key' in cands[0]), JSON.stringify(cands[0]).slice(0, 300));
  check('Certificaciones: B no ve ni calcula candidatos de A', (await B.app('/api/certificaciones/candidatos')).data.rows.length === 0 && (await B.app(`/api/certificaciones/candidatos/${cand.data.id}/calcular`, { method: 'POST', body: { puntos: {} } })).status === 404 && (await B.app(`/api/certificaciones/candidatos/${cand.data.id}/hoja`)).status === 404);

  /* ───── Asesorías ───── */
  const tipo = await A.app('/api/asesorias/tipos', { method: 'POST', body: { nombre: 'Ausbildung', precio: 600000, pasos: [{ nombre: 'Diagnóstico', docs: ['Pasaporte'] }, { nombre: 'Documentos', docs: ['Diploma traducido', 'Certificado de idioma'] }, { nombre: 'Viaje' }] } });
  check('Asesorías: crea el tipo con sus pasos y documentos', tipo.status === 201);
  const ase = await A.app('/api/asesorias/asesorias', { method: 'POST', body: { tipo_id: tipo.data.id, estudiante_id: est1.data.id, prox_fecha: '2099-02-01', prox_texto: 'Primera reunión' } });
  const det = (await A.app(`/api/asesorias/asesorias/${ase.data.id}/detalle`)).data;
  check('Asesorías: el proceso copia los pasos, crea los documentos y toma el precio del tipo', ase.status === 201 && det.asesoria.pasos.length === 3 && det.docs.length === 3 && det.avances.length === 1 && det.asesoria.precio === 600000 && det.asesoria.nombre === 'Sofía Montoya', JSON.stringify(det).slice(0, 300));
  await A.app(`/api/asesorias/tipos/${tipo.data.id}`, { method: 'PATCH', body: { pasos: [{ nombre: 'Único' }] } });
  check('Asesorías: cambiar la plantilla no mueve los procesos en curso', (await A.app(`/api/asesorias/asesorias/${ase.data.id}/detalle`)).data.asesoria.pasos.length === 3);
  const doc = det.docs[0];
  await A.app(`/api/asesorias/docs/${doc.id}/archivo?nombre=pasaporte`, { method: 'POST', body: PNG, headers: raw });
  const d2 = (await A.app(`/api/asesorias/asesorias/${ase.data.id}/detalle`)).data.docs.find((x) => x.id === doc.id);
  check('Asesorías: subir el archivo deja el documento «recibido»', d2.estado === 'recibido' && d2.tiene === 1, JSON.stringify(d2));
  const paso = (accion) => A.app(`/api/asesorias/asesorias/${ase.data.id}/paso`, { method: 'POST', body: { accion, texto: 'ok' } });
  await paso('avanzar'); const p2 = await paso('avanzar'); const p3 = await paso('avanzar');
  check('Asesorías: avanzar desde el último paso termina el proceso y queda cerrado', p2.data.paso === 2 && p3.data.estado === 'terminado' && (await paso('avanzar')).status === 409);
  const cobAse = await A.app(`/api/asesorias/asesorias/${ase.data.id}/cobros`, { method: 'POST', body: { valor: 600000, ya_pagado: true, nota: 'Pagado por transferencia antes de usar la app' } });
  check('Asesorías: cobro «ya pagado» con nota deja la asesoría pagada', cobAse.status === 201 && (await A.app(`/api/asesorias/asesorias?f_id=${ase.data.id}`)).data.rows[0].cobro === 'pagado');
  const res = (await A.app('/api/asesorias/resumen')).data;
  check('Asesorías: el resumen cuenta la terminada', res.terminadas === 1 && res.activas === 0, JSON.stringify(res));
  check('Asesorías: B no ve procesos, tipos ni documentos de A', (await B.app('/api/asesorias/asesorias')).data.rows.length === 0 && (await B.app(`/api/asesorias/asesorias/${ase.data.id}/detalle`)).status === 404 && (await B.app(`/api/asesorias/docs/${doc.id}/archivo`)).status === 404
    && (await B.app('/api/asesorias/asesorias', { method: 'POST', body: { tipo_id: tipo.data.id, nombre: 'X' } })).status === 400);
}
