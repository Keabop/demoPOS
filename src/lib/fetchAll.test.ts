import { describe, it, expect, vi } from 'vitest';
import { fetchAll } from './fetchAll';

describe('fetchAll', () => {
  it('trae todas las filas en lotes hasta agotar', async () => {
    const total = 2500;
    const build = vi.fn(async (from: number, to: number) => {
      const rows: { id: number }[] = [];
      for (let i = from; i <= to && i < total; i++) rows.push({ id: i });
      return { data: rows, error: null };
    });
    const all = await fetchAll(build, 1000);
    expect(all.length).toBe(2500);
    // 0-999, 1000-1999, 2000-2999 (último lote parcial → corta)
    expect(build).toHaveBeenCalledTimes(3);
    expect(build).toHaveBeenNthCalledWith(1, 0, 999);
    expect(build).toHaveBeenNthCalledWith(3, 2000, 2999);
  });

  it('un solo lote cuando hay menos que el tamaño', async () => {
    const build = vi.fn(async () => ({ data: [{ id: 1 }, { id: 2 }], error: null }));
    const all = await fetchAll(build, 1000);
    expect(all.length).toBe(2);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('propaga el error', async () => {
    const build = async () => ({ data: null, error: new Error('boom') });
    await expect(fetchAll(build)).rejects.toThrow('boom');
  });
});
