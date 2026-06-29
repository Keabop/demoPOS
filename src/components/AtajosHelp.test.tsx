import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AtajosHelp } from './AtajosHelp';

describe('AtajosHelp', () => {
  it('no renderiza nada si open=false', () => {
    const { container } = render(<AtajosHelp open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('muestra los atajos y cierra con Escape', () => {
    const onClose = vi.fn();
    render(<AtajosHelp open onClose={onClose} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/atajos de teclado/i)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
  it('cierra con el botón cerrar', () => {
    const onClose = vi.fn();
    render(<AtajosHelp open onClose={onClose} />);
    fireEvent.click(screen.getByLabelText(/cerrar/i));
    expect(onClose).toHaveBeenCalled();
  });
});
