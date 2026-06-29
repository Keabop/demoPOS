import { round2 } from './money';

/**
 * Monto a reembolsar por una línea devuelta. Espeja la fórmula del RPC
 * `fn_registrar_devolucion`: precio × cantidad devuelta + IEPS proporcional.
 * `iepsLinea` es el IEPS TOTAL de la línea original (para la cantidad vendida).
 */
export function montoLineaDevolucion(
  precioUnitario: number,
  iepsLinea: number,
  cantidadVendida: number,
  cantidadDevolver: number,
): number {
  if (cantidadVendida <= 0 || cantidadDevolver <= 0) return 0;
  const iepsProporcional = iepsLinea * (cantidadDevolver / cantidadVendida);
  return round2(precioUnitario * cantidadDevolver + iepsProporcional);
}

/** Suma de los montos de las líneas a devolver. */
export function totalDevolucion(montos: number[]): number {
  return round2(montos.reduce((s, m) => s + m, 0));
}
