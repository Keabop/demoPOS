import type { Venta } from '../../types';
import { round2, sumMoney } from '../../lib/money';
import { ymdEnMX, inicioDiaMX, finDiaMX, formatFechaHoraMX } from '../../lib/dates';

/** Venta con los datos embebidos para la tabla del historial. */
export interface VentaHistorial extends Venta {
  clientes: { nombre: string; rancho?: string | null } | null;
  perfiles: { nombre: string } | null;
}

export type PeriodoOpcion = 'hoy' | '7dias' | 'mes' | 'ano' | 'personalizado';

/**
 * Rango [startDate, endDate] para el periodo elegido, ANCLADO a la hora de México
 * (no a la del navegador). `now` es inyectable para tests. Cierra T-FECHA-3.
 */
export function rangoDeFechas(
  opcion: PeriodoOpcion,
  customDesde?: string,
  customHasta?: string,
  now: Date = new Date(),
): { startDate: Date; endDate: Date } {
  const hoyMX = ymdEnMX(now); // 'YYYY-MM-DD' del día actual en México
  if (opcion === 'personalizado') {
    return {
      startDate: inicioDiaMX(customDesde || hoyMX),
      endDate: finDiaMX(customHasta || hoyMX),
    };
  }
  const [y, m] = hoyMX.split('-').map(Number);
  const endDate = finDiaMX(hoyMX);
  let startYmd = hoyMX;
  switch (opcion) {
    case 'hoy':
      startYmd = hoyMX;
      break;
    case '7dias': {
      // Aritmética de fecha pura (UTC) sobre el día calendario de México.
      const base = new Date(Date.UTC(y, m - 1, Number(hoyMX.slice(8, 10))));
      base.setUTCDate(base.getUTCDate() - 7);
      startYmd = base.toISOString().slice(0, 10);
      break;
    }
    case 'mes':
      startYmd = `${hoyMX.slice(0, 7)}-01`;
      break;
    case 'ano':
      startYmd = `${y}-01-01`;
      break;
  }
  return { startDate: inicioDiaMX(startYmd), endDate };
}

export interface FiltrosHistorial {
  search: string;
  tipoPago: string; // 'todos' | Venta['tipo_pago']
  estado: string; // 'todos' | Venta['estado']
  vendedorId: string; // 'todos' | id de perfil
}

export function filtrarVentas(ventas: VentaHistorial[], f: FiltrosHistorial): VentaHistorial[] {
  const term = f.search.trim().toLowerCase();
  return ventas.filter(v => {
    if (f.tipoPago !== 'todos' && v.tipo_pago !== f.tipoPago) return false;
    if (f.estado !== 'todos' && v.estado !== f.estado) return false;
    if (f.vendedorId !== 'todos' && v.vendedor_id !== f.vendedorId) return false;
    if (!term) return true;
    const folio = v.folio.toLowerCase();
    const cliente = (v.clientes?.nombre ?? '').toLowerCase();
    return folio.includes(term) || cliente.includes(term);
  });
}

export interface KpisHistorial {
  totalVendido: number;
  numVentas: number;
  ticketPromedio: number;
  totalContado: number;
  totalCredito: number;
}

export function calcularKpis(ventas: VentaHistorial[]): KpisHistorial {
  const validas = ventas.filter(v => v.estado !== 'cancelada');
  const numVentas = validas.length;
  const totalVendido = sumMoney(validas.map(v => Number(v.total)));
  const totalCredito = sumMoney(validas.filter(v => v.tipo_pago === 'credito').map(v => Number(v.total)));
  const totalContado = round2(totalVendido - totalCredito);
  const ticketPromedio = numVentas > 0 ? round2(totalVendido / numVentas) : 0;
  return { totalVendido, numVentas, ticketPromedio, totalContado, totalCredito };
}

export const ETIQUETA_TIPO_PAGO: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  debito: 'Débito',
  transferencia: 'Transferencia',
  credito: 'Crédito',
};

export const ETIQUETA_ESTADO: Record<string, string> = {
  cobrada: 'Cobrada',
  pendiente: 'Pendiente',
  cancelada: 'Cancelada',
};

export function nombreCliente(v: VentaHistorial): string {
  return v.clientes?.nombre ?? 'Mostrador';
}

/** Formatea un timestamp ISO a 'DD/MM/YYYY HH:mm' en hora de México (no del navegador). */
export function formatFechaHora(fecha?: string): string {
  return formatFechaHoraMX(fecha);
}

export const COLUMNAS_EXPORT: string[] = [
  'Folio', 'Fecha', 'Cliente', 'Vendedor', 'Tipo de pago', 'Estado', 'Subtotal', 'IVA', 'Total',
];

export function aFilaExport(v: VentaHistorial): (string | number)[] {
  return [
    v.folio,
    formatFechaHora(v.fecha),
    nombreCliente(v),
    v.perfiles?.nombre ?? '',
    ETIQUETA_TIPO_PAGO[v.tipo_pago] ?? v.tipo_pago,
    ETIQUETA_ESTADO[v.estado] ?? v.estado,
    round2(Number(v.subtotal)),
    round2(Number(v.iva)),
    round2(Number(v.total)),
  ];
}

export function construirFilasExport(ventas: VentaHistorial[]): (string | number)[][] {
  return ventas.map(aFilaExport);
}

export function totalDeExport(ventas: VentaHistorial[]): number {
  return sumMoney(ventas.filter(v => v.estado !== 'cancelada').map(v => Number(v.total)));
}
