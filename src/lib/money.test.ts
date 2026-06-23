import { describe, it, expect } from 'vitest';
import { round2, sumMoney, calcularTotales, subtotalLinea, margen } from './money';

describe('margen', () => {
  it('calcula utilidad y porcentaje sobre el precio público', () => {
    expect(margen(100, 60)).toEqual({ utilidad: 40, porcentaje: 40 });
  });
  it('margen negativo si el costo supera al precio', () => {
    expect(margen(50, 80)).toEqual({ utilidad: -30, porcentaje: -60 });
  });
  it('precio 0 no divide entre cero', () => {
    expect(margen(0, 0)).toEqual({ utilidad: 0, porcentaje: 0 });
  });
});

describe('round2', () => {
  it('redondea a 2 decimales', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(10)).toBe(10);
  });

  it('elimina el error de punto flotante binario', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe('sumMoney', () => {
  it('suma sin arrastrar error de flotante', () => {
    expect(sumMoney([0.1, 0.2, 0.3])).toBe(0.6);
  });

  it('trata valores nulos/undefined como cero', () => {
    // @ts-expect-error probamos robustez ante datos sucios de la BD
    expect(sumMoney([10.5, null, undefined, 4.5])).toBe(15);
  });
});

describe('calcularTotales', () => {
  it('suma partidas exentas de IVA (insumos agrícolas al 0%)', () => {
    const t = calcularTotales([
      { precioUnitario: 150.5, cantidad: 2, tasaIva: 0 },
      { precioUnitario: 99.9, cantidad: 1, tasaIva: 0 },
    ]);
    expect(t.subtotal).toBe(400.9);
    expect(t.iva).toBe(0);
    expect(t.total).toBe(400.9);
  });

  it('calcula IVA al 16% por línea', () => {
    const t = calcularTotales([{ precioUnitario: 100, cantidad: 1, tasaIva: 0.16 }]);
    expect(t.subtotal).toBe(100);
    expect(t.iva).toBe(16);
    expect(t.total).toBe(116);
  });

  it('redondea por partida: el total coincide con la suma de líneas del ticket', () => {
    // 3 partidas de 0.333 -> cada una redondea a 0.33, total 0.99 (no 1.00)
    const t = calcularTotales([
      { precioUnitario: 0.333, cantidad: 1, tasaIva: 0 },
      { precioUnitario: 0.333, cantidad: 1, tasaIva: 0 },
      { precioUnitario: 0.333, cantidad: 1, tasaIva: 0 },
    ]);
    expect(t.subtotal).toBe(0.99);
  });

  it('maneja cantidades fraccionadas (venta a granel)', () => {
    const t = calcularTotales([{ precioUnitario: 37.5, cantidad: 1.5, tasaIva: 0 }]);
    expect(t.subtotal).toBe(56.25);
  });

  it('carrito vacío da ceros', () => {
    expect(calcularTotales([])).toEqual({ subtotal: 0, iva: 0, total: 0 });
  });
});

describe('subtotalLinea', () => {
  it('redondea precio * cantidad a centavos', () => {
    expect(subtotalLinea(19.99, 3)).toBe(59.97);
  });
});
