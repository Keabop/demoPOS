// Lógica pura de órdenes de compra: totales y folio. Usa money.ts para el redondeo.

import { round2, sumMoney } from './money';

export interface PartidaOrden {
  cantidad: number;
  precioUnitario: number;
}

export interface TotalesOrden {
  subtotal: number;
  iva: number;
  total: number;
}

/** Subtotal de una partida (cantidad * precio) redondeado a centavos. */
export function subtotalPartida(cantidad: number, precioUnitario: number): number {
  return round2(Number(cantidad) * Number(precioUnitario));
}

/**
 * Totales de una orden de compra: el subtotal es la suma de partidas y el IVA se
 * aplica con una tasa única del proveedor (a diferencia de la venta, donde el IVA
 * es por producto). tasaIva es fracción (0.16 = 16%).
 */
export function calcularTotalesOrden(partidas: PartidaOrden[], tasaIva: number): TotalesOrden {
  const subtotal = sumMoney(partidas.map((p) => subtotalPartida(p.cantidad, p.precioUnitario)));
  const iva = round2(subtotal * Number(tasaIva || 0));
  return { subtotal, iva, total: round2(subtotal + iva) };
}
