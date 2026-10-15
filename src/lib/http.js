export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function errorResponse(err) {
  if (err instanceof HttpError) return json({ error: err.message, code: err.code }, err.status);
  console.error(err);
  return json({ error: 'Error interno del servidor' }, 500);
}

export function getCookie(req, name) {
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export async function readJson(req) {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'JSON inválido');
  }
}

// --- Validación mínima de campos ---

export function str(v, { max = 200, required = false, label = 'Campo' } = {}) {
  if (v === undefined || v === null || String(v).trim() === '') {
    if (required) throw new HttpError(400, `${label} es obligatorio`);
    return null;
  }
  const s = String(v).trim();
  if (s.length > max) throw new HttpError(400, `${label} supera ${max} caracteres`);
  return s;
}

export function oneOf(v, options, { label = 'Campo', fallback = null } = {}) {
  if (v === undefined || v === null || v === '') return fallback;
  if (!options.includes(v)) throw new HttpError(400, `${label} no válido`);
  return v;
}

export function email(v, { required = false, label = 'Correo' } = {}) {
  const s = str(v, { max: 254, required, label });
  if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new HttpError(400, `${label} no es válido`);
  return s ? s.toLowerCase() : null;
}

export function date(v, { label = 'Fecha' } = {}) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new HttpError(400, `${label} debe ser AAAA-MM-DD`);
  return v;
}
