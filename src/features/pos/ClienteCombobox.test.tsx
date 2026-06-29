import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClienteCombobox } from './ClienteCombobox';

const CLIENTES = [
  { id: 'cli-1', nombre: 'Roberto Hernández Cortés', numero_cliente: 12, rancho: 'La Esperanza', archivado: false },
  { id: 'cli-2', nombre: 'María de la Luz Vázquez', numero_cliente: 34, rancho: 'El Sabino', archivado: false },
];

vi.mock('../../lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  chain.eq = vi.fn(() => chain);
  chain.or = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve({ data: CLIENTES, error: null }));
  return { supabase: { from: vi.fn(() => ({ select: vi.fn(() => chain) })) } };
});

describe('ClienteCombobox', () => {
  beforeEach(() => vi.clearAllMocks());

  it('busca al teclear y elige con clic', async () => {
    const onSelect = vi.fn();
    render(<ClienteCombobox value={null} onSelect={onSelect} />);
    const input = screen.getByPlaceholderText(/buscar cliente/i);
    fireEvent.change(input, { target: { value: 'Rob' } });
    const opt = await screen.findByText('Roberto Hernández Cortés');
    fireEvent.mouseDown(opt);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'cli-1' }));
  });

  it('Enter elige el primer resultado', async () => {
    const onSelect = vi.fn();
    render(<ClienteCombobox value={null} onSelect={onSelect} />);
    const input = screen.getByPlaceholderText(/buscar cliente/i);
    fireEvent.change(input, { target: { value: 'a' } });
    await screen.findByText('Roberto Hernández Cortés');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'cli-1' }));
  });

  it('con value muestra chip y permite limpiar', () => {
    const onSelect = vi.fn();
    render(<ClienteCombobox value={CLIENTES[0] as never} onSelect={onSelect} />);
    expect(screen.getByText(/Roberto Hernández Cortés/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/quitar cliente/i));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
