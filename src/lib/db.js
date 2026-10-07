// Helpers de D1. Toda consulta de la app pasa por aquí.
export const uid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

export async function all(env, sql, ...params) {
  const res = await env.DB.prepare(sql).bind(...params).all();
  return res.results || [];
}
export async function first(env, sql, ...params) {
  return env.DB.prepare(sql).bind(...params).first();
}
export async function run(env, sql, ...params) {
  return env.DB.prepare(sql).bind(...params).run();
}
