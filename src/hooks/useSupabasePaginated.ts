import { useState, useEffect, useCallback } from 'react';

export interface PaginatedState<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  setPage: (p: number) => void;
  refetch: () => void;
}

interface QueryResult<T> {
  data: T[] | null;
  count: number | null;
  error: unknown;
}

/**
 * Paginación server-side genérica sobre Supabase/PostgREST.
 *
 * `buildQuery(from, to)` debe armar la consulta con sus filtros + orden +
 * `.range(from, to)` y `{ count: 'exact' }`, y devolver la promesa del
 * query builder (que resuelve a `{ data, count, error }`). El orden DEBE incluir
 * un desempate único (p. ej. `.order('id')`) para que las páginas no se solapen
 * ni pierdan filas cuando la columna principal tiene valores repetidos.
 *
 * `deps` son las dependencias de filtro/orden: al cambiar, se vuelve a la
 * página 1 automáticamente.
 */
export function useSupabasePaginated<T>(
  buildQuery: (from: number, to: number) => PromiseLike<QueryResult<T>>,
  deps: unknown[],
  pageSize = 50,
): PaginatedState<T> {
  const [data, setData] = useState<T[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce(n => n + 1), []);

  // Al cambiar filtros/orden (deps), volver a la primera página. El reset
  // derivado de las deps es intencional (no es un efecto en cascada real).
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { setPage(1); }, deps);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      try {
        const res = await buildQuery(from, to);
        if (!active) return;
        if (res.error) {
          setError(res.error instanceof Error ? res.error.message : 'Error al cargar los datos.');
        } else {
          setData(res.data ?? []);
          setCount(res.count ?? 0);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Error al cargar los datos.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, nonce, ...deps]);

  return { data, count, page, pageSize, loading, error, setPage, refetch };
}
