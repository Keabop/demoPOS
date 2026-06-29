import { describe, it, expect } from 'vitest';
import { subtotalPartida, calcularTotalesOrden } from './compras';

describe('subtotalPartida', () => {
  it('redondea cantidad * precio a centavos', () => {
    expect(subtotalPartida(3, 19.99)).toBe(59.97);
  });
});

describe('calcularTotalesOrden', () => {
  it('IVA al 16% sobre el subtotal', () => {
    const t = calcularTotalesOrden([{ cantidad: 2, precioUnitario: 100 }], 0.16);
    expect(t.subtotal).toBe(200);
    expect(t.iva).toBe(32);
    expect(t.total).toBe(232);
  });

  it('IVA 0% deja total = subtotal', () => {
    const t = calcularTotalesOrden([{ cantidad: 1, precioUnitario: 150.5 }], 0);
    expect(t).toEqual({ subtotal: 150.5, iva: 0, total: 150.5 });
  });

  it('suma varias partidas sin error de flotante', () => {
    const t = calcularTotalesOrden(
      [{ cantidad: 1, precioUnitario: 0.1 }, { cantidad: 1, precioUnitario: 0.2 }],
      0,
    );
    expect(t.subtotal).toBe(0.3);
  });

  it('orden vacía da ceros', () => {
    expect(calcularTotalesOrden([], 0.16)).toEqual({ subtotal: 0, iva: 0, total: 0 });
  });
});
