import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useSupabasePaginated } from './useSupabasePaginated';

describe('useSupabasePaginated', () => {
  it('carga la primera pagina y expone el conteo total', async () => {
    const build = vi.fn(async (from: number) => ({ data: [{ id: from }], count: 250, error: null }));
    const { result } = renderHook(() => useSupabasePaginated(build, [], 50));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.count).toBe(250);
    expect(build).toHaveBeenCalledWith(0, 49);
    expect(result.current.data).toEqual([{ id: 0 }]);
  });

  it('cambia de pagina y pide el rango correcto', async () => {
    const build = vi.fn(async (from: number) => ({ data: [{ id: from }], count: 250, error: null }));
    const { result } = renderHook(() => useSupabasePaginated(build, [], 50));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setPage(3));
    await waitFor(() => expect(build).toHaveBeenLastCalledWith(100, 149));
    expect(result.current.page).toBe(3);
  });

  it('expone el error y no rompe', async () => {
    const build = vi.fn(async () => ({ data: null, count: null, error: new Error('boom') }));
    const { result } = renderHook(() => useSupabasePaginated(build, [], 50));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('boom');
    expect(result.current.data).toEqual([]);
  });
});
