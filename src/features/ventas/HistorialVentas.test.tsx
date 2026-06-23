import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HistorialVentas } from './HistorialVentas';

// Estado del mock, definido con vi.hoisted para que exista antes del vi.mock hoisteado.
const h = vi.hoisted(() => ({
  calls: {} as Record<string, unknown[]>,
  fromMock: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: { from: (...a: unknown[]) => h.fromMock(...a) },
}));

// Topbar trae su propia lógica de tiempo real (supabase.channel); no es lo que probamos
// aquí, así que lo neutralizamos para aislar el componente.
vi.mock('../../components/Topbar', () => ({ Topbar: () => null }));

// Builder "thenable" que registra cada método encadenado de Supabase.
function makeQuery(result: unknown) {
  const q: Record<string, (...a: unknown[]) => unknown> = {};
  for (const m of ['select', 'gte', 'lte', 'order', 'eq']) {
    q[m] = (...args: unknown[]) => { h.calls[m] = args; return q; };
  }
  (q as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve(result);
  return q;
}

beforeEach(() => {
  for (const k of Object.keys(h.calls)) delete h.calls[k];
  h.fromMock.mockReset();
  h.fromMock.mockImplementation(() => makeQuery({ data: [], error: null }));
});

describe('HistorialVentas — filtro de presentación', () => {
  it('vendedor: la consulta filtra por su vendedor_id', async () => {
    render(<HistorialVentas rol="vendedor" vendedorId="vend-1" />);
    await screen.findByText('Total vendido');
    expect(h.calls.eq).toEqual(['vendedor_id', 'vend-1']);
  });

  it('admin: la consulta NO filtra por vendedor', async () => {
    render(<HistorialVentas rol="admin" vendedorId="admin-9" />);
    await screen.findByText('Total vendido');
    expect(h.calls.eq).toBeUndefined();
  });
});
