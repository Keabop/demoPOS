import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CambiarMiPasswordModal } from './CambiarMiPasswordModal';

const signInMock = vi.fn();
const updateUserMock = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...a: unknown[]) => signInMock(...a),
      updateUser: (...a: unknown[]) => updateUserMock(...a),
    },
  },
}));
vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>{name}</span>,
}));

beforeEach(() => {
  signInMock.mockReset();
  updateUserMock.mockReset();
});

function llenar(actual: string, nueva: string, confirmar: string) {
  fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: actual } });
  fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: nueva } });
  fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'), { target: { value: confirmar } });
}

describe('CambiarMiPasswordModal', () => {
  it('rechaza si la contraseña actual es incorrecta y no actualiza', async () => {
    signInMock.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
    render(<CambiarMiPasswordModal isOpen email="yo@agromar.com" onClose={vi.fn()} />);
    llenar('malaActual1A', 'Agromar2026', 'Agromar2026');
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }));

    expect(await screen.findByText('La contraseña actual no es correcta.')).toBeInTheDocument();
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('no actualiza si la nueva y la confirmación no coinciden', () => {
    render(<CambiarMiPasswordModal isOpen email="yo@agromar.com" onClose={vi.fn()} />);
    llenar('ActualValida1', 'Agromar2026', 'Otra2026XX');
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }));

    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it('cambia la contraseña cuando la actual es correcta', async () => {
    signInMock.mockResolvedValue({ data: { user: {} }, error: null });
    updateUserMock.mockResolvedValue({ data: { user: {} }, error: null });
    render(<CambiarMiPasswordModal isOpen email="yo@agromar.com" onClose={vi.fn()} />);
    llenar('ActualValida1', 'Agromar2026', 'Agromar2026');
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }));

    await waitFor(() => expect(updateUserMock).toHaveBeenCalledTimes(1));
    expect(signInMock).toHaveBeenCalledWith({ email: 'yo@agromar.com', password: 'ActualValida1' });
    expect(updateUserMock).toHaveBeenCalledWith({ password: 'Agromar2026' });
    expect(await screen.findByText(/actualiz/i)).toBeInTheDocument();
  });
});
