// Atajos sobre D1. Siempre con parámetros (?), nunca concatenando valores en el SQL.
export const uuid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();
export const isoIn = (ms) => new Date(Date.now() + ms).toISOString();

export function db(env) {
  const prepare = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  return {
    prepare,
    first: (sql, ...args) => prepare(sql, ...args).first(),
    all: async (sql, ...args) => (await prepare(sql, ...args).all()).results,
    run: (sql, ...args) => prepare(sql, ...args).run(),
    batch: (stmts) => env.DB.batch(stmts),
  };
}
