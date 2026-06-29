// Generación de SKU para productos. Los folios de venta, abono, cotización y orden
// de compra ahora son números secuenciales asignados por la BD (secuencias), no aquí.

/** SKU automático para un producto nuevo sin código manual: P-######. */
export function generarSku(): string {
  return 'P-' + Date.now().toString().slice(-6);
}
