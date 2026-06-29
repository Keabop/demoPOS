import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RestablecerPasswordModal } from './RestablecerPasswordModal';
import type { Perfil } from '../../types';

const invokeMock = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));
vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>{name}</span>,
}));

const usuario: Perfil = {
  id: 'u-1',
  email: 'vendedor@agromar.com',
  nombre: 'Vendedor Agromar',
  rol: 'vendedor',
};

beforeEach(() => {
  invokeMock.mockReset();
});

describe('RestablecerPasswordModal', () => {
  it('muestra error y no invoca si las contraseñas no coinciden', () => {
    render(<RestablecerPasswordModal isOpen usuario={usuario} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'Agromar2026' } });
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'Otra2026XX' } });
    fireEvent.click(screen.getByRole('button', { name: /restablecer/i }));
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('invoca cambiar-password con userId y password cuando es válido', async () => {
    invokeMock.mockResolvedValue({ data: { message: 'ok' }, error: null });
    render(<RestablecerPasswordModal isOpen usuario={usuario} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'Agromar2026' } });
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'Agromar2026' } });
    fireEvent.click(screen.getByRole('button', { name: /restablecer/i }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(invokeMock).toHaveBeenCalledWith('cambiar-password', {
      body: { userId: 'u-1', password: 'Agromar2026' },
    });
    expect(await screen.findByText(/actualizada/i)).toBeInTheDocument();
  });

  it('muestra el mensaje de error de la función si falla', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { context: { json: async () => ({ error: 'Acceso denegado.' }) } },
    });
    render(<RestablecerPasswordModal isOpen usuario={usuario} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'Agromar2026' } });
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'Agromar2026' } });
    fireEvent.click(screen.getByRole('button', { name: /restablecer/i }));

    expect(await screen.findByText('Acceso denegado.')).toBeInTheDocument();
  });

  it('Generar rellena ambos campos y habilita el submit', () => {
    render(<RestablecerPasswordModal isOpen usuario={usuario} onClose={vi.fn()} />);
    const submitBtn = screen.getByRole('button', { name: /restablecer/i });
    expect(submitBtn).toBeDisabled(); // empieza inválido
    fireEvent.click(screen.getByRole('button', { name: /generar/i }));
    const nueva = screen.getByLabelText('Nueva contraseña') as HTMLInputElement;
    const conf = screen.getByLabelText('Confirmar contraseña') as HTMLInputElement;
    expect(nueva.value).not.toBe('');
    expect(conf.value).toBe(nueva.value);
    expect(submitBtn).not.toBeDisabled();
  });
});
