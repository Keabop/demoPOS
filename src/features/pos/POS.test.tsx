import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { POS } from './POS';

// Mock Supabase Client
vi.mock('../../lib/supabase', () => {
  const mockFrom = (table: string) => {
    return {
      select: vi.fn().mockImplementation(() => {
        const chain = {
          eq: vi.fn(() => chain),
          order: vi.fn().mockImplementation(() => {
            if (table === 'productos') {
              return Promise.resolve({
                data: [
                  {
                    id: 'prod-1',
                    sku: '7501034501203',
                    nombre: 'Semilla de Maíz Híbrido',
                    categoria: 'Semillas',
                    unidad: 'costal 20kg',
                    precio_publico: 1000.00,
                    precio_mayoreo: 900.00,
                    tasa_iva: 0.00, // Seeds are 0% VAT
                    stock: 10.00,
                    stock_minimo: 2.00
                  },
                  {
                    id: 'prod-2',
                    sku: '7501034503112',
                    nombre: 'Herbicida Glifosato 1L',
                    categoria: 'Agroquímicos',
                    unidad: 'botella 1L',
                    precio_publico: 200.00,
                    precio_mayoreo: 180.00,
                    tasa_iva: 0.00, // No VAT
                    stock: 5.00,
                    stock_minimo: 1.00
                  }
                ],
                error: null
              });
            }
            if (table === 'clientes') {
              return Promise.resolve({
                data: [
                  {
                    id: 'cli-1',
                    nombre: 'Roberto Hernández Cortés',
                    rancho: 'Rancho La Esperanza',
                    telefono: '442 318 5520',
                    limite_credito: 1500.00,
                    saldo_deudor: 200.00,
                    activo_para_credito: true
                  },
                  {
                    id: 'cli-2',
                    nombre: 'María de la Luz Vázquez',
                    rancho: 'Parcela El Sabino',
                    telefono: '442 184 9933',
                    limite_credito: 1000.00,
                    saldo_deudor: 900.00,
                    activo_para_credito: false // Blocked moroso
                  }
                ],
                error: null
              });
            }
            return Promise.resolve({ data: [], error: null });
          })
        };
        return chain;
      })
    };
  };

  return {
    supabase: {
      from: vi.fn().mockImplementation(mockFrom),
      rpc: vi.fn().mockResolvedValue({ data: 'sale-uuid-mock', error: null }),
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis()
      }),
      removeChannel: vi.fn()
    }
  };
});

describe('POS Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders products and sidebar components properly', async () => {
    render(<POS vendedorId="vend-1" vendedorNombre="Carlos Núñez" />);
    
    // Wait for mock products to load
    await waitFor(() => {
      expect(screen.getByText('Semilla de Maíz Híbrido')).toBeInTheDocument();
      expect(screen.getByText('Herbicida Glifosato 1L')).toBeInTheDocument();
    });

    // Check header and seller name
    expect(screen.getByText('Nueva Venta')).toBeInTheDocument();
    expect(screen.getByText(/Vendedor: Carlos Núñez/i)).toBeInTheDocument();
  });

  it('adds items to cart when clicked and calculates total price without IVA', async () => {
    render(<POS vendedorId="vend-1" vendedorNombre="Carlos Núñez" />);

    await waitFor(() => {
      expect(screen.getByText('Semilla de Maíz Híbrido')).toBeInTheDocument();
    });

    // Add 1 Seed (1000.00)
    const seedButton = screen.getByText('Semilla de Maíz Híbrido').closest('button')!;
    fireEvent.click(seedButton);

    // Add 1 Herbicide (200.00)
    const chemButton = screen.getByText('Herbicida Glifosato 1L').closest('button')!;
    fireEvent.click(chemButton);

    // Total: 1000 + 200 = 1200
    expect(screen.getAllByText('$1,200.00').length).toBeGreaterThan(0); // Total
    expect(screen.queryByText('IVA Trasladado')).toBeNull(); // Should be hidden
  });

  it.skip('allows adding items by scanning SKU / barcode in input field', async () => {
    render(<POS vendedorId="vend-1" vendedorNombre="Carlos Núñez" />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Escanee o teclee el código…')).toBeInTheDocument();
    });

    const scanInput = screen.getByPlaceholderText('Escanee o teclee el código…');
    
    // Type a valid SKU and submit barcode scan
    fireEvent.change(scanInput, { target: { value: '7501034503112' } }); // Glifosato SKU
    fireEvent.submit(scanInput.closest('form')!);

    // Check if added to cart (should list 'Herbicida Glifosato 1L' in both grid and cart)
    expect(screen.getAllByText('Herbicida Glifosato 1L').length).toBe(2);
    // Total = 200.00
    expect(screen.getAllByText('$200.00').length).toBeGreaterThan(0);
  });

  it('blocks credit selection and displays warning if client is moroso', async () => {
    // Mock window.alert to capture checks
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<POS vendedorId="vend-1" vendedorNombre="Carlos Núñez" />);

    await waitFor(() => {
      expect(screen.getByText('Venta a Cliente')).toBeInTheDocument();
    });

    // Toggle Venta a Cliente
    fireEvent.click(screen.getByText('Venta a Cliente'));

    // Select second client (María, who has activo_para_credito = false)
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'cli-2' } });

    // Check status reads blocked
    expect(screen.getByText('BLOQUEADO (Moroso)')).toBeInTheDocument();

    alertMock.mockRestore();
  });

  it('checks credit limits and disables checkout button if credit limit would be exceeded', async () => {
    render(<POS vendedorId="vend-1" vendedorNombre="Carlos Núñez" />);

    await waitFor(() => {
      expect(screen.getByText('Venta a Cliente')).toBeInTheDocument();
    });

    // Select Cliente (Roberto, credit limit = 1500, balance = 200, available = 1300)
    fireEvent.click(screen.getByText('Venta a Cliente'));
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'cli-1' } });

    // Add 2 Seeds to cart (2 * 1000 = 2000 total sale)
    const seedButton = screen.getByText('Semilla de Maíz Híbrido').closest('button')!;
    fireEvent.click(seedButton);
    fireEvent.click(seedButton); // twice

    // Toggle Credit payment
    const creditBtn = screen.getByText('Nota a Crédito (30 días)').closest('button')!;
    fireEvent.click(creditBtn);

    // Limit exceeded warning should be visible
    expect(screen.getByText(/La venta excede el límite de crédito disponible/i)).toBeInTheDocument();

    // Checkout button should be disabled
    const checkoutBtn = screen.getByRole('button', { name: /generar nota a crédito/i });
    expect(checkoutBtn).toBeDisabled();
  });
});
