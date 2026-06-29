import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { POS } from './POS';

// Mock de Supabase con cadena "thenable": sirve tanto a loadData (productos,
// termina en .order y se await-ea) como al ClienteCombobox (clientes, termina en .limit).
vi.mock('../../lib/supabase', () => {
  const PRODUCTS = [
    { id: 'prod-1', sku: '7501034501203', nombre: 'Semilla de Maíz Híbrido', categoria: 'Semillas',
      unidad: 'costal 20kg', precio_publico: 1000.00, precio_mayoreo: 900.00, tasa_iva: 0.00, tasa_ieps: 0.00, stock: 10.00, stock_minimo: 2.00 },
    { id: 'prod-2', sku: '7501034503112', nombre: 'Herbicida Glifosato 1L', categoria: 'Agroquímicos',
      unidad: 'botella 1L', precio_publico: 200.00, precio_mayoreo: 180.00, tasa_iva: 0.00, tasa_ieps: 0.00, stock: 5.00, stock_minimo: 1.00 },
  ];
  const CLIENTS = [
    { id: 'cli-1', nombre: 'Roberto Hernández Cortés', rancho: 'Rancho La Esperanza', telefono: '442 318 5520',
      numero_cliente: 12, limite_credito: 1500.00, saldo_deudor: 200.00, activo_para_credito: true, dias_credito: 30, archivado: false, nivel_precio: 'contado' },
    { id: 'cli-2', nombre: 'María de la Luz Vázquez', rancho: 'Parcela El Sabino', telefono: '442 184 9933',
      numero_cliente: 34, limite_credito: 1000.00, saldo_deudor: 900.00, activo_para_credito: false, dias_credito: 30, archivado: false, nivel_precio: 'contado' },
  ];
  const makeChain = (data: unknown[]) => {
    const result = { data, error: null };
    const chain: Record<string, unknown> = {};
    chain.eq = vi.fn(() => chain);
    chain.or = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve(result));
    // Hace la cadena "awaitable" para loadData (que await-ea sobre .order(...)).
    (chain as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve(result);
    return chain;
  };
  return {
    supabase: {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => makeChain(table === 'productos' ? PRODUCTS : table === 'clientes' ? CLIENTS : [])),
      })),
      rpc: vi.fn().mockResolvedValue({ data: { folio: '1', venta_id: 'sale-uuid' }, error: null }),
      channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }),
      removeChannel: vi.fn(),
    },
  };
});

describe('POS Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders products and sidebar components properly', async () => {
    render(<POS vendedorId="vend-1" vendedorNombre="Carlos Núñez" />);

    await waitFor(() => {
      expect(screen.getByText('Semilla de Maíz Híbrido')).toBeInTheDocument();
      expect(screen.getByText('Herbicida Glifosato 1L')).toBeInTheDocument();
    });

    expect(screen.getByText('Nueva Venta')).toBeInTheDocument();
    expect(screen.getByText(/Vendedor: Carlos Núñez/i)).toBeInTheDocument();
  });

  it('adds items to cart when clicked and calculates total price without IVA', async () => {
    render(<POS vendedorId="vend-1" vendedorNombre="Carlos Núñez" />);

    await waitFor(() => {
      expect(screen.getByText('Semilla de Maíz Híbrido')).toBeInTheDocument();
    });

    const seedButton = screen.getByText('Semilla de Maíz Híbrido').closest('button')!;
    fireEvent.click(seedButton);

    const chemButton = screen.getByText('Herbicida Glifosato 1L').closest('button')!;
    fireEvent.click(chemButton);

    // Total: 1000 + 200 = 1200
    expect(screen.getAllByText('$1,200.00').length).toBeGreaterThan(0);
    expect(screen.queryByText('IVA Trasladado')).toBeNull();
  });

  it.skip('allows adding items by scanning SKU / barcode in input field', async () => {
    render(<POS vendedorId="vend-1" vendedorNombre="Carlos Núñez" />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Escanee o teclee el código…')).toBeInTheDocument();
    });

    const scanInput = screen.getByPlaceholderText('Escanee o teclee el código…');
    fireEvent.change(scanInput, { target: { value: '7501034503112' } });
    fireEvent.submit(scanInput.closest('form')!);

    expect(screen.getAllByText('Herbicida Glifosato 1L').length).toBe(2);
    expect(screen.getAllByText('$200.00').length).toBeGreaterThan(0);
  });

  it('blocks credit selection and displays warning if client is moroso', async () => {
    render(<POS vendedorId="vend-1" vendedorNombre="Carlos Núñez" />);
    await waitFor(() => expect(screen.getByText('Venta a Cliente')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Venta a Cliente'));
    const buscador = screen.getByPlaceholderText(/buscar cliente/i);
    fireEvent.change(buscador, { target: { value: 'María' } });
    const opt = await screen.findByText('María de la Luz Vázquez');
    fireEvent.mouseDown(opt);

    expect(screen.getByText('BLOQUEADO (Moroso)')).toBeInTheDocument();
  });

  it('checks credit limits and disables checkout button if credit limit would be exceeded', async () => {
    render(<POS vendedorId="vend-1" vendedorNombre="Carlos Núñez" />);
    await waitFor(() => expect(screen.getByText('Venta a Cliente')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Venta a Cliente'));
    const buscador = screen.getByPlaceholderText(/buscar cliente/i);
    fireEvent.change(buscador, { target: { value: 'Roberto' } });
    const opt = await screen.findByText('Roberto Hernández Cortés');
    fireEvent.mouseDown(opt);

    const seedButton = screen.getByText('Semilla de Maíz Híbrido').closest('button')!;
    fireEvent.click(seedButton);
    fireEvent.click(seedButton);

    const creditBtn = screen.getByText('Nota a Crédito (30 días)').closest('button')!;
    fireEvent.click(creditBtn);

    expect(screen.getByText(/La venta excede el límite de crédito disponible/i)).toBeInTheDocument();
    const checkoutBtn = screen.getByRole('button', { name: /generar nota a crédito/i });
    expect(checkoutBtn).toBeDisabled();
  });

  it('Enter en el buscador agrega el primer producto', async () => {
    render(<POS vendedorId="vend-1" vendedorNombre="Carlos Núñez" />);
    await waitFor(() => expect(screen.getByText('Semilla de Maíz Híbrido')).toBeInTheDocument());
    const buscador = screen.getByPlaceholderText('Buscar por nombre o SKU...');
    fireEvent.keyDown(buscador, { key: 'Enter' });
    // El primer producto (orden de mock) queda en el carrito → su total aparece.
    expect(screen.getAllByText('$1,000.00').length).toBeGreaterThan(0);
  });

  it('flechas mueven el foco entre tarjetas y Enter agrega', async () => {
    render(<POS vendedorId="vend-1" vendedorNombre="Carlos Núñez" />);
    await waitFor(() => expect(screen.getByText('Herbicida Glifosato 1L')).toBeInTheDocument());
    const buscador = screen.getByPlaceholderText('Buscar por nombre o SKU...');
    fireEvent.keyDown(buscador, { key: 'ArrowDown' }); // entra a la rejilla (índice 0)
    const primera = document.querySelector('[data-prod-index="0"]') as HTMLElement;
    expect(document.activeElement).toBe(primera);
    fireEvent.keyDown(primera, { key: 'ArrowRight' }); // → índice 1
    const segunda = document.querySelector('[data-prod-index="1"]') as HTMLElement;
    expect(document.activeElement).toBe(segunda);
    fireEvent.keyDown(segunda, { key: 'Enter' }); // agrega el 2º (Glifosato, $200)
    expect(screen.getAllByText('$200.00').length).toBeGreaterThan(0);
  });
});
