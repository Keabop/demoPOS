import { describe, it, expect } from 'vitest';
import { numeroALetras } from './numeroEnLetras';

describe('numeroALetras', () => {
  it('entero simple (caso del pagaré real)', () => {
    expect(numeroALetras(2622)).toBe('DOS MIL SEISCIENTOS VEINTIDÓS PESOS 00/100 M.N.');
  });
  it('cien exacto', () => {
    expect(numeroALetras(100)).toBe('CIEN PESOS 00/100 M.N.');
  });
  it('ciento y pico', () => {
    expect(numeroALetras(135)).toBe('CIENTO TREINTA Y CINCO PESOS 00/100 M.N.');
  });
  it('con centavos', () => {
    expect(numeroALetras(1850.5)).toBe('MIL OCHOCIENTOS CINCUENTA PESOS 50/100 M.N.');
  });
  it('cero', () => {
    expect(numeroALetras(0)).toBe('CERO PESOS 00/100 M.N.');
  });
  it('un peso (singular)', () => {
    expect(numeroALetras(1)).toBe('UN PESO 00/100 M.N.');
  });
  it('un millón', () => {
    expect(numeroALetras(1000000)).toBe('UN MILLÓN PESOS 00/100 M.N.');
  });
});
