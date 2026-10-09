import { error } from "../lib/http.js";

// Fotos, PDF, documentos y material de módulos en R2. La llave siempre lleva el prefijo del negocio:
// <business_id>/<nombre>. Nada se sirve de forma pública: todo pasa por la sesión (/staff/*).
const keyOf = (ctx) => `${ctx.businessId}/${ctx.params.name}`;
const OK = /^[\w.\-:]{1,120}$/;
const MAX_BYTES = 20 * 1024 * 1024;
// Solo estos tipos se muestran dentro de la página; todo lo demás (HTML, SVG, scripts…) se fuerza a descarga.
const INLINE = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|video\/(mp4|webm)|audio\/(mpeg|mp4|wav|ogg|webm))$/;

const safeName = (n) => String(n || "archivo").replace(/[\r\n"\\/]/g, "_").slice(0, 120);

export function registerFiles(router) {
  router.put("/staff/files/:name", async (request, env, ctx) => {
    if (!OK.test(ctx.params.name)) return error("Nombre inválido");
    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > MAX_BYTES) return error("El archivo supera los 20 MB", 413);
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return error("El archivo supera los 20 MB", 413);
    await env.FILES.put(keyOf(ctx), body, { httpMetadata: { contentType: (request.headers.get("content-type") || "application/octet-stream").split(";")[0].trim().toLowerCase() } });
    return new Response(null, { status: 204 });
  });

  router.get("/staff/files/:name", async (request, env, ctx) => {
    const obj = await env.FILES.get(keyOf(ctx));
    if (!obj) return error("No encontrado", 404);
    const q = new URL(request.url).searchParams;
    const type = obj.httpMetadata?.contentType || "application/octet-stream";
    const inline = INLINE.test(type) && q.get("dl") !== "1";
    const headers = {
      "content-type": inline ? type : (INLINE.test(type) ? type : "application/octet-stream"),
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
      "content-disposition": inline ? "inline" : `attachment; filename*=UTF-8''${encodeURIComponent(safeName(q.get("n") || ctx.params.name))}`,
    };
    return new Response(obj.body, { headers });
  });

  router.delete("/staff/files/:name", async (request, env, ctx) => {
    await env.FILES.delete(keyOf(ctx));
    return new Response(null, { status: 204 });
  });
}
