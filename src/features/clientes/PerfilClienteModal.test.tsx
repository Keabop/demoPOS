import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PerfilClienteModal } from './PerfilClienteModal';

const h = vi.hoisted(() => ({ can: true, rpc: vi.fn().mockResolvedValue({ data: null, error: null }) }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
          in: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
    rpc: h.rpc,
  },
}));
vi.mock('../auth/useCan', () => ({ useCan: () => () => h.can }));
vi.mock('../../lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../lib/configNegocio', () => ({ getConfig: () => ({ nombre: 'AGROMAR' }) }));

const clienteBloqueado = {
  id: 'c1', nombre: 'Juan Perez', limite_credito: 1000, saldo_deudor: 0,
  activo_para_credito: false, exento_bloqueo: false, archivado: false,
} as never;

beforeEach(() => { h.can = true; h.rpc.mockClear(); });

describe('PerfilClienteModal — acciones de cartera', () => {
  it('con la capacidad y cliente bloqueado, ofrece dar excepción', async () => {
    render(<PerfilClienteModal isOpen cliente={clienteBloqueado} onClose={() => {}} onVerEstadoCuenta={() => {}} onOpenAbono={() => {}} onChanged={() => {}} />);
    expect(await screen.findByRole('button', { name: /desbloquear cr[eé]dito/i })).toBeInTheDocument();
  });

  it('sin la capacidad, NO muestra el botón de excepción', async () => {
    h.can = false;
    render(<PerfilClienteModal isOpen cliente={clienteBloqueado} onClose={() => {}} onVerEstadoCuenta={() => {}} onOpenAbono={() => {}} onChanged={() => {}} />);
    expect(screen.queryByRole('button', { name: /desbloquear cr[eé]dito/i })).toBeNull();
  });
});
