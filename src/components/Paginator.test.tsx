import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Paginator } from './Paginator';

describe('Paginator', () => {
  it('muestra el rango y el total de páginas', () => {
    render(<Paginator page={1} pageSize={50} count={120} onPage={() => {}} />);
    expect(screen.getByText(/de 3/)).toBeInTheDocument();
    expect(screen.getByText(/1–50 de 120/)).toBeInTheDocument();
  });

  it('avanza a la página siguiente', () => {
    const onPage = vi.fn();
    render(<Paginator page={1} pageSize={50} count={120} onPage={onPage} />);
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(onPage).toHaveBeenCalledWith(2);
  });

  it('deshabilita "anterior" en la primera página y "siguiente" en la última', () => {
    const { rerender } = render(<Paginator page={1} pageSize={50} count={120} onPage={() => {}} />);
    expect(screen.getByRole('button', { name: /anterior/i })).toBeDisabled();
    rerender(<Paginator page={3} pageSize={50} count={120} onPage={() => {}} />);
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeDisabled();
  });
});
