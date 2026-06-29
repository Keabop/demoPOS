import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LogoNegocio } from './LogoNegocio';
import { iniciales } from '../lib/iniciales';

describe('iniciales', () => {
  it('una sola palabra → dos primeras letras en mayúscula', () => {
    expect(iniciales('AGROMAR')).toBe('AG');
    expect(iniciales('semillas')).toBe('SE');
  });

  it('dos o más palabras → inicial de las dos primeras', () => {
    expect(iniciales('Juan Pérez')).toBe('JP');
    expect(iniciales('Distribuidora Agrícola del Centro')).toBe('DA');
  });

  it('vacío o solo espacios → "·"', () => {
    expect(iniciales('')).toBe('·');
    expect(iniciales('   ')).toBe('·');
  });
});

describe('LogoNegocio', () => {
  it('muestra la imagen cuando hay logoUrl', () => {
    render(<LogoNegocio logoUrl="https://ejemplo/logo.png" nombre="AGROMAR" />);
    const img = screen.getByRole('img', { name: 'AGROMAR' });
    expect(img).toHaveAttribute('src', 'https://ejemplo/logo.png');
  });

  it('muestra el monograma con iniciales cuando no hay logoUrl', () => {
    render(<LogoNegocio logoUrl="" nombre="AGROMAR" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('AG')).toBeInTheDocument();
  });
});
