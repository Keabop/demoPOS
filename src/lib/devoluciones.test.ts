import { describe, it, expect } from 'vitest';
import { montoLineaDevolucion, totalDevolucion } from './devoluciones';

describe('montoLineaDevolucion', () => {
  it('sin IEPS = precio × cantidad', () => {
    expect(montoLineaDevolucion(50, 0, 10, 4)).toBe(200);
  });
  it('con IEPS proporcional a la cantidad devuelta', () => {
    // IEPS total de la línea = 60 para 10 piezas; devolver 4 → 24 de IEPS + 200 = 224
    expect(montoLineaDevolucion(50, 60, 10, 4)).toBe(224);
  });
  it('devolución total recupera todo el IEPS de la línea', () => {
    expect(montoLineaDevolucion(50, 60, 10, 10)).toBe(560);
  });
  it('cantidades inválidas → 0', () => {
    expect(montoLineaDevolucion(50, 60, 0, 4)).toBe(0);
    expect(montoLineaDevolucion(50, 60, 10, 0)).toBe(0);
  });
  it('redondea a centavos', () => {
    // 33.333 IEPS sobre 1 de 3 → 11.111 + 10 = 21.11
    expect(montoLineaDevolucion(10, 33.333, 3, 1)).toBe(21.11);
  });
});

describe('totalDevolucion', () => {
  it('suma y redondea', () => {
    expect(totalDevolucion([200, 224, 0])).toBe(424);
    expect(totalDevolucion([])).toBe(0);
  });
});
