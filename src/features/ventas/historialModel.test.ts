import { describe, it, expect } from 'vitest';
import {
  rangoDeFechas,
  filtrarVentas,
  calcularKpis,
  nombreCliente,
  aFilaExport,
  construirFilasExport,
  totalDeExport,
  COLUMNAS_EXPORT,
  type VentaHistorial,
} from './historialModel';

const NOW = new Date('2026-06-19T16:30:00Z'); // 19 jun 2026, 10:30 en México (UTC-6)

const mkVenta = (over: Partial<VentaHistorial>): VentaHistorial => ({
  id: 'x',
  folio: 'V-1',
  vendedor_id: 'vend-1',
  tipo_pago: 'efectivo',
  subtotal: 100,
  iva: 0,
  total: 100,
  estado: 'cobrada',
  fecha: '2026-06-19T10:00:00Z',
  cliente_id: null,
  clientes: null,
  perfiles: { nombre: 'María' },
  ...over,
});

const BASE_FILTROS = { search: '', tipoPago: 'todos', estado: 'todos', vendedorId: 'todos' };

describe('rangoDeFechas (anclado a México UTC-6, independiente del navegador)', () => {
  it('hoy: medianoche a fin de día en México', () => {
    const { startDate, endDate } = rangoDeFechas('hoy', undefined, undefined, NOW);
    expect(startDate.getTime()).toBe(Date.parse('2026-06-19T06:00:00.000Z'));
    expect(endDate.getTime()).toBe(Date.parse('2026-06-20T05:59:59.999Z'));
  });

  it('mes: desde el día 1 del mes en México', () => {
    const { startDate } = rangoDeFechas('mes', undefined, undefined, NOW);
    expect(startDate.getTime()).toBe(Date.parse('2026-06-01T06:00:00.000Z'));
  });

  it('7dias: 7 días atrás en el calendario de México', () => {
    const { startDate } = rangoDeFechas('7dias', undefined, undefined, NOW);
    expect(startDate.getTime()).toBe(Date.parse('2026-06-12T06:00:00.000Z'));
  });

  it('personalizado: usa las fechas dadas como días completos en México', () => {
    const { startDate, endDate } = rangoDeFechas('personalizado', '2026-05-01', '2026-05-31', NOW);
    expect(startDate.getTime()).toBe(Date.parse('2026-05-01T06:00:00.000Z'));
    expect(endDate.getTime()).toBe(Date.parse('2026-06-01T05:59:59.999Z'));
  });
});

describe('filtrarVentas', () => {
  const ventas = [
    mkVenta({ id: '1', folio: 'V-100', tipo_pago: 'credito', estado: 'pendiente', vendedor_id: 'a', clientes: { nombre: 'Juan Pérez' } }),
    mkVenta({ id: '2', folio: 'V-200', tipo_pago: 'efectivo', estado: 'cobrada', vendedor_id: 'b', clientes: null }),
  ];

  it('sin filtros devuelve todo', () => {
    expect(filtrarVentas(ventas, BASE_FILTROS)).toHaveLength(2);
  });
  it('filtra por tipo de pago', () => {
    expect(filtrarVentas(ventas, { ...BASE_FILTROS, tipoPago: 'credito' }).map(v => v.id)).toEqual(['1']);
  });
  it('filtra por estado', () => {
    expect(filtrarVentas(ventas, { ...BASE_FILTROS, estado: 'cobrada' }).map(v => v.id)).toEqual(['2']);
  });
  it('filtra por vendedor', () => {
    expect(filtrarVentas(ventas, { ...BASE_FILTROS, vendedorId: 'b' }).map(v => v.id)).toEqual(['2']);
  });
  it('busca por folio', () => {
    expect(filtrarVentas(ventas, { ...BASE_FILTROS, search: 'v-100' }).map(v => v.id)).toEqual(['1']);
  });
  it('busca por nombre de cliente', () => {
    expect(filtrarVentas(ventas, { ...BASE_FILTROS, search: 'juan' }).map(v => v.id)).toEqual(['1']);
  });
});

describe('calcularKpis', () => {
  it('suma totales, excluye canceladas y separa contado/crédito', () => {
    const ventas = [
      mkVenta({ total: 100, tipo_pago: 'efectivo', estado: 'cobrada' }),
      mkVenta({ total: 300, tipo_pago: 'credito', estado: 'pendiente' }),
      mkVenta({ total: 999, tipo_pago: 'efectivo', estado: 'cancelada' }), // excluida
    ];
    const k = calcularKpis(ventas);
    expect(k.numVentas).toBe(2);
    expect(k.totalVendido).toBe(400);
    expect(k.totalCredito).toBe(300);
    expect(k.totalContado).toBe(100);
    expect(k.ticketPromedio).toBe(200);
  });

  it('lista vacía no divide entre cero', () => {
    const k = calcularKpis([]);
    expect(k.numVentas).toBe(0);
    expect(k.ticketPromedio).toBe(0);
  });
});

describe('helpers de export', () => {
  it('nombreCliente usa "Mostrador" cuando no hay cliente', () => {
    expect(nombreCliente(mkVenta({ clientes: null }))).toBe('Mostrador');
    expect(nombreCliente(mkVenta({ clientes: { nombre: 'Ana' } }))).toBe('Ana');
  });

  it('aFilaExport mapea columnas con etiquetas legibles', () => {
    const fila = aFilaExport(mkVenta({
      folio: 'V-7', tipo_pago: 'credito', estado: 'pendiente',
      subtotal: 100, iva: 16, total: 116, clientes: null, perfiles: { nombre: 'María' },
    }));
    // [Folio, Fecha, Cliente, Vendedor, Tipo, Estado, Subtotal, IVA, Total]
    expect(fila[0]).toBe('V-7');
    expect(fila[2]).toBe('Mostrador');
    expect(fila[3]).toBe('María');
    expect(fila[4]).toBe('Crédito');
    expect(fila[5]).toBe('Pendiente');
    expect(fila[8]).toBe(116);
    expect(COLUMNAS_EXPORT).toHaveLength(fila.length);
  });

  it('totalDeExport suma totales excluyendo canceladas', () => {
    const total = totalDeExport([
      mkVenta({ total: 100 }),
      mkVenta({ total: 50, estado: 'cancelada' }),
    ]);
    expect(total).toBe(100);
    expect(construirFilasExport([mkVenta({}), mkVenta({})])).toHaveLength(2);
  });
});
