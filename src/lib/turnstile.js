// Cloudflare Turnstile en formularios públicos (login e invitación). Se verifica SIEMPRE en el Worker con
// Siteverify, enviando la IP. Falla cerrado: sin secret, sin token o si Cloudflare no responde, no se entra.
// Pruebas locales: claves de prueba de Cloudflare (site 1x00000000000000000000AA / secret 1x0000000000000000000000000000000AA).
import { HttpError } from './http.js';

export async function verifyTurnstile(c, token) {
  const secret = c.env.TURNSTILE_SECRET_KEY;
  if (!secret) throw new HttpError(503, 'La verificación de seguridad no está configurada. Avísale a Diwilo.', 'TURNSTILE_OFF');
  if (!token || typeof token !== 'string' || token.length > 2048) throw new HttpError(400, 'Completa la verificación de seguridad', 'TURNSTILE');
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  const ip = c.req.headers.get('cf-connecting-ip');
  if (ip) form.append('remoteip', ip);
  let out;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form, signal: AbortSignal.timeout(8000) });
    out = await res.json();
  } catch {
    throw new HttpError(503, 'No pudimos verificar que eres una persona. Intenta de nuevo en un momento.', 'TURNSTILE_DOWN');
  }
  if (!out?.success) throw new HttpError(403, 'La verificación de seguridad no pasó. Vuelve a intentarlo.', 'TURNSTILE');
}
