import { describe, it, expect } from 'vitest';
import { ticketDesdeVentaNueva, ticketDesdeVentaGuardada, ticketHTML } from './ticketModel';

describe('ticketDesdeVentaNueva', () => {
  it('arma líneas con importe = precio × cantidad y clave del cliente', () => {
    const td = ticketDesdeVentaNueva(
      {
        folio: 'F1', clientName: 'Ana', clientNumero: 7,
        cartItems: [{ qty: 3, nombre: 'Maíz', precioVendido: 50 }],
        subtotal: 150, ieps: 0, total: 150,
        metodoPago: 'efectivo', efectivoRecibido: 200, cambio: 50,
      },
      'Carlos',
      '01/01/2026 10:00',
    );
    expect(td.folio).toBe('F1');
    expect(td.clienteClave).toBe('7');
    expect(td.vendedor).toBe('Carlos');
    expect(td.lineas[0].importe).toBe(150);
  });
});

describe('ticketDesdeVentaGuardada', () => {
  it('toma el método del tipo_pago y mapea detalles; sin efectivo recibido', () => {
    const td = ticketDesdeVentaGuardada(
      { folio: 'F2', fecha: '02/01/2026', tipo_pago: 'credito', subtotal: 100, ieps: 6, total: 106 },
      [{ cantidad: 2, nombre: 'Herbicida', precio_unitario: 50, importe: 100 }],
      'Beto', '12', 'Caja 1',
    );
    expect(td.metodoPago).toBe('credito');
    expect(td.total).toBe(106);
    expect(td.lineas[0].nombre).toBe('Herbicida');
    expect(td.efectivoRecibido).toBeNull();
  });
});

describe('ticketHTML', () => {
  const td = ticketDesdeVentaNueva(
    {
      folio: 'F9', clientName: null, clientNumero: null,
      cartItems: [{ qty: 1, nombre: 'Producto X', precioVendido: 99 }],
      subtotal: 99, ieps: 0, total: 99,
      metodoPago: 'efectivo', efectivoRecibido: null, cambio: null,
    },
    'Vend',
    '03/01/2026',
  );

  it('incluye folio, producto y pie del ticket', () => {
    const html = ticketHTML(td, 58);
    expect(html).toContain('F9');
    expect(html).toContain('Producto X');
    expect(html).toContain('GRACIAS POR SU COMPRA');
  });

  it('respeta el ancho configurado', () => {
    expect(ticketHTML(td, 80)).toContain('width:80mm');
    expect(ticketHTML(td, 58)).toContain('width:58mm');
  });

  it('escapa HTML peligroso del nombre', () => {
    const td2 = ticketDesdeVentaNueva(
      {
        folio: 'F', clientName: null, clientNumero: null,
        cartItems: [{ qty: 1, nombre: '<b>x</b>&', precioVendido: 1 }],
        subtotal: 1, ieps: 0, total: 1, metodoPago: 'efectivo', efectivoRecibido: null, cambio: null,
      },
      'V',
      'd',
    );
    expect(ticketHTML(td2, 58)).toContain('&lt;b&gt;x&lt;/b&gt;&amp;');
  });
});
