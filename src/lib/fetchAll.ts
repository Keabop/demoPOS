// Trae TODAS las filas de una consulta en lotes, superando el límite de
// `max-rows` de PostgREST (1000 por defecto). Para documentos que requieren el
// conjunto completo (estado de cuenta de un cliente) y para exportaciones.
//
// `buildQuery(from, to)` debe aplicar `.range(from, to)` y devolver la promesa
// del query builder de supabase ({ data, error }).
export async function fetchAll<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  batch = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery(from, from + batch - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < batch) break;
    from += batch;
  }
  return all;
}
