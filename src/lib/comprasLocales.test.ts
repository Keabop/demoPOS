import { describe, it, expect } from 'vitest';
import { subtotalLineaCompra, iepsLineaCompra, totalesCompraLocal } from './comprasLocales';

describe('comprasLocales', () => {
  it('subtotal de línea redondea a centavos', () => {
    expect(subtotalLineaCompra(6, 979.69)).toBe(5878.14);
    expect(subtotalLineaCompra(3, 33.333)).toBe(100); // 99.999 -> 100.00
  });

  it('IEPS de línea = tasa sobre el subtotal de la línea (redondeado)', () => {
    // 6 x 979.69 @ 6% = 5878.14 * 0.06 = 352.6884 -> 352.69 (replica del documento Velneo)
    expect(iepsLineaCompra(6, 979.69, 0.06)).toBe(352.69);
    expect(iepsLineaCompra(2, 500, 0)).toBe(0);
  });

  it('totales de la compra (ejemplo del documento del comercio local)', () => {
    const t = totalesCompraLocal([{ cantidad: 6, costoUnitario: 979.69, tasaIeps: 0.06 }]);
    expect(t.subtotal).toBe(5878.14);
    expect(t.ieps).toBe(352.69);
    expect(t.total).toBe(6230.83); // coincide con el smoke MCP del RPC
  });

  it('totales con varias partidas y mezcla de IEPS', () => {
    const t = totalesCompraLocal([
      { cantidad: 6, costoUnitario: 979.69, tasaIeps: 0.06 }, // sub 5878.14, ieps 352.69
      { cantidad: 2, costoUnitario: 500, tasaIeps: 0 },        // sub 1000.00, ieps 0
    ]);
    expect(t.subtotal).toBe(6878.14);
    expect(t.ieps).toBe(352.69);
    expect(t.total).toBe(7230.83);
  });

  it('compra vacía da ceros', () => {
    expect(totalesCompraLocal([])).toEqual({ subtotal: 0, ieps: 0, total: 0 });
  });
});
