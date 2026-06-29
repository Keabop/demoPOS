import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CreditosList } from './CreditosList';

// El listado va por la RPC fn_creditos_listado (paginación server-side que escala);
// fn_creditos_kpis trae los totales de cartera. `from` queda como builder inerte.
const h = vi.hoisted(() => ({
  rpcCalls: [] as { fn: string; args: unknown }[],
  kpis: { totalEnCartera: 0, totalVencido: 0, totalClientesDeudores: 0 } as Record<string, number>,
  listado: { data: { rows: [] as unknown[], total: 0 } as unknown, error: null as unknown },
}));

vi.mock('../../lib/supabase', () => {
  const makeQuery = () => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'eq', 'or', 'range', 'gt', 'lte', 'neq', 'delete']) q[m] = () => q;
    (q as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
    return q;
  };
  return {
    supabase: {
      from: vi.fn(() => makeQuery()),
      rpc: vi.fn((fn: string, args: unknown) => {
        h.rpcCalls.push({ fn, args });
        if (fn === 'fn_creditos_kpis') return Promise.resolve({ data: h.kpis, error: null });
        if (fn === 'fn_creditos_listado') return Promise.resolve(h.listado);
        return Promise.resolve({ data: null, error: null });
      }),
    },
  };
});

vi.mock('../../components/Topbar', () => ({ Topbar: () => null }));
vi.mock('../clientes/RegistrarPagoModal', () => ({ RegistrarPagoModal: () => null }));
vi.mock('../../lib/pdf/notaCreditoPagarePDF', () => ({ exportarNotaPagarePDF: vi.fn() }));
vi.mock('../auth/useCan', () => ({ useCan: () => () => true }));
vi.mock('../../lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
  h.rpcCalls.length = 0;
  h.kpis = { totalEnCartera: 0, totalVencido: 0, totalClientesDeudores: 0 };
  h.listado = { data: { rows: [], total: 0 }, error: null };
});

describe('CreditosList — listado server-side escalable', () => {
  it('pide la primera página vía fn_creditos_listado (sin tocar la vista pesada)', async () => {
    render(<CreditosList />);
    await waitFor(() => expect(h.rpcCalls.some((c) => c.fn === 'fn_creditos_listado')).toBe(true));
    const call = h.rpcCalls.find((c) => c.fn === 'fn_creditos_listado')!;
    expect(call.args).toMatchObject({ p_filtro: 'todos', p_offset: 0, p_limit: 50 });
  });

  it('muestra el error en pantalla cuando el listado falla', async () => {
    h.listado = { data: null, error: new Error('tiempo de espera agotado') };
    render(<CreditosList />);
    await screen.findByText('tiempo de espera agotado');
  });

  it('renderiza las notas que devuelve la RPC', async () => {
    h.listado = {
      data: {
        rows: [{
          id: 'v1', folio: 'F-001', fecha: '2026-06-01', total: 1000, plazo_dias: 30, estado: 'pendiente',
          cliente_id: 'c1', cliente_nombre: 'Juan Pérez', cliente_rancho: 'El Mirador', cliente_telefono: '477',
          dias_credito: 30, abonado: 200, saldo: 800, fecha_venc: '2026-07-01', atraso: -5,
        }],
        total: 1,
      },
      error: null,
    };
    render(<CreditosList />);
    await screen.findByText('Juan Pérez');
  });
});
