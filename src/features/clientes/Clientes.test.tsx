import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Clientes } from './Clientes';

// Estado del mock, accesible desde el vi.mock hoisteado.
const h = vi.hoisted(() => ({
  rpcCalls: [] as { fn: string; args: unknown }[],
  kpis: { total: 10003, corriente: 10003, porVencer: 0, vencida: 0, montoVencido: 0 } as Record<string, number>,
  listado: { data: { rows: [] as unknown[], total: 0 } as unknown, error: null as unknown },
}));

// El listado va 100% por la RPC fn_clientes_listado (paginacion server-side que
// escala); fn_clientes_kpis trae los totales. `from` queda como builder inerte
// (solo lo usa el refresco tras un abono, que aqui no se dispara).
vi.mock('../../lib/supabase', () => {
  const makeQuery = () => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'eq', 'or', 'range', 'single']) q[m] = () => q;
    (q as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
    return q;
  };
  return {
    supabase: {
      from: vi.fn(() => makeQuery()),
      rpc: vi.fn((fn: string, args: unknown) => {
        h.rpcCalls.push({ fn, args });
        if (fn === 'fn_clientes_kpis') return Promise.resolve({ data: h.kpis, error: null });
        if (fn === 'fn_clientes_listado') return Promise.resolve(h.listado);
        return Promise.resolve({ data: null, error: null });
      }),
    },
  };
});

// Topbar trae lógica de realtime (supabase.channel); modales/subpantallas no son lo que probamos.
vi.mock('../../components/Topbar', () => ({ Topbar: () => null }));
vi.mock('./NuevoClienteModal', () => ({ NuevoClienteModal: () => null }));
vi.mock('./EstadoCuenta', () => ({ EstadoCuenta: () => null }));
vi.mock('./RegistrarPagoModal', () => ({ RegistrarPagoModal: () => null }));
vi.mock('./PerfilClienteModal', () => ({ PerfilClienteModal: () => null }));
vi.mock('../auth/useCan', () => ({ useCan: () => () => true }));
vi.mock('../../lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
  h.rpcCalls.length = 0;
  h.kpis = { total: 10003, corriente: 10003, porVencer: 0, vencida: 0, montoVencido: 0 };
  h.listado = { data: { rows: [], total: 0 }, error: null };
});

describe('Clientes — listado server-side escalable', () => {
  it('pide la primera página al servidor vía fn_clientes_listado (sin tocar la vista pesada)', async () => {
    render(<Clientes onNav={() => {}} />);
    await waitFor(() => expect(h.rpcCalls.some((c) => c.fn === 'fn_clientes_listado')).toBe(true));
    const call = h.rpcCalls.find((c) => c.fn === 'fn_clientes_listado')!;
    expect(call.args).toMatchObject({ p_filtro: 'todos', p_offset: 0, p_limit: 50 });
  });

  it('muestra el error en pantalla cuando el listado falla (no se queda vacío en silencio)', async () => {
    h.listado = { data: null, error: new Error('tiempo de espera agotado') };
    render(<Clientes onNav={() => {}} />);
    // Antes el error se tragaba y solo se veía "No hay clientes registrados".
    await screen.findByText('tiempo de espera agotado');
  });

  it('renderiza los clientes que devuelve la RPC', async () => {
    h.listado = {
      data: {
        rows: [{
          id: 'c1', nombre: 'Juan Pérez', rancho: 'El Mirador', telefono: '4771234567',
          lada: '52', limite_credito: 10000, saldo_deudor: 0, activo_para_credito: true,
          dias_credito: 30, creado_en: '2026-01-01', notas_activas: 2, saldo_vencido: 0,
          cartera: 1500, estatus: 'al-corriente',
        }],
        total: 1,
      },
      error: null,
    };
    render(<Clientes onNav={() => {}} />);
    await screen.findByText('Juan Pérez');
  });

  it('el filtro Archivados pide ese filtro a la RPC', async () => {
    render(<Clientes onNav={() => {}} />);
    const btn = await screen.findByRole('button', { name: /archivados/i });
    btn.click();
    await waitFor(() => expect(
      h.rpcCalls.some((c) => c.fn === 'fn_clientes_listado' && (c.args as { p_filtro?: string }).p_filtro === 'archivados'),
    ).toBe(true));
  });
});
