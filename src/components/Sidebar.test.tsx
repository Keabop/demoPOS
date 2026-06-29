import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Sidebar } from './Sidebar';

vi.mock('../features/auth/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'u1', nombre: 'Karen Admin', rol: 'admin', etiqueta: 'Administrador' } }),
}));
vi.mock('../features/config/ConfigContext', () => ({
  useConfig: () => ({ config: { nombre: 'AGROMAR', ciudad: 'Irapuato', logoUrl: null } }),
}));
vi.mock('../features/auth/useCan', () => ({ useCan: () => () => true }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ lt: () => Promise.resolve({ count: 0, error: null }) }) }) }) }),
    channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }), }),
    removeChannel: vi.fn(),
  },
}));

describe('Sidebar (teclado)', () => {
  it('muestra badges numéricos en los primeros items y navega con Enter', () => {
    const onNav = vi.fn();
    render(<Sidebar screen="pos" onNav={onNav} onLogout={() => {}} />);
    const tablero = screen.getByText('Tablero').closest('.sidebar-item') as HTMLElement;
    expect(within(tablero).getByText('1')).toBeInTheDocument();
    fireEvent.keyDown(tablero, { key: 'Enter' });
    expect(onNav).toHaveBeenCalledWith('dashboard');
  });

  it('ArrowDown mueve el foco al siguiente item', () => {
    render(<Sidebar screen="pos" onNav={() => {}} onLogout={() => {}} />);
    const tablero = screen.getByText('Tablero').closest('.sidebar-item') as HTMLElement;
    tablero.focus();
    fireEvent.keyDown(tablero, { key: 'ArrowDown' });
    const segundo = document.querySelector('[data-nav-index="1"]');
    expect(document.activeElement).toBe(segundo);
  });
});
