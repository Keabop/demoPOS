import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Precios } from './Precios';

// Mock Supabase Client
vi.mock('../../lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn().mockImplementation(() => {
        return {
          select: vi.fn().mockImplementation(() => {
            const chain = {
              eq: vi.fn(() => chain),
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'p-1',
                    sku: '12345',
                    nombre: 'Fertilizante Urea 50kg',
                    categoria: 'Fertilizantes',
                    unidad: 'saco',
                    precio_publico: 650.00,
                    precio_mayoreo: 600.00,
                    tasa_iva: 0,
                    stock: 25.00,
                    stock_minimo: 5.00
                  },
                  {
                    id: 'p-2',
                    sku: '67890',
                    nombre: 'Insecticida Cipermetrina 1L',
                    categoria: 'Agroquímicos',
                    unidad: 'botella',
                    precio_publico: 180.00,
                    precio_mayoreo: 160.00,
                    tasa_iva: 0,
                    stock: 6.00,
                    stock_minimo: 8.00 // stock < stock_minimo -> Bajo
                  }
                ],
                error: null
              })
            };
            return chain;
          })
        };
      }),
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis()
      }),
      removeChannel: vi.fn()
    }
  };
});

describe('Precios Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders read-only catalog with prices and stock information', async () => {
    render(<Precios />);

    // Wait for data load
    await waitFor(() => {
      expect(screen.getByText('Fertilizante Urea 50kg')).toBeInTheDocument();
      expect(screen.getByText('Insecticida Cipermetrina 1L')).toBeInTheDocument();
    });

    // Check titles
    expect(screen.getByText('Lista de Precios')).toBeInTheDocument();
    
    // Public prices should be formatted and visible
    expect(screen.getByText('$650.00')).toBeInTheDocument();
    expect(screen.getByText('$180.00')).toBeInTheDocument();

    // Wholesale prices should be visible
    expect(screen.getByText('$600.00')).toBeInTheDocument();
    expect(screen.getByText('$160.00')).toBeInTheDocument();

    // Verify availability status levels (both are stock > 0, so 'Disponible')
    expect(screen.getAllByText('Disponible').length).toBe(2);
    expect(screen.queryByText('Normal')).toBeNull();
    expect(screen.queryByText('Bajo')).toBeNull();

    // Verify exact stock numbers are not rendered in table
    expect(screen.queryByText('25')).toBeNull();
    expect(screen.queryByText('6')).toBeNull();

    // Verify no edit/insert controls are present
    expect(screen.queryByText(/Nuevo Producto/i)).toBeNull();
    expect(screen.queryByText(/Registrar movimiento/i)).toBeNull();
  });

  it('filters products by category and search text', async () => {
    render(<Precios />);

    await waitFor(() => {
      expect(screen.getByText('Fertilizante Urea 50kg')).toBeInTheDocument();
    });

    // Search query
    const searchInput = screen.getByPlaceholderText('Buscar insumo por nombre o SKU...');
    fireEvent.change(searchInput, { target: { value: 'Urea' } });

    // Should only show Urea
    expect(screen.getByText('Fertilizante Urea 50kg')).toBeInTheDocument();
    expect(screen.queryByText('Insecticida Cipermetrina 1L')).toBeNull();

    // Reset search
    fireEvent.change(searchInput, { target: { value: '' } });

    // Click Category pill: Agroquímicos
    const agroButton = screen.getByText('Agroquímicos');
    fireEvent.click(agroButton);

    // Should only show Insecticida
    expect(screen.getByText('Insecticida Cipermetrina 1L')).toBeInTheDocument();
    expect(screen.queryByText('Fertilizante Urea 50kg')).toBeNull();
  });
});
