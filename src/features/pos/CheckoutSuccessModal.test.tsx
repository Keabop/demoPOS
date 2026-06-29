import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { CheckoutSuccessModal } from './CheckoutSuccessModal';

// Mock the Icon component since it might render SVGs or Lucide icons
vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>{name}</span>
}));

describe('CheckoutSuccessModal Component', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    folio: 'V-2026-123456',
    subtotal: 1500.50,
    iva: 0,
    total: 1500.50,
    vendedorNombre: 'Carlos vendedor',
    clientName: 'Juan Cliente',
    clientPhone: '4621234567',
    cartItems: [
      {
        id: '1',
        sku: 'SKU-001',
        nombre: 'Semilla de Maíz',
        categoria: 'Semillas',
        unidad: 'costal',
        precio_publico: 500.00,
        precio_mayoreo: 450.00,
        costo: 300.00,
        tasa_iva: 0,
        stock: 10,
        stock_minimo: 2,
        qty: 3
      }
    ],
    onSendWhatsApp: vi.fn().mockResolvedValue(true),
    metodoPago: 'tarjeta'
  };

  it('renderiza el ticket (portal) con método de pago y cliente', () => {
    render(<CheckoutSuccessModal {...defaultProps} />);
    // El ticket se inyecta vía dangerouslySetInnerHTML en el portal de impresión.
    expect(document.body.innerHTML).toContain('TARJETA DE CRÉDITO');
    expect(document.body.innerHTML).toContain('Juan Cliente');
    expect(document.body.innerHTML).toContain('V-2026-123456'); // folio
  });

  it('método de pago desconocido cae a su nombre en mayúsculas', () => {
    render(<CheckoutSuccessModal {...defaultProps} metodoPago="otro_metodo" />);
    expect(document.body.innerHTML).toContain('OTRO_METODO');
  });
});
