import { describe, it, expect } from 'vitest';
import { costoValuacion } from './valuacion';

describe('costoValuacion', () => {
  it('usa el costo del lote cuando es > 0', () => {
    expect(costoValuacion(120, 100, 200)).toBe(120);
  });

  it('cae al costo del producto si el lote no tiene costo', () => {
    expect(costoValuacion(0, 100, 200)).toBe(100);
    expect(costoValuacion(undefined, 100, 200)).toBe(100);
  });

  it('estima con precio de venta si no hay ningún costo capturado', () => {
    expect(costoValuacion(0, 0, 200)).toBe(200);
    expect(costoValuacion(null, null, 200)).toBe(200);
  });

  it('devuelve 0 si no hay costo ni precio', () => {
    expect(costoValuacion(0, 0, 0)).toBe(0);
    expect(costoValuacion(undefined, undefined, undefined)).toBe(0);
  });

  it('ignora valores negativos o no numéricos tratándolos como 0', () => {
    expect(costoValuacion(-5, 0, 200)).toBe(200);
  });
});
