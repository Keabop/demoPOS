import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Precios } from './Precios';

// La pantalla de consulta NO debe mostrar costos a un perfil sin la capacidad.
vi.mock('../auth/useCan', () => ({
  useCan: () => () => false,
}));

vi.mock('../config/ConfigContext', () => ({
  useConfig: () => ({ config: { nombre: 'AGROMAR' } }),
}));

const PRODUCTS = [
  { id: 'p-1', sku: '12345', nombre: 'Fertilizante Urea 50kg', categoria: 'Fertilizantes', unidad: 'saco', precio_publico: 650.0, precio_credito: 680.0, precio_subdistribuidor: 600.0, tasa_ieps: 0.06, stock: 25.0, stock_minimo: 5.0 },
  { id: 'p-2', sku: '67890', nombre: 'Insecticida Cipermetrina 1L', categoria: 'Agroquímicos', unidad: 'botella', precio_publico: 180.0, precio_credito: 200.0, precio_subdistribuidor: 160.0, tasa_ieps: 0, stock: 6.0, stock_minimo: 8.0 },
];

// Captura los filtros .or() (búsqueda server-side) a través de re-consultas.
const orSpy = vi.fn();

// Builder encadenable y "thenable" que imita a PostgREST (resuelve {data,count,error}).
function makeChain(data: unknown, count: number) {
  const chain: Record<string, unknown> = {};
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.range = vi.fn(() => chain);
  chain.or = vi.fn((arg: string) => { orSpy(arg); return chain; });
  chain.then = (resolve: (v: unknown) => void) => resolve({ data, count, error: null });
  return chain;
}

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn((_cols: string, opts?: { head?: boolean }) =>
        opts?.head ? makeChain(null, PRODUCTS.length) : makeChain(PRODUCTS, PRODUCTS.length)),
    })),
    rpc: vi.fn((fn: string) =>
      fn === 'fn_categorias_productos'
        ? Promise.resolve({ data: ['Fertilizantes', 'Agroquímicos'], error: null })
        : Promise.resolve({ data: null, error: null })),
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }),
    removeChannel: vi.fn(),
  },
}));

describe('Precios Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orSpy.mockClear();
  });

  it('renders read-only catalog with prices and availability', async () => {
    render(<Precios />);

    await waitFor(() => {
      expect(screen.getByText('Fertilizante Urea 50kg')).toBeInTheDocument();
      expect(screen.getByText('Insecticida Cipermetrina 1L')).toBeInTheDocument();
    });

    expect(screen.getByText('Lista de Precios')).toBeInTheDocument();
    // Contado (precio_publico)
    expect(screen.getByText('$650.00')).toBeInTheDocument();
    expect(screen.getByText('$180.00')).toBeInTheDocument();
    // Crédito (precio_credito)
    expect(screen.getByText('$680.00')).toBeInTheDocument();
    expect(screen.getByText('$200.00')).toBeInTheDocument();
    // Subdistribuidor (precio_subdistribuidor)
    expect(screen.getByText('$600.00')).toBeInTheDocument();
    expect(screen.getByText('$160.00')).toBeInTheDocument();
    // IEPS: 0.06 (fracción) → 6%; sin IEPS → '—'
    expect(screen.getByText('6%')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();

    // Ambos con stock > 0 → 'Disponible'.
    expect(screen.getAllByText('Disponible').length).toBe(2);

    // Sin columna de costo (perfil sin capacidad) ni controles de edición.
    expect(screen.queryByText(/Nuevo Producto/i)).toBeNull();
    expect(screen.queryByText(/Registrar movimiento/i)).toBeNull();
  });

  it('muestra las categorías de la RPC y busca en servidor', async () => {
    render(<Precios />);

    await waitFor(() => {
      expect(screen.getByText('Fertilizante Urea 50kg')).toBeInTheDocument();
    });

    // Las categorías vienen de fn_categorias_productos (no derivadas en cliente).
    expect(screen.getByText('Fertilizantes')).toBeInTheDocument();
    expect(screen.getByText('Agroquímicos')).toBeInTheDocument();

    // Al escribir, se re-consulta en servidor con el término (.or con el texto).
    const searchInput = screen.getByPlaceholderText('Buscar insumo por nombre o SKU...');
    fireEvent.change(searchInput, { target: { value: 'Urea' } });

    await waitFor(() => {
      expect(orSpy).toHaveBeenCalledWith(expect.stringContaining('Urea'));
    });
  });
});
