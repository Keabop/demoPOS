import { describe, it, expect } from 'vitest';
import { construirWorksheetData } from './historialVentasXLSX';

describe('construirWorksheetData', () => {
  it('arma encabezado, filas y renglón de TOTAL', () => {
    const data = construirWorksheetData({
      columnas: ['Folio', 'Total'],
      filas: [['V-1', 100], ['V-2', 200]],
      total: 300,
      desde: '2026-06-01',
      hasta: '2026-06-30',
    });
    expect(data[0]).toEqual(['Folio', 'Total']);
    expect(data[1]).toEqual(['V-1', 100]);
    expect(data[2]).toEqual(['V-2', 200]);
    // último renglón contiene la palabra TOTAL y el monto
    const ultima = data[data.length - 1];
    expect(ultima).toContain('TOTAL');
    expect(ultima).toContain(300);
  });
});
