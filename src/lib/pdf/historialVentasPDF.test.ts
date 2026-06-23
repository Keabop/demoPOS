import { describe, it, expect } from 'vitest';
import { formatearBodyPDF } from './historialVentasPDF';

describe('formatearBodyPDF', () => {
  it('formatea como moneda las columnas 6,7,8 (Subtotal, IVA, Total) y deja el resto como texto', () => {
    const body = formatearBodyPDF([
      ['V-1', '19/06/2026 10:00', 'Mostrador', 'María', 'Efectivo', 'Cobrada', 100, 16, 116],
    ]);
    expect(body[0][0]).toBe('V-1');
    expect(body[0][6]).toBe('$100.00');
    expect(body[0][7]).toBe('$16.00');
    expect(body[0][8]).toBe('$116.00');
  });
});
