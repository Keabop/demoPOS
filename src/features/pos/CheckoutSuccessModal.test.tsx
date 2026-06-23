import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('renders payment method label correctly on printed ticket', () => {
    render(<CheckoutSuccessModal {...defaultProps} />);

    // Should display FORMA DE PAGO: TARJETA DE CRÉDITO
    expect(screen.getByText('FORMA DE PAGO: TARJETA DE CRÉDITO')).toBeInTheDocument();
    
    // Should display CLIENTE in uppercase
    expect(screen.getByText('CLIENTE: JUAN CLIENTE')).toBeInTheDocument();
    
    // Should NOT display VENDEDOR
    expect(screen.queryByText(/VENDEDOR:/i)).toBeNull();
  });

  it('handles custom fallback for undefined/unknown payment method', () => {
    render(<CheckoutSuccessModal {...defaultProps} metodoPago="otro_metodo" />);

    expect(screen.getByText('FORMA DE PAGO: OTRO_METODO')).toBeInTheDocument();
  });
});
