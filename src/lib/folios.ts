// Generación de folios para ventas y cotizaciones.
// Vive en lib (no en un componente) para mantener el render puro: la hora
// actual y el aleatorio se resuelven aquí, no en el cuerpo del componente.

/**
 * Folio de venta: V-AAAA-#########-XXX
 * Usa los últimos 9 dígitos del timestamp + un sufijo aleatorio de 3 chars
 * para minimizar colisiones (la unicidad real la garantiza el UNIQUE en BD).
 */
export function generarFolioVenta(): string {
  const now = new Date();
  const timestamp = now.getTime().toString().slice(-9);
  const randomSuffix = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `V-${now.getFullYear()}-${timestamp}-${randomSuffix}`;
}

/** Folio de cotización: C-###### (últimos 6 dígitos del timestamp). */
export function generarFolioCotizacion(): string {
  return 'C-' + Date.now().toString().slice(-6);
}

/** SKU automático para un producto nuevo sin código manual: P-######. */
export function generarSku(): string {
  return 'P-' + Date.now().toString().slice(-6);
}
