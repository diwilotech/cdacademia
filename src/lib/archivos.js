// Archivos privados en R2 (FILES) para los módulos nuevos: comprobantes de cobro, hojas de examen escaneadas y documentos de asesorías.
// El tipo se decide por los primeros bytes (nunca por lo que diga el navegador). Nada se sirve público: siempre con sesión del negocio.
import { HttpError } from './http.js';

const need = (env) => { if (!env.FILES) throw new HttpError(501, 'Esta app no tiene almacenamiento de archivos (R2) configurado'); return env.FILES; };

export function tipoDe(b) {
  const u = new Uint8Array(b.slice(0, 12)), ascii = (i, n) => String.fromCharCode(...u.slice(i, i + n));
  if (u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) return ['image/jpeg', 'jpg'];
  if (u[0] === 0x89 && ascii(1, 3) === 'PNG') return ['image/png', 'png'];
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return ['image/webp', 'webp'];
  if (ascii(0, 4) === '%PDF') return ['application/pdf', 'pdf'];
  return null;
}

// Lee el cuerpo de la solicitud como archivo (foto o PDF, hasta `max` bytes) y lo guarda en <negocio>/<carpeta>/<aleatorio>.<ext>.
export async function guardarArchivo(c, carpeta, { max = 5 * 1024 * 1024 } = {}) {
  const mb = Math.round(max / 1048576);
  if (Number(c.req.headers.get('content-length') || 0) > max) throw new HttpError(413, `El archivo pesa más de ${mb} MB`);
  const body = await c.req.arrayBuffer();
  if (!body.byteLength) throw new HttpError(400, 'Adjunta la foto o el PDF');
  if (body.byteLength > max) throw new HttpError(413, `El archivo pesa más de ${mb} MB`);
  const tipo = tipoDe(body);
  if (!tipo) throw new HttpError(400, 'Sube una imagen (JPG, PNG, WebP) o un PDF');
  const base = ((c.url.searchParams.get('nombre') || 'archivo').replace(/[^\w.\- ]+/g, '').slice(0, 80) || 'archivo').replace(/\.[a-z0-9]{2,4}$/i, '');
  const key = `${c.businessId}/${carpeta}/${crypto.randomUUID()}.${tipo[1]}`;
  await need(c.env).put(key, body, { httpMetadata: { contentType: tipo[0] } });
  return { key, mime: tipo[0], nombre: `${base}.${tipo[1]}` };
}

export async function servirArchivo(c, { key, mime, nombre }) {
  if (!key) throw new HttpError(404, 'No hay archivo');
  const obj = await need(c.env).get(key);
  if (!obj) throw new HttpError(404, 'El archivo ya no está');
  return new Response(obj.body, { headers: { 'content-type': mime, 'cache-control': 'private, max-age=300', 'x-content-type-options': 'nosniff',
    'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(nombre || 'archivo')}`, 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:" } });
}

export const borrarArchivo = async (env, key) => { if (key && env.FILES) await env.FILES.delete(key).catch(() => {}); };
