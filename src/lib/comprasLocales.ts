// Lógica pura de compras locales (recepción directa de un proveedor): IEPS por
// línea + totales. Réplica EXACTA de la aritmética del RPC fn_registrar_compra_local
// (sub_linea = round(costo*cant,2); ieps_linea = round(sub_linea*tasa,2);
// total = round(subtotal + ieps,2)). El IEPS es un agregado sobre el costo, igual
// que en las ventas; el costo del lote es el costo base (sin IEPS).
import { round2, sumMoney } from './money';

export interface LineaCompraLocal {
  cantidad: number;
  costoUnitario: number;
  tasaIeps: number; // fracción (0.06 = 6%)
}

export interface TotalesCompraLocal {
  subtotal: number; // Σ (costo * cantidad), sin IEPS
  ieps: number;     // Σ IEPS por línea
  total: number;    // subtotal + ieps (lo que se le debe al proveedor)
}

/** Subtotal de una partida (cantidad * costo) redondeado a centavos. */
export function subtotalLineaCompra(cantidad: number, costoUnitario: number): number {
  return round2(Number(cantidad) * Number(costoUnitario));
}

/** IEPS de una partida: tasa (fracción) sobre el subtotal de la línea. */
export function iepsLineaCompra(cantidad: number, costoUnitario: number, tasaIeps: number): number {
  return round2(subtotalLineaCompra(cantidad, costoUnitario) * Number(tasaIeps || 0));
}

/** Totales de una compra local: subtotal (sin IEPS), IEPS y total con IEPS. */
export function totalesCompraLocal(lineas: LineaCompraLocal[]): TotalesCompraLocal {
  const subtotal = sumMoney(lineas.map((l) => subtotalLineaCompra(l.cantidad, l.costoUnitario)));
  const ieps = sumMoney(lineas.map((l) => iepsLineaCompra(l.cantidad, l.costoUnitario, l.tasaIeps)));
  return { subtotal, ieps, total: round2(subtotal + ieps) };
}
