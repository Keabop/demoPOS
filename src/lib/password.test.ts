import { describe, it, expect } from 'vitest';
import { passwordCumple, generarPassword, REGLAS_PASSWORD } from './password';

describe('passwordCumple', () => {
  it('rechaza contraseñas que no cumplen todas las reglas', () => {
    expect(passwordCumple('corta1A')).toBe(false);        // < 8 caracteres
    expect(passwordCumple('todominuscula1')).toBe(false); // sin mayúscula
    expect(passwordCumple('TODOMAYUS1')).toBe(false);      // sin minúscula
    expect(passwordCumple('SinNumeros')).toBe(false);      // sin dígito
  });

  it('acepta una contraseña válida', () => {
    expect(passwordCumple('Agromar2026')).toBe(true);
  });

  it('expone 4 reglas', () => {
    expect(REGLAS_PASSWORD).toHaveLength(4);
  });
});

describe('generarPassword', () => {
  it('genera contraseñas que siempre cumplen la política', () => {
    for (let i = 0; i < 200; i++) {
      expect(passwordCumple(generarPassword())).toBe(true);
    }
  });

  it('respeta la longitud solicitada', () => {
    expect(generarPassword(16)).toHaveLength(16);
  });
});
