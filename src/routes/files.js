import { error } from "../lib/http.js";

// Fotos y documentos en R2. La llave siempre lleva el prefijo del negocio: <business_id>/<nombre>.
const keyOf = (ctx) => `${ctx.businessId}/${ctx.params.name}`;
const OK = /^[\w.\-:]{1,120}$/;

export function registerFiles(router) {
  router.put("/staff/files/:name", async (request, env, ctx) => {
    if (!OK.test(ctx.params.name)) return error("Nombre inválido");
    const body = await request.arrayBuffer();
    if (body.byteLength > 5_000_000) return error("Archivo mayor a 5 MB", 413);
    await env.FILES.put(keyOf(ctx), body, { httpMetadata: { contentType: request.headers.get("content-type") || "application/octet-stream" } });
    return new Response(null, { status: 204 });
  });
  router.get("/staff/files/:name", async (request, env, ctx) => {
    const obj = await env.FILES.get(keyOf(ctx));
    if (!obj) return error("No encontrado", 404);
    return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType || "application/octet-stream", "cache-control": "private, max-age=3600" } });
  });
  router.delete("/staff/files/:name", async (request, env, ctx) => {
    await env.FILES.delete(keyOf(ctx));
    return new Response(null, { status: 204 });
  });
}
